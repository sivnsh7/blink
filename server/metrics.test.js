import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  getCpuMetrics,
  getMemoryMetrics,
  getDiskMetrics,
  getNetworkMetrics,
  getProcessMetrics,
  getSystemInfo,
  getPsiMetrics,
  getSecurityMetrics,
  getHostAudit,
  killHostProcess,
} from './metrics.js';
import { spawn } from 'node:child_process';

const procfsAvailable = existsSync('/proc/stat') && existsSync('/proc/diskstats');

test('Linux collectors return JSON-safe host metric shapes', { skip: !procfsAvailable }, () => {
  const s = {
    cpu: getCpuMetrics(),
    memory: getMemoryMetrics(),
    disk: getDiskMetrics(),
    network: getNetworkMetrics(),
    processes: getProcessMetrics(),
    system: getSystemInfo(),
    psi: getPsiMetrics(),
    security: getSecurityMetrics(),
  };

  assert.equal(typeof s.cpu, 'object');
  assert.equal(typeof s.memory, 'object');
  assert.ok(Array.isArray(s.disk));
  assert.ok(Array.isArray(s.network));
  assert.ok(Array.isArray(s.processes));
  assert.equal(typeof s.system, 'object');
  assert.equal(typeof s.psi, 'object');
  assert.equal(typeof s.security, 'object');
  assert.doesNotThrow(() => JSON.stringify(s));
});

test('Process metrics include security classification & uid', { skip: !procfsAvailable }, () => {
  const procs = getProcessMetrics();
  assert.ok(Array.isArray(procs));
  if (procs.length > 0) {
    const first = procs[0];
    assert.ok('privilegeClass' in first);
    assert.ok('threatClassification' in first);
    assert.ok('isPrivileged' in first);
    assert.ok(['kernel-task', 'root-sys', 'user-space'].includes(first.privilegeClass));
  }
});

test('Memory metrics accurately report used as MemTotal - MemAvailable', { skip: !procfsAvailable }, () => {
  const mem = getMemoryMetrics();
  assert.ok(mem);
  assert.ok(typeof mem.total === 'number' && mem.total > 0);
  assert.ok(typeof mem.available === 'number' && mem.available >= 0);
  assert.ok(typeof mem.used === 'number');
  assert.equal(mem.used, Math.max(0, mem.total - mem.available));
  assert.ok('committedAs' in mem);
  assert.ok('commitLimit' in mem);
});

test('Storage metrics separate blockDevices from filesystems', { skip: !procfsAvailable }, () => {
  const disk = getDiskMetrics();
  assert.ok(Array.isArray(disk));
  assert.ok(Array.isArray(disk.blockDevices));
  assert.ok(Array.isArray(disk.filesystems));
  if (disk.filesystems.length > 0) {
    const rootFs = disk.filesystems.find((f) => f.mountpoint === '/');
    if (rootFs) {
      assert.equal(rootFs.isRoot, true);
    }
  }
});

test('PSI metrics report kernel support state and structure', { skip: !procfsAvailable }, () => {
  const psi = getPsiMetrics();
  assert.equal(typeof psi.supported, 'boolean');
  if (psi.supported) {
    if (psi.cpu) {
      assert.ok('some' in psi.cpu);
    }
    if (psi.memory) {
      assert.ok('some' in psi.memory);
    }
  }
});

test('Host audit performs pure evaluation without baseline mutation', { skip: !procfsAvailable }, () => {
  const mockSnapshot = {
    system: { hostname: 'test-node', kernel: '6.6.0' },
    cpu: { overall: { usage: 42.5 } },
    memory: { total: 16000000000, available: 8000000000, usagePercent: 50.0 },
    psi: { supported: true, cpu: { some: { avg10: 1.2 } }, memory: { some: { avg10: 0.0 } } },
    security: { aslr: 2, entropy: 256 },
    processes: [{ pid: 1, name: 'systemd', isPrivileged: true, state: 'sleeping' }],
  };

  const audit1 = getHostAudit(mockSnapshot);
  const audit2 = getHostAudit(mockSnapshot);

  assert.deepEqual(audit1, audit2);
  assert.equal(audit1.score, 100);
  assert.equal(typeof audit1.postureGrade, 'string');
  assert.equal(audit1.coverage.evaluatedChecks, 5);
});

test('Process termination safety and validation guards', async () => {
  // Reject PID <= 1
  assert.throws(() => killHostProcess(1), /strictly prohibited/);
  assert.throws(() => killHostProcess(0), /strictly prohibited/);
  assert.throws(() => killHostProcess(-5), /strictly prohibited/);
  assert.throws(() => killHostProcess('invalid'), /strictly prohibited/);

  // Reject self-kill
  assert.throws(() => killHostProcess(process.pid), /Self-termination/);

  // Reject unsupported signal
  assert.throws(() => killHostProcess(999999, 'SIGFOO'), /Unsupported signal/);

  // Non-existent PID throws ESRCH
  assert.throws(() => killHostProcess(999999, 'SIGTERM'), /does not exist/);

  // Successfully terminate a spawned child process
  const child = spawn('sleep', ['30']);
  assert.ok(child.pid > 1);

  const exitPromise = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));

  const res = killHostProcess(child.pid, 'SIGTERM');
  assert.equal(res.ok, true);
  assert.equal(res.pid, child.pid);
  assert.equal(res.signal, 'SIGTERM');

  const { signal } = await exitPromise;
  assert.equal(signal, 'SIGTERM');
});
