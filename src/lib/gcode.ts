import type { CamSettings, ToolpathResult } from '../types';

const fmt = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

export function generateGcode(result: ToolpathResult, s: CamSettings, fileName: string): string {
  const L: string[] = [];
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const zSafe = s.safeZ + (s.originZ === 'bottom-of-cut' ? s.totalDepth : 0);

  L.push(`; Gravur-G-Code – erzeugt von Stichel CAM`);
  L.push(`; Quelle: ${fileName}`);
  L.push(`; Datum: ${now}`);
  L.push(`; Strategie: ${s.strategy === 'contour' ? 'Kontur' : s.strategy === 'centerline' ? 'Mittellinie' : 'Flaechenfuellung'}`);
  L.push(`; Werkzeug: Stichel, Spitze ~${fmt(s.toolDia)} mm`);
  L.push(`; Tiefe: ${fmt(s.totalDepth)} mm in ${result.stats.passCount} Zustellung(en) je ${fmt(s.stepDown)} mm`);
  L.push(`; Kurventoleranz: ${fmt(s.tolerance)} mm`);
  L.push(`; Nullpunkt XY: ${s.originXY} | Z: ${s.originZ === 'top' ? 'Werkstueckoberflaeche' : 'Gravurgrund'}`);
  if (result.bounds) {
    L.push(`; Arbeitsbereich: X ${fmt(result.bounds.minX)}..${fmt(result.bounds.maxX)}  Y ${fmt(result.bounds.minY)}..${fmt(result.bounds.maxY)} mm`);
  }
  L.push(`; Fraeslaenge: ${fmt(result.stats.cutLength)} mm | geschaetzte Zeit: ${fmt(result.stats.timeMin)} min`);
  L.push('');
  L.push('G21 ; Millimeter');
  L.push('G90 ; Absolute Koordinaten');
  L.push('G17 ; XY-Ebene');
  L.push('G94 ; Vorschub mm/min');
  if (s.useSpindleCmd) L.push(`M3 S${Math.round(s.spindleRpm)} ; Spindel ein`);
  L.push(`G0 Z${fmt(zSafe)} ; Sicherheitshoehe`);
  L.push('');

  let lastX = NaN, lastY = NaN, lastZ = NaN, lastF = NaN;
  const g0 = (x?: number, y?: number, z?: number) => {
    const parts: string[] = ['G0'];
    if (x !== undefined && x !== lastX) { parts.push(`X${fmt(x)}`); lastX = x; }
    if (y !== undefined && y !== lastY) { parts.push(`Y${fmt(y)}`); lastY = y; }
    if (z !== undefined && z !== lastZ) { parts.push(`Z${fmt(z)}`); lastZ = z; }
    if (parts.length > 1) L.push(parts.join(' '));
  };
  const g1 = (x: number | undefined, y: number | undefined, z: number | undefined, f: number) => {
    const parts: string[] = ['G1'];
    if (x !== undefined && x !== lastX) { parts.push(`X${fmt(x)}`); lastX = x; }
    if (y !== undefined && y !== lastY) { parts.push(`Y${fmt(y)}`); lastY = y; }
    if (z !== undefined && z !== lastZ) { parts.push(`Z${fmt(z)}`); lastZ = z; }
    if (parts.length === 1) return;
    if (f !== lastF) { parts.push(`F${fmt(f)}`); lastF = f; }
    L.push(parts.join(' '));
  };

  let pathNo = 0;
  for (const pass of result.passes) {
    pathNo++;
    const first = pass.pts[0];
    L.push(`; Pfad ${pathNo} @ Z${fmt(pass.z)}`);
    g0(undefined, undefined, zSafe);
    g0(first.x, first.y, undefined);
    g1(undefined, undefined, pass.z, s.feedZ);
    for (let i = 1; i < pass.pts.length; i++) {
      g1(pass.pts[i].x, pass.pts[i].y, undefined, s.feedXY);
    }
    if (pass.closed) g1(first.x, first.y, undefined, s.feedXY);
  }

  L.push('');
  L.push(`G0 Z${fmt(zSafe)} ; abheben`);
  if (s.useSpindleCmd) L.push('M5 ; Spindel aus');
  L.push('G0 X0 Y0 ; zurueck zum Nullpunkt');
  L.push('M30 ; Programmende');
  return L.join('\n');
}
