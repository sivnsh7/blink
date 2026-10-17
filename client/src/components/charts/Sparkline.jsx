import React, { useId } from 'react';

/**
 * Flat sparkline. One stroke, one soft fill, no axes.
 * Returns a quiet baseline instead of collapsing when data is thin.
 */
export default function Sparkline({
  data = [],
  width = 240,
  height = 44,
  color = 'var(--accent)',
  fill = true,
  min = 0,
  max,
  label = 'Trend',
}) {
  const gid = useId().replace(/:/g, '');
  const pts = data
    .map((d) => (typeof d === 'number' ? d : Number(d?.value)))
    .filter((n) => Number.isFinite(n));

  if (pts.length < 2) {
    return (
      <svg className="chart" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: not enough samples`} preserveAspectRatio="none">
        <line x1="0" x2={width} y1={height - 1} y2={height - 1} stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4" />
      </svg>
    );
  }

  const lo = Number.isFinite(min) ? Math.min(min, ...pts) : Math.min(...pts);
  const hi = Number.isFinite(max) ? Math.max(max, ...pts) : Math.max(...pts);
  const span = hi - lo || 1;
  const pad = 3;
  const stepX = (width - pad * 2) / (pts.length - 1);

  const coords = pts.map((v, i) => {
    const x = pad + i * stepX;
    const y = height - pad - ((v - lo) / span) * (height - pad * 2);
    return [x, y];
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)} ${height - pad} L${coords[0][0].toFixed(1)} ${height - pad} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg
      className="chart"
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label}: ${last.toFixed(1)}`}
      preserveAspectRatio="none"
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={`f${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.16" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#f${gid})`} />
        </>
      )}
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
