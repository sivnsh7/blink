import React, { useState } from 'react';
import { bytes, pct } from '../lib/format';
import Redacted from './Redacted';

export default function TelemetryTicker({ metrics, connected }) {
  const [isPaused, setIsPaused] = useState(false);

  const system = metrics?.system || {};
  const cpu = metrics?.cpu || {};
  const mem = metrics?.memory || {};
  const load = cpu?.loadAvg || {};
  const net = metrics?.network || [];

  const netRx = net.reduce((s, n) => s + (Number(n?.rxBytesPerSec) || 0), 0);
  const netTx = net.reduce((s, n) => s + (Number(n?.txBytesPerSec) || 0), 0);

  const items = [
    {
      label: 'HOST',
      value: (
        <Redacted note="MASKED-HOST" interactive={false}>
          {system.hostname || 'LOCAL-NODE'}
        </Redacted>
      ),
    },
    { label: 'KERNEL', value: system.kernel || 'LINUX' },
    { label: 'ARCH', value: system.arch || 'X86_64' },
    { label: 'LOGICAL CPUS', value: `${system.cpus || 1}` },
    {
      label: 'LOAD 1/5/15',
      value: `${(load.l1 || 0).toFixed(2)} · ${(load.l5 || 0).toFixed(2)} · ${(load.l15 || 0).toFixed(2)}`,
    },
    {
      label: 'ESTIMATED RAM USED',
      value: `${bytes(mem.used || 0)} / ${bytes(mem.total || 0)} (${pct(mem.usagePercent || 0, 0)})`,
    },
    {
      label: 'NET BANDWIDTH',
      value: `RX ${bytes(netRx, { rate: true })} · TX ${bytes(netTx, { rate: true })}`,
    },
    { label: 'STREAM', value: connected ? 'STREAMING' : 'OFFLINE' },
    { label: 'SECURITY', value: 'LOOPBACK ISOLATED' },
  ];

  const renderGroup = (prefix) =>
    items.map((item, idx) => (
      <span className="tick__g" key={`${prefix}-${idx}`}>
        <b>{item.label}:</b>
        <span>{item.value}</span>
        <i>◆</i>
      </span>
    ));

  return (
    <div
      className="ticker-wrap"
      role="region"
      aria-label="Real-time host telemetry ticker"
    >
      <div
        className={`tick ${isPaused ? 'is-paused' : ''}`}
        title="Real-time Host Telemetry Ribbon (Hover or click pause to halt)"
      >
        <div className="tick__row" aria-hidden="true">
          {renderGroup('track-a')}
          {renderGroup('track-b')}
        </div>
      </div>
      <button
        type="button"
        className="ticker-pause-btn"
        onClick={() => setIsPaused((prev) => !prev)}
        aria-label={isPaused ? 'Resume telemetry ticker' : 'Pause telemetry ticker'}
        aria-pressed={isPaused}
        title={isPaused ? 'Resume ticker' : 'Pause ticker'}
      >
        {isPaused ? '▶' : '❚❚'}
      </button>
    </div>
  );
}
