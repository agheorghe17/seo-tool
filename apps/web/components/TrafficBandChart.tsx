'use client';

import type { TrafficEstimateDto } from '@/lib/queries';
import { Badge } from './ui';

/**
 * Epic 8.7 — traffic projection as a MIN-MAX BAND, never a single line.
 * Renders inline SVG so there's no chart dependency and it prints cleanly.
 */
export function TrafficBandChart({ estimate }: { estimate: TrafficEstimateDto }) {
  const w = 640;
  const h = 220;
  const pad = { l: 48, r: 16, t: 16, b: 28 };
  const pts = [{ month: 0, low: estimate.baselineMonthlyVisits, mid: estimate.baselineMonthlyVisits, high: estimate.baselineMonthlyVisits }, ...estimate.series];

  const maxY = Math.max(...pts.map((p) => p.high), 1);
  const minY = Math.min(...pts.map((p) => p.low), 0);
  const x = (m: number) => pad.l + (m / (pts.length - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => h - pad.b - ((v - minY) / (maxY - minY || 1)) * (h - pad.t - pad.b);

  const area =
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.high)}`).join(' ') +
    ' ' +
    [...pts].reverse().map((p, i) => `L ${x(pts.length - 1 - i)} ${y(p.low)}`).join(' ') +
    ' Z';
  const midLine = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.mid)}`).join(' ');

  const confTone = estimate.confidenceLevel === 'medium' ? 'warning' : estimate.confidenceLevel === 'high' ? 'good' : 'neutral';

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-neutral-500">Baseline:</span>
        <strong className="tabular-nums">{estimate.baselineMonthlyVisits.toLocaleString()}</strong>
        <span className="text-neutral-500">vizite/lună</span>
        <Badge tone={confTone}>încredere: {estimate.confidenceLevel}</Badge>
        <span className="text-neutral-500">
          sursă: {estimate.baselineSource === 'gsc' ? 'Google Search Console' : 'model keyword'}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Interval estimat de trafic pe luni">
        {[0, 0.5, 1].map((f) => {
          const val = minY + f * (maxY - minY);
          return (
            <g key={f}>
              <line x1={pad.l} x2={w - pad.r} y1={y(val)} y2={y(val)} className="stroke-neutral-200 dark:stroke-neutral-800" />
              <text x={4} y={y(val) + 4} className="fill-neutral-400 text-[10px]">
                {Math.round(val).toLocaleString()}
              </text>
            </g>
          );
        })}
        <path d={area} className="fill-sky-400/25" />
        <path d={midLine} className="fill-none stroke-sky-500" strokeWidth={2} />
        {pts.map((p, i) =>
          i % Math.ceil(pts.length / 7 || 1) === 0 || i === pts.length - 1 ? (
            <text key={i} x={x(i)} y={h - 8} className="fill-neutral-400 text-[10px]" textAnchor="middle">
              L{p.month}
            </text>
          ) : null,
        )}
      </svg>
      <p className="mt-2 text-xs text-neutral-500">
        Bandă = scenariu pesimist → optimist. Linia = mijloc. Nu este o promisiune; rezultatele reale pot fi în afara benzii.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
        {(['estimateLow', 'estimateMid', 'estimateHigh'] as const).map((k, i) => (
          <div key={k} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
            <div className="text-xs text-neutral-500">{['pesimist', 'mijloc', 'optimist'][i]}</div>
            <div className="text-lg font-semibold tabular-nums">{estimate[k].toLocaleString()}</div>
          </div>
        ))}
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-neutral-500">Asumpții ({estimate.assumptions.length})</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-500">
          {estimate.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
