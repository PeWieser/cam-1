import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MeshData } from '../types';

type Props = { mesh: MeshData | null; slicePercent: number };

export default function Viewer3D({ mesh, slicePercent }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    modelGroup: THREE.Group;
    plane: THREE.Mesh;
  } | null>(null);

  // Szene einmalig aufbauen
  useEffect(() => {
    const el = containerRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfafafa);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
    camera.up.set(0, 0, 1);
    camera.position.set(80, -80, 60);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(1, -1.5, 2);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dir2.position.set(-1.5, 1, -0.5);
    scene.add(dir2);

    const grid = new THREE.GridHelper(200, 20, 0xd4d4d8, 0xe4e4e7);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
    );
    plane.visible = false;
    scene.add(plane);

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    stateRef.current = { renderer, scene, camera, controls, modelGroup, plane };
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  }, []);

  // Modell aktualisieren
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    st.modelGroup.clear();
    if (!mesh) { st.plane.visible = false; return; }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xa1a1aa, metalness: 0.15, roughness: 0.55,
      side: THREE.DoubleSide, flatShading: true,
    });
    st.modelGroup.add(new THREE.Mesh(geo, mat));

    // Kamera auf Modell ausrichten
    const { min, max } = mesh.bbox;
    const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, cz = (min[2] + max[2]) / 2;
    const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1);
    st.controls.target.set(cx, cy, cz);
    st.camera.position.set(cx + size * 1.2, cy - size * 1.4, cz + size * 1.1);
    st.camera.near = size / 100;
    st.camera.far = size * 50;
    st.camera.updateProjectionMatrix();

    st.plane.visible = true;
    st.plane.scale.set((max[0] - min[0]) * 1.3 + 1, (max[1] - min[1]) * 1.3 + 1, 1);
    st.plane.position.set(cx, cy, min[2] + ((max[2] - min[2]) * slicePercent) / 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh]);

  // Schnittebene bewegen
  useEffect(() => {
    const st = stateRef.current;
    if (!st || !mesh) return;
    const { min, max } = mesh.bbox;
    st.plane.position.z = min[2] + ((max[2] - min[2]) * slicePercent) / 100;
  }, [slicePercent, mesh]);

  return <div ref={containerRef} className="h-full w-full" />;
}
