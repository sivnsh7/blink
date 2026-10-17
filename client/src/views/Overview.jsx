import React, { useMemo } from 'react';
import Stat from '../components/Stat';
import IsoBars from '../components/charts/IsoBars';
import Ring3D from '../components/charts/Ring3D';
import Icon from '../components/Icon';
import { bytes, pct, series, clampPct, lastOf, isNum } from '../lib/format';

function CardHead({ title, note, icon }) {
  return (
    <div className="card-head">
      <div>
        <h2 className="card-title">{title}</h2>
        {note && <p className="card-note">{note}</p>}
      </div>
      {icon && <span className="card-icon" aria-hidden="true"><Icon name={icon} size={15} /></span>}
    </div>
  );
}

export default function Overview({ metrics, history, onOpen }) {
  const cpu = metrics?.cpu;
  const mem = metrics?.memory;
  const disks = useMemo(() => {
    const all = (metrics?.disk || []).filter((d) => d && d.size > 0 && !/^(loop|ram)/.test(d.name));
    return [...all].sort((a, b) => Number(Boolean(b.mountpoint)) - Number(Boolean(a.mountpoint)));
  }, [metrics?.disk]);
  const net = metrics?.network || [];

  const cpuUsage = clampPct(cpu?.overall?.usage);
  const memUsage = clampPct(mem?.usagePercent);
  const netRx = net.reduce((s, n) => s + (Number(n?.rxBytesPerSec) || 0), 0);
  const netTx = net.reduce((s, n) => s + (Number(n?.txBytesPerSec) || 0), 0);

  // A disk with no mountpoint reports no usage — prefer the filesystem holding `/`.
  const rootDisk = disks.find((d) => d.mountpoint === '/') || disks.find((d) => d.mountpoint) || disks[0];
  const diskUsage = clampPct(rootDisk?.usePercent);

  const cpuSeries = series(history, 'cpu');
  const memSeries = series(history, 'memory');
  const netSeries = series(history, 'network');
  const diskSeries = series(history, 'disk');

  const load = cpu?.loadAvg || {};
  const thermal = cpu?.thermal || [];
  const hottest = thermal.reduce((max, t) => (isNum(t?.temperature) && t.temperature > (max?.temperature || -Infinity) ? t : max), null);

  return (
    <>
      <div className="stat-row">
        <Stat
          label="Processor"
          value={cpuUsage.toFixed(0)}
          unit="%"
          icon="cpu"
          history={cpuSeries}
          tone={cpuUsage > 85 ? 'danger' : 'accent'}
          sub={isNum(load.l1) ? `load ${Number(load.l1).toFixed(2)}` : 'no load data'}
        />
        <Stat
          label="Memory"
          value={memUsage.toFixed(0)}
          unit="%"
          icon="memory"
          history={memSeries}
          tone={memUsage > 90 ? 'danger' : 'accent'}
          sub={isNum(mem?.used) ? `${bytes(mem.used)} of ${bytes(mem.total)}` : 'waiting for a sample'}
        />
        <Stat
          label="Storage"
          value={isNum(rootDisk?.usePercent) ? Number(rootDisk.usePercent).toFixed(0) : '—'}
          unit={isNum(rootDisk?.usePercent) ? '%' : ''}
          icon="storage"
          history={diskSeries}
          tone={diskUsage > 92 ? 'warn' : 'accent'}
          sub={rootDisk ? `${rootDisk.name} · ${bytes(rootDisk.used)} used` : 'no mounted device'}
        />
        <Stat
          label="Throughput"
          value={netRx > 0 ? bytes(netRx, { rate: true }) : '0 B/s'}
          icon="network"
          history={netSeries}
          tone="accent"
          sub={`tx ${bytes(netTx, { rate: true })} · ${net.length} iface${net.length === 1 ? '' : 's'}`}
        />
      </div>

      <div className="grid-2">
        <section className="card card-pad" aria-labelledby="util-title">
          <CardHead
            title="Utilisation"
            note="One sample per push, newest at the right."
            icon="overview"
          />
          <div style={{ display: 'grid', gap: 22 }}>
            <div>
              <div className="legend-row" style={{ marginBottom: 8 }}>
                <span>Processor</span>
                <b className="tabular">{pct(cpuUsage, 0)}</b>
              </div>
              <IsoBars data={cpuSeries.slice(-28)} width={520} height={96} max={100} label="Processor utilisation, last 28 samples" />
            </div>
            <div>
              <div className="legend-row" style={{ marginBottom: 8 }}>
                <span>Memory</span>
                <b className="tabular">{pct(memUsage, 0)}</b>
              </div>
              <IsoBars data={memSeries.slice(-28)} width={520} height={72} max={100} label="Memory utilisation, last 28 samples" />
            </div>
          </div>
        </section>

        <section className="card card-pad" aria-labelledby="storage-title">
          <CardHead title="Storage" note="Latest capacity sample." icon="storage" />
          <div className="ring-wrap">
            <Ring3D value={diskUsage} size={132} sublabel="used" label="Storage used" />
            <div className="legend-list">
              {disks.slice(0, 4).map((d) => (
                <div className="legend-row" key={d.name}>
                  <span>
                    <i className="swatch" style={{ background: 'var(--accent)', opacity: 0.9 - disks.indexOf(d) * 0.18 }} />
                    {d.name}
                  </span>
                  <b>{isNum(d.usePercent) ? `${Number(d.usePercent).toFixed(0)}%` : '—'}</b>
                </div>
              ))}
              {disks.length === 0 && <span className="stat-sub">No mounted block devices reported.</span>}
            </div>
          </div>
          <div className="rows" style={{ marginTop: 16 }}>
            <div className="row">
              <span className="row-label">Read</span>
              <span className="row-value">{bytes(rootDisk?.readBytesPerSec, { rate: true })}</span>
            </div>
            <div className="row">
              <span className="row-label">Write</span>
              <span className="row-value">{bytes(rootDisk?.writeBytesPerSec, { rate: true })}</span>
            </div>
            <div className="row">
              <span className="row-label">Free</span>
              <span className="row-value">{rootDisk ? bytes(Math.max(0, rootDisk.size - rootDisk.used)) : '—'}</span>
            </div>
          </div>
        </section>
      </div>

      <div className="grid-3">
        <section className="card card-pad">
          <CardHead title="Thermal" note="Kernel-exposed zones." icon="sensors" />
          {thermal.length === 0 ? (
            <p className="stat-sub">No thermal zones exposed on this host.</p>
          ) : (
            <div className="rows">
              {thermal.slice(0, 4).map((t) => (
                <div className="row" key={t.type}>
                  <span className="row-label">{t.type}</span>
                  <span className="row-value" style={{ color: t.temperature > 85 ? 'var(--danger)' : undefined }}>
                    {isNum(t.temperature) ? `${Number(t.temperature).toFixed(1)} °C` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="card-note" style={{ marginTop: 12 }}>
            {hottest ? `Hottest zone: ${hottest.type}` : 'Firmware values only.'}
          </p>
        </section>

        <section className="card card-pad">
          <CardHead title="Load average" note="Not a percentage." icon="cpu" />
          <div className="rows">
            <div className="row">
              <span className="row-label">1 minute</span>
              <span className="row-value">{isNum(load.l1) ? Number(load.l1).toFixed(2) : '—'}</span>
            </div>
            <div className="row">
              <span className="row-label">5 minutes</span>
              <span className="row-value">{isNum(load.l5) ? Number(load.l5).toFixed(2) : '—'}</span>
            </div>
            <div className="row">
              <span className="row-label">15 minutes</span>
              <span className="row-value">{isNum(load.l15) ? Number(load.l15).toFixed(2) : '—'}</span>
            </div>
          </div>
          <p className="card-note" style={{ marginTop: 12 }}>
            {cpu?.threadCount ? `${cpu.threadCount} logical CPUs` : 'Logical CPU count unavailable'}
          </p>
        </section>

        <section className="card card-pad">
          <CardHead title="Processes" note="Top sample, read-only." icon="processes" />
          <div className="rows">
            {(metrics?.processes || []).slice(0, 3).map((p) => (
              <div className="row" key={p.pid}>
                <span className="row-label" style={{ color: 'var(--ink)', fontWeight: 550 }}>{p.name}</span>
                <span className="row-value">{isNum(p.cpuPercent) ? `${Number(p.cpuPercent).toFixed(1)}%` : '—'}</span>
              </div>
            ))}
            {(!metrics?.processes || metrics.processes.length === 0) && (
              <p className="stat-sub">No process sample yet.</p>
            )}
          </div>
          <button type="button" className="btn" style={{ marginTop: 14 }} onClick={() => onOpen('processes')}>
            Open process list
          </button>
        </section>
      </div>

      <div className="grid-2-wide">
        <section className="card card-pad">
          <CardHead title="Network" note="Interface counters, not per-process attribution." icon="network" />
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

        <section className="card card-pad">
          <CardHead title="Last sample" note="Where these numbers come from." icon="server" />
          <div className="rows">
            <div className="row"><span className="row-label">Timestamp</span><span className="row-value">{metrics?.timestamp ? new Date(metrics.timestamp).toLocaleTimeString() : '—'}</span></div>
            <div className="row"><span className="row-label">Samples kept</span><span className="row-value">{series(history, 'cpu').length}</span></div>
            <div className="row"><span className="row-label">Guest count</span><span className="row-value">{lastOf(history, 'cpu', 0).toFixed(1)}%</span></div>
            <div className="row"><span className="row-label">Sources</span><span className="row-value">/proc · /sys</span></div>
          </div>
        </section>
      </div>
    </>
  );
}
