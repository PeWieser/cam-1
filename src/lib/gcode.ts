import type { Contour, MotionMode, Point2D, SequenceStep, ToolSettings, ToolpathPass, ToolpathResult } from "../types/cam";

interface GenerateInput {
  contours: Contour[];
  ignoredIds: string[];
  origin: Point2D;
  tool: ToolSettings;
  mode: MotionMode;
  sequence: SequenceStep[];
  fileName: string;
}

export function generateToolpath(input: GenerateInput): ToolpathResult {
  const selected = input.contours.filter((contour) => !input.ignoredIds.includes(contour.id));
  if (!selected.length) throw new Error("Mindestens eine Kontur muss für die Bearbeitung aktiv bleiben.");
  validateTool(input.tool);

  const depths = input.mode === "2d"
    ? [-input.tool.depth]
    : depthPasses(input.tool.depth, input.tool.stepDown);
  const passes: ToolpathPass[] = [];
  for (const depth of depths) {
    for (const contour of selected) {
      passes.push({
        contourId: contour.id,
        depth,
        points: contour.points.map((point) => ({ x: point.x - input.origin.x, y: point.y - input.origin.y, z: depth })),
      });
    }
  }

  const lines: string[] = [
    `(Stichel CAM: ${sanitize(input.fileName)})`,
    `(V-Bit ${fmt(input.tool.angle)} deg, Spitze ${fmt(input.tool.diameter)} mm)`,
  ];
  const hasStart = input.sequence.some((step) => step.preset === "safe-start");
  const hasEnd = input.sequence.some((step) => step.preset === "safe-end");
  const warnings: string[] = [];
  if (!hasStart) throw new Error("Füge den Preset-Schritt Sicher starten hinzu.");
  if (!hasEnd) throw new Error("Füge den Preset-Schritt Sicher beenden hinzu.");
  const movementIndex = input.sequence.findIndex((step) => step.preset === "movement");
  const startIndices = input.sequence.map((step, index) => step.preset === "safe-start" ? index : -1).filter((index) => index >= 0);
  const endIndices = input.sequence.map((step, index) => step.preset === "safe-end" ? index : -1).filter((index) => index >= 0);
  if (startIndices.length > 1 || endIndices.length > 1) throw new Error("Sicher starten und Sicher beenden dürfen jeweils nur einmal vorkommen.");
  if (hasStart && startIndices[0] > movementIndex) throw new Error("Sicher starten muss vor der berechneten Bewegung liegen.");
  if (hasEnd && endIndices[0] < movementIndex) throw new Error("Sicher beenden muss nach der berechneten Bewegung liegen.");

  if (movementIndex < 0) throw new Error("Die berechnete Bewegung fehlt in der Schrittfolge.");
  let cutLength = 0;
  for (const step of input.sequence) {
    if (step.preset !== "movement") {
      emitSequence(lines, [step], input.tool);
      continue;
    }
    for (const pass of passes) {
      const first = pass.points[0];
      lines.push(`(Kontur ${pass.contourId}, Z${fmt(pass.depth)})`);
      lines.push(`G0 Z${fmt(input.tool.safeZ)}`);
      lines.push(`G0 X${fmt(first.x)} Y${fmt(first.y)}`);
      lines.push(`G1 Z${fmt(pass.depth)} F${fmt(input.tool.plungeRate)}`);
      lines.push(`F${fmt(input.tool.feedRate)}`);
      for (let index = 1; index < pass.points.length; index += 1) {
        const point = pass.points[index];
        const previous = pass.points[index - 1];
        cutLength += Math.hypot(point.x - previous.x, point.y - previous.y);
        lines.push(`G1 X${fmt(point.x)} Y${fmt(point.y)}`);
      }
      lines.push(`G0 Z${fmt(input.tool.safeZ)}`);
    }
  }
  const estimatedSeconds = cutLength / input.tool.feedRate * 60 + passes.length * (input.tool.safeZ + input.tool.depth) / input.tool.plungeRate * 60 + 2;
  return { passes, gcode: lines.join("\n"), warnings, cutLength, estimatedSeconds, generatedAt: Date.now() };
}

function emitSequence(lines: string[], sequence: SequenceStep[], tool: ToolSettings) {
  for (const step of sequence) {
    if (step.preset === "safe-start") lines.push("G21 G90 G17 G94", `G0 Z${fmt(tool.safeZ)}`, `M3 S${Math.round(tool.spindleRpm)}`, "G4 P2");
    if (step.preset === "movement") continue;
    if (step.preset === "pause") lines.push("M0 (Pause)");
    if (step.preset === "return-origin") lines.push(`G0 Z${fmt(tool.safeZ)}`, "G0 X0 Y0");
    if (step.preset === "safe-end") lines.push(`G0 Z${fmt(tool.safeZ)}`, "M5", "M30");
  }
}

function depthPasses(depth: number, stepDown: number) {
  const result: number[] = [];
  for (let current = stepDown; current < depth - 1e-9; current += stepDown) result.push(-current);
  result.push(-depth);
  return result;
}

function validateTool(tool: ToolSettings) {
  if (tool.diameter <= 0 || tool.diameter > 20) throw new Error("Die Spitzenbreite muss zwischen 0 und 20 mm liegen.");
  if (tool.angle < 10 || tool.angle >= 180) throw new Error("Der Spitzenwinkel muss zwischen 10 und 179 Grad liegen.");
  if (tool.depth <= 0 || tool.depth > 20) throw new Error("Die Tiefe muss zwischen 0 und 20 mm liegen.");
  if (tool.stepDown <= 0 || tool.stepDown > tool.depth) throw new Error("Die Zustellung muss größer als 0 und höchstens so groß wie die Tiefe sein.");
  if (tool.safeZ <= 0) throw new Error("Sicherheits-Z muss über der Oberfläche liegen.");
  if (tool.feedRate <= 0 || tool.plungeRate <= 0 || tool.spindleRpm <= 0) throw new Error("Vorschub, Eintauchen und Drehzahl müssen größer als 0 sein.");
}

function sanitize(value: string) { return value.replace(/[()]/g, "").slice(0, 80); }
function fmt(value: number) { return value.toFixed(3).replace(/\.000$/, ""); }