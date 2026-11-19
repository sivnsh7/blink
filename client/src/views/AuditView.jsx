import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import Icon from '../components/Icon';
import { auditReducer, createAuditState } from '../lib/stateMachines.js';

function formatStallTotal(usec) {
  if (usec == null) return '—';
  const sec = usec / 1e6;
  if (sec < 0.01 && usec > 0) return `${(usec / 1e3).toFixed(1)}ms`;
  if (sec < 10) return `${sec.toFixed(2)}s`;
  return `${sec.toFixed(1)}s`;
}

export default function AuditView({ metrics }) {
  const [auditState, dispatchAudit] = useReducer(auditReducer, undefined, createAuditState);
  const { audit, error } = auditState;
  const loading = auditState.phase === 'loading';
  const auditRequestRef = useRef(null);

  const fetchAudit = useCallback(async () => {
    auditRequestRef.current?.abort();
    const controller = new AbortController();
    auditRequestRef.current = controller;
    dispatchAudit({ type: 'REQUEST' });

    try {
      const res = await fetch('/api/audit', { signal: controller.signal });
      if (!res.ok) throw new Error(`Audit endpoint returned HTTP ${res.status}`);
      const json = await res.json();
      if (auditRequestRef.current !== controller) return;
      dispatchAudit({ type: 'SUCCESS', audit: json.audit });
    } catch (err) {
      if (auditRequestRef.current === controller && !controller.signal.aborted) {
        dispatchAudit({
          type: 'FAILURE',
          message: err?.message || 'Failed to reach audit endpoint',
        });
      }
    } finally {
      if (auditRequestRef.current === controller) auditRequestRef.current = null;
    }
  }, []);

  useEffect(() => {
    void fetchAudit();
    return () => {
      auditRequestRef.current?.abort();
      auditRequestRef.current = null;
    };
  }, [fetchAudit]);

  const sec = metrics?.security || audit?.security || null;
  const psi = metrics?.psi || audit?.psi || null;
  const hasAudit = Number.isFinite(audit?.score);
  const score = hasAudit ? audit.score : null;
  const posture = hasAudit
    ? audit.postureGrade
    : loading
    ? 'Awaiting audit telemetry...'
    : error
    ? 'Audit telemetry unavailable'
    : 'Awaiting host data';

  const stampClass = hasAudit ? audit.stampClass : 'stamp--idle';

  return (
    <div className="stack" style={{ display: 'grid', gap: '1.6rem' }}>
      {/* Proof Strip */}
      <div className="proof">
        <div>
          <span className="proof__n">{hasAudit ? `${score} / 100` : '—'}</span>
          <span className="lbl proof__l">HEURISTIC POSTURE SCORE</span>
        </div>
        <div>
          <span className="proof__n">
            {Number.isFinite(psi?.cpu?.some?.avg10) ? `${psi.cpu.some.avg10.toFixed(2)}%` : '—'}
          </span>
          <span className="lbl proof__l">CPU STALL RATE (PSI 10S)</span>
        </div>
        <div>
          <span className="proof__n">
            {Number.isFinite(psi?.memory?.some?.avg10) ? `${psi.memory.some.avg10.toFixed(2)}%` : '—'}
          </span>
          <span className="lbl proof__l">MEM PRESSURE (PSI 10S)</span>
        </div>
        <div>
          <span className="proof__n">
            {Number.isFinite(sec?.entropy) ? `${sec.entropy} BITS` : '—'}
          </span>
          <span className="lbl proof__l">ENTROPY AVAILABILITY</span>
        </div>
      </div>

      {error && (
        <div
          className="card card-pad"
          role="alert"
          style={{
            border: 'var(--border-w) solid var(--red)',
            background: 'var(--red-tint)',
            color: 'var(--red-dark)',
            fontFamily: 'var(--font-mono)',
            fontSize: '.84rem',
          }}
        >
          [AUDIT NOTICE] {error}
        </div>
      )}

      {/* Main Posture Assessment Card */}
      <section className="card card-pad card--fold">
        <div className="card-head">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem', marginBottom: '.4rem' }}>
              <span className={`stamp ${stampClass}`}>{posture}</span>
              {hasAudit && (
                <span className="stamp stamp--confirmed">
                  {audit.coverage?.evaluatedChecks ?? 0} CHECKS EVALUATED
                </span>
              )}
            </div>
            <h2 className="card-title">Host Security & Stability Baseline</h2>
            <p className="card-note">
              Heuristic assessment evaluated from Linux kernel sysfs and procfs security parameters.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--clay btn--sm"
            onClick={fetchAudit}
            disabled={loading}
          >
            <span>{loading ? 'EVALUATING...' : 'REFRESH AUDIT'}</span>
          </button>
        </div>

        <div className="sys">
          {/* ASLR Module */}
          <div className="mod">
            <div className="mod__head">
              <div>
                <span className="lbl">MEMORY PROTECTION</span>
                <h3>Address Space Layout</h3>
              </div>
              <span
                className={`stamp ${sec?.aslr === 2 ? 'stamp--confirmed' : sec?.aslr === 1 ? 'stamp--wip' : 'stamp--idle'}`}
                style={{ fontSize: '.6rem' }}
              >
                {sec?.aslr != null ? `LEVEL ${sec.aslr}` : 'UNAVAILABLE'}
              </span>
            </div>
            <p style={{ fontSize: '.82rem', color: 'var(--ink-soft)', marginTop: '.4rem' }}>
              {sec?.aslrLabel || 'Address space randomization parameter unreadable'}
            </p>
            <div className="meter">
              <i className={sec?.aslr >= 1 ? 'on' : ''} />
              <i className={sec?.aslr >= 2 ? 'on' : ''} />
              <i className={sec?.aslr >= 2 ? 'on' : ''} />
            </div>
          </div>

          {/* Cryptographic Entropy */}
          <div className="mod">
            <div className="mod__head">
              <div>
                <span className="lbl">ENTROPY</span>
                <h3>Kernel Entropy Availability</h3>
              </div>
              <span
                className={`stamp ${sec?.entropy != null && sec.entropy >= 256 ? 'stamp--confirmed' : 'stamp--wip'}`}
                style={{ fontSize: '.6rem' }}
              >
                {sec?.entropy != null ? `${sec.entropy} BITS` : 'UNAVAILABLE'}
              </span>
            </div>
            <p style={{ fontSize: '.82rem', color: 'var(--ink-soft)', marginTop: '.4rem' }}>
              {sec?.entropy != null
                ? `${sec.entropy} bits available in /proc/sys/kernel/random/entropy_avail`
                : 'Kernel entropy availability counter unreadable'}
            </p>
            <div className="meter">
              <i className={sec?.entropy != null && sec.entropy >= 64 ? 'on' : ''} />
              <i className={sec?.entropy != null && sec.entropy >= 128 ? 'on' : ''} />
              <i className={sec?.entropy != null && sec.entropy >= 256 ? 'on' : ''} />
            </div>
          </div>

          {/* Isolation Profile */}
          <div className="mod">
            <div className="mod__head">
              <div>
                <span className="lbl">SANDBOX BOUNDARY</span>
                <h3>Container Isolation</h3>
              </div>
              <span className="stamp stamp--live" style={{ fontSize: '.6rem' }}>
                {sec?.isContainer === true
                  ? 'CONTAINER'
                  : sec?.isContainer === false
                  ? 'NON-CONTAINER'
                  : 'UNKNOWN'}
              </span>
            </div>
            <p style={{ fontSize: '.82rem', color: 'var(--ink-soft)', marginTop: '.4rem' }}>
              {sec?.isolationProfile || 'Container sandbox detection not verified'}
            </p>
            <div className="meter">
              <i className={sec ? 'on' : ''} />
              <i className={typeof sec?.isContainer === 'boolean' ? 'on' : ''} />
              <i className={sec?.isContainer === false ? 'on' : ''} />
            </div>
          </div>

          {/* Mandatory Access Control */}
          <div className="mod">
            <div className="mod__head">
              <div>
                <span className="lbl">SECURITY MODULES</span>
                <h3>LSM Framework</h3>
              </div>
              <span
                className={`stamp ${sec?.appArmor === true || sec?.selinux === true ? 'stamp--confirmed' : 'stamp--idle'}`}
                style={{ fontSize: '.6rem' }}
              >
                {sec?.appArmor === true ? 'APPARMOR' : sec?.selinux === true ? 'SELINUX' : sec?.appArmor === false && sec?.selinux === false ? 'NONE DETECTED' : 'UNKNOWN'}
              </span>
            </div>
            <p style={{ fontSize: '.82rem', color: 'var(--ink-soft)', marginTop: '.4rem' }}>
              {sec?.appArmor === true
                ? 'AppArmor kernel security module active'
                : sec?.selinux === true
                ? 'SELinux security module active'
                : sec?.appArmor === false && sec?.selinux === false
                ? 'No active Linux Security Module reported by this host'
                : 'Security module status is not available in the current snapshot'}
            </p>
            <div className="meter">
              <i className="on" />
              <i className={sec?.appArmor || sec?.selinux ? 'on' : ''} />
              <i className={sec?.appArmor || sec?.selinux ? 'on' : ''} />
            </div>
          </div>
        </div>
      </section>

      {/* Linux Pressure Stall Information (PSI) Case Files */}
      <section className="card card-pad">
        <div className="card-head">
          <div>
            <h2 className="card-title">Linux Pressure Stall Telemetry (/proc/pressure)</h2>
            <p className="card-note">
              Task stall times and resource pressure sampled from the Linux task scheduler.
            </p>
          </div>
          <span className={`stamp ${psi?.supported === true ? 'stamp--live' : 'stamp--idle'}`}>
            {psi?.supported === true ? 'PSI AVAILABLE' : psi?.supported === false ? 'PSI UNSUPPORTED' : 'PSI UNKNOWN'}
          </span>
        </div>

        {psi?.supported !== true ? (
          <div
            style={{
              padding: '1.2rem',
              border: 'var(--border-hair) solid var(--ink)',
              borderRadius: 'var(--r-sm)',
              background: 'var(--paper-2)',
              fontFamily: 'var(--font-mono)',
              fontSize: '.82rem',
              color: 'var(--ink-soft)',
            }}
          >
            {psi?.supported === false
              ? 'Linux Pressure Stall Information (PSI) is not enabled or supported by the current kernel configuration.'
              : 'PSI support has not been confirmed by the current host snapshot. No pressure rating is inferred.'}
          </div>
        ) : (
          <div className="files">
            {/* CPU PSI */}
            <details className="file" open>
              <summary>
                <span className="file__id">PSI-01</span>
                <div className="file__head">
                  <h3>CPU Scheduler Pressure</h3>
                  <span className="stamp stamp--confirmed">
                    {psi?.cpu?.some?.avg10 != null ? `${psi.cpu.some.avg10.toFixed(2)}% 10S` : '—'}
                  </span>
                </div>
                <span className="file__x" aria-hidden="true">
                  <Icon name="chevron" size={14} />
                </span>
              </summary>
              <div className="file__body">
                <p style={{ fontSize: '.84rem', color: 'var(--ink-soft)', marginBottom: '.8rem' }}>
                  Percentage of time that runnable tasks were delayed waiting for an available CPU core.
                </p>
                <div className="proof" style={{ boxShadow: 'var(--sh-1)' }}>
                  <div>
                    <span className="proof__n">
                      {Number.isFinite(psi?.cpu?.some?.avg10) ? `${psi.cpu.some.avg10.toFixed(2)}%` : '—'}
                    </span>
                    <span className="lbl proof__l">SOME TASKS (10S)</span>
                  </div>
                  <div>
                    <span className="proof__n">
                      {Number.isFinite(psi?.cpu?.some?.avg60) ? `${psi.cpu.some.avg60.toFixed(2)}%` : '—'}
                    </span>
                    <span className="lbl proof__l">SOME TASKS (60S)</span>
                  </div>
                  <div>
                    <span className="proof__n">
                      {Number.isFinite(psi?.cpu?.some?.avg300) ? `${psi.cpu.some.avg300.toFixed(2)}%` : '—'}
                    </span>
                    <span className="lbl proof__l">SOME TASKS (300S)</span>
                  </div>
                  <div>
                    <span className="proof__n">{formatStallTotal(psi?.cpu?.some?.total)}</span>
                    <span className="lbl proof__l">CUMULATIVE STALL TIME</span>
                  </div>
                </div>
              </div>
            </details>

            {/* Memory PSI */}
            <details className="file">
              <summary>
                <span className="file__id">PSI-02</span>
                <div className="file__head">
                  <h3>Memory Subsystem Pressure</h3>
                  <span className="stamp stamp--confirmed">
                    {psi?.memory?.some?.avg10 != null ? `${psi.memory.some.avg10.toFixed(2)}% 10S` : '—'}
                  </span>
                </div>
                <span className="file__x" aria-hidden="true">
                  <Icon name="chevron" size={14} />
                </span>
              </summary>
              <div className="file__body">
                <p style={{ fontSize: '.84rem', color: 'var(--ink-soft)', marginBottom: '.8rem' }}>
                  Time spent in page compaction, memory reclaim, or allocation delays.
                </p>
                <div className="proof" style={{ boxShadow: 'var(--sh-1)' }}>
                  <div>
                    <span className="proof__n">
                      {Number.isFinite(psi?.memory?.some?.avg10) ? `${psi.memory.some.avg10.toFixed(2)}%` : '—'}
                    </span>
                    <span className="lbl proof__l">SOME DELAY (10S)</span>
                  </div>
                  <div>
                    <span className="proof__n">
                      {Number.isFinite(psi?.memory?.full?.avg10) ? `${psi.memory.full.avg10.toFixed(2)}%` : '—'}
                    </span>
                    <span className="lbl proof__l">FULL STALL (10S)</span>
                  </div>
                  <div>
                    <span className="proof__n">{formatStallTotal(psi?.memory?.some?.total)}</span>
                    <span className="lbl proof__l">CUMULATIVE RECLAIM DELAY</span>
                  </div>
                </div>
              </div>
            </details>

            {/* IO PSI */}
            <details className="file">
              <summary>
                <span className="file__id">PSI-03</span>
                <div className="file__head">
                  <h3>Storage I/O Pressure</h3>
                  <span className="stamp stamp--confirmed">
                    {psi?.io?.some?.avg10 != null ? `${psi.io.some.avg10.toFixed(2)}% 10S` : '—'}
                  </span>
                </div>
                <span className="file__x" aria-hidden="true">
                  <Icon name="chevron" size={14} />
                </span>
              </summary>
              <div className="file__body">
                <p style={{ fontSize: '.84rem', color: 'var(--ink-soft)', marginBottom: '.8rem' }}>
                  Tasks delayed waiting for storage block completion.
                </p>
                <div className="proof" style={{ boxShadow: 'var(--sh-1)' }}>
                  <div>
                    <span className="proof__n">
                      {Number.isFinite(psi?.io?.some?.avg10) ? `${psi.io.some.avg10.toFixed(2)}%` : '—'}
                    </span>
                    <span className="lbl proof__l">SOME I/O DELAY (10S)</span>
                  </div>
                  <div>
                    <span className="proof__n">
                      {Number.isFinite(psi?.io?.full?.avg10) ? `${psi.io.full.avg10.toFixed(2)}%` : '—'}
                    </span>
                    <span className="lbl proof__l">FULL I/O STALL (10S)</span>
                  </div>
                  <div>
                    <span className="proof__n">{formatStallTotal(psi?.io?.some?.total)}</span>
                    <span className="lbl proof__l">CUMULATIVE I/O DELAY</span>
                  </div>
                </div>
              </div>
            </details>
          </div>
        )}
      </section>

      {/* Auditor Recommendations */}
      <section className="card card-pad">
        <div className="card-head">
          <div>
            <h2 className="card-title">Automated Heuristic Observations</h2>
            <p className="card-note">Rule-based observations derived from current host telemetry.</p>
          </div>
          <span className="stamp stamp--idle">HEURISTIC ANALYSIS</span>
        </div>

        <div style={{ display: 'grid', gap: '.65rem' }}>
          {audit?.recommendations && audit.recommendations.length > 0 ? (
            audit.recommendations.map((rec, i) => (
              <div
                key={i}
                style={{
                  padding: '.8rem 1rem',
                  border: 'var(--border-hair) solid var(--ink)',
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--paper-2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '.8rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '.78rem',
                }}
              >
                <span className="stamp stamp--wip" style={{ fontSize: '.6rem' }}>ADVISORY</span>
                <span>{rec}</span>
              </div>
            ))
          ) : (
            <div
              style={{
                padding: '.8rem 1rem',
                border: 'var(--border-hair) solid var(--ink)',
                borderRadius: 'var(--r-sm)',
                background: 'var(--paper-2)',
                display: 'flex',
                alignItems: 'center',
                gap: '.8rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '.78rem',
              }}
            >
              <span className="stamp stamp--idle" style={{ fontSize: '.6rem' }}>NO FINDINGS</span>
              <span>No recommendations were returned. This is not proof that the host is secure; review evaluated-check coverage and unavailable telemetry above.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
