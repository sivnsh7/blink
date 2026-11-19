import React from 'react';
import { GraphicsView, SensorsView, BatteryView } from './Details';

export default function Hardware({ metrics }) {
  return (
    <div className="stack">
      <section className="card card-pad">
        <div className="section-intro">
          <div><h2>Hardware inventory</h2><p>Device telemetry exposed by the active Linux kernel drivers. Missing sensor data is not interpreted as zero.</p></div>
        </div>
      </section>
      <section className="detail-section">
        <div className="section-intro"><div><h2>Graphics adapters</h2><p>GPU utilization and memory where a supported driver exposes them.</p></div></div>
        <GraphicsView metrics={metrics} />
      </section>
      <section className="detail-section">
        <div className="section-intro"><div><h2>Thermal sensors</h2><p>Readable temperature and fan channels.</p></div></div>
        <SensorsView metrics={metrics} />
      </section>
      <section className="detail-section">
        <div className="section-intro"><div><h2>Power and battery</h2><p>Charge and power telemetry, when a battery device is exposed.</p></div></div>
        <BatteryView metrics={metrics} />
      </section>
    </div>
  );
}
