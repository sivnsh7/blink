import React, { useMemo } from 'react';
import Icon from '../components/Icon';
import Sparkline from '../components/charts/Sparkline';
import Redacted from '../components/Redacted';
import { useRedaction } from '../context/RedactionContext';
import { bytes, clampPct, isNum, series } from '../lib/format';

function MetricCard({ label, value, hint, icon, tone = 'brand' }) {
  return (
    <article className="metric-card">
      <div className="metric-card__top">
        <span>{label}</span>
        <span className={`metric-card__icon metric-card__icon--${tone}`}><Icon name={icon} size={17} /></span>
      </div>
      <div className="metric-card__value tabular">{value}</div>
      <div className="metric-card__hint">{hint}</div>
    </article>
  );
}

function maskedExport(snapshot) {
  if (!snapshot) return {};
  const copy = JSON.parse(JSON.stringify(snapshot));
  if (copy.system) copy.system.hostname = '[MASKED HOST]';
  if (Array.isArray(copy.network)) copy.network = copy.network.map(item => ({
    ...item, mac: item.mac ? '[MASKED]' : item.mac,
    ip4: item.ip4 ? '[MASKED]' : item.ip4, ip6: item.ip6 ? '[MASKED]' : item.ip6,
  }));
  if (Array.isArray(copy.processes)) copy.processes = copy.processes.map(item => ({
    ...item,
    pid: item.privilegeClass === 'kernel-task' ? item.pid : '[MASKED]',
    ppid: item.privilegeClass === 'kernel-task' ? item.ppid : '[MASKED]',
    startTimeTicks: '[MASKED]',
    name: item.privilegeClass === 'kernel-task' ? item.name : '[MASKED PROCESS]',
    command: item.command ? '[MASKED COMMAND]' : item.command,
  }));
  return copy;
}

