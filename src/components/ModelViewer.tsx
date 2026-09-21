import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Contour, Point2D, ToolSettings, ToolpathPass, TriangleMesh } from "../types/cam";

interface Props { mesh: TriangleMesh | null; sectionZ: number; contours: Contour[]; ignoredIds: string[]; origin: Point2D; tool: ToolSettings; passes?: ToolpathPass[]; showTool: boolean }

export function ModelViewer(props: Props) {
  const mount = useRef<HTMLDivElement>(null); const contentRef = useRef<THREE.Group | undefined>(undefined); const cameraRef = useRef<THREE.PerspectiveCamera | undefined>(undefined); const controlsRef = useRef<OrbitControls | undefined>(undefined);
  useEffect(() => {
    if (!mount.current) return; const host = mount.current; const scene = new THREE.Scene(); scene.background = new THREE.Color(0x101114);
    const camera = new THREE.PerspectiveCamera(38, host.clientWidth / host.clientHeight, 0.01, 100000); camera.up.set(0, 0, 1);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(host.clientWidth, host.clientHeight); renderer.outputColorSpace = THREE.SRGBColorSpace; host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.08;
    const content = new THREE.Group(); scene.add(content, new THREE.HemisphereLight(0xffffff, 0x252936, 2.2));
    const light = new THREE.DirectionalLight(0xffffff, 2.6); light.position.set(40, -30, 70); scene.add(light);
    const grid = new THREE.GridHelper(300, 60, 0x343844, 0x23262d); grid.rotation.x = Math.PI / 2; scene.add(grid);
    contentRef.current = content; cameraRef.current = camera; controlsRef.current = controls;
    let frame = 0; const draw = () => { frame = requestAnimationFrame(draw); controls.update(); renderer.render(scene, camera); }; draw();
    const resize = () => { if (!host.clientWidth || !host.clientHeight) return; camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(host.clientWidth, host.clientHeight); };
    const observer = new ResizeObserver(resize); observer.observe(host);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); };
  }, []);

  useEffect(() => {
    const group = contentRef.current; if (!group) return; disposeChildren(group); if (!props.mesh) return;
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.BufferAttribute(props.mesh.positions, 3)); geometry.computeVertexNormals(); geometry.computeBoundingBox();
    group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb9bec8, roughness: 0.72, metalness: 0.08, transparent: true, opacity: 0.88, side: THREE.DoubleSide })));
    const box = geometry.boundingBox!; const size = box.getSize(new THREE.Vector3()); const center = box.getCenter(new THREE.Vector3());
    const section = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.12, size.y * 1.12), new THREE.MeshBasicMaterial({ color: 0x4c8dff, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false })); section.position.set(center.x, center.y, props.sectionZ); group.add(section);
    props.contours.forEach((contour) => { const points = contour.points.map((point) => new THREE.Vector3(point.x, point.y, props.sectionZ + 0.006)); group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: props.ignoredIds.includes(contour.id) ? 0x626875 : 0x4c8dff, transparent: true, opacity: props.ignoredIds.includes(contour.id) ? 0.38 : 1 }))); });
    props.passes?.forEach((pass) => { const points = pass.points.map((point) => new THREE.Vector3(point.x + props.origin.x, point.y + props.origin.y, point.z)); group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x61a0ff }))); });
    const marker = new THREE.Mesh(new THREE.SphereGeometry(Math.max(size.x, size.y) * 0.008, 16, 8), new THREE.MeshBasicMaterial({ color: 0x4c8dff })); marker.position.set(props.origin.x, props.origin.y, 0.02); group.add(marker);
    if (props.showTool) {
      const radius = Math.max(props.tool.diameter / 2, 0.08); const visibleLength = Math.max(5, size.z * 0.35); const tool = new THREE.Group();
      const tip = props.passes?.[0]?.points[0]; const fallback = props.contours.find((contour) => !props.ignoredIds.includes(contour.id))?.points[0] ?? props.origin;
      tool.position.set(tip ? tip.x + props.origin.x : fallback.x, tip ? tip.y + props.origin.y : fallback.y, props.tool.safeZ);
      const coneLength = Math.max(radius / Math.tan(props.tool.angle * Math.PI / 360), 0.6);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(radius + coneLength * Math.tan(props.tool.angle * Math.PI / 360), coneLength, 24), new THREE.MeshStandardMaterial({ color: 0xd9dde5, metalness: 0.8, roughness: 0.22 })); cone.rotation.x = Math.PI / 2; cone.position.z = -coneLength / 2;
      const shank = new THREE.Mesh(new THREE.CylinderGeometry(radius * 2.2, radius * 2.2, visibleLength, 24), new THREE.MeshStandardMaterial({ color: 0x7e8795, metalness: 0.72, roughness: 0.28 })); shank.rotation.x = Math.PI / 2; shank.position.z = visibleLength / 2;
      tool.add(cone, shank); group.add(tool);
    }
    const max = Math.max(size.x, size.y, size.z, 1); const camera = cameraRef.current; const controls = controlsRef.current;
    if (camera && controls) { camera.position.set(center.x + max * 1.25, center.y - max * 1.35, center.z + max); controls.target.copy(center); controls.update(); }
  }, [props.mesh, props.sectionZ, props.contours, props.ignoredIds, props.origin, props.tool, props.passes, props.showTool]);
  return <div className="model-stage" ref={mount} />;
}

function disposeChildren(group: THREE.Group) { while (group.children.length) { const child = group.children.pop()!; child.traverse((object) => { const mesh = object as THREE.Mesh; mesh.geometry?.dispose(); const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []; materials.forEach((material) => material.dispose()); }); } }