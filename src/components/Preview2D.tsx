import { useEffect, useRef, useState } from 'react';
import type { ToolpathResult } from '../types';

type Props = { result: ToolpathResult | null };

export default function Preview2D({ result }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ scale: number; ox: number; oy: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Auto-Fit bei neuem Ergebnis
  useEffect(() => {
    if (!result?.bounds || !containerRef.current) { setView(null); return; }
    const el = containerRef.current;
    const b = result.bounds;
    const w = Math.max(b.maxX - b.minX, 1), h = Math.max(b.maxY - b.minY, 1);
    const scale = Math.min((el.clientWidth - 80) / w, (el.clientHeight - 80) / h);
    setView({
      scale,
      ox: el.clientWidth / 2 - ((b.minX + b.maxX) / 2) * scale,
      oy: el.clientHeight / 2 + ((b.minY + b.maxY) / 2) * scale,
    });
  }, [result]);

  useEffect(() => {
    const canvas = canvasRef.current, el = containerRef.current;
    if (!canvas || !el) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = el.clientWidth * dpr;
    canvas.height = el.clientHeight * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, el.clientWidth, el.clientHeight);

    if (!result || !view) return;
    const { scale, ox, oy } = view;
    const X = (x: number) => ox + x * scale;
    const Y = (y: number) => oy - y * scale;

    // mm-Raster
    const gridStep = niceStep(50 / scale);
    ctx.strokeStyle = '#f1f1f3';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const x0 = Math.floor(-ox / scale / gridStep) * gridStep;
    const x1 = (el.clientWidth - ox) / scale;
    for (let x = x0; x <= x1; x += gridStep) { ctx.moveTo(X(x), 0); ctx.lineTo(X(x), el.clientHeight); }
    const y0 = Math.floor((oy - el.clientHeight) / scale / gridStep) * gridStep;
    const y1 = oy / scale;
    for (let y = y0; y <= y1; y += gridStep) { ctx.moveTo(0, Y(y)); ctx.lineTo(el.clientWidth, Y(y)); }
    ctx.stroke();

    // Original-Konturen (hellgrau, gestrichelt) zur Orientierung
    ctx.strokeStyle = '#d4d4d8';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    for (const c of result.allContours) {
      ctx.beginPath();
      c.pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
      if (c.closed) ctx.closePath();
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Eilgänge (nur erste Tiefenebene)
    const firstZ = result.passes.length ? result.passes[0].z : 0;
    const firstLevel = result.passes.filter((p) => p.z === firstZ);
    ctx.strokeStyle = '#fca5a5';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    let last: { x: number; y: number } | null = null;
    for (const p of firstLevel) {
      if (last) { ctx.moveTo(X(last.x), Y(last.y)); ctx.lineTo(X(p.pts[0].x), Y(p.pts[0].y)); }
      last = p.closed ? p.pts[0] : p.pts[p.pts.length - 1];
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Werkzeugwege
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    for (const p of firstLevel) {
      ctx.beginPath();
      p.pts.forEach((pt, i) => (i ? ctx.lineTo(X(pt.x), Y(pt.y)) : ctx.moveTo(X(pt.x), Y(pt.y))));
      if (p.closed) ctx.closePath();
      ctx.stroke();
    }

    // Nullpunkt
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(X(0) - 12, Y(0)); ctx.lineTo(X(0) + 12, Y(0));
    ctx.moveTo(X(0), Y(0) - 12); ctx.lineTo(X(0), Y(0) + 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(0), Y(0), 5, 0, Math.PI * 2);
    ctx.stroke();

    // Maßangabe
    if (result.bounds) {
      const b = result.bounds;
      ctx.fillStyle = '#71717a';
      ctx.font = '11px ui-sans-serif, system-ui';
      ctx.fillText(
        `${(b.maxX - b.minX).toFixed(1)} × ${(b.maxY - b.minY).toFixed(1)} mm   Raster ${gridStep} mm`,
        10, el.clientHeight - 10
      );
    }
  }, [result, view]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
      onWheel={(e) => {
        if (!view) return;
        const rect = containerRef.current!.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        setView({
          scale: view.scale * f,
          ox: mx - (mx - view.ox) * f,
          oy: my - (my - view.oy) * f,
        });
      }}
      onPointerDown={(e) => {
        if (!view) return;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        dragRef.current = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy };
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (!d || !view) return;
        setView({ scale: view.scale, ox: d.ox + e.clientX - d.x, oy: d.oy + e.clientY - d.y });
      }}
      onPointerUp={() => (dragRef.current = null)}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {!result?.passes.length && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
          Keine Werkzeugwege – Datei laden bzw. Einstellungen prüfen
        </div>
      )}
    </div>
  );
}

function niceStep(min: number): number {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  for (const s of steps) if (s >= min) return s;
  return 1000;
}
