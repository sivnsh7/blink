/**
 * Shared formatting. One set of units for the whole product (binary, IEC
 * labels) so a value never reads "1.2 GB" in one card and "1.1 GiB" in another.
 */

export const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

export function bytes(v, { rate = false, digits } = {}) {
  if (!isNum(v)) return '—';
  let n = Math.max(0, Number(v));
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const d = digits ?? (i === 0 ? 0 : n >= 100 ? 0 : n >= 10 ? 1 : 2);
  return `${n.toFixed(d)} ${units[i]}${rate ? '/s' : ''}`;
}

export const pct = (v, digits = 1) => (isNum(v) ? `${Number(v).toFixed(digits)}%` : '—');

export function uptime(seconds) {
  if (!isNum(seconds) || seconds < 0) return '—';
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const clampPct = (v) => Math.max(0, Math.min(100, isNum(v) ? Number(v) : 0));

export const series = (history, key) =>
  (history?.[key] || []).map((p) => (typeof p === 'number' ? p : p?.value));

export const lastOf = (history, key, fallback = 0) => {
  const arr = series(history, key).filter(isNum);
  return arr.length ? Number(arr[arr.length - 1]) : fallback;
};
