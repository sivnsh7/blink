import React from 'react';
import { CpuView, MemoryView, StorageView, NetworkView } from './Details';

const sections = [
  ['cpu', 'Processor', 'CPU utilization, load average, logical CPU activity and clock data'],
  ['memory', 'Memory', 'Estimated memory use, availability, swap and reclaimable cache'],
  ['storage', 'Storage', 'Block devices, mounted filesystems and I/O throughput'],
  ['network', 'Network', 'Interface traffic and aggregate throughput'],
];

export default function Performance({ metrics, history }) {
  return (
    <div className="stack">
      <section className="card card-pad">
        <div className="section-intro">
          <div><h2>Performance workspace</h2><p>Resource telemetry from the Linux host. Jump to a subsystem to inspect its measurements.</p></div>
        </div>
        <div className="overview-list performance-jumps">
          {sections.map(([id, label, description]) => (
            <a href={`#performance-${id}`} key={id}>
              <span><strong>{label}</strong><small>{description}</small></span>
              <span aria-hidden="true">↓</span>
            </a>
          ))}
        </div>
      </section>
      <section id="performance-cpu" className="detail-section">
        <div className="section-intro"><div><h2>Processor</h2><p>Utilization and scheduler counters</p></div></div>
        <CpuView metrics={metrics} history={history} />
      </section>
      <section id="performance-memory" className="detail-section">
        <div className="section-intro"><div><h2>Memory</h2><p>Physical memory estimate and swap</p></div></div>
        <MemoryView metrics={metrics} history={history} />
      </section>
      <section id="performance-storage" className="detail-section">
        <div className="section-intro"><div><h2>Storage</h2><p>Devices, mounts and disk I/O</p></div></div>
        <StorageView metrics={metrics} history={history} />
      </section>
      <section id="performance-network" className="detail-section">
        <div className="section-intro"><div><h2>Network</h2><p>Interface throughput and counters</p></div></div>
        <NetworkView metrics={metrics} history={history} />
      </section>
    </div>
  );
}
