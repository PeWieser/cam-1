import { useId, useState, type ReactNode } from 'react';
import { cn } from '../utils/cn';
import type { OriginXY } from '../types';

// --- Sektion mit Auf-/Zuklappen ---------------------------------------------
export function Section({ title, children, defaultOpen = true }: {
  title: string; children: ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-200">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-800"
      >
        {title}
        <span className={cn('text-zinc-400 transition-transform', open && 'rotate-90')}>›</span>
      </button>
      {open && <div className="space-y-2.5 px-4 pb-4">{children}</div>}
    </div>
  );
}

// --- Zahlenfeld ---------------------------------------------------------------
export function NumberField({ label, value, onChange, min, max, step, unit, hint }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; unit?: string; hint?: string;
}) {
  const id = useId();
  return (
    <div title={hint}>
      <label htmlFor={id} className="mb-0.5 block text-xs text-zinc-500">{label}</label>
      <div className="flex items-center rounded-md border border-zinc-300 bg-white focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500">
        <input
          id={id}
          type="number"
          value={value}
          min={min} max={max} step={step ?? 0.1}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange(v);
          }}
          className="w-full bg-transparent px-2 py-1.5 text-sm text-zinc-800 outline-none"
        />
        {unit && <span className="pr-2 text-xs text-zinc-400">{unit}</span>}
      </div>
    </div>
  );
}

// --- Slider mit Wertanzeige ------------------------------------------------------
export function SliderField({ label, value, onChange, min, max, step, unit }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; unit?: string;
}) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-xs text-zinc-500">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-700">{value}{unit}</span>
      </div>
      <input
        type="range"
        value={value} min={min} max={max} step={step ?? 1}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-sky-600"
      />
    </div>
  );
}

// --- Toggle -----------------------------------------------------------------------
export function Toggle({ label, checked, onChange, hint }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-zinc-700" title={hint}>
      <span className="text-xs text-zinc-600">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-sky-600' : 'bg-zinc-300'
        )}
      >
        <span className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
          checked ? 'left-4.5' : 'left-0.5'
        )} />
      </button>
    </label>
  );
}

// --- Segment-Auswahl -----------------------------------------------------------------
export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; hint?: string }[];
  value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-1 rounded-lg bg-zinc-100 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-1 py-1.5 text-xs font-medium transition-colors',
            value === o.value ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// --- Nullpunkt-Wahl (3×3) ---------------------------------------------------------------
const originGrid: OriginXY[][] = [
  ['back-left', 'back-center', 'back-right'],
  ['center-left', 'center', 'center-right'],
  ['front-left', 'front-center', 'front-right'],
];

export function OriginPicker({ value, onChange }: { value: OriginXY; onChange: (v: OriginXY) => void }) {
  return (
    <div className="inline-grid grid-cols-3 gap-1 rounded-lg border border-zinc-200 bg-white p-1.5">
      {originGrid.flat().map((o) => (
        <button
          key={o}
          type="button"
          title={o}
          onClick={() => onChange(o)}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded transition-colors',
            value === o ? 'bg-sky-600' : 'bg-zinc-100 hover:bg-zinc-200'
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', value === o ? 'bg-white' : 'bg-zinc-400')} />
        </button>
      ))}
    </div>
  );
}
