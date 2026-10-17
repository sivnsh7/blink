import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {getCpuMetrics,getMemoryMetrics,getDiskMetrics,getNetworkMetrics,getProcessMetrics,getSystemInfo} from './metrics.js';
const procfsAvailable=existsSync('/proc/stat')&&existsSync('/proc/diskstats');
test('Linux collectors return JSON-safe host metric shapes',{skip:!procfsAvailable},()=>{const s={cpu:getCpuMetrics(),memory:getMemoryMetrics(),disk:getDiskMetrics(),network:getNetworkMetrics(),processes:getProcessMetrics(),system:getSystemInfo()};assert.equal(typeof s.cpu,'object');assert.equal(typeof s.memory,'object');assert.ok(Array.isArray(s.disk));assert.ok(Array.isArray(s.network));assert.ok(Array.isArray(s.processes));assert.equal(typeof s.system,'object');assert.doesNotThrow(()=>JSON.stringify(s));});
