import type { Bounds3D, Contour, Orientation, Point2D, TriangleMesh } from "../types/cam";

export function orientMesh(source: TriangleMesh, orientation: Orientation): { mesh: TriangleMesh; bbox: Bounds3D } {
  const output = new Float32Array(source.positions.length);
  const map = (x: number, y: number, z: number): [number, number, number] => {
    if (orientation === "-Z") return [x, -y, -z];
    if (orientation === "+X") return [y, z, x];
    if (orientation === "-X") return [-y, z, -x];
    if (orientation === "+Y") return [x, -z, y];
    if (orientation === "-Y") return [x, z, -y];
    return [x, y, z];
  };

  const raw: number[] = [];
  for (let index = 0; index < source.positions.length; index += 3) {
    raw.push(...map(source.positions[index], source.positions[index + 1], source.positions[index + 2]));
  }
  const rawBounds = boundsOf(new Float32Array(raw));
  for (let index = 0; index < raw.length; index += 3) {
    output[index] = raw[index] - rawBounds.min[0];
    output[index + 1] = raw[index + 1] - rawBounds.min[1];
    output[index + 2] = raw[index + 2] - rawBounds.max[2];
  }
  return { mesh: { positions: output }, bbox: boundsOf(output) };
}

export function extractContours(mesh: TriangleMesh, depthFromTop: number, tolerance: number): Contour[] {
  const z = -Math.max(0.001, depthFromTop);
  const segments: [Point2D, Point2D][] = [];
  const p = mesh.positions;
  for (let index = 0; index < p.length; index += 9) {
    const vertices = [
      { x: p[index], y: p[index + 1], z: p[index + 2] },
      { x: p[index + 3], y: p[index + 4], z: p[index + 5] },
      { x: p[index + 6], y: p[index + 7], z: p[index + 8] },
    ];
    const intersections: Point2D[] = [];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = vertices[edge];
      const b = vertices[(edge + 1) % 3];
      const da = a.z - z;
      const db = b.z - z;
      if (Math.abs(da) < 1e-7 && Math.abs(db) < 1e-7) continue;
      if ((da > 0) === (db > 0) && Math.abs(da) > 1e-7 && Math.abs(db) > 1e-7) continue;
      const denominator = b.z - a.z;
      if (Math.abs(denominator) < 1e-9) continue;
      const t = (z - a.z) / denominator;
      if (t >= -1e-7 && t <= 1 + 1e-7) intersections.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
    const unique = dedupe(intersections, 1e-5);
    if (unique.length === 2 && distance(unique[0], unique[1]) > 1e-6) segments.push([unique[0], unique[1]]);
  }

  return chainSegments(segments, Math.max(0.001, tolerance * 0.25))
    .filter((points) => points.length >= 4 && distance(points[0], points[points.length - 1]) <= Math.max(0.02, tolerance))
    .map((points) => simplify(close(points), tolerance))
    .map((points, index) => ({
      id: `contour-${index}`,
      points,
      area: Math.abs(signedArea(points)),
      perimeter: perimeter(points),
      ignored: false,
    }))
    .filter((contour) => contour.area > tolerance * tolerance && contour.perimeter > tolerance * 4)
    .sort((a, b) => b.area - a.area);
}

export function originFor(contours: Contour[], preset: string): Point2D {
  const points = contours.flatMap((contour) => contour.points);
  if (!points.length) return { x: 0, y: 0 };
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  if (preset === "top-left") return { x: minX, y: maxY };
  if (preset === "top-right") return { x: maxX, y: maxY };
  if (preset === "bottom-right") return { x: maxX, y: minY };
  if (preset === "center") return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  return { x: minX, y: minY };
}

function chainSegments(input: [Point2D, Point2D][], epsilon: number): Point2D[][] {
  const segments = input.slice();
  const chains: Point2D[][] = [];
  while (segments.length) {
    const first = segments.pop()!;
    const chain = [first[0], first[1]];
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = segments.length - 1; index >= 0; index -= 1) {
        const [a, b] = segments[index];
        const head = chain[0];
        const tail = chain[chain.length - 1];
        if (distance(tail, a) <= epsilon) chain.push(b);
        else if (distance(tail, b) <= epsilon) chain.push(a);
        else if (distance(head, b) <= epsilon) chain.unshift(a);
        else if (distance(head, a) <= epsilon) chain.unshift(b);
        else continue;
        segments.splice(index, 1);
        changed = true;
        break;
      }
    }
    chains.push(chain);
  }
  return chains;
}

function simplify(points: Point2D[], tolerance: number): Point2D[] {
  if (points.length < 4) return points;
  const open = points.slice(0, -1);
  const kept = open.filter((point, index) => {
    if (index === 0) return true;
    const previous = open[(index - 1 + open.length) % open.length];
    return distance(point, previous) >= tolerance;
  });
  return close(kept.length >= 3 ? kept : open);
}

function close(points: Point2D[]) {
  if (!points.length) return points;
  return distance(points[0], points[points.length - 1]) < 1e-6 ? points : [...points, points[0]];
}

function dedupe(points: Point2D[], epsilon: number) {
  return points.filter((point, index) => points.findIndex((other) => distance(point, other) < epsilon) === index);
}

function distance(a: Point2D, b: Point2D) { return Math.hypot(a.x - b.x, a.y - b.y); }
function perimeter(points: Point2D[]) { return points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0); }
function signedArea(points: Point2D[]) { return points.slice(1).reduce((sum, point, index) => sum + points[index].x * point.y - point.x * points[index].y, 0) / 2; }

function boundsOf(positions: Float32Array): Bounds3D {
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