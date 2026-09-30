import { useMemo, useRef, useState } from "react";

export interface Series { id: string; label: string; color: string; points: Array<{ x: number; y: number }>; dashed?: boolean }
interface Props {
  series: Series[];
  xLabel: string;
  yLabel: string;
  height?: number;
  refLines?: Array<{ y: number; label: string }>;
  band?: { y0: number; y1: number; label: string };
  xFormat?: (x: number) => string;
  yFormat?: (y: number) => string;
  yMin?: number;
  yMax?: number;
  title: string;
}

function niceTicks(min: number, max: number, count = 5) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/** Line chart with crosshair tooltip, reference lines, legend (≥2 series) and table view. */
export default function LineChart({ series, xLabel, yLabel, height = 240, refLines = [], band, xFormat = (x) => x.toFixed(0), yFormat = (y) => y.toFixed(2), yMin, yMax, title }: Props) {
  const W = 640, H = height, m = { l: 52, r: 16, t: 12, b: 38 };
  const all = series.flatMap((s) => s.points);
  const xs = all.map((p) => p.x), ys = [...all.map((p) => p.y), ...refLines.map((r) => r.y), ...(band ? [band.y0, band.y1] : [])];
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const lo = yMin ?? Math.min(...ys), hi = yMax ?? Math.max(...ys);
  const pad = (hi - lo) * 0.08 || 1;
  const y0 = yMin ?? lo - pad, y1 = yMax ?? hi + pad;
  const sx = (x: number) => m.l + ((x - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
  const sy = (y: number) => H - m.b - ((y - y0) / (y1 - y0 || 1)) * (H - m.t - m.b);
  const xt = useMemo(() => niceTicks(x0, x1, 6), [x0, x1]);
  const yt = useMemo(() => niceTicks(y0, y1, 5), [y0, y1]);
  const [hx, setHx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const valueAt = (s: Series, x: number) => {
    const p = s.points;
    if (!p.length) return null;
    if (x <= p[0].x) return p[0].y;
    for (let i = 1; i < p.length; i++) if (p[i].x >= x) { const a = p[i - 1], b = p[i]; return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x || 1); }
    return p[p.length - 1].y;
  };
  const onMove = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const x = x0 + ((px - m.l) / (W - m.l - m.r)) * (x1 - x0);
    setHx(Math.min(Math.max(x, x0), x1));
  };
  if (!all.length) return null;
  return (
    <figure className="w-full">
      <figcaption className="mb-1 text-sm font-semibold text-ink">{title}</figcaption>
      {series.length >= 2 && (
        <div className="mb-1 flex flex-wrap gap-3 text-xs text-ink-2">
          {series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "4 3" : undefined} /></svg>{s.label}
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" role="img" aria-label={title}
          onPointerMove={onMove} onPointerLeave={() => setHx(null)}>
          {band && <rect x={m.l} y={sy(band.y1)} width={W - m.l - m.r} height={Math.max(0, sy(band.y0) - sy(band.y1))} fill="#1baf7a" opacity="0.10" />}
          {yt.map((v) => (
            <g key={v}>
              <line x1={m.l} x2={W - m.r} y1={sy(v)} y2={sy(v)} stroke="#e8eeed" />
              <text x={m.l - 6} y={sy(v)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="#6b8081">{yFormat(v)}</text>
            </g>
          ))}
          {xt.map((v) => <text key={v} x={sx(v)} y={H - m.b + 16} textAnchor="middle" fontSize="11" fill="#6b8081">{xFormat(v)}</text>)}
          <line x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} stroke="#c9d6d5" />
          <text x={(W + m.l) / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="#3f5859">{xLabel}</text>
          <text x={12} y={(H - m.b + m.t) / 2} textAnchor="middle" fontSize="11" fill="#3f5859" transform={`rotate(-90 12 ${(H - m.b + m.t) / 2})`}>{yLabel}</text>
          {refLines.map((r) => (
            <g key={r.label}>
              <line x1={m.l} x2={W - m.r} y1={sy(r.y)} y2={sy(r.y)} stroke="#b42318" strokeDasharray="5 4" strokeWidth="1.5" />
              <text x={W - m.r - 4} y={sy(r.y) - 5} textAnchor="end" fontSize="11" fill="#b42318">{r.label}</text>
            </g>
          ))}
          {band && <text x={m.l + 6} y={sy(band.y1) + 13} fontSize="11" fill="#146c4f">{band.label}</text>}
          {series.map((s) => (
            <polyline key={s.id} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "6 4" : undefined}
              points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")} />
          ))}
          {hx !== null && (
            <g>
              <line x1={sx(hx)} x2={sx(hx)} y1={m.t} y2={H - m.b} stroke="#3f5859" strokeWidth="1" opacity="0.5" />
              {series.map((s) => { const v = valueAt(s, hx); return v === null ? null : <circle key={s.id} cx={sx(hx)} cy={sy(v)} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />; })}
            </g>
          )}
        </svg>
        {hx !== null && (
          <div className="pointer-events-none absolute top-2 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs shadow-md"
            style={{ left: `${Math.min(Math.max((sx(hx) / W) * 100, 5), 70)}%` }}>
            <div className="font-semibold text-ink">{xLabel}: {xFormat(hx)}</div>
            {series.map((s) => { const v = valueAt(s, hx); return v === null ? null : (
              <div key={s.id} className="flex items-center gap-1.5 text-ink-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} /><strong className="text-ink">{yFormat(v)}</strong> {s.label}
              </div>
            ); })}
          </div>
        )}
      </div>
      <details className="mt-1 text-xs text-ink-2">
        <summary className="cursor-pointer">Table view</summary>
        <div className="max-h-48 overflow-auto">
          <table className="table-clean">
            <thead><tr><th>{xLabel}</th>{series.map((s) => <th key={s.id}>{s.label}</th>)}</tr></thead>
            <tbody>
              {series[0].points.filter((_, i, a) => a.length < 25 || i % Math.ceil(a.length / 25) === 0).map((p) => (
                <tr key={p.x}><td>{xFormat(p.x)}</td>{series.map((s) => <td key={s.id}>{yFormat(valueAt(s, p.x) ?? NaN)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
