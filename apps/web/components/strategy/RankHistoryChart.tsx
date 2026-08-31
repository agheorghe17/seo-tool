'use client';

/** SVG line chart of position over time (lower = better, so the Y axis is inverted). */
export function RankHistoryChart({
  points,
}: {
  points: { capturedAt: string; position: number | null }[];
}) {
  const data = points.filter((p) => p.position != null) as { capturedAt: string; position: number }[];
  if (data.length < 2) {
    return <p className="text-sm text-neutral-500">Nu sunt suficiente date de istoric încă.</p>;
  }
  const w = 560;
  const h = 180;
  const pad = { l: 34, r: 12, t: 12, b: 22 };
  const maxPos = Math.min(60, Math.max(...data.map((d) => d.position), 10));
  const x = (i: number) => pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r);
  const y = (pos: number) => pad.t + ((pos - 1) / (maxPos - 1)) * (h - pad.t - pad.b); // inverted

  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.position)}`).join(' ');
  const fmt = (s: string) => new Date(s).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Evoluția poziției">
      {[1, Math.round(maxPos / 2), maxPos].map((p) => (
        <g key={p}>
          <line x1={pad.l} x2={w - pad.r} y1={y(p)} y2={y(p)} className="stroke-neutral-200 dark:stroke-neutral-800" />
          <text x={4} y={y(p) + 4} className="fill-neutral-400 text-[10px]">
            #{p}
          </text>
        </g>
      ))}
      <path d={path} className="fill-none stroke-emerald-500" strokeWidth={2} />
      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.position)} r={2.5} className="fill-emerald-500" />
      ))}
      {[0, data.length - 1].map((i) => (
        <text key={i} x={x(i)} y={h - 6} className="fill-neutral-400 text-[10px]" textAnchor={i === 0 ? 'start' : 'end'}>
          {fmt(data[i]!.capturedAt)}
        </text>
      ))}
    </svg>
  );
}
