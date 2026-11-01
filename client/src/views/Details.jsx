import React from 'react';
import IsoBars from '../components/charts/IsoBars';
import Ring3D from '../components/charts/Ring3D';
import Sparkline from '../components/charts/Sparkline';
import Icon from '../components/Icon';
import { bytes, pct, series, clampPct, isNum } from '../lib/format';

function Head({ title, note, stamp = 'TELEMETRY' }) {
  return (
    <div className="card-head">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.3rem' }}>
          {stamp && <span className="stamp stamp--confirmed" style={{ fontSize: '.58rem' }}>{stamp}</span>}
          <h2 className="card-title">{title}</h2>
        </div>
        {note && <p className="card-note">{note}</p>}
      </div>
    </div>
  );
}

function Row({ label, value, tone }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className="row-value tabular" style={tone ? { color: tone } : undefined}>{value}</span>
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
  const validFreqs = freq.filter((f) => isNum(f?.current) && f.current > 0);
  const avgFreq = validFreqs.length
    ? validFreqs.reduce((s, f) => s + Number(f.current), 0) / validFreqs.length
    : null;

  return (
    <div className="stack" style={{ display: 'grid', gap: '1.6rem' }}>
      {/* Proof Strip */}
      <div className="proof">
        <div>
          <span className="proof__n">{cores.length || metrics?.system?.cpus || 1}</span>
          <span className="proof__l">LOGICAL CPUS</span>
        </div>
        <div>
          <span className="proof__n">{usage != null ? `${usage.toFixed(0)}%` : '—'}</span>
          <span className="proof__l">SCHEDULER LOAD</span>
        </div>
        <div>
          <span className="proof__n">{avgFreq != null ? `${avgFreq.toFixed(2)} GHz` : '—'}</span>
          <span className="proof__l">AVERAGE FREQUENCY</span>
        </div>
        <div>
          <span className="proof__n">{load.l1 != null ? load.l1.toFixed(2) : '0.00'}</span>
          <span className="proof__l">TASK LOAD 1M</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack" style={{ display: 'grid', gap: '1.6rem' }}>
          <section className="card card-pad card--fold">
            <Head title="Utilisation IsoBars" note="Kernel counter deltas between samples." stamp="TIMESERIES" />
            <IsoBars data={series(history, 'cpu').slice(-36)} width={560} height={140} max={100} label="Processor utilisation" />
          </section>

          <section className="card card-pad card--fold">
            <Head title="Per-Core Scheduler Activity" note={`${cores.length} logical cores reported by Linux task scheduler.`} stamp="SMP TOPOLOGY" />
            <div style={{ display: 'grid', gap: 6 }}>
              {cores.slice(0, 16).map((c) => {
                const cUsage = clampPct(c.usage);
                return (
                  <div className="bar-row" key={c.core}>
                    <span>c{c.core}</span>
                    <div className={`bar ${cUsage != null && cUsage > 90 ? 'is-danger' : cUsage != null && cUsage > 70 ? 'is-warn' : ''}`}>
                      <i style={{ width: `${cUsage ?? 0}%` }} />
                    </div>
                    <b className="tabular">{cUsage != null ? `${cUsage.toFixed(0)}%` : '—'}</b>
                  </div>
                );
              })}
              {cores.length > 16 && <p className="card-note" style={{ marginTop: 8 }}>Showing the first 16 of {cores.length} logical cores.</p>}
            </div>
          </section>
        </div>

        <div className="stack" style={{ display: 'grid', gap: '1.6rem' }}>
          <section className="card card-pad card--fold">
            <Head title="Overall Processor Capacity" stamp="REGISTER" />
            <div className="ring-wrap">
              <Ring3D value={usage ?? 0} size={132} sublabel="BUSY" label="Processor utilisation" tone={usage != null && usage > 85 ? 'danger' : 'accent'} />
              <div className="legend-list">
                <Row label="Load 1m" value={isNum(load.l1) ? Number(load.l1).toFixed(2) : '—'} />
                <Row label="Load 5m" value={isNum(load.l5) ? Number(load.l5).toFixed(2) : '—'} />
                <Row label="Load 15m" value={isNum(load.l15) ? Number(load.l15).toFixed(2) : '—'} />
                <Row label="Active Threads" value={cpu?.threadCount ?? '—'} />
                <Row label="Task Processes" value={cpu?.processCount ?? '—'} />
              </div>
            </div>
          </section>

          <section className="card card-pad card--fold">
            <Head title="Clock Frequency & Thermals" stamp="HWMON" />
            <div className="rows">
              <Row label="Average Clock" value={avgFreq != null ? `${avgFreq.toFixed(2)} GHz` : 'unavailable'} />
              {thermal.slice(0, 4).map((t) => (
                <Row
                  key={t.type}
                  label={t.type}
                  value={isNum(t.temperature) ? `${Number(t.temperature).toFixed(1)} °C` : '—'}
                  tone={t.temperature > 85 ? 'var(--red)' : undefined}
                />
              ))}
              {thermal.length === 0 && <p className="card-note">No thermal sensors reported.</p>}
            </div>
            <p className="card-note" style={{ marginTop: 12 }}>
              CPU percentage is derived from cumulative counter deltas in /proc/stat.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export function MemoryView({ metrics, history }) {
  const m = metrics?.memory;
  const usage = clampPct(m?.usagePercent);
  const swap = clampPct(m?.swapUsagePercent);

  return (
    <div className="stack" style={{ display: 'grid', gap: '1.6rem' }}>
      {/* Proof Strip */}
      <div className="proof">
        <div>
          <span className="proof__n">{bytes(m?.total || 0)}</span>
          <span className="proof__l">TOTAL PHYSICAL RAM</span>
        </div>
        <div>
          <span className="proof__n">{usage != null ? `${usage.toFixed(0)}%` : '—'}</span>
          <span className="proof__l">ESTIMATED RAM USED</span>
        </div>
        <div>
          <span className="proof__n">{bytes(m?.available || 0)}</span>
          <span className="proof__l">AVAILABLE HEADROOM</span>
        </div>
        <div>
          <span className="proof__n">{bytes(m?.cached || 0)}</span>
          <span className="proof__l">PAGE CACHE & BUFFERS</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack" style={{ display: 'grid', gap: '1.6rem' }}>
          <section className="card card-pad card--fold">
            <Head title="Physical Memory Allocation" note="MemAvailable accounts for reclaimable slab and page cache." stamp="VIRTUAL VM" />
            <IsoBars data={series(history, 'memory').slice(-36)} width={560} height={140} max={100} label="Memory utilisation" />
            <div className="rows" style={{ marginTop: 16 }}>
              <Row label="Estimated RAM Used" value={bytes(m?.used)} />
              <Row label="Available Headroom" value={bytes(m?.available)} />
              <Row label="Page Cache" value={bytes(m?.cached)} />
              <Row label="Disk Buffers" value={bytes(m?.buffers)} />
            </div>
          </section>

          <section className="card card-pad card--fold">
            <Head title="Swap Subsystem" note={m?.swapTotal > 0 ? 'Reclaimable swap partition.' : 'No swap device active.'} stamp="SWAP / ZRAM" />
            <div className="bar" style={{ height: 8 }}>
              <i style={{ width: `${swap ?? 0}%`, background: swap != null && swap > 60 ? 'var(--clay)' : 'var(--red)' }} />
            </div>
            <div className="rows" style={{ marginTop: 14 }}>
              <Row label="Swap Used" value={bytes(m?.swapUsed)} />
              <Row label="Swap Total" value={bytes(m?.swapTotal)} />
              <Row label="zram Compressed" value={m?.zram > 0 ? bytes(m.zram) : 'not in use'} />
              <Row label="zswap Memory" value={m?.zswap > 0 ? bytes(m.zswap) : 'not in use'} />
            </div>
          </section>
        </div>

        <div className="stack" style={{ display: 'grid', gap: '1.6rem' }}>
          <section className="card card-pad card--fold">
            <Head title="Virtual Memory & Allocation" stamp="PAGING" />
            <div className="ring-wrap">
              <Ring3D value={usage ?? 0} size={132} sublabel="OF RAM" label="Memory utilisation" tone={usage != null && usage > 90 ? 'danger' : 'accent'} />
              <div className="legend-list">
                <Row label="Installed RAM" value={bytes(m?.total)} />
                <Row label="Committed Memory" value={m?.committedAs != null ? bytes(m.committedAs) : '—'} />
                <Row label="Commit Limit" value={m?.commitLimit != null ? bytes(m.commitLimit) : '—'} />
                <Row label="Active Pages" value={bytes(m?.active)} />
                <Row label="Inactive Pages" value={bytes(m?.inactive)} />
                <Row label="Kernel Slab" value={bytes(m?.slab)} />
                <Row label="Non-Reclaimable" value={bytes(Math.max(0, Number(m?.nonReclaimable) || 0))} />
              </div>
            </div>
          </section>

          <section className="card card-pad card--fold">
            <Head title="Investigator Guidance" stamp="AUDIT NOTE" />
            <p style={{ fontSize: '.84rem', color: 'var(--ink-soft)', lineHeight: '1.6' }}>
              Used RAM is estimated as MemTotal minus MemAvailable, which accurately accounts for reclaimable page cache and kernel slab. Committed memory (/proc/meminfo Committed_AS) reflects total virtual address space allocated by processes.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export function StorageView({ metrics, history }) {
  const blockDevices = metrics?.storage?.blockDevices || [];
  const filesystems = (metrics?.storage?.filesystems || metrics?.disk || []).filter((d) => !/^(loop|ram)/.test(d.name));
  const rootFs = filesystems.find((f) => f.isRoot || f.mountpoint === '/') || filesystems[0];
  const rootUsage = clampPct(rootFs?.usePercent);
  const totalFsCap = filesystems.reduce((s, d) => s + (Number(d.size) || 0), 0);
  const totalFsUsed = filesystems.reduce((s, d) => s + (Number(d.used) || 0), 0);

  return (
    <div className="stack" style={{ display: 'grid', gap: '1.6rem' }}>
      {/* Proof Strip */}
      <div className="proof">
        <div>
          <span className="proof__n">{blockDevices.length}</span>
          <span className="proof__l">BLOCK DEVICES</span>
        </div>
        <div>
          <span className="proof__n">{filesystems.length}</span>
          <span className="proof__l">MOUNTED FILESYSTEMS</span>
        </div>
        <div>
          <span className="proof__n">{bytes(totalFsCap)}</span>
          <span className="proof__l">FS CAPACITY</span>
        </div>
        <div>
          <span className="proof__n">{rootUsage != null ? `${rootUsage.toFixed(0)}%` : '—'}</span>
          <span className="proof__l">ROOT (/) COMMITTED</span>
        </div>
      </div>

      {/* Block Devices Table */}
      <section className="card card-pad card--fold">
        <Head title="Physical & Virtual Block Devices" note="Throughput, media type, and I/O latency sampled from /sys/block and /proc/diskstats." stamp="DISKSTATS" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>DEVICE</th>
                <th>TYPE</th>
                <th>MEDIA</th>
                <th>CAPACITY</th>
                <th>READ RATE</th>
                <th>WRITE RATE</th>
                <th>LATENCY (R/W)</th>
              </tr>
            </thead>
            <tbody>
              {blockDevices.map((d) => (
                <tr key={d.name}>
                  <td>
                    <span className="cell-name">
                      <span className="mark">{String(d.name).slice(0, 2).toUpperCase()}</span>
                      <strong style={{ fontFamily: 'var(--font-mono)' }}>{d.name}</strong>
                    </span>
                  </td>
                  <td><span className="stamp stamp--idle" style={{ fontSize: '.58rem' }}>{d.type || 'BLOCK'}</span></td>
                  <td>
                    <span className="stamp stamp--confirmed" style={{ fontSize: '.58rem' }}>
                      {d.rotational === false ? 'NON-ROTATIONAL (SSD/NVMe)' : d.rotational === true ? 'ROTATIONAL (HDD)' : 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="tabular">{d.size > 0 ? bytes(d.size) : '—'}</td>
                  <td className="tabular">{bytes(d.readBytesPerSec, { rate: true })}</td>
                  <td className="tabular">{bytes(d.writeBytesPerSec, { rate: true })}</td>
                  <td className="tabular">
                    {isNum(d.readLatency) ? `${Number(d.readLatency).toFixed(1)} / ${Number(d.writeLatency || 0).toFixed(1)} ms` : '—'}
                  </td>
                </tr>
              ))}
              {blockDevices.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--ink-mute)' }}>No block devices reported.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Filesystems Table */}
      <section className="card card-pad card--fold">
        <Head title="Mounted Filesystem Partitions" note="Mountpoints, filesystem types, and storage allocations sampled from /proc/mounts." stamp="FILESYSTEMS" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>MOUNTPOINT</th>
                <th>DEVICE</th>
                <th>FSTYPE</th>
                <th>ALLOCATION</th>
                <th>CAPACITY</th>
                <th>USED</th>
                <th>AVAILABLE</th>
              </tr>
            </thead>
            <tbody>
              {filesystems.map((f) => {
                const fsUsage = clampPct(f.usePercent);
                return (
                  <tr key={f.mountpoint || f.name}>
                    <td>
                      <span className="cell-name">
                        {f.isRoot && <span className="stamp stamp--live" style={{ fontSize: '.55rem', marginRight: 6 }}>ROOT</span>}
                        <strong style={{ fontFamily: 'var(--font-mono)' }}>{f.mountpoint || f.name}</strong>
                      </span>
                    </td>
                    <td className="tabular" style={{ fontSize: '.78rem' }}>{f.name}</td>
                    <td><span className="stamp stamp--idle" style={{ fontSize: '.58rem' }}>{f.fstype || 'FS'}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="bar" style={{ width: 84 }}>
                          <i style={{ width: `${fsUsage ?? 0}%` }} />
                        </div>
                        <span className="tabular">{fsUsage != null ? `${fsUsage.toFixed(0)}%` : '—'}</span>
                      </div>
                    </td>
                    <td className="tabular">{f.size > 0 ? bytes(f.size) : '—'}</td>
                    <td className="tabular">{bytes(f.used)}</td>
                    <td className="tabular">{bytes(f.available)}</td>
                  </tr>
                );
              })}
              {filesystems.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--ink-mute)' }}>No mounted filesystems detected.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid-2">
        <section className="card card-pad card--fold">
          <Head title="I/O Throughput Rate" note="Aggregate read and write bytes per second." stamp="DISK I/O" />
          <IsoBars data={series(history, 'disk').slice(-36)} width={560} height={128} label="Disk throughput" />
        </section>

        <section className="card card-pad card--fold">
          <Head title="Root Filesystem Allocation" stamp="CAPACITY" />
          <div className="ring-wrap">
            <Ring3D
              value={rootUsage ?? 0}
              size={132}
              sublabel="USED"
              label="Root filesystem allocation"
              tone={rootUsage != null && rootUsage > 92 ? 'warn' : 'accent'}
            />
            <div className="legend-list">
              {filesystems.slice(0, 5).map((d) => (
                <Row key={d.mountpoint || d.name} label={d.mountpoint || d.name} value={isNum(d.usePercent) ? pct(d.usePercent, 0) : '—'} />
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
    <div className="stack" style={{ display: 'grid', gap: '1.6rem' }}>
      {/* Proof Strip */}
      <div className="proof">
        <div>
          <span className="proof__n">{bytes(rx, { rate: true })}</span>
          <span className="proof__l">INGRESS BANDWIDTH (RX)</span>
        </div>
        <div>
          <span className="proof__n">{bytes(tx, { rate: true })}</span>
          <span className="proof__l">EGRESS BANDWIDTH (TX)</span>
        </div>
        <div>
          <span className="proof__n">{net.length}</span>
          <span className="proof__l">ACTIVE INTERFACES</span>
        </div>
        <div>
          <span className="proof__n">{bytes(net.reduce((s, n) => s + (Number(n.rxBytes) || 0), 0))}</span>
          <span className="proof__l">CUMULATIVE RECEIVED</span>
        </div>
      </div>

      <div className="grid-2">
        <section className="card card-pad card--fold">
          <Head title="Throughput Sparkline" note="All host network interfaces aggregated." stamp="NET RATE" />
          <Sparkline data={series(history, 'network')} width={520} height={120} label="Network throughput" />
        </section>

        <section className="card card-pad card--fold">
          <Head title="Physical & Virtual Interfaces" note="Sampled directly from /proc/net/dev." stamp="IFACES" />
          <div className="rows">
            {net.map((n) => (
              <div className="row" key={n.name}>
                <span className="row-label">
                  <strong>{n.name}</strong>
                  <span className="stamp stamp--idle" style={{ marginLeft: 8, fontSize: '.58rem', padding: '.2em .5em' }}>{n.type || n.operstate || 'ETH'}</span>
                </span>
                <span className="row-value tabular">
                  ↓ {bytes(n.rxBytesPerSec, { rate: true })} · ↑ {bytes(n.txBytesPerSec, { rate: true })}
                </span>
              </div>
            ))}
            {net.length === 0 && <p className="card-note">No network interfaces reported.</p>}
          </div>
          <p className="card-note" style={{ marginTop: 12 }}>
            Note: Throughput is aggregated across all virtual and physical interfaces reported by /proc/net/dev.
          </p>
        </section>
      </div>
    </div>
  );
}

export function GraphicsView({ metrics }) {
  const gpus = metrics?.gpu || [];
  if (gpus.length === 0) {
    return (
      <section className="card card-pad card--fold">
        <div className="empty">
          <span className="empty-mark"><Icon name="graphics" size={18} /></span>
          <strong>NO ACCELERATED GPU TELEMETRY REPORTED</strong>
          <span>Utilisation metrics require NVIDIA Management Library or AMD sysfs kernel exposure.</span>
        </div>
      </section>
    );
  }

  return (
    <div className="grid-2">
      {gpus.map((g) => {
        const util = isNum(g.utilization) ? clampPct(g.utilization) : null;
        const vramUsed = g.memoryUsedBytes ?? (isNum(g.memoryUsed) ? g.memoryUsed * 1024 * 1024 : null);
        const vramTotal = g.memoryTotalBytes ?? (isNum(g.memoryTotal) ? g.memoryTotal * 1024 * 1024 : null);

        return (
          <section className="card card-pad card--fold" key={g.id ?? g.name}>
            <Head title={g.name || 'Graphics Adapter'} note={String(g.vendor || '').toUpperCase()} stamp="VRAM // ACCEL" />
            <div className="ring-wrap">
              <Ring3D value={util ?? 0} size={124} sublabel={util != null ? "LOAD" : "N/A"} label="GPU utilisation" />
              <div className="legend-list">
                <Row label="GPU Load" value={util != null ? `${util.toFixed(0)}%` : 'N/A'} />
                <Row label="VRAM Used" value={isNum(vramUsed) ? bytes(vramUsed) : '—'} />
                <Row label="VRAM Total" value={isNum(vramTotal) ? bytes(vramTotal) : '—'} />
                <Row label="Core Temp" value={isNum(g.temperature) && g.temperature > 0 ? `${g.temperature} °C` : '—'} />
              </div>
            </div>
          </section>
        );
      })}
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
      <section className="card card-pad card--fold">
        <div className="empty">
          <span className="empty-mark"><Icon name="sensors" size={18} /></span>
          <strong>NO HWMON SENSORS REPORTED</strong>
          <span>Board firmware does not expose hardware thermal or fan monitoring channels.</span>
        </div>
      </section>
    );
  }

  return (
    <div className="grid-2">
      <section className="card card-pad card--fold">
        <Head title="Thermal Zones" note="Linux hwmon temperature sensors in degrees Celsius." stamp="HWMON THERMAL" />
        <div className="rows">
          {temps.map((t) => (
            <Row
              key={`${t.source}-${t.label}`}
              label={`${t.source} · ${t.label}`}
              value={isNum(t.value) ? `${Number(t.value).toFixed(1)} °C` : '—'}
              tone={t.value > 85 ? 'var(--red)' : t.value > 70 ? 'var(--clay)' : undefined}
            />
          ))}
        </div>
      </section>

      <section className="card card-pad card--fold">
        <Head title="Cooling Fans" note="Fan tachometer registers in revolutions per minute." stamp="HWMON FANS" />
        <div className="rows">
          {fans.map((f) => (
            <Row
              key={`${f.source}-${f.label}`}
              label={`${f.source} · ${f.label}`}
              value={isNum(f.value) ? `${Number(f.value).toLocaleString()} RPM` : '—'}
            />
          ))}
          {fans.length === 0 && <p className="card-note">No active fan channels reported.</p>}
        </div>
      </section>
    </div>
  );
}

export function BatteryView({ metrics }) {
  const batteries = metrics?.battery || [];
  if (batteries.length === 0) {
    return (
      <section className="card card-pad card--fold">
        <div className="empty">
          <span className="empty-mark"><Icon name="battery" size={18} /></span>
          <strong>NO BATTERY SUPPLY DETECTED</strong>
          <span>No battery power supply detected in /sys/class/power_supply (host may be running on AC line power, a VM, or container).</span>
        </div>
      </section>
    );
  }

  return (
    <div className="grid-2">
      {batteries.map((b) => {
        const cap = isNum(b.capacity) ? clampPct(b.capacity) : null;
        return (
          <section className="card card-pad card--fold" key={b.id}>
            <Head title={b.id.toUpperCase()} note={b.status || 'unknown'} stamp="POWER SUPPLY" />
            <div className="ring-wrap">
              <Ring3D
                value={cap ?? 0}
                size={132}
                sublabel={cap != null ? "CHARGE" : "N/A"}
                label="Battery charge"
                tone={cap != null && cap < 20 ? 'danger' : cap != null && cap < 50 ? 'warn' : 'accent'}
              />
              <div className="legend-list">
                <Row label="Charge Level" value={cap != null ? `${cap.toFixed(0)}%` : '—'} />
                <Row label="Power Draw" value={isNum(b.powerNow) ? `${Number(b.powerNow).toFixed(2)} W` : '—'} />
                <Row label="Pack Voltage" value={isNum(b.voltageNow) ? `${Number(b.voltageNow).toFixed(2)} V` : '—'} />
                <Row label="Charge Cycles" value={b.chargeCycle || '—'} />
                <Row label="Time To Empty" value={isNum(b.timeToEmpty) ? `${Number(b.timeToEmpty).toFixed(1)} h` : '—'} />
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default { CpuView, MemoryView, StorageView, NetworkView, GraphicsView, SensorsView, BatteryView };
