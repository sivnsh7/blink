import React, { useId } from 'react';

/** Compact SVG trend chart with a quiet grid and a single, legible series. */
export default function IsoBars({
  data = [],
  width = 560,
  height = 140,
  max = 100,
  label = 'Activity over time',
  formatValue,
}) {
  const id = useId().replace(/:/g, '');
  const values = data
    .map(item => (typeof item === 'number' ? item : item?.value))
    .filter(value => typeof value === 'number' && Number.isFinite(value));
  const left = 5;
  const right = width - 5;
  const top = 10;
  const bottom = height - 12;
  const upper = Math.max(1, Number.isFinite(max) ? max : 100, ...values);
  const xStep = values.length > 1 ? (right - left) / (values.length - 1) : 0;
  const points = values.map((value, index) => ({
    x: left + index * xStep,
    y: bottom - (Math.max(0, value) / upper) * (bottom - top),
  }));
  const line = points.map((point, index) =>
    `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  ).join(' ');
  const area = points.length
    ? `${line} L${right} ${bottom} L${left} ${bottom} Z`
    : '';
  const last = values.length ? values[values.length - 1] : null;

  return (
    <svg
      className="chart trend-chart"
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label}: ${last == null ? 'awaiting samples' : formatValue ? formatValue(last) : last.toFixed(1)}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`trend-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity=".16" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map(fraction => {
        const y = top + fraction * (bottom - top);
        return <line key={fraction} x1={left} x2={right} y1={y} y2={y} stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4" />;
      })}
      {points.length > 1 && <path d={area} fill={`url(#trend-fill-${id})`} />}
      {points.length > 1 && <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      {points.length > 0 && <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3" fill="var(--brand)" />}
      {points.length < 2 && (
        <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="middle" fill="var(--text-muted)" fontSize="11" fontFamily="var(--font-body)">
          Awaiting samples
        </text>
      )}
      {formatValue && last != null && <title>{`${label}: ${formatValue(last)}`}</title>}
    </svg>
  );
}
