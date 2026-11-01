import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import Redacted from '../components/Redacted';
import { bytes, isNum } from '../lib/format';

const SORTS = [
  { key: 'cpu', label: 'CPU %' },
  { key: 'mem', label: 'MEM %' },
  { key: 'pid', label: 'PID' },
  { key: 'name', label: 'NAME' },
];

const FILTERS = [
  { key: 'all', label: 'ALL SAMPLES' },
  { key: 'active', label: 'RUNNING' },
  { key: 'root', label: 'ROOT / SYS' },
  { key: 'sleeping', label: 'SLEEPING' },
];

// Memoized Process Row Component to prevent 100-row re-renders on every telemetry tick
const ProcessRow = React.memo(function ProcessRow({ proc: p, onSelect }) {
  const isRoot = p.privilegeClass === 'root-sys' || p.isPrivileged || p.uid === 0;
  const isKern = p.privilegeClass === 'kernel-task' || p.isKernel;

  return (
    <tr
      style={{ cursor: 'pointer' }}
      onClick={() => onSelect(p)}
      tabIndex={0}
      role="row"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(p);
        }
      }}
    >
      <td>
        <Redacted note="PID" className="tabular">
          {p.pid}
        </Redacted>
      </td>

      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              border: 'var(--border-hair) solid var(--ink)',
              background: isRoot ? 'var(--red-tint)' : isKern ? 'var(--clay-tint)' : 'var(--paper-2)',
              color: isRoot ? 'var(--red)' : isKern ? 'var(--clay)' : 'var(--ink)',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: '.66rem',
              fontWeight: 700,
            }}
          >
            {String(p.name || '?').slice(0, 2).toUpperCase()}
          </span>
          <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '.82rem' }}>
            {isRoot || isKern ? (
              <Redacted note="SYS-PROC">{p.name}</Redacted>
            ) : (
              p.name
            )}
          </strong>
        </div>
      </td>

      <td>
        {isKern ? (
          <span className="stamp stamp--wip" style={{ fontSize: '.58rem' }}>
            KERNEL-TASK
          </span>
        ) : isRoot ? (
          <span className="stamp stamp--hypothesis" style={{ fontSize: '.58rem' }}>
            ROOT-SYS
          </span>
        ) : (
          <span className="stamp stamp--confirmed" style={{ fontSize: '.58rem' }}>
            USER-SPACE
          </span>
        )}
      </td>

      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span className="tabular" style={{ fontWeight: 600 }}>
            {isNum(p.cpuPercent) ? `${Number(p.cpuPercent).toFixed(1)}%` : '—'}
          </span>
          <div
            style={{
              width: 48,
              height: 5,
              border: 'var(--border-hair) solid var(--ink)',
              borderRadius: 2,
              background: 'var(--paper-2)',
              overflow: 'hidden',
            }}
          >
            <i
              style={{
                display: 'block',
                height: '100%',
                width: `${Math.min(100, (p.cpuPercent || 0) * 2)}%`,
                background: 'var(--red)',
              }}
            />
          </div>
        </div>
      </td>

      <td>
        <span className="tabular">{bytes(p.rss)}</span>
      </td>

      <td>
        <span className="tabular">{p.threads ?? '—'}</span>
      </td>

      <td>
        <span
          className={`stamp ${
            p.state === 'running'
              ? 'stamp--live'
              : p.state === 'zombie'
              ? 'stamp--hypothesis'
              : 'stamp--idle'
          }`}
          style={{ fontSize: '.6rem' }}
        >
          {p.state}
        </span>
      </td>

      <td style={{ textAlign: 'right' }}>
        <button
          type="button"
          className="btn btn--paper btn--sm"
          style={{ padding: '.25em .65em' }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(p);
          }}
          aria-label={`Inspect process ${p.name} PID ${p.pid}`}
        >
          DOSSIER
        </button>
      </td>
    </tr>
  );
});

