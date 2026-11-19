import React from 'react';
import AuditView from './AuditView';

export default function Diagnostics({ metrics }) {
  return (
    <div className="stack">
      <section className="card card-pad diagnostics-intro">
        <div className="section-intro">
          <div><h2>Host diagnostics</h2><p>Observed kernel settings, Linux Pressure Stall Information and a limited heuristic assessment. This is not a security certification.</p></div>
        </div>
      </section>
      <AuditView metrics={metrics} />
    </div>
  );
}
