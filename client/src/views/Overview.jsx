import React, { useMemo } from 'react';
import Stat from '../components/Stat';
import IsoBars from '../components/charts/IsoBars';
import Ring3D from '../components/charts/Ring3D';
import Icon from '../components/Icon';
import DossierHeroTitle from '../components/DossierHeroTitle';
import Redacted from '../components/Redacted';
import { useRedaction } from '../context/RedactionContext';
import { bytes, pct, series, clampPct, isNum } from '../lib/format';

function CardHead({ title, note, icon, stamp, titleId }) {
  return (
    <div className="card-head">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.3rem' }}>
          {stamp && <span className="stamp stamp--confirmed" style={{ fontSize: '.58rem' }}>{stamp}</span>}
          <h2 id={titleId} className="card-title">{title}</h2>
        </div>
        {note && <p className="card-note">{note}</p>}
      </div>
      {icon && (
        <span className="card-icon" aria-hidden="true" style={{ opacity: .75 }}>
          <Icon name={icon} size={16} />
        </span>
      )}
    </div>
  );
}

function sanitizeExportData(data) {
  if (!data) return {};
  const clone = JSON.parse(JSON.stringify(data));
  if (clone.system) {
    clone.system.hostname = '[REDACTED-HOST]';
  }
  if (Array.isArray(clone.network)) {
    clone.network = clone.network.map((n) => ({
      ...n,
      mac: n.mac ? 'xx:xx:xx:xx:xx:xx' : n.mac,
      ip4: n.ip4 ? 'xxx.xxx.xxx.xxx' : n.ip4,
      ip6: n.ip6 ? 'xxxx::xxxx' : n.ip6,
    }));
  }
  if (Array.isArray(clone.processes)) {
    clone.processes = clone.processes.map((p) => ({
      ...p,
      name: p.privilegeClass === 'kernel-task' ? p.name : `proc-${p.pid}`,
      command: '[REDACTED-CMD]',
    }));
  }
  return clone;
}