export default function Processes({ metrics, onRefresh }) {
  const all = metrics?.processes || [];
  const totalSeen = metrics?.processesInfo?.totalSeen ?? all.length;
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState('cpu');
  const [filter, setFilter] = useState('all');
  const [selectedProc, setSelectedProc] = useState(null);

  // Process termination state
  const [confirmKill, setConfirmKill] = useState(false);
  const [killSignal, setKillSignal] = useState('SIGTERM');
  const [isTerminating, setIsTerminating] = useState(false);
  const [killStatus, setKillStatus] = useState(null);

  const modalRef = useRef(null);
  const closeBtnRef = useRef(null);
  const lastFocusedRef = useRef(null);

  const handleSelectProc = (proc) => {
    lastFocusedRef.current = document.activeElement;
    setSelectedProc(proc);
    setConfirmKill(false);
    setKillStatus(null);
    setKillSignal('SIGTERM');
  };

  const handleCloseModal = () => {
    setSelectedProc(null);
    setConfirmKill(false);
    setKillStatus(null);
    if (lastFocusedRef.current && typeof lastFocusedRef.current.focus === 'function') {
      lastFocusedRef.current.focus();
    }
  };

  const handleKillProcess = async () => {
    if (!selectedProc) return;
    setIsTerminating(true);
    setKillStatus(null);
    try {
      const res = await fetch(`/api/processes/${selectedProc.pid}/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal: killSignal }),
      });
      const data = await res.json();
      if (data.ok) {
        setKillStatus({
          ok: true,
          message: `Process ${selectedProc.pid} (${selectedProc.name}) terminated successfully via ${killSignal}.`,
        });
        setConfirmKill(false);
        if (typeof onRefresh === 'function') {
          onRefresh();
        }
        setTimeout(() => {
          handleCloseModal();
        }, 1400);
      } else {
        setKillStatus({
          ok: false,
          message: `Termination failed: ${data.error || 'Server error'}`,
        });
      }
    } catch (err) {
      setKillStatus({
        ok: false,
        message: `Network error terminating process: ${err.message}`,
      });
    } finally {
      setIsTerminating(false);
    }
  };

  // Accessible Modal focus trap and Escape handler
  useEffect(() => {
    if (!selectedProc) return;

    // Focus close button on mount
    const timer = setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleCloseModal();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedProc]);

  const rows = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const filtered = all.filter((p) => {
      const priv = p.privilegeClass || p.threatClassification || '';
      if (needle && !`${p.name} ${p.pid} ${priv}`.toLowerCase().includes(needle)) {
        return false;
      }
      if (filter === 'active') return p.state === 'running';
      if (filter === 'sleeping') return p.state === 'sleeping';
      if (filter === 'root') return p.privilegeClass === 'root-sys' || p.isPrivileged || p.uid === 0;
      return true;
    });

    const by = {
      cpu: (a, b) => (b.cpuPercent || 0) - (a.cpuPercent || 0),
      mem: (a, b) => (b.rss || 0) - (a.rss || 0),
      pid: (a, b) => a.pid - b.pid,
      name: (a, b) => String(a.name).localeCompare(String(b.name)),
    }[sort];

    return [...filtered].sort(by);
  }, [all, deferredQuery, sort, filter]);

  const totalCpu = all.reduce((s, p) => s + (Number(p.cpuPercent) || 0), 0);
  const totalMem = all.reduce((s, p) => s + (Number(p.rss) || 0), 0);
  const rootCount = all.filter((p) => p.privilegeClass === 'root-sys' || p.isPrivileged || p.uid === 0).length;

  return (
    <div className="stack" style={{ display: 'grid', gap: '1.6rem' }}>
      {/* Proof Primitive Strip */}
      <div className="proof">
        <div>
          <span className="proof__n">{all.length}</span>
          <span className="lbl proof__l">TOP {all.length} SAMPLED ({totalSeen} TOTAL)</span>
        </div>
        <div>
          <span className="proof__n">{totalCpu.toFixed(1)}%</span>
          <span className="lbl proof__l">CUMULATIVE CPU LOAD</span>
        </div>
        <div>
          <span className="proof__n">{bytes(totalMem)}</span>
          <span className="lbl proof__l">COMMITTED RSS RESIDENT</span>
        </div>
        <div>
          <span className="proof__n">{rootCount}</span>
          <span className="lbl proof__l">ROOT / PRIVILEGED</span>
        </div>
      </div>

      <section className="card card-pad card--fold">
        <div className="card-head">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.3rem' }}>
              <span className="stamp stamp--live">PROC TELEMETRY</span>
              <h2 className="card-title">Process Security & Resource Registry</h2>
            </div>
            <p className="card-note">
              Top {all.length} active processes by resource consumption sampled directly from Linux <code style={{ fontFamily: 'var(--font-mono)' }}>/proc/[pid]/stat</code> (out of {totalSeen} total tasks seen). Click any row or dossier button to inspect scheduling registers.
            </p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="table-tools">
          <label className="search">
            <Icon name="search" size={15} />
            <input
              type="search"
              placeholder="Filter by name, PID, or privilege class"
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

        {/* Tabular Process Registry */}
        <div className="table-wrap">
          <table role="table" aria-label="Process security and resource table">
            <thead>
              <tr>
                <th style={{ width: 100 }}>PID</th>
                <th>PROCESS IDENTIFIER</th>
                <th>PRIVILEGE CLASS</th>
                <th>CPU %</th>
                <th>RSS MEMORY</th>
                <th>THREADS</th>
                <th>STATE</th>
                <th style={{ textAlign: 'right' }}>INSPECT</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <ProcessRow key={p.pid} proc={p} onSelect={handleSelectProc} />
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-mute)' }}>
                      NO PROCESS REGISTERS MATCHING ACTIVE FILTER
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.2rem', fontFamily: 'var(--font-mono)', fontSize: '.74rem', color: 'var(--ink-mute)', flexWrap: 'wrap', gap: '.6rem' }}>
          <span>DISPLAYING {rows.length} OF {all.length} SAMPLED PROCESSES ({totalSeen} TOTAL IN /proc)</span>
          <span>TASK SCHEDULER CPU LOAD IS CUMULATIVE ACROSS LOGICAL CORES</span>
        </div>
      </section>

      {/* Selected Process Dossier Modal */}
      {selectedProc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="proc-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20, 18, 15, .72)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 100,
            padding: 16,
          }}
          onClick={handleCloseModal}
        >
          <div
            ref={modalRef}
            className="card card-pad card--fold"
            style={{
              maxWidth: 580,
              width: '100%',
              background: 'var(--paper-3)',
              boxShadow: 'var(--sh-hero)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-head">
              <div>
                <div style={{ display: 'flex', gap: '.6rem', marginBottom: '.4rem' }}>
                  <span className="stamp stamp--confirmed">PROCESS CASE FILE</span>
                  <span className="stamp stamp--live">PID {selectedProc.pid}</span>
                </div>
                <h2 id="proc-modal-title" className="card-title">{selectedProc.name}</h2>
              </div>
              <button
                ref={closeBtnRef}
                type="button"
                className="btn btn--paper btn--sm"
                onClick={handleCloseModal}
                aria-label="Close process dossier"
              >
                CLOSE [ESC]
              </button>
            </div>

            <div className="proof" style={{ boxShadow: 'var(--sh-1)', marginBottom: '1.2rem' }}>
              <div>
                <span className="proof__n">{isNum(selectedProc.cpuPercent) ? selectedProc.cpuPercent.toFixed(1) : 0}%</span>
                <span className="lbl proof__l">CORE LOAD</span>
              </div>
              <div>
                <span className="proof__n">{bytes(selectedProc.rss)}</span>
                <span className="lbl proof__l">RESIDENT SET</span>
              </div>
              <div>
                <span className="proof__n">{selectedProc.threads ?? 1}</span>
                <span className="lbl proof__l">THREADS</span>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '.6rem', fontFamily: 'var(--font-mono)', fontSize: '.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '.4em .6em', background: 'var(--paper-2)', borderRadius: 'var(--r-sm)' }}>
                <span style={{ color: 'var(--ink-mute)' }}>PRIVILEGE CLASS:</span>
                <b>{(selectedProc.privilegeClass || (selectedProc.uid === 0 ? 'root-sys' : 'user-space')).toUpperCase()}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '.4em .6em', background: 'var(--paper-2)', borderRadius: 'var(--r-sm)' }}>
                <span style={{ color: 'var(--ink-mute)' }}>PARENT PID (PPID):</span>
                <b>{selectedProc.ppid ?? '—'}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '.4em .6em', background: 'var(--paper-2)', borderRadius: 'var(--r-sm)' }}>
                <span style={{ color: 'var(--ink-mute)' }}>USER ID (UID):</span>
                <b>{selectedProc.uid != null ? `${selectedProc.uid} (${selectedProc.uid === 0 ? 'root' : 'user'})` : '—'}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '.4em .6em', background: 'var(--paper-2)', borderRadius: 'var(--r-sm)' }}>
                <span style={{ color: 'var(--ink-mute)' }}>PRIORITY / NICE:</span>
                <b>{selectedProc.priority ?? '—'} / {selectedProc.nice ?? '—'}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '.4em .6em', background: 'var(--paper-2)', borderRadius: 'var(--r-sm)' }}>
                <span style={{ color: 'var(--ink-mute)' }}>TASK STATE:</span>
                <b>{selectedProc.state?.toUpperCase()}</b>
              </div>
            </div>

            {/* Termination Controls */}
            <div style={{ marginTop: '1.2rem', paddingTop: '1rem', borderTop: 'var(--border-hair) solid var(--ink)' }}>
              {selectedProc.isKernel || selectedProc.privilegeClass === 'kernel-task' ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="stamp stamp--wip" style={{ fontSize: '.68rem' }}>KERNEL TASK // IMMUTABLE</span>
                  <button type="button" className="btn btn--clay" onClick={handleCloseModal}>
                    <span>DISMISS</span>
                  </button>
                </div>
              ) : selectedProc.pid === 1 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="stamp stamp--hypothesis" style={{ fontSize: '.68rem' }}>PID 1 (INIT) // PROTECTED</span>
                  <button type="button" className="btn btn--clay" onClick={handleCloseModal}>
                    <span>DISMISS</span>
                  </button>
                </div>
              ) : confirmKill ? (
                <div style={{ padding: '.8rem', background: 'var(--red-tint)', borderRadius: 'var(--r-sm)', border: '1px solid var(--red)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.8rem', flexWrap: 'wrap', gap: '.5rem' }}>
                    <strong style={{ fontSize: '.8rem', color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>
                      CONFIRM TERMINATION (PID {selectedProc.pid})
                    </strong>
                    <div className="segmented" role="group" aria-label="Kill signal selection">
                      <button
                        type="button"
                        className={killSignal === 'SIGTERM' ? 'is-on' : ''}
                        onClick={() => setKillSignal('SIGTERM')}
                      >
                        SIGTERM (GRACEFUL)
                      </button>
                      <button
                        type="button"
                        className={killSignal === 'SIGKILL' ? 'is-on' : ''}
                        onClick={() => setKillSignal('SIGKILL')}
                      >
                        SIGKILL (FORCE)
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn--paper btn--sm"
                      onClick={() => setConfirmKill(false)}
                      disabled={isTerminating}
                    >
                      CANCEL
                    </button>
                    <button
                      type="button"
                      className="btn btn--clay btn--sm"
                      style={{ background: 'var(--red)', color: '#fff' }}
                      onClick={handleKillProcess}
                      disabled={isTerminating}
                    >
                      <span>{isTerminating ? 'TERMINATING...' : `SEND ${killSignal}`}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.6rem' }}>
                  <button
                    type="button"
                    className="btn btn--paper btn--sm"
                    style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                    onClick={() => setConfirmKill(true)}
                  >
                    <span>KILL PROCESS</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn--clay"
                    onClick={handleCloseModal}
                  >
                    <span>ACKNOWLEDGE RECORD</span>
                  </button>
                </div>
              )}

              {/* Status Banner */}
              {killStatus && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    marginTop: '.8rem',
                    padding: '.55em .8em',
                    borderRadius: 'var(--r-sm)',
                    border: `1px solid ${killStatus.ok ? 'var(--clay)' : 'var(--red)'}`,
                    background: killStatus.ok ? 'var(--clay-tint)' : 'var(--red-tint)',
                    color: killStatus.ok ? 'var(--clay)' : 'var(--red)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '.76rem',
                  }}
                >
                  {killStatus.message}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
