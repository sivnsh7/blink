import React, { useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { bytes, isNum } from '../lib/format';

const SORTS = [
  { key: 'cpu', label: 'CPU' },
  { key: 'mem', label: 'Memory' },
  { key: 'pid', label: 'PID' },
  { key: 'name', label: 'Name' },
];

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Running' },
  { key: 'sleeping', label: 'Sleeping' },
];

export default function Processes({ metrics }) {
  const all = metrics?.processes || [];
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('cpu');
  const [filter, setFilter] = useState('all');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = all.filter((p) => {
      if (needle && !`${p.name} ${p.pid}`.toLowerCase().includes(needle)) return false;
      if (filter === 'active') return p.state === 'running';
      if (filter === 'sleeping') return p.state === 'sleeping';
      return true;
    });
    const by = {
      cpu: (a, b) => (b.cpuPercent || 0) - (a.cpuPercent || 0),
      mem: (a, b) => (b.rss || 0) - (a.rss || 0),
      pid: (a, b) => a.pid - b.pid,
      name: (a, b) => String(a.name).localeCompare(String(b.name)),
    }[sort];
    return [...filtered].sort(by);
  }, [all, query, sort, filter]);

  const totalCpu = all.reduce((s, p) => s + (Number(p.cpuPercent) || 0), 0);
  const totalMem = all.reduce((s, p) => s + (Number(p.rss) || 0), 0);

  return (
    <div className="stack">
      <section className="card card-pad">
        <div className="card-head">
          <div>
            <h2 className="card-title">Process list</h2>
            <p className="card-note">
              {all.length} sampled{all.length >= 100 ? ', capped at the 100 busiest' : ''}. Read-only, top CPU first.
            </p>
          </div>
          <div className="stat-row" style={{ gridTemplateColumns: 'auto auto', gap: 20, alignItems: 'center' }}>
            <div style={{ textAlign: 'right' }}>
              <div className="stat-label">Total CPU</div>
              <div className="mono" style={{ fontSize: 15, marginTop: 2 }}>{totalCpu.toFixed(1)}%</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="stat-label">Total RSS</div>
              <div className="mono" style={{ fontSize: 15, marginTop: 2 }}>{bytes(totalMem)}</div>
            </div>
          </div>
        </div>

        <div className="table-tools">
          <label className="search">
            <Icon name="search" size={15} />
            <input
              type="search"
              placeholder="Filter by name or PID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Filter processes"
            />
          </label>
          <div className="segmented" role="group" aria-label="Process state filter">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={filter === f.key ? 'is-on' : ''}
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="Sort order">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={sort === s.key ? 'is-on' : ''}
                onClick={() => setSort(s.key)}
                aria-pressed={sort === s.key}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 34 }} aria-label="State" />
                <th>Process</th>
                <th>PID</th>
                <th>CPU</th>
                <th>Memory</th>
                <th>RSS</th>
                <th>Threads</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.pid}>
                  <td>
                    <span className={`state state-${p.state}`} title={p.state} />
                  </td>
                  <td>
                    <span className="cell-name">
                      <span className="mark">{String(p.name || '?').slice(0, 2).toUpperCase()}</span>
                      {p.name}
                    </span>
                  </td>
                  <td className="mono">{p.pid}</td>
                  <td className="mono">{isNum(p.cpuPercent) ? `${Number(p.cpuPercent).toFixed(1)}%` : '—'}</td>
                  <td>
                    <div className="cell-meter">
                      <div className="bar" style={{ width: 64 }}>
                        <i style={{ width: `${Math.min(100, Number(p.memPercent) || 0)}%` }} />
                      </div>
                      <span className="mono">{isNum(p.memPercent) ? `${Number(p.memPercent).toFixed(1)}%` : '—'}</span>
                    </div>
                  </td>
                  <td className="mono">{bytes(p.rss)}</td>
                  <td className="mono">{p.threads ?? '—'}</td>
                  <td><span className="chip chip-quiet">{p.state}</span></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty">
                      <span className="empty-mark"><Icon name="search" size={18} /></span>
                      <strong>No processes match</strong>
                      <span>Clear the filter or wait for the next sample.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-foot">
          <span>Showing {rows.length} of {all.length}</span>
          <span>CPU share is cumulative across cores.</span>
        </div>
      </section>
    </div>
  );
}
