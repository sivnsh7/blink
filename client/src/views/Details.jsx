import React from 'react';
import IsoBars from '../components/charts/IsoBars';
import Ring3D from '../components/charts/Ring3D';
import Sparkline from '../components/charts/Sparkline';
import Icon from '../components/Icon';
import { bytes, pct, series, clampPct, isNum } from '../lib/format';

function Head({ title, note }) {
  return (
    <div className="card-head">
      <div>
        <h2 className="card-title">{title}</h2>
        {note && <p className="card-note">{note}</p>}
      </div>
    </div>
  );
}

function Row({ label, value, tone }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className="row-value" style={tone ? { color: tone } : undefined}>{value}</span>
    </div>
  );
}

export function CpuView({ metrics, history }) {
  const cpu = metrics?.cpu;
  const cores = cpu?.cores || [];
  const load = cpu?.loadAvg || {};
  const thermal = cpu?.thermal || [];
  const usage = clampPct(cpu?.overall?.usage);
  const freq = cpu?.freqs || [];
  const avgFreq = freq.length ? freq.reduce((s, f) => s + (Number(f.current) || 0), 0) / freq.length : 0;

  return (
    <div className="grid-2">
      <div className="stack">
        <section className="card card-pad">
          <Head title="Utilisation" note="Kernel counter deltas between samples." />
          <IsoBars data={series(history, 'cpu').slice(-36)} width={560} height={140} max={100} label="Processor utilisation" />
        </section>
        <section className="card card-pad">
          <Head title="Per-core activity" note={`${cores.length} logical cores reported.`} />
          <div>
            {cores.slice(0, 16).map((c) => (
              <div className="bar-row" key={c.core}>
                <span>c{c.core}</span>
                <div className={`bar ${c.usage > 90 ? 'is-danger' : c.usage > 70 ? 'is-warn' : ''}`}>
                  <i style={{ width: `${clampPct(c.usage)}%` }} />
                </div>
                <b>{clampPct(c.usage).toFixed(0)}%</b>
              </div>
            ))}
            {cores.length > 16 && <p className="card-note" style={{ marginTop: 8 }}>Showing the first 16 of {cores.length} cores.</p>}
          </div>
        </section>
      </div>

      <div className="stack">
        <section className="card card-pad">
          <Head title="Overall" />
          <div className="ring-wrap">
            <Ring3D value={usage} size={132} sublabel="busy" label="Processor utilisation" tone={usage > 85 ? 'danger' : 'accent'} />
            <div className="legend-list">
              <Row label="Load 1m" value={isNum(load.l1) ? Number(load.l1).toFixed(2) : '—'} />
              <Row label="Load 5m" value={isNum(load.l5) ? Number(load.l5).toFixed(2) : '—'} />
              <Row label="Load 15m" value={isNum(load.l15) ? Number(load.l15).toFixed(2) : '—'} />
              <Row label="Threads" value={cpu?.threadCount ?? '—'} />
              <Row label="Processes" value={cpu?.processCount ?? '—'} />
            </div>
          </div>
        </section>

        <section className="card card-pad">
          <Head title="Clock & thermal" />
          <div className="rows">
            <Row label="Average clock" value={avgFreq > 0 ? `${avgFreq.toFixed(2)} GHz` : 'unavailable'} />
            {thermal.slice(0, 4).map((t) => (
              <Row
                key={t.type}
                label={t.type}
                value={isNum(t.temperature) ? `${Number(t.temperature).toFixed(1)} °C` : '—'}
                tone={t.temperature > 85 ? 'var(--danger)' : undefined}
              />
            ))}
          </div>
          <p className="card-note" style={{ marginTop: 12 }}>
            CPU percentage is derived from sampled counters. The first sample after start is always empty.
          </p>
        </section>
      </div>
    </div>
  );
}

export function MemoryView({ metrics, history }) {
  const m = metrics?.memory;
  const usage = clampPct(m?.usagePercent);
  const swap = clampPct(m?.swapUsagePercent);

  return (
    <div className="grid-2">
      <div className="stack">
        <section className="card card-pad">
          <Head title="Physical memory" note="MemAvailable is not the same as free pages." />
          <IsoBars data={series(history, 'memory').slice(-36)} width={560} height={140} max={100} label="Memory utilisation" />
          <div className="rows" style={{ marginTop: 16 }}>
            <Row label="Used" value={bytes(m?.used)} />
            <Row label="Available" value={bytes(m?.available)} />
            <Row label="Cached" value={bytes(m?.cached)} />
            <Row label="Buffers" value={bytes(m?.buffers)} />
          </div>
        </section>
        <section className="card card-pad">
          <Head title="Swap" note={m?.swapTotal > 0 ? 'Reclaimable by the kernel.' : 'No swap device configured.'} />
          <div className="bar" style={{ height: 7 }}>
            <i style={{ width: `${swap}%`, background: swap > 60 ? 'var(--warn)' : undefined }} />
          </div>
          <div className="rows" style={{ marginTop: 14 }}>
            <Row label="Swap used" value={bytes(m?.swapUsed)} />
            <Row label="Swap total" value={bytes(m?.swapTotal)} />
            <Row label="zram" value={m?.zram > 0 ? bytes(m.zram) : 'not in use'} />
            <Row label="zswap" value={m?.zswap > 0 ? bytes(m.zswap) : 'not in use'} />
          </div>
        </section>
      </div>
      <div className="stack">
        <section className="card card-pad">
          <Head title="Usage" />
          <div className="ring-wrap">
            <Ring3D value={usage} size={132} sublabel="of RAM" label="Memory utilisation" tone={usage > 90 ? 'danger' : 'accent'} />
            <div className="legend-list">
              <Row label="Installed" value={bytes(m?.total)} />
              <Row label="Active" value={bytes(m?.active)} />
              <Row label="Inactive" value={bytes(m?.inactive)} />
              <Row label="Slab" value={bytes(m?.slab)} />
              <Row label="Non-reclaimable" value={bytes(Math.max(0, Number(m?.nonReclaimable) || 0))} />
            </div>
          </div>
        </section>
        <section className="card card-pad note">
          <h3>Reading this view</h3>
          <p>
            Used memory is total minus available, so it already accounts for reclaimable cache.
            Process RSS can include shared pages and will not sum to the figure above.
          </p>
        </section>
      </div>
    </div>
  );
}

export function StorageView({ metrics, history }) {
  const disks = (metrics?.disk || []).filter((d) => !/^(loop|ram)/.test(d.name));

  return (
    <div className="stack">
      <section className="card card-pad">
        <Head title="Devices" note="Throughput, capacity and latency per block device." />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Type</th>
                <th>Used</th>
                <th>Capacity</th>
                <th>Read</th>
                <th>Write</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {disks.map((d) => (
                <tr key={d.name}>
                  <td>
                    <span className="cell-name">
                      <span className="mark">{String(d.name).slice(0, 2).toUpperCase()}</span>
                      {d.name}
                    </span>
                  </td>
                  <td>{d.type || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className={`bar ${d.usePercent > 92 ? 'is-warn' : ''}`} style={{ width: 84 }}>
                        <i style={{ width: `${clampPct(d.usePercent)}%` }} />
                      </div>
                      <span className="mono">{isNum(d.usePercent) ? `${Number(d.usePercent).toFixed(0)}%` : '—'}</span>
                    </div>
                  </td>
                  <td className="mono">{d.size > 0 ? bytes(d.size) : '—'}</td>
                  <td className="mono">{bytes(d.readBytesPerSec, { rate: true })}</td>
                  <td className="mono">{bytes(d.writeBytesPerSec, { rate: true })}</td>
                  <td className="mono">
                    {isNum(d.readLatency) ? `${Number(d.readLatency).toFixed(1)} / ${Number(d.writeLatency || 0).toFixed(1)} ms` : '—'}
                  </td>
                </tr>
              ))}
              {disks.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--ink-3)' }}>No block devices reported.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid-2">
        <section className="card card-pad">
          <Head title="I/O rate" note="Aggregate bytes per second." />
          <IsoBars data={series(history, 'disk').slice(-36)} width={560} height={128} label="Disk throughput" />
        </section>
        <section className="card card-pad">
          <Head title="Capacity" />
          <div className="ring-wrap">
            <Ring3D
              value={disks[0]?.usePercent || 0}
              size={132}
              sublabel="used"
              label="Primary device capacity"
              tone={disks[0]?.usePercent > 92 ? 'warn' : 'accent'}
            />
            <div className="legend-list">
              {disks.slice(0, 5).map((d) => (
                <Row key={d.name} label={d.name} value={isNum(d.usePercent) ? pct(d.usePercent, 0) : '—'} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export function NetworkView({ metrics, history }) {
  const net = metrics?.network || [];
  const rx = net.reduce((s, n) => s + (Number(n.rxBytesPerSec) || 0), 0);
  const tx = net.reduce((s, n) => s + (Number(n.txBytesPerSec) || 0), 0);

  return (
    <div className="stack">
      <div className="stat-row">
        {[
          ['Download', bytes(rx, { rate: true })],
          ['Upload', bytes(tx, { rate: true })],
          ['Received total', bytes(net.reduce((s, n) => s + (Number(n.rxBytes) || 0), 0))],
          ['Sent total', bytes(net.reduce((s, n) => s + (Number(n.txBytes) || 0), 0))],
        ].map(([label, value]) => (
          <article className="card stat" key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat-value" style={{ fontSize: 21, marginTop: 8 }}>{value}</div>
          </article>
        ))}
      </div>

      <div className="grid-2">
        <section className="card card-pad">
          <Head title="Throughput" note="All non-loopback interfaces combined." />
          <Sparkline data={series(history, 'network')} width={520} height={120} label="Network throughput" />
        </section>
        <section className="card card-pad">
          <Head title="Interfaces" note="Errors and drops are deltas since the previous sample." />
          <div className="rows">
            {net.map((n) => (
              <div className="row" key={n.name}>
                <span className="row-label">
                  {n.name}
                  <span className="chip" style={{ marginLeft: 8, height: 20, fontSize: 9.5, padding: '0 7px' }}>{n.type}</span>
                </span>
                <span className="row-value">
                  ↓ {bytes(n.rxBytesPerSec, { rate: true })} · ↑ {bytes(n.txBytesPerSec, { rate: true })}
                </span>
              </div>
            ))}
            {net.length === 0 && <p className="stat-sub">No interfaces reported.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

export function GraphicsView({ metrics }) {
  const gpus = metrics?.gpu || [];
  if (gpus.length === 0) {
    return (
      <section className="card">
        <div className="empty">
          <span className="empty-mark"><Icon name="graphics" size={18} /></span>
          <strong>No GPU telemetry reported</strong>
          <span>Utilisation depends on vendor tooling and driver exposure. Missing data does not mean zero load.</span>
        </div>
      </section>
    );
  }
  return (
    <div className="grid-3">
      {gpus.map((g) => (
        <section className="card card-pad" key={g.id ?? g.name}>
          <Head title={g.name || 'Graphics adapter'} note={String(g.vendor || '').toUpperCase()} />
          <div className="ring-wrap" style={{ gridTemplateColumns: 'auto minmax(0, 1fr)' }}>
            <Ring3D value={g.utilization ?? 0} size={116} sublabel="load" label="GPU utilisation" />
            <div className="legend-list">
              <Row label="VRAM used" value={isNum(g.memoryUsed) ? bytes(Number(g.memoryUsed) * 1024 * 1024) : '—'} />
              <Row label="VRAM total" value={isNum(g.memoryTotal) ? bytes(Number(g.memoryTotal) * 1024 * 1024) : '—'} />
              <Row label="Clock" value={isNum(g.freq) ? `${Number(g.freq).toFixed(0)} MHz` : '—'} />
              <Row label="Temp" value={isNum(g.temperature) && g.temperature > 0 ? `${g.temperature} °C` : '—'} />
            </div>
          </div>
          {(isNum(g.powerDraw) || isNum(g.powerLimit)) && (
            <div className="rows" style={{ marginTop: 14 }}>
              <Row label="Power" value={`${isNum(g.powerDraw) ? Number(g.powerDraw).toFixed(1) : '—'} W / ${isNum(g.powerLimit) ? Number(g.powerLimit).toFixed(0) : '—'} W`} />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export function SensorsView({ metrics }) {
  const sensors = metrics?.sensors || [];
  const temps = [];
  const fans = [];
  sensors.forEach((s) => {
    Object.entries(s.temps || {}).forEach(([label, v]) => temps.push({ source: s.name, label, value: v }));
    Object.entries(s.fans || {}).forEach(([label, v]) => fans.push({ source: s.name, label, value: v }));
  });

  if (temps.length === 0 && fans.length === 0) {
    return (
      <section className="card">
        <div className="empty">
          <span className="empty-mark"><Icon name="sensors" size={18} /></span>
          <strong>No readable sensors</strong>
          <span>Firmware and board support vary. Missing readings do not indicate a hardware fault.</span>
        </div>
      </section>
    );
  }

  return (
    <div className="grid-2">
      <section className="card card-pad">
        <Head title="Temperatures" note="Hwmon inputs, degrees Celsius." />
        <div className="rows">
          {temps.map((t) => (
            <Row
              key={`${t.source}-${t.label}`}
              label={`${t.source} · ${t.label}`}
              value={isNum(t.value) ? `${Number(t.value).toFixed(1)} °C` : '—'}
              tone={t.value > 85 ? 'var(--danger)' : t.value > 70 ? 'var(--warn)' : undefined}
            />
          ))}
        </div>
      </section>
      <section className="card card-pad">
        <Head title="Fans" note="Revolutions per minute." />
        <div className="rows">
          {fans.map((f) => (
            <Row
              key={`${f.source}-${f.label}`}
              label={`${f.source} · ${f.label}`}
              value={isNum(f.value) ? `${Number(f.value).toLocaleString()} rpm` : '—'}
            />
          ))}
          {fans.length === 0 && <p className="stat-sub">No fan channels exposed.</p>}
        </div>
      </section>
    </div>
  );
}

export function BatteryView({ metrics }) {
  const batteries = metrics?.battery || [];
  if (batteries.length === 0) {
    return (
      <section className="card">
        <div className="empty">
          <span className="empty-mark"><Icon name="battery" size={18} /></span>
          <strong>No battery detected</strong>
          <span>This is likely a desktop host, or the kernel does not expose a battery device.</span>
        </div>
      </section>
    );
  }
  return (
    <div className="grid-2">
      {batteries.map((b) => (
        <section className="card card-pad" key={b.id}>
          <Head title={b.id} note={b.status || 'unknown'} />
          <div className="ring-wrap">
            <Ring3D
              value={b.capacity || 0}
              size={132}
              sublabel="charge"
              label="Battery charge"
              tone={b.capacity < 20 ? 'danger' : b.capacity < 50 ? 'warn' : 'accent'}
            />
            <div className="legend-list">
              <Row label="Power draw" value={isNum(b.powerNow) ? `${Number(b.powerNow).toFixed(2)} W` : '—'} />
              <Row label="Voltage" value={isNum(b.voltageNow) ? `${Number(b.voltageNow).toFixed(2)} V` : '—'} />
              <Row label="Energy now" value={isNum(b.energyNow) ? `${Number(b.energyNow).toFixed(2)} Wh` : '—'} />
              <Row label="Energy full" value={isNum(b.energyFull) ? `${Number(b.energyFull).toFixed(2)} Wh` : '—'} />
              <Row label="Cycles" value={b.chargeCycle || '—'} />
              <Row label="Time to empty" value={isNum(b.timeToEmpty) ? `${Number(b.timeToEmpty).toFixed(1)} h` : '—'} />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

export default { CpuView, MemoryView, StorageView, NetworkView, GraphicsView, SensorsView, BatteryView };