function downloadSnapshot(payload, mode) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `blink-snapshot-${mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function Overview({ metrics, history, onOpen, onRefresh }) {
  const { redactionMode } = useRedaction();
  const cpu = clampPct(metrics?.cpu?.overall?.usage);
  const memory = clampPct(metrics?.memory?.usagePercent);
  const filesystems = useMemo(
    () => metrics?.storage?.filesystems || metrics?.disk?.filesystems || [],
    [metrics?.storage?.filesystems, metrics?.disk?.filesystems]
  );
  const root = metrics?.storage?.rootFilesystem ||
    filesystems.find(item => item.mountpoint === '/' || item.isRoot) || null;
  const storage = clampPct(root?.usePercent);
  const network = metrics?.network || [];
  const networkReady = network.length > 0 &&
    network.every((item) => isNum(item?.rxBytesPerSec) && isNum(item?.txBytesPerSec));
  const rx = networkReady ? network.reduce((sum, item) => sum + Number(item.rxBytesPerSec), 0) : null;
  const tx = networkReady ? network.reduce((sum, item) => sum + Number(item.txBytesPerSec), 0) : null;
  const processes = metrics?.processes || [];
  const sampledCount = metrics?.processesInfo?.sampledCount ?? processes.length;
  const totalSeen = metrics?.processesInfo?.totalSeen ?? sampledCount;
  const system = metrics?.system || {};
  const cpuSeries = series(history, 'cpu');
  const memorySeries = series(history, 'memory');

  const exportMasked = () => downloadSnapshot(maskedExport(metrics), 'masked');
  const exportFull = () => {
    const accepted = window.confirm(
      'This file contains host identifiers, process names and network addresses. Export the complete unmasked snapshot?'
    );
    if (accepted) downloadSnapshot(metrics, 'full');
  };

  const items = [
    { label: 'CPU utilization', value: cpu == null ? '—' : `${cpu.toFixed(0)}%`, hint: 'Kernel counter deltas', icon: 'cpu', tone: cpu > 85 ? 'warning' : 'brand' },
    { label: 'Memory used', value: memory == null ? '—' : `${memory.toFixed(0)}%`, hint: metrics?.memory?.used != null ? `${bytes(metrics.memory.used)} estimated` : 'Waiting for memory data', icon: 'memory', tone: memory > 90 ? 'warning' : 'brand' },
    { label: 'Root filesystem', value: storage == null ? '—' : `${storage.toFixed(0)}%`, hint: root?.size != null ? `${bytes(root.available)} available` : 'Root mount not reported', icon: 'storage', tone: storage > 90 ? 'danger' : 'brand' },
    { label: 'Network receive', value: bytes(rx, { rate: true }), hint: networkReady ? `Transmit ${bytes(tx, { rate: true })}` : 'Waiting for a complete rate sample', icon: 'network', tone: 'brand' },
  ];

  return (
    <div className="stack">
      <section className="hero-banner overview-welcome">
        <div>
          <div className="eyebrow">HOST STATUS <span className="stamp stamp--idle">{metrics?.timestamp ? 'LAST SAMPLE AVAILABLE' : 'WAITING FOR DATA'}</span></div>
          <h2><Redacted note="HOST NAME">{system.hostname || 'Your Linux host'}</Redacted></h2>
          <p>
            {system.distro || 'Linux'}{system.kernel ? ` · Kernel ${system.kernel}` : ''}.
            {metrics?.timestamp ? ' Latest telemetry is available below.' : ' Waiting for the first telemetry sample.'}
          </p>
        </div>
        <div className="overview-actions">
          <button type="button" className="btn btn--clay" onClick={onRefresh} disabled={!metrics}>
            <Icon name="refresh" size={15} /> Refresh snapshot
          </button>
          <button type="button" className="btn btn--paper" onClick={() => onOpen('processes')}>
            <Icon name="processes" size={15} /> View processes
          </button>
        </div>
      </section>

      <section aria-label="Host resource summary">
        <div className="section-intro">
          <div><h2>Resource overview</h2><p>Most recent available measurements from the local agent.</p></div>
          <span className="chip">{metrics?.timestamp ? 'Sample received' : 'Waiting for data'}</span>
        </div>
        <div className="overview-grid">
          {items.map(item => <MetricCard key={item.label} {...item} />)}
        </div>
      </section>

      <div className="overview-lower">
        <section className="card card-pad">
          <div className="card-head">
            <div><h2 className="card-title">Resource trends</h2><p className="card-note">Recent samples collected while this dashboard is open.</p></div>
          </div>
          <div className="trend-block">
            <div className="trend-heading"><span>CPU utilization</span><strong className="tabular">{cpu == null ? '—' : `${cpu.toFixed(1)}%`}</strong></div>
            <Sparkline data={cpuSeries} height={58} label="CPU utilization trend" color="var(--brand)" max={100} />
          </div>
          <div className="trend-block">
            <div className="trend-heading"><span>Memory utilization</span><strong className="tabular">{memory == null ? '—' : `${memory.toFixed(1)}%`}</strong></div>
            <Sparkline data={memorySeries} height={58} label="Memory utilization trend" color="var(--success)" max={100} />
          </div>
          <p className="card-note">The trend history is held in the browser session and is not a persistent time-series database.</p>
        </section>

        <section className="card card-pad">
          <div className="card-head">
            <div><h2 className="card-title">Host information</h2><p className="card-note">System metadata reported by the Linux agent.</p></div>
          </div>
          <div className="system-grid">
            <div className="system-item"><span>Distribution</span><strong>{system.distro || '—'}</strong></div>
            <div className="system-item"><span>Architecture</span><strong>{system.arch || '—'}</strong></div>
            <div className="system-item"><span>Logical CPUs</span><strong>{system.cpus ?? '—'}</strong></div>
            <div className="system-item"><span>Uptime</span><strong>{isNum(system.uptime) ? `${Math.floor(system.uptime / 3600)} hours` : '—'}</strong></div>
            <div className="system-item"><span>Process sample</span><strong>{sampledCount} of {totalSeen}</strong></div>
            <div className="system-item"><span>Kernel</span><strong>{system.kernel || '—'}</strong></div>
          </div>
        </section>
      </div>

      <div className="overview-lower">
        <section className="card card-pad">
          <div className="card-head">
            <div><h2 className="card-title">Top sampled processes</h2><p className="card-note">Highest resource consumers in the current bounded sample.</p></div>
            <button type="button" className="btn btn--paper btn--sm" onClick={() => onOpen('processes')}>Open process list</button>
          </div>
          {processes.length ? (
            <div className="overview-list">
              {[...processes].sort((a, b) => (Number(b.cpuPercent) || 0) - (Number(a.cpuPercent) || 0)).slice(0, 5).map(proc => (
                <div className="overview-process" key={`${proc.pid}-${proc.name}`}>
                  <span><strong>{proc.name || 'Unknown process'}</strong><small>PID <Redacted note="PROCESS ID">{proc.pid}</Redacted> · {proc.privilegeClass || 'Unknown privilege'}</small></span>
                  <b className="tabular">{isNum(proc.cpuPercent) ? `${proc.cpuPercent.toFixed(1)}%` : '—'}</b>
                </div>
              ))}
            </div>
          ) : <div className="empty"><strong>No process sample yet</strong><span>Process rows appear when the agent returns a valid process sample.</span></div>}
        </section>

        <section className="card card-pad">
          <div className="card-head">
            <div><h2 className="card-title">Data export</h2><p className="card-note">Download the current sample for offline review.</p></div>
          </div>
          <p className="card-note">Masked export removes host identifiers, network addresses, process IDs and command lines. A full export requires separate confirmation.</p>
          <div className="overview-actions export-actions">
            <button type="button" className="btn btn--clay" onClick={exportMasked} disabled={!metrics}>Export masked snapshot</button>
            <button type="button" className="btn btn--paper" onClick={exportFull} disabled={!metrics}>Export full snapshot…</button>
          </div>
          <div className="notice-inline"><Icon name="eye-off" size={16} /><span>{redactionMode ? 'Visual masking is on in the interface.' : 'Visual masking is off in the interface.'} This is a presentation control, not an access-control boundary.</span></div>
        </section>
      </div>
    </div>
  );
}
