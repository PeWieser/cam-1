import type { Contour, Point2D, ToolpathPass } from "../types/cam";

interface Props { contours: Contour[]; ignoredIds: string[]; origin: Point2D; passes?: ToolpathPass[]; interactive?: boolean; onToggle?: (id: string) => void }

export function ContourCanvas({ contours, ignoredIds, origin, passes = [], interactive, onToggle }: Props) {
  const all = contours.flatMap((contour) => contour.points);
  const minX = Math.min(...all.map((point) => point.x), 0); const maxX = Math.max(...all.map((point) => point.x), 1);
  const minY = Math.min(...all.map((point) => point.y), 0); const maxY = Math.max(...all.map((point) => point.y), 1);
  const pad = Math.max(maxX - minX, maxY - minY) * 0.08 + 0.5;
  const viewBox = `${minX - pad} ${-(maxY + pad)} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  const path = (points: Point2D[]) => points.map((point, index) => `${index ? "L" : "M"}${point.x} ${-point.y}`).join(" ");
  return <div className="contour-stage">
    <svg viewBox={viewBox} role="img" aria-label="Draufsicht der erkannten Konturen">
      <defs><pattern id="minor-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M 5 0 L 0 0 0 5" className="grid-line" /></pattern></defs>
      <rect x={minX - pad} y={-(maxY + pad)} width={maxX - minX + pad * 2} height={maxY - minY + pad * 2} fill="url(#minor-grid)" />
      {contours.map((contour) => {
        const ignored = ignoredIds.includes(contour.id);
        return <path key={contour.id} d={path(contour.points)} className={`contour-line ${ignored ? "is-ignored" : "is-active"} ${interactive ? "is-clickable" : ""}`}
          vectorEffect="non-scaling-stroke" tabIndex={interactive ? 0 : undefined} role={interactive ? "button" : undefined}
          aria-label={`${ignored ? "Ignorierte" : "Aktive"} Kontur, ${contour.perimeter.toFixed(1)} Millimeter`}
          onClick={() => interactive && onToggle?.(contour.id)} onKeyDown={(event) => { if (interactive && (event.key === "Enter" || event.key === " ")) onToggle?.(contour.id); }} />;
      })}
      {passes.map((pass, index) => <path key={`${pass.contourId}-${pass.depth}-${index}`} d={path(pass.points)} className="toolpath-line" vectorEffect="non-scaling-stroke" />)}
      <g transform={`translate(${origin.x} ${-origin.y})`} className="origin-mark" vectorEffect="non-scaling-stroke"><circle r={0.7} /><path d="M-2 0H2M0-2V2" /></g>
    </svg>
    <div className="stage-legend"><span><i className="active-swatch" />Bearbeiten</span><span><i className="ignored-swatch" />Ignorieren</span><span><i className="origin-swatch" />Nullpunkt</span></div>
  </div>;
}