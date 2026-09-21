import type { CamSettings, Contour, MeshData, ToolpathPass, ToolpathResult, Vec2 } from '../types';
import { buildContours, chainSegments, hatchFill, pathLength, sliceMesh } from './geometry';
import { computeCenterlines } from './centerline';

export function computeToolpaths(mesh: MeshData, s: CamSettings): ToolpathResult {
  const empty: ToolpathResult = {
    passes: [], contours: [], allContours: [], bounds: null,
    origin: { x: 0, y: 0 },
    stats: { cutLength: 0, rapidLength: 0, passCount: 0, timeMin: 0 },
  };

  // --- 1. Schnittebene bestimmen -------------------------------------------
  const [, , zMin] = mesh.bbox.min;
  const [, , zMax] = mesh.bbox.max;
  const height = zMax - zMin;
  let zSlice = zMin + (height * s.slicePercent) / 100;
  // exakt auf Flächen liegende Ebenen minimal versetzen
  if (height > 0) zSlice += height * 1e-5;
  else zSlice = zMin + 1e-5;

  // --- 2. Schneiden & Konturen bilden --------------------------------------
  const segs = sliceMesh(mesh.positions, zSlice);
  if (!segs.length) return empty;
  const chains = chainSegments(segs);
  const scale = s.scale / 100;
  const scaled = chains.map((c) => ({
    pts: c.pts.map((p) => ({ x: p.x * scale * (s.mirrorX ? -1 : 1), y: p.y * scale })),
    closed: c.closed,
  }));
  const allContours = buildContours(scaled, s.tolerance);

  // --- 3. Filter -------------------------------------------------------------
  let contours = allContours.filter((c) => c.length >= s.minLength);
  if (s.ignoreOutermost) contours = contours.filter((c) => !(c.closed && c.depth === 0));
  if (s.ignoreInner) contours = contours.filter((c) => !c.closed || c.isOuter);
  contours = contours.filter((c) => !c.closed || c.depth <= s.maxNestDepth);
  if (!contours.length) return { ...empty, allContours };

  // --- 4. Strategie → 2D-Pfade ------------------------------------------------
  let paths: { pts: Vec2[]; closed: boolean }[] = [];
  if (s.strategy === 'contour') {
    paths = contours.map((c) => ({ pts: c.pts, closed: c.closed }));
  } else if (s.strategy === 'centerline') {
    const lines = computeCenterlines(contours, s.tolerance);
    paths = lines
      .map((pts) => ({ pts, closed: false }))
      .filter((p) => pathLength(p.pts, false) >= s.minLength);
  } else {
    // Füllung: Schraffur + Kontur außen herum
    const lines = hatchFill(contours, Math.max(s.stepOver, 0.05), s.fillAngle);
    paths = [
      ...contours.filter((c) => c.closed).map((c) => ({ pts: c.pts, closed: true })),
      ...lines.map((pts) => ({ pts, closed: false })),
    ];
  }
  if (!paths.length) return { ...empty, allContours, contours };

  // --- 5. Nullpunkt verschieben ------------------------------------------------
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of contours) for (const p of c.pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const ox = s.originXY.includes('left') ? minX
    : s.originXY.includes('right') ? maxX
    : (minX + maxX) / 2;
  const oy = s.originXY.startsWith('front') ? minY
    : s.originXY.startsWith('back') ? maxY
    : (minY + maxY) / 2;

  const shift = (p: Vec2): Vec2 => ({ x: p.x - ox, y: p.y - oy });
  paths = paths.map((p) => ({ ...p, pts: p.pts.map(shift) }));
  const shContours = contours.map((c) => ({ ...c, pts: c.pts.map(shift) }));
  const shAll = allContours.map((c) => ({ ...c, pts: c.pts.map(shift) }));

  // --- 6. Pfade sortieren (Greedy Nearest Neighbor) -----------------------------
  paths = orderPaths(paths);

  // --- 7. Tiefen-Durchgänge -------------------------------------------------------
  const zOffset = s.originZ === 'bottom-of-cut' ? s.totalDepth : 0;
  const nSteps = Math.max(1, Math.ceil(s.totalDepth / Math.max(s.stepDown, 0.01)));
  const passes: ToolpathPass[] = [];
  for (let i = 1; i <= nSteps; i++) {
    const z = -Math.min(s.totalDepth, i * s.stepDown) + zOffset;
    for (const p of paths) passes.push({ pts: p.pts, z, closed: p.closed });
  }

  // --- 8. Statistik ---------------------------------------------------------------
  let cutLength = 0, rapidLength = 0;
  let last: Vec2 | null = null;
  for (const p of passes) {
    cutLength += pathLength(p.pts, p.closed);
    if (last) rapidLength += Math.hypot(p.pts[0].x - last.x, p.pts[0].y - last.y);
    last = p.closed ? p.pts[0] : p.pts[p.pts.length - 1];
  }
  const timeMin = cutLength / Math.max(s.feedXY, 1)
    + rapidLength / 3000
    + passes.length * ((s.safeZ + s.totalDepth) / Math.max(s.feedZ, 1));

  return {
    passes,
    contours: shContours,
    allContours: shAll,
    bounds: { minX: minX - ox, minY: minY - oy, maxX: maxX - ox, maxY: maxY - oy },
    origin: { x: 0, y: 0 },
    stats: { cutLength, rapidLength, passCount: nSteps, timeMin },
  };
}

// ---------------------------------------------------------------------------

function orderPaths(paths: { pts: Vec2[]; closed: boolean }[]) {
  const remaining = [...paths];
  const out: typeof paths = [];
  let cur: Vec2 = { x: 0, y: 0 };
  while (remaining.length) {
    let best = 0, bestD = Infinity, bestRev = false;
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      const d1 = dist2(cur, p.pts[0]);
      if (d1 < bestD) { bestD = d1; best = i; bestRev = false; }
      if (!p.closed) {
        const d2 = dist2(cur, p.pts[p.pts.length - 1]);
        if (d2 < bestD) { bestD = d2; best = i; bestRev = true; }
      }
    }
    const p = remaining.splice(best, 1)[0];
    const pts = bestRev ? [...p.pts].reverse() : p.pts;
    out.push({ pts, closed: p.closed });
    cur = p.closed ? pts[0] : pts[pts.length - 1];
  }
  return out;
}

const dist2 = (a: Vec2, b: Vec2) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export { pathLength };
export type { Contour };
