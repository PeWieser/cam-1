import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CamSettings, MeshData, ToolpathResult } from './types';
import { defaultSettings } from './types';
import { loadModelFile, SUPPORTED_EXT } from './lib/loaders';
import { computeToolpaths } from './lib/toolpath';
import { generateGcode } from './lib/gcode';
import Viewer3D from './components/Viewer3D';
import Preview2D from './components/Preview2D';
import { NumberField, OriginPicker, Section, Segmented, SliderField, Toggle } from './components/controls';
import { cn } from './utils/cn';

type Tab = '3d' | '2d' | 'gcode';

export default function App() {
  const [mesh, setMesh] = useState<MeshData | null>(null);
  const [settings, setSettings] = useState<CamSettings>(defaultSettings);
  const [result, setResult] = useState<ToolpathResult | null>(null);
  const [tab, setTab] = useState<Tab>('3d');
  const [loading, setLoading] = useState(false);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = useCallback(<K extends keyof CamSettings>(key: K, value: CamSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  }, []);

  // Datei laden
  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const m = await loadModelFile(file);
      setMesh(m);
      setTab('2d');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Datei konnte nicht gelesen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Werkzeugwege berechnen (entprellt)
  useEffect(() => {
    if (!mesh) { setResult(null); return; }
    setComputing(true);
    const t = setTimeout(() => {
      try {
        setResult(computeToolpaths(mesh, settings));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Berechnung fehlgeschlagen.');
        setResult(null);
      } finally {
        setComputing(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [mesh, settings]);

  const gcode = useMemo(() => {
    if (!result?.passes.length || !mesh) return '';
    return generateGcode(result, settings, mesh.name);
  }, [result, settings, mesh]);

  const download = () => {
    if (!gcode || !mesh) return;
    const blob = new Blob([gcode], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = mesh.name.replace(/\.[^.]+$/, '') + '.gcode';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const modelSize = mesh
    ? mesh.bbox.max.map((v, i) => ((v - mesh.bbox.min[i]) * settings.scale) / 100)
    : null;

  return (
    <div
      className="flex h-screen flex-col bg-zinc-50 text-zinc-900"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
      }}
    >
      {/* ---------- Kopfzeile ---------- */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4">
        <div className="flex items-center gap-2.5">
          <svg width="20" height="20" viewBox="0 0 24 24" className="text-sky-600">
            <path fill="currentColor" d="M12 2 L15 10 H9 Z" />
            <path fill="currentColor" opacity="0.5" d="M11 10 h2 v6 l-1 6 -1 -6 Z" />
          </svg>
          <h1 className="text-sm font-semibold tracking-tight">Stichel CAM</h1>
          <span className="text-xs text-zinc-400">3D → Gravur-G-Code für 3-Achs-Fräsen</span>
        </div>
        <div className="flex items-center gap-2">
          {mesh && (
            <span className="hidden text-xs text-zinc-400 md:block">
              {mesh.name} · {mesh.triangleCount.toLocaleString('de-DE')} Dreiecke
              {modelSize && ` · ${modelSize.map((v) => v.toFixed(1)).join(' × ')} mm`}
            </span>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50"
          >
            {mesh ? 'Andere Datei…' : 'Datei öffnen…'}
          </button>
          <button
            onClick={download}
            disabled={!gcode}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            G-Code herunterladen
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={SUPPORTED_EXT.map((e) => '.' + e).join(',')}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
      </header>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          {error}
          <button className="ml-3 underline" onClick={() => setError(null)}>schließen</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ---------- Einstellungen ---------- */}
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-zinc-200 bg-white">
          <Section title="Schnittebene">
            <SliderField
              label="Höhe im Modell"
              value={settings.slicePercent} min={0} max={100} step={1} unit=" %"
              onChange={(v) => set('slicePercent', v)}
            />
            {mesh && (
              <p className="text-[11px] leading-snug text-zinc-400">
                Z = {(mesh.bbox.min[2] + ((mesh.bbox.max[2] - mesh.bbox.min[2]) * settings.slicePercent) / 100).toFixed(2)} mm.
                Das Modell wird auf dieser Höhe geschnitten; die Konturen des Schnitts werden graviert.
              </p>
            )}
            <NumberField label="Skalierung" value={settings.scale} min={1} step={1} unit="%" onChange={(v) => set('scale', v)} />
          </Section>

          <Section title="Strategie">
            <Segmented
              value={settings.strategy}
              onChange={(v) => set('strategy', v)}
              options={[
                { value: 'contour', label: 'Kontur', hint: 'Umrisse der Schnittebene abfahren' },
                { value: 'centerline', label: 'Mittellinie', hint: 'Mittellinien dünner Formen (Schrift/Zahlen) mit einem Strich gravieren' },
                { value: 'fill', label: 'Füllung', hint: 'Flächen mit Schraffur ausräumen' },
              ]}
            />
            {settings.strategy === 'centerline' && (
              <p className="text-[11px] leading-snug text-zinc-400">
                Ideal für Schriftzüge und Zahlen: Statt beider Umrisslinien wird nur die Strichmitte einmal graviert.
              </p>
            )}
            {settings.strategy === 'fill' && (
              <div className="space-y-2.5">
                <NumberField label="Zeilenabstand (Stepover)" value={settings.stepOver} min={0.05} step={0.05} unit="mm" onChange={(v) => set('stepOver', v)} />
                <NumberField label="Schraffurwinkel" value={settings.fillAngle} min={0} max={180} step={5} unit="°" onChange={(v) => set('fillAngle', v)} />
              </div>
            )}
            <NumberField
              label="Kurventoleranz" value={settings.tolerance} min={0.005} step={0.01} unit="mm"
              hint="Maximale Abweichung beim Vereinfachen von Kurven – kleiner = genauer, mehr G-Code"
              onChange={(v) => set('tolerance', v)}
            />
          </Section>

          <Section title="Tiefe & Zustellung">
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Gravurtiefe" value={settings.totalDepth} min={0.01} step={0.1} unit="mm" onChange={(v) => set('totalDepth', v)} />
              <NumberField label="Zustellung/Pass" value={settings.stepDown} min={0.01} step={0.05} unit="mm" onChange={(v) => set('stepDown', v)} />
            </div>
            <NumberField label="Sicherheitshöhe" value={settings.safeZ} min={0.5} step={0.5} unit="mm" onChange={(v) => set('safeZ', v)} />
          </Section>

          <Section title="Filter">
            <NumberField
              label="Konturen kürzer als … ignorieren" value={settings.minLength} min={0} step={0.1} unit="mm"
              onChange={(v) => set('minLength', v)}
            />
            <Toggle
              label="Äußerste Kontur ignorieren" checked={settings.ignoreOutermost}
              hint="Plattenrand/Umriss nicht gravieren – nur innenliegende Details"
              onChange={(v) => set('ignoreOutermost', v)}
            />
            <Toggle
              label="Innenkonturen (Löcher) ignorieren" checked={settings.ignoreInner}
              hint="Nur Außenumrisse gravieren"
              onChange={(v) => set('ignoreInner', v)}
            />
            <NumberField
              label="Max. Verschachtelungstiefe" value={settings.maxNestDepth} min={0} step={1}
              hint="0 = nur äußerste Ebene, 99 = alle Ebenen"
              onChange={(v) => set('maxNestDepth', Math.round(v))}
            />
          </Section>

          <Section title="Nullpunkt">
            <div className="flex items-start gap-3">
              <OriginPicker value={settings.originXY} onChange={(v) => set('originXY', v)} />
              <p className="text-[11px] leading-snug text-zinc-400">
                XY-Nullpunkt am Werkstück (oben = hinten, unten = vorne).
              </p>
            </div>
            <Segmented
              value={settings.originZ}
              onChange={(v) => set('originZ', v)}
              options={[
                { value: 'top', label: 'Z0 = Oberfläche' },
                { value: 'bottom-of-cut', label: 'Z0 = Gravurgrund' },
              ]}
            />
            <Toggle label="X spiegeln (Rückseitengravur)" checked={settings.mirrorX} onChange={(v) => set('mirrorX', v)} />
          </Section>

          <Section title="Maschine & Werkzeug" defaultOpen={false}>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Vorschub XY" value={settings.feedXY} min={1} step={50} unit="mm/min" onChange={(v) => set('feedXY', v)} />
              <NumberField label="Eintauchen Z" value={settings.feedZ} min={1} step={25} unit="mm/min" onChange={(v) => set('feedZ', v)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Drehzahl" value={settings.spindleRpm} min={0} step={1000} unit="U/min" onChange={(v) => set('spindleRpm', v)} />
              <NumberField label="Stichelspitze Ø" value={settings.toolDia} min={0.05} step={0.05} unit="mm" onChange={(v) => set('toolDia', v)} />
            </div>
            <Toggle label="Spindelbefehle (M3/M5) ausgeben" checked={settings.useSpindleCmd} onChange={(v) => set('useSpindleCmd', v)} />
          </Section>

          <div className="px-4 py-3">
            <button
              onClick={() => setSettings(defaultSettings)}
              className="text-xs text-zinc-400 underline hover:text-zinc-600"
            >
              Einstellungen zurücksetzen
            </button>
          </div>
        </aside>

        {/* ---------- Hauptbereich ---------- */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-3">
            <div className="flex gap-1">
              {([['3d', '3D-Modell'], ['2d', 'Werkzeugwege'], ['gcode', 'G-Code']] as [Tab, string][]).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium',
                    tab === t ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-800'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-zinc-400">
              {computing && <span className="text-sky-600">Berechne…</span>}
              {result && result.passes.length > 0 && (
                <>
                  <span>{result.contours.length} Konturen</span>
                  <span>Fräsweg {result.stats.cutLength.toFixed(0)} mm</span>
                  <span>{result.stats.passCount} Zustellung(en)</span>
                  <span>≈ {formatTime(result.stats.timeMin)}</span>
                </>
              )}
            </div>
          </div>

          <div className="relative min-h-0 flex-1">
            {!mesh && !loading && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-zinc-50"
              >
                <div className={cn(
                  'flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-16 py-14 transition-colors',
                  dragOver ? 'border-sky-500 bg-sky-50' : 'border-zinc-300'
                )}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="text-zinc-400">
                    <path d="M12 3v12m0-12L8 7m4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="text-sm font-medium text-zinc-700">3D-Datei hierher ziehen oder klicken</div>
                  <div className="text-xs text-zinc-400">STL · OBJ · 3MF · STEP · IGES · BREP</div>
                </div>
              </button>
            )}
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-50/80 text-sm text-zinc-500">
                Datei wird gelesen…
              </div>
            )}

            <div className={cn('h-full', tab !== '3d' && 'hidden')}>
              <Viewer3D mesh={mesh} slicePercent={settings.slicePercent} />
            </div>
            <div className={cn('h-full', tab !== '2d' && 'hidden')}>
              <Preview2D result={result} />
            </div>
            {tab === 'gcode' && (
              <div className="h-full overflow-auto bg-white p-4">
                {gcode ? (
                  <pre className="text-[11px] leading-relaxed text-zinc-600">{gcode}</pre>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                    Kein G-Code – erst Datei laden
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function formatTime(min: number): string {
  if (min < 1) return `${Math.round(min * 60)} s`;
  if (min < 60) return `${min.toFixed(1)} min`;
  return `${Math.floor(min / 60)} h ${Math.round(min % 60)} min`;
}
