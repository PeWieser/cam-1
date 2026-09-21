// ---------- Geometrie ----------
export type Vec2 = { x: number; y: number };

/** Geschlossene oder offene 2D-Polylinie */
export type Polyline = {
  pts: Vec2[];
  closed: boolean;
};

/** Kontur mit Metadaten (aus dem Schnitt des Meshes) */
export type Contour = {
  pts: Vec2[];
  closed: boolean;
  area: number;        // absolute Fläche (mm²), 0 bei offenen Pfaden
  length: number;      // Umfang / Länge (mm)
  depth: number;       // Verschachtelungstiefe (0 = äußerste)
  isOuter: boolean;    // depth gerade => Außenkontur (Material innen)
};

/** Ein Werkzeugweg-Segment auf einer bestimmten Z-Höhe */
export type ToolpathPass = {
  pts: Vec2[];
  z: number;           // Fräs-Z (negativ = unter Werkstückoberfläche)
  closed: boolean;
};

export type MeshData = {
  positions: Float32Array;   // Dreiecke, 9 Werte pro Dreieck
  triangleCount: number;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  name: string;
};

// ---------- Einstellungen ----------
export type Strategy = 'contour' | 'centerline' | 'fill';
export type OriginXY =
  | 'front-left' | 'front-center' | 'front-right'
  | 'center-left' | 'center' | 'center-right'
  | 'back-left' | 'back-center' | 'back-right';
export type OriginZ = 'top' | 'bottom-of-cut';

export type CamSettings = {
  // Schnittebene im Modell
  slicePercent: number;        // 0..100, relativ zur Modellhöhe
  // Strategie
  strategy: Strategy;
  // Genauigkeit
  tolerance: number;           // Kurventoleranz / Sehnenfehler in mm
  // Tiefen
  totalDepth: number;          // Gesamt-Gravurtiefe (mm, positiv)
  stepDown: number;            // Zustellung pro Durchgang (mm)
  safeZ: number;               // Sicherheitshöhe (mm über Oberfläche)
  // Füllung
  stepOver: number;            // Zeilenabstand bei Flächenfüllung (mm)
  fillAngle: number;           // Schraffurwinkel in Grad
  // Filter
  minLength: number;           // Konturen kürzer als X mm ignorieren
  ignoreOutermost: boolean;    // äußerste Kontur (Plattenrand) ignorieren
  ignoreInner: boolean;        // Innenkonturen (Löcher) ignorieren
  maxNestDepth: number;        // Konturen tiefer als diese Ebene ignorieren (99 = alle)
  // Nullpunkt
  originXY: OriginXY;
  originZ: OriginZ;
  mirrorX: boolean;
  // Maschine / Werkzeug
  feedXY: number;              // mm/min
  feedZ: number;               // mm/min (Eintauchen)
  spindleRpm: number;
  useSpindleCmd: boolean;      // M3/M5 ausgeben
  toolDia: number;             // Stichel-Spitzendurchmesser (nur Doku/Füllung)
  // Skalierung
  scale: number;               // Modell-Skalierung in %
};

export const defaultSettings: CamSettings = {
  slicePercent: 50,
  strategy: 'contour',
  tolerance: 0.05,
  totalDepth: 0.4,
  stepDown: 0.2,
  safeZ: 2,
  stepOver: 0.3,
  fillAngle: 0,
  minLength: 0.5,
  ignoreOutermost: false,
  ignoreInner: false,
  maxNestDepth: 99,
  originXY: 'front-left',
  originZ: 'top',
  mirrorX: false,
  feedXY: 600,
  feedZ: 150,
  spindleRpm: 12000,
  useSpindleCmd: true,
  toolDia: 0.2,
  scale: 100,
};

export type ToolpathResult = {
  passes: ToolpathPass[];
  contours: Contour[];        // gefilterte Konturen (für Vorschau)
  allContours: Contour[];     // alle Konturen der Schnittebene
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  origin: Vec2;               // Nullpunkt in Vorschau-Koordinaten
  stats: { cutLength: number; rapidLength: number; passCount: number; timeMin: number };
};