export default function Overview({ metrics, history, onOpen }) {
  const { redactionMode } = useRedaction();
  const cpu = metrics?.cpu;
  const mem = metrics?.memory;
  const filesystems = useMemo(() => {
    const list = metrics?.storage?.filesystems || metrics?.disk || [];
    return list
      .filter((d) => d && d.size > 0 && !/^(loop|ram)/.test(d.name))
      .sort((a, b) => Number(Boolean(b.isRoot || b.mountpoint === '/')) - Number(Boolean(a.isRoot || a.mountpoint === '/')));
  }, [metrics?.storage, metrics?.disk]);

  const net = metrics?.network || [];
  const system = metrics?.system || {};

  const cpuUsage = clampPct(cpu?.overall?.usage);
  const memUsage = clampPct(mem?.usagePercent);
  const netRx = net.reduce((s, n) => s + (Number(n?.rxBytesPerSec) || 0), 0);
  const netTx = net.reduce((s, n) => s + (Number(n?.txBytesPerSec) || 0), 0);

  const rootDisk = filesystems.find((d) => d.isRoot || d.mountpoint === '/') || filesystems[0];
  const diskUsage = clampPct(rootDisk?.usePercent);

  const cpuSeries = series(history, 'cpu');
  const memSeries = series(history, 'memory');
  const netSeries = series(history, 'network');
  const diskSeries = series(history, 'disk');

  const load = cpu?.loadAvg || {};
  const thermal = cpu?.thermal || [];
  const hottest = thermal.reduce(
    (max, t) => (isNum(t?.temperature) && t.temperature > (max?.temperature || -Infinity) ? t : max),
    null
  );

  const handleExport = () => {
    const payload = redactionMode ? sanitizeExportData(metrics) : metrics;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `blink-snapshot-${redactionMode ? 'masked' : 'full'}-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="stack" style={{ display: 'grid', gap: '2rem' }}>
      {/* 3D Struck-Brass Hero Masthead */}
      <section className="hero-banner" style={{ marginBottom: '.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', marginBottom: '.8rem', flexWrap: 'wrap' }}>
          <span className="stamp stamp--live">
            <span className="dot dot--live" aria-hidden="true" />
            LIVE TELEMETRY
          </span>
          <span className="stamp stamp--wip">
            HOST: <Redacted note="MASKED-HOST">{system.hostname || 'LOCAL-NODE'}</Redacted>
          </span>
        </div>

        <DossierHeroTitle text="BLINK // HOST DOSSIER" />

        <div style={{ maxWidth: '68ch', marginTop: '.8rem' }}>
          <p style={{ color: 'var(--ink-soft)', fontSize: '1.02rem', lineHeight: '1.6' }}>
            <strong style={{ color: 'var(--ink)', fontWeight: 700 }}>Direct Linux kernel instrumentation.</strong> Telemetry sampled directly from <code style={{ fontFamily: 'var(--font-mono)', fontSize: '.9em', background: 'var(--paper-2)', padding: '2px 5px', borderRadius: 3, border: '1px solid var(--ink)' }}>/proc</code> and <code style={{ fontFamily: 'var(--font-mono)', fontSize: '.9em', background: 'var(--paper-2)', padding: '2px 5px', borderRadius: 3, border: '1px solid var(--ink)' }}>/sys</code> virtual filesystems with zero external charting bloat, brutalist precision, and classified redaction.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '.85rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn--clay"
            onClick={() => onOpen('audit')}
          >
            <span>SECURITY AUDIT</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h13M13 6.5 18.5 12 13 17.5"/></svg>
          </button>
          <button
            type="button"
            className="btn btn--paper"
            onClick={() => onOpen('processes')}
          >
            <span>PROCESS REGISTRY</span>
          </button>
          <button
            type="button"
            className="btn btn--paper"
            onClick={handleExport}
            title={redactionMode ? 'Export sanitized snapshot without confidential host identifiers' : 'Export complete unmasked snapshot'}
          >
            <span>EXPORT SNAPSHOT ({redactionMode ? 'MASKED' : 'FULL'})</span>
          </button>
        </div>
      </section>

      {/* Proof Primitive Strip */}
      <div className="proof">
        <div>
          <span className="proof__n">{cpuUsage != null ? `${cpuUsage.toFixed(0)}%` : '—'}</span>
          <span className="proof__l">CPU UTILIZATION</span>
        </div>
        <div>
          <span className="proof__n">{memUsage != null ? `${memUsage.toFixed(0)}%` : '—'}</span>
          <span className="proof__l">ESTIMATED RAM USED</span>
        </div>
        <div>
          <span className="proof__n">{diskUsage != null ? `${diskUsage.toFixed(0)}%` : '—'}</span>
          <span className="proof__l">ROOT FILESYSTEM</span>
        </div>
        <div>
          <span className="proof__n">{netRx > 0 ? bytes(netRx, { rate: true }) : '0 B/s'}</span>
          <span className="proof__l">RX THROUGHPUT</span>
        </div>
      </div>

      {/* Stat Trend Cards */}
      <div className="stat-row">
        <Stat
          label="CPU Utilization"
          value={cpuUsage != null ? cpuUsage.toFixed(0) : '—'}
          unit={cpuUsage != null ? '%' : ''}
          icon="cpu"
          history={cpuSeries}
          tone={cpuUsage != null && cpuUsage > 85 ? 'danger' : 'accent'}
          sub={isNum(load.l1) ? `load ${Number(load.l1).toFixed(2)}` : 'no load data'}
        />
        <Stat
          label="Estimated RAM"
          value={memUsage != null ? memUsage.toFixed(0) : '—'}
          unit={memUsage != null ? '%' : ''}
          icon="memory"
          history={memSeries}
          tone={memUsage != null && memUsage > 90 ? 'danger' : 'accent'}
          sub={isNum(mem?.used) && isNum(mem?.total) ? `${bytes(mem.used)} used of ${bytes(mem.total)}` : 'waiting for a sample'}
        />
        <Stat
          label="Root Filesystem"
          value={diskUsage != null ? diskUsage.toFixed(0) : '—'}
          unit={diskUsage != null ? '%' : ''}
          icon="storage"
          history={diskSeries}
          tone={diskUsage != null && diskUsage > 92 ? 'warn' : 'accent'}
          sub={rootDisk ? `${rootDisk.mountpoint || rootDisk.name} · ${bytes(rootDisk.used)} used` : 'no mounted device'}
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

      <div className="rule-redact" aria-hidden="true" />

      {/* Grid: Charts & Capacities */}
      <div className="grid-2">
        <section className="card card-pad card--fold" aria-labelledby="util-title">
          <CardHead
            titleId="util-title"
            title="Telemetry IsoBars"
            note="Solid-column isometric projections. No canvas or WebGL."
            icon="overview"
            stamp="SAMPLES // 28"
          />
          <div style={{ display: 'grid', gap: 24 }}>
            <div>
              <div className="legend-row" style={{ marginBottom: 8 }}>
                <span className="lbl">CPU UTILIZATION</span>
                <b className="tabular">{cpuUsage != null ? pct(cpuUsage, 0) : '—'}</b>
              </div>
              <IsoBars
                data={cpuSeries.slice(-28)}
                width={520}
                height={96}
                max={100}
                label="Processor utilisation, last 28 samples"
              />
            </div>
            <div>
              <div className="legend-row" style={{ marginBottom: 8 }}>
                <span className="lbl">ESTIMATED RAM FOOTPRINT</span>
                <b className="tabular">{memUsage != null ? pct(memUsage, 0) : '—'}</b>
              </div>
              <IsoBars
                data={memSeries.slice(-28)}
                width={520}
                height={78}
                max={100}
                label="Memory utilisation, last 28 samples"
              />
            </div>
          </div>
        </section>

        <section className="card card-pad card--fold" aria-labelledby="storage-title">
          <CardHead
            titleId="storage-title"
            title="Storage Array & Mounts"
            note="Local filesystem allocation and committed sectors."
            icon="storage"
            stamp="FILESYSTEMS"
          />
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <Ring3D value={diskUsage ?? 0} size={142} sublabel="USED" label="Root storage committed" />
            <div style={{ flex: 1, minWidth: 200, display: 'grid', gap: 10 }}>
              {filesystems.slice(0, 4).map((d) => (
                <div className="legend-row" key={d.mountpoint || d.name} style={{ padding: '.45em .6em', background: 'var(--paper-2)', borderRadius: 'var(--r-sm)', border: 'var(--border-hair) solid var(--ink)' }}>
                  <span>
                    <i className="swatch" style={{ background: 'var(--red)' }} />
                    <b style={{ fontFamily: 'var(--font-mono)', fontSize: '.76rem' }}>{d.mountpoint || d.name}</b>
                  </span>
                  <span className="tabular" style={{ fontSize: '.76rem', color: 'var(--ink-mute)' }}>
                    {isNum(d.usePercent) ? `${Number(d.usePercent).toFixed(0)}%` : '—'} · {bytes(d.used)}
                  </span>
                </div>
              ))}
              {filesystems.length === 0 && (
                <span style={{ fontSize: '.8rem', color: 'var(--ink-mute)' }}>No mounted filesystems detected.</span>
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="rule-redact" aria-hidden="true" />

      {/* Dossier Subsystem Case Files */}
      <section className="card card-pad">
        <div className="card-head">
          <div>
            <h2 className="card-title">Subsystem Evidence Files</h2>
            <p className="card-note">Expandable registers for hardware subsystems and interface controllers.</p>
          </div>
          <span className="stamp stamp--confirmed">4 REGISTERS SAMPLED</span>
        </div>

        <div className="files">
          {/* File 1: Processor */}
          <details className="file" open>
            <summary>
              <span className="file__id">REG-01</span>
              <div className="file__head">
                <h3>Processor Topology & Thermal Zones</h3>
                <span className="stamp stamp--live">{system.cpus || 1} LOGICAL CPUS ONLINE</span>
              </div>
              <span className="file__x" aria-hidden="true">
                <Icon name="chevron" size={14} />
              </span>
            </summary>
            <div className="file__body">
              <div className="proof" style={{ boxShadow: 'var(--sh-1)', marginBottom: '1rem' }}>
                <div>
                  <span className="proof__n">{system.cpuModel ? system.cpuModel.split(' ')[0] : 'CPU'}</span>
                  <span className="proof__l">ARCHITECTURE / MODEL</span>
                </div>
                <div>
                  <span className="proof__n">{hottest && isNum(hottest.temperature) ? `${hottest.temperature}°C` : 'UNAVAILABLE'}</span>
                  <span className="proof__l">HOTTEST CORE TEMP</span>
                </div>
                <div>
                  <span className="proof__n">{load.l1 != null ? load.l1.toFixed(2) : '0.00'}</span>
                  <span className="proof__l">SCHEDULER 1M LOAD</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '.8rem' }}>
                <button type="button" className="btn btn--paper btn--sm" onClick={() => onOpen('cpu')}>
                  <span>OPEN PROCESSOR DOSSIER</span>
                  <Icon name="chevron" size={12} />
                </button>
              </div>
            </div>
          </details>

          {/* File 2: Memory */}
          <details className="file">
            <summary>
              <span className="file__id">REG-02</span>
              <div className="file__head">
                <h3>Estimated RAM & Swap Allocation</h3>
                <span className="stamp stamp--confirmed">{bytes(mem?.total || 0)} INSTALLED</span>
              </div>
              <span className="file__x" aria-hidden="true">
                <Icon name="chevron" size={14} />
              </span>
            </summary>
            <div className="file__body">
              <p style={{ fontSize: '.84rem', color: 'var(--ink-soft)', marginBottom: '.8rem' }}>
                Estimated RAM used (MemTotal - MemAvailable), available headroom, and reclaimable page cache.
              </p>
              <div className="proof" style={{ boxShadow: 'var(--sh-1)', marginBottom: '1rem' }}>
                <div>
                  <span className="proof__n">{mem?.used != null ? bytes(mem.used) : '—'}</span>
                  <span className="proof__l">ESTIMATED RAM USED</span>
                </div>
                <div>
                  <span className="proof__n">{mem?.available != null ? bytes(mem.available) : '—'}</span>
                  <span className="proof__l">AVAILABLE HEADROOM</span>
                </div>
                <div>
                  <span className="proof__n">{mem?.cached != null ? bytes(mem.cached) : '—'}</span>
                  <span className="proof__l">PAGE CACHE & BUFFERS</span>
                </div>
              </div>
              <button type="button" className="btn btn--paper btn--sm" onClick={() => onOpen('memory')}>
                <span>OPEN MEMORY DOSSIER</span>
                <Icon name="chevron" size={12} />
              </button>
            </div>
          </details>

          {/* File 3: Network */}
          <details className="file">
            <summary>
              <span className="file__id">REG-03</span>
              <div className="file__head">
                <h3>Network Packet Interfaces</h3>
                <span className="stamp stamp--live">{net.length} ACTIVE INTERFACES</span>
              </div>
              <span className="file__x" aria-hidden="true">
                <Icon name="chevron" size={14} />
              </span>
            </summary>
            <div className="file__body">
              <div style={{ display: 'grid', gap: '.6rem', marginBottom: '1rem' }}>
                {net.map((iface) => (
                  <div key={iface.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '.55em .8em', background: 'var(--paper-3)', border: 'var(--border-hair) solid var(--ink)', borderRadius: 'var(--r-sm)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '.78rem' }}>
                      {iface.name} ({iface.state || 'UP'})
                    </span>
                    <span className="tabular" style={{ fontSize: '.76rem', color: 'var(--ink-mute)' }}>
                      RX {bytes(iface.rxBytesPerSec || 0, { rate: true })} · TX {bytes(iface.txBytesPerSec || 0, { rate: true })}
                    </span>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn--paper btn--sm" onClick={() => onOpen('network')}>
                <span>OPEN NETWORK DOSSIER</span>
                <Icon name="chevron" size={12} />
              </button>
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
