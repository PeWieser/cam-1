import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import type { ModelInfo, TriangleMesh } from "../types/cam";

export const ACCEPTED_FORMATS = ["stl", "obj", "3mf", "ply"] as const;

export async function loadModel(file: File): Promise<ModelInfo> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !ACCEPTED_FORMATS.includes(extension as (typeof ACCEPTED_FORMATS)[number])) {
    throw new Error("Dieses Format wird noch nicht sicher verarbeitet. Bitte STL, OBJ, 3MF oder PLY verwenden.");
  }

  const buffer = await file.arrayBuffer();
  const geometries: THREE.BufferGeometry[] = [];
  if (extension === "stl") {
    geometries.push(new STLLoader().parse(buffer));
  } else if (extension === "ply") {
    geometries.push(new PLYLoader().parse(buffer));
  } else {
    const root = extension === "obj"
      ? new OBJLoader().parse(new TextDecoder().decode(buffer))
      : new ThreeMFLoader().parse(buffer);
    root.updateMatrixWorld(true);
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.geometry?.attributes.position) return;
      const geometry = child.geometry.clone();
      geometry.applyMatrix4(child.matrixWorld);
      geometries.push(geometry);
    });
  }

  if (!geometries.length) throw new Error("Die Datei enthält keine lesbare Dreiecksgeometrie.");
  const mesh = mergeGeometries(geometries);
  const bbox = boundsOf(mesh.positions);
  if ([...bbox.min, ...bbox.max].some((value) => !Number.isFinite(value))) {
    throw new Error("Das Modell enthält ungültige Koordinaten.");
  }
  return { mesh, bbox, triangleCount: mesh.positions.length / 9, fileName: file.name, fileSize: file.size };
}

function mergeGeometries(geometries: THREE.BufferGeometry[]): TriangleMesh {
  const vertices: number[] = [];
  for (const source of geometries) {
    const geometry = source.index ? source.toNonIndexed() : source;
    const position = geometry.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      vertices.push(position.getX(index), position.getY(index), position.getZ(index));
    }
    if (geometry !== source) geometry.dispose();
  }
  return { positions: new Float32Array(vertices) };
}

function boundsOf(positions: Float32Array) {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[index + axis]);
      max[axis] = Math.max(max[axis], positions[index + axis]);
    }
  }
  return { min, max };
}