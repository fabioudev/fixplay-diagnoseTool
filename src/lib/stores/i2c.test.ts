import { get } from 'svelte/store';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  i2cConnected, i2cPorts, xboxDbCount, xboxDbLoading,
  i2cScanResults, i2cErrlogEntries, i2cLog, nextI2cLogId,
} from './i2c';
import type { I2cLogEntry } from './i2c';
import type { I2cErrlogEntry } from '$lib/api/types';

describe('i2c store', () => {
  beforeEach(() => {
    i2cConnected.set(false);
    i2cPorts.set([]);
    xboxDbCount.set(null);
    xboxDbLoading.set(false);
    i2cScanResults.set([]);
    i2cErrlogEntries.set([]);
    i2cLog.set([]);
  });

  it('starts disconnected', () => {
    expect(get(i2cConnected)).toBe(false);
  });

  it('starts with empty ports', () => {
    expect(get(i2cPorts)).toEqual([]);
  });

  it('starts with null xbox db count', () => {
    expect(get(xboxDbCount)).toBeNull();
  });

  it('can set connected', () => {
    i2cConnected.set(true);
    expect(get(i2cConnected)).toBe(true);
  });

  it('can store scan results', () => {
    i2cScanResults.set([0x48, 0x50]);
    expect(get(i2cScanResults)).toEqual([0x48, 0x50]);
  });

  it('can store errlog entries', () => {
    const e: I2cErrlogEntry = {
      code: 'E74', timestamp: 123, source: 'SMC', description: 'AV cable / scaler error',
    };
    i2cErrlogEntries.set([e]);
    expect(get(i2cErrlogEntries)[0].code).toBe('E74');
  });

  it('can append a log entry', () => {
    const entry: I2cLogEntry = { id: nextI2cLogId(), timestamp_ms: Date.now(), raw: 'scan ok' };
    i2cLog.update((log) => [entry, ...log]);
    expect(get(i2cLog)[0].raw).toBe('scan ok');
  });

  it('log entry accepts kind error', () => {
    const entry: I2cLogEntry = { id: 0, timestamp_ms: 0, raw: 'NACK', kind: 'error' };
    expect(entry.kind).toBe('error');
  });

  it('nextI2cLogId increments', () => {
    const a = nextI2cLogId();
    const b = nextI2cLogId();
    expect(b).toBeGreaterThan(a);
  });
});