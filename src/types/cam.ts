export type Orientation = "+Z" | "-Z" | "+X" | "-X" | "+Y" | "-Y";
export type OriginPreset = "bottom-left" | "top-left" | "center" | "bottom-right" | "top-right";
export type MotionMode = "2d" | "3d";

export interface Point2D { x: number; y: number }
export interface Point3D extends Point2D { z: number }
export interface TriangleMesh { positions: Float32Array; normals?: Float32Array }
export interface Bounds3D { min: [number, number, number]; max: [number, number, number] }

export interface ModelInfo {
  mesh: TriangleMesh;
  bbox: Bounds3D;
  triangleCount: number;
  fileName: string;
  fileSize: number;
}

export interface Contour {
  id: string;
  points: Point2D[];
  area: number;
  perimeter: number;
  ignored: boolean;
}

export interface ToolSettings {
  diameter: number;
  angle: number;
  depth: number;
  stepDown: number;
  safeZ: number;
  feedRate: number;
  plungeRate: number;
  spindleRpm: number;
  tolerance: number;
}

export type SequencePreset = "safe-start" | "movement" | "pause" | "return-origin" | "safe-end";
export interface SequenceStep { id: string; preset: SequencePreset; label: string }

export interface ToolpathPass {
  contourId: string;
  depth: number;
  points: Point3D[];
}

export interface ToolpathResult {
  passes: ToolpathPass[];
  gcode: string;
  warnings: string[];
  cutLength: number;
  estimatedSeconds: number;
  generatedAt: number;
}

export interface ProjectState {
  orientation: Orientation;
  sectionDepth: number;
  originPreset: OriginPreset;
  motionMode: MotionMode;
  tool: ToolSettings;
  ignoredContourIds: string[];
  sequence: SequenceStep[];
}

export const DEFAULT_TOOL: ToolSettings = {
  diameter: 0.2,
  angle: 30,
  depth: 0.4,
  stepDown: 0.2,
  safeZ: 3,
  feedRate: 420,
  plungeRate: 120,
  spindleRpm: 12000,
  tolerance: 0.05,
};

export const DEFAULT_SEQUENCE: SequenceStep[] = [
  { id: "start", preset: "safe-start", label: "Sicher starten" },
  { id: "movement", preset: "movement", label: "Berechnete Bewegung" },
  { id: "end", preset: "safe-end", label: "Sicher beenden" },
];

export const DEFAULT_PROJECT: ProjectState = {
  orientation: "+Z",
  sectionDepth: 0.1,
  originPreset: "bottom-left",
  motionMode: "2d",
  tool: DEFAULT_TOOL,
  ignoredContourIds: [],
  sequence: DEFAULT_SEQUENCE,
};