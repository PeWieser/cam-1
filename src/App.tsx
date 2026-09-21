import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Clipboard, Download, Eye, EyeOff, FileBox, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { ContourCanvas } from "./components/ContourCanvas";
import { FileUpload } from "./components/FileUpload";
import { ModelViewer } from "./components/ModelViewer";
import { extractContours, orientMesh, originFor } from "./lib/geometry";
import { generateToolpath } from "./lib/gcode";
import { loadModel } from "./lib/modelLoader";
import { DEFAULT_PROJECT, type ModelInfo, type MotionMode, type Orientation, type OriginPreset, type ProjectState, type SequencePreset, type ToolpathResult } from "./types/cam";

const STEPS = ["Modell", "Oberseite", "Abschnitt", "Nullpunkt", "Werkzeug", "Konturen", "Bewegung"];
const ORIENTATIONS: { value: Orientation; label: string; hint: string }[] = [
  { value: "+Z", label: "+Z", hint: "Aktuelle Oberseite" }, { value: "-Z", label: "-Z", hint: "Unterseite" },
  { value: "+X", label: "+X", hint: "Rechte Seite" }, { value: "-X", label: "-X", hint: "Linke Seite" },
  { value: "+Y", label: "+Y", hint: "Rückseite" }, { value: "-Y", label: "-Y", hint: "Vorderseite" },
];

export default function App() {
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [project, setProject] = useState<ProjectState>(DEFAULT_PROJECT);
  const [past, setPast] = useState<ProjectState[]>([]);
  const [future, setFuture] = useState<ProjectState[]>([]);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ToolpathResult | null>(null);
  const [status, setStatus] = useState("Modell öffnen, um zu beginnen.");
  const [error, setError] = useState<string | null>(null);
  const [showTool, setShowTool] = useState(true);

  const oriented = useMemo(() => model ? orientMesh(model.mesh, project.orientation) : null, [model, project.orientation]);
  const modelHeight = oriented ? Math.abs(oriented.bbox.min[2]) : 1;
  const sectionDepth = Math.min(Math.max(project.sectionDepth, 0.001), Math.max(modelHeight - 0.001, 0.001));
  const contours = useMemo(() => oriented ? extractContours(oriented.mesh, sectionDepth, project.tool.tolerance) : [], [oriented, sectionDepth, project.tool.tolerance]);
  const origin = useMemo(() => originFor(contours, project.originPreset), [contours, project.originPreset]);
  const activeContours = contours.filter((contour) => !project.ignoredContourIds.includes(contour.id));

  const commit = (next: ProjectState, message = "Einstellung gespeichert.") => {
    setPast((items) => [...items.slice(-49), project]); setFuture([]); setProject(next);
    setStatus(result ? "Einstellung geändert. Bewegung bitte neu berechnen." : message); setResult(null); setError(null);
  };
  const patch = (value: Partial<ProjectState>, message?: string) => commit({ ...project, ...value }, message);
  const patchTool = (key: keyof ProjectState["tool"], value: number) => commit({ ...project, tool: { ...project.tool, [key]: value } });
  const undo = () => { const previous = past.at(-1); if (!previous) return; setFuture((items) => [project, ...items]); setPast((items) => items.slice(0, -1)); setProject(previous); setResult(null); setStatus("Rückgängig gemacht."); };
  const redo = () => { const next = future[0]; if (!next) return; setPast((items) => [...items, project]); setFuture((items) => items.slice(1)); setProject(next); setResult(null); setStatus("Wiederhergestellt."); };

  const copyGcode = async () => {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.gcode); setStatus("G-Code kopiert."); }
    catch { setError("Der Browser hat den Zugriff auf die Zwischenablage blockiert. Markiere den G-Code im Textfeld und kopiere ihn dort."); }
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setError(null); setStatus("Modus beendet."); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && result && !window.getSelection()?.toString()) { event.preventDefault(); void copyGcode(); }
    };
    window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  });

  const openFile = async (file: File) => {
    setLoading(true); setError(null); setStatus("Modell wird lokal geprüft...");
    try {
      const loaded = await loadModel(file); const initial = orientMesh(loaded.mesh, "+Z"); const height = Math.abs(initial.bbox.min[2]);
      setModel(loaded); setProject({ ...DEFAULT_PROJECT, sectionDepth: Math.min(Math.max(height * 0.02, 0.02), 0.5) });
      setPast([]); setFuture([]); setResult(null); setStep(1); setStatus(`${loaded.fileName} ist bereit. Jetzt die Oberseite wählen.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Das Modell konnte nicht geöffnet werden."); setStatus("Import fehlgeschlagen."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? [])[0];
      if (file) { event.preventDefault(); void openFile(file); }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  });

  const toggleContour = (id: string) => {
    const ignored = project.ignoredContourIds.includes(id) ? project.ignoredContourIds.filter((item) => item !== id) : [...project.ignoredContourIds, id];
    patch({ ignoredContourIds: ignored }, ignored.includes(id) ? "Kontur wird ignoriert." : "Kontur wird bearbeitet.");
  };
  const calculate = (mode: MotionMode) => {
    try {
      const generated = generateToolpath({ contours, ignoredIds: project.ignoredContourIds, origin, tool: project.tool, mode, sequence: project.sequence, fileName: model?.fileName ?? "Modell" });
      setProject({ ...project, motionMode: mode }); setResult(generated); setError(null); setStatus(`${mode === "2d" ? "2D" : "3D"}-Bewegung berechnet. ${generated.passes.length} Werkzeugwege sind bereit.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Die Bewegung konnte nicht berechnet werden."); }
  };
  const download = () => {
    if (!result) return; const url = URL.createObjectURL(new Blob([result.gcode], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${model?.fileName.replace(/\.[^.]+$/, "") ?? "stichel"}.gcode`; anchor.click(); URL.revokeObjectURL(url); setStatus("G-Code exportiert.");
  };
  const centerIs2D = step === 5 || (step === 6 && Boolean(result));

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">S</span><div><strong>STICHEL</strong><span>Geführter CAM-Entwurf</span></div></div>
      <div className="history-actions"><button className="icon-button" onClick={undo} disabled={!past.length} aria-label="Rückgängig" title="Rückgängig (Strg Z)"><Undo2 /></button><button className="icon-button" onClick={redo} disabled={!future.length} aria-label="Wiederholen" title="Wiederholen (Strg Y)"><Redo2 /></button>{model && <div className="file-chip"><FileBox /><span>{model.fileName}</span><b>{model.triangleCount.toLocaleString("de-DE")} Dreiecke</b></div>}</div>
    </header>
    <div className="workspace">
      <nav className="step-rail" aria-label="Arbeitsablauf"><div className="rail-title">Ablauf</div>{STEPS.map((label, index) => <button key={label} className={`step-item ${step === index ? "is-current" : ""} ${index < step ? "is-past" : ""}`} onClick={() => (index === 0 || model) && setStep(index)} disabled={index > 0 && !model} aria-current={step === index ? "step" : undefined}><span className="step-number">{index < step ? <Check /> : index + 1}</span><span>{label}</span></button>)}<div className="rail-help"><strong>Sicherheitsgrenze</strong><span>Diese Version erzeugt ausschließlich geschlossene Gravurkonturen. Keine Taschen, Bohrungen oder automatische Kollisionsprüfung.</span></div></nav>
      <main className="stage-shell"><div className="stage-header"><div><span className="eyebrow">Schritt {step + 1} von 7</span><h1>{stageTitle(step)}</h1></div>{model && <button className="quiet-button" onClick={() => setShowTool((value) => !value)}>{showTool ? <EyeOff /> : <Eye />}{showTool ? "Werkzeug ausblenden" : "Werkzeug zeigen"}</button>}</div>
        <div className="stage-body">{!model ? <div className="empty-stage"><FileUpload onFile={openFile} loading={loading} /><p>Keine Cloud, kein automatischer Werkzeugweg. Du entscheidest jeden Schritt.</p></div> : centerIs2D ? <ContourCanvas contours={contours} ignoredIds={project.ignoredContourIds} origin={origin} passes={result?.passes} interactive={step === 5} onToggle={toggleContour} /> : <ModelViewer mesh={oriented?.mesh ?? null} sectionZ={-sectionDepth} contours={contours} ignoredIds={project.ignoredContourIds} origin={origin} tool={project.tool} passes={result?.passes} showTool={showTool} />}</div>
        <div className="stage-status" role="status"><span className={error ? "status-dot is-error" : "status-dot"} />{error ?? status}</div></main>
      <aside className="inspector"><Inspector step={step} model={model} project={project} modelHeight={modelHeight} contours={contours} activeCount={activeContours.length} result={result} openFile={openFile} patch={patch} patchTool={patchTool} toggleContour={toggleContour} calculate={calculate} copy={copyGcode} download={download} /><div className="inspector-nav"><button className="secondary-button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}><ArrowLeft />Zurück</button>{step < 6 && <button className="primary-button" onClick={() => setStep((value) => Math.min(6, value + 1))} disabled={!model}>Weiter<ArrowRight /></button>}</div></aside>
    </div>
  </div>;
}

interface InspectorProps { step: number; model: ModelInfo | null; project: ProjectState; modelHeight: number; contours: ReturnType<typeof extractContours>; activeCount: number; result: ToolpathResult | null; openFile: (file: File) => void; patch: (value: Partial<ProjectState>, message?: string) => void; patchTool: (key: keyof ProjectState["tool"], value: number) => void; toggleContour: (id: string) => void; calculate: (mode: MotionMode) => void; copy: () => void; download: () => void }

function Inspector({ step, model, project, modelHeight, contours, activeCount, result, openFile, patch, patchTool, toggleContour, calculate, copy, download }: InspectorProps) {
  if (step === 0) return <div className="inspector-content"><PanelHeading title="Modell öffnen" text="Die Datei bleibt auf diesem Gerät. Nach dem Import prüfst du zuerst die Ausrichtung." /><FileUpload onFile={openFile} loading={false} />{model && <Fact label="Geladen" value={model.fileName} />}</div>;
  if (step === 1) return <div className="inspector-content"><PanelHeading title="Welche Seite zeigt nach oben?" text="Wähle die Achse, die zur Spindel zeigen soll." /><div className="orientation-grid">{ORIENTATIONS.map((item) => <button key={item.value} className={project.orientation === item.value ? "is-selected" : ""} onClick={() => patch({ orientation: item.value, ignoredContourIds: [] }, `${item.label} ist jetzt oben.`)}><b>{item.label}</b><span>{item.hint}</span></button>)}</div></div>;
  if (step === 2) return <div className="inspector-content"><PanelHeading title="Schnittebene setzen" text="Die blaue Ebene bestimmt, welche Kanten erkannt werden. Schiebe sie knapp unter die gewünschte Gravur." /><label className="range-field"><span><b>Tiefe unter Oberseite</b><output>{project.sectionDepth.toFixed(2)} mm</output></span><input type="range" min="0.01" max={Math.max(0.02, modelHeight - 0.01)} step="0.01" value={Math.min(project.sectionDepth, Math.max(0.01, modelHeight - 0.01))} onChange={(event) => patch({ sectionDepth: Number(event.target.value), ignoredContourIds: [] }, "Schnittebene verschoben.")} /></label><div className="facts"><Fact label="Erkannte Konturen" value={String(contours.length)} /><Fact label="Modellhöhe" value={`${modelHeight.toFixed(2)} mm`} /></div>{!contours.length && <Notice>Auf dieser Ebene wurde keine geschlossene Kontur gefunden. Verschiebe die Ebene.</Notice>}</div>;
  if (step === 3) return <div className="inspector-content"><PanelHeading title="Werkstück-Nullpunkt" text="Die Koordinaten im G-Code beziehen sich auf diesen Punkt. Setze denselben Punkt später an der Maschine." /><OriginPicker value={project.originPreset} onChange={(value) => patch({ originPreset: value }, "Nullpunkt gesetzt.")} /></div>;
  if (step === 4) return <div className="inspector-content"><PanelHeading title="Stichel und Tiefe" text="Der Stichel wird maßstäblich in der Bühne angezeigt. Prüfe zuerst Tiefe und Sicherheitsabstand." /><div className="field-grid"><NumberField label="Spitzenbreite" value={project.tool.diameter} unit="mm" min={0.01} step={0.05} onChange={(value) => patchTool("diameter", value)} /><NumberField label="Spitzenwinkel" value={project.tool.angle} unit="°" min={10} step={5} onChange={(value) => patchTool("angle", value)} /><NumberField label="Gravurtiefe" value={project.tool.depth} unit="mm" min={0.01} step={0.05} onChange={(value) => patchTool("depth", value)} /><NumberField label="Zustellung" value={project.tool.stepDown} unit="mm" min={0.01} step={0.05} onChange={(value) => patchTool("stepDown", value)} /><NumberField label="Sicherheits-Z" value={project.tool.safeZ} unit="mm" min={0.1} step={0.5} onChange={(value) => patchTool("safeZ", value)} /><NumberField label="Vorschub" value={project.tool.feedRate} unit="mm/min" min={1} step={10} onChange={(value) => patchTool("feedRate", value)} /><NumberField label="Eintauchen" value={project.tool.plungeRate} unit="mm/min" min={1} step={10} onChange={(value) => patchTool("plungeRate", value)} /><NumberField label="Drehzahl" value={project.tool.spindleRpm} unit="U/min" min={1} step={500} onChange={(value) => patchTool("spindleRpm", value)} /></div></div>;
  if (step === 5) return <div className="inspector-content"><PanelHeading title="Unwichtige Kanten ausblenden" text="Klicke die Würfelkante oder andere Konturen direkt in der Draufsicht an. Blau wird gefräst, Grau ignoriert." /><div className="contour-list">{contours.map((contour, index) => { const ignored = project.ignoredContourIds.includes(contour.id); return <button key={contour.id} onClick={() => toggleContour(contour.id)} className={ignored ? "is-ignored" : ""}><span>{index + 1}</span><div><b>{ignored ? "Ignorieren" : "Bearbeiten"}</b><small>{contour.perimeter.toFixed(1)} mm Umfang</small></div>{ignored ? <EyeOff /> : <Eye />}</button>; })}</div><Fact label="Aktiv" value={`${activeCount} von ${contours.length}`} /></div>;
  return <div className="inspector-content"><PanelHeading title="Bewegung berechnen" text="Nichts wird automatisch berechnet. 2D fährt einmal auf Endtiefe, 3D teilt die Tiefe in sichere Zustellungen." /><div className="calculate-grid"><button onClick={() => calculate("2d")} className={project.motionMode === "2d" && result ? "is-selected" : ""}><b>2D-Bewegung</b><span>Eine konstante Gravurtiefe</span></button><button onClick={() => calculate("3d")} className={project.motionMode === "3d" && result ? "is-selected" : ""}><b>3D-Bewegung</b><span>Mehrere Tiefenstufen</span></button></div><SequenceEditor project={project} patch={patch} />{result && <><div className="result-summary"><Fact label="Werkzeugwege" value={String(result.passes.length)} /><Fact label="Schnittlänge" value={`${result.cutLength.toFixed(1)} mm`} /><Fact label="Schätzung" value={formatTime(result.estimatedSeconds)} /></div>{result.warnings.map((warning) => <Notice key={warning}>{warning}</Notice>)}<textarea className="gcode-output" value={result.gcode} readOnly aria-label="Generierter G-Code" /><div className="export-actions"><button className="secondary-button" onClick={copy}><Clipboard />Kopieren</button><button className="primary-button" onClick={download}><Download />Exportieren</button></div><span className="shortcut-hint">Strg C kopiert den G-Code, wenn kein Text markiert ist.</span></>}</div>;
}

function SequenceEditor({ project, patch }: { project: ProjectState; patch: (value: Partial<ProjectState>, message?: string) => void }) {
  const labels: Record<SequencePreset, string> = { "safe-start": "Sicher starten", movement: "Berechnete Bewegung", pause: "Pause", "return-origin": "Zum Nullpunkt", "safe-end": "Sicher beenden" };
  const add = (preset: SequencePreset) => { const end = project.sequence.findIndex((step) => step.preset === "safe-end"); const next = project.sequence.slice(); next.splice(end < 0 ? next.length : end, 0, { id: crypto.randomUUID(), preset, label: labels[preset] }); patch({ sequence: next }, "Schritt hinzugefügt."); };
  const move = (index: number, direction: number) => { const next = project.sequence.slice(); const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; patch({ sequence: next }, "Reihenfolge geändert."); };
  return <section className="sequence-editor"><div className="section-label"><span>Manuelle Schritte</span><small>Reihenfolge im G-Code</small></div>{project.sequence.map((item, index) => <div className="sequence-row" key={item.id}><span className="drag-index">{index + 1}</span><b>{item.label}</b><button onClick={() => move(index, -1)} disabled={index === 0} aria-label="Nach oben"><ChevronUp /></button><button onClick={() => move(index, 1)} disabled={index === project.sequence.length - 1} aria-label="Nach unten"><ChevronDown /></button><button onClick={() => patch({ sequence: project.sequence.filter((current) => current.id !== item.id) }, "Schritt entfernt.")} disabled={item.preset === "movement"} aria-label="Entfernen"><Trash2 /></button></div>)}<div className="preset-row"><span><Plus />Preset</span>{(["safe-start", "pause", "return-origin", "safe-end"] as SequencePreset[]).map((preset) => <button key={preset} onClick={() => add(preset)}>{labels[preset]}</button>)}</div></section>;
}

function OriginPicker({ value, onChange }: { value: OriginPreset; onChange: (value: OriginPreset) => void }) { const positions: OriginPreset[] = ["top-left", "center", "top-right", "bottom-left", "bottom-right"]; return <div className="origin-picker"><div className="origin-board">{positions.map((position) => <button key={position} className={`${position} ${value === position ? "is-selected" : ""}`} onClick={() => onChange(position)} aria-label={`Nullpunkt ${position}`}><span /></button>)}</div><p>Blauer Punkt = X0 / Y0 · Z0 liegt auf der Oberfläche.</p></div>; }
function NumberField({ label, value, unit, min, step, onChange }: { label: string; value: number; unit: string; min: number; step: number; onChange: (value: number) => void }) { return <label className="number-field"><span>{label}</span><div><input type="number" value={value} min={min} step={step} onChange={(event) => onChange(Number(event.target.value))} /><b>{unit}</b></div></label>; }
function PanelHeading({ title, text }: { title: string; text: string }) { return <div className="panel-heading"><h2>{title}</h2><p>{text}</p></div>; }
function Fact({ label, value }: { label: string; value: string }) { return <div className="fact"><span>{label}</span><b>{value}</b></div>; }
function Notice({ children }: { children: React.ReactNode }) { return <div className="notice">{children}</div>; }
function formatTime(seconds: number) { const minutes = Math.floor(seconds / 60); const rest = Math.round(seconds % 60); return minutes ? `${minutes} min ${rest} s` : `${rest} s`; }
function stageTitle(step: number) { return ["Ein gutes Ergebnis beginnt mit einer guten Datei.", "Lege fest, was oben ist.", "Zeige der Software die wichtigen Kanten.", "Lege X0, Y0 und Z0 bewusst fest.", "Prüfe den Stichel vor der Bewegung.", "Entferne alles, was nicht gefräst werden soll.", "Berechne erst, wenn alles stimmt."][step]; }