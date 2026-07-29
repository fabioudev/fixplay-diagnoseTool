import { get } from 'svelte/store';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  i2cConnected, i2cPorts, xboxDbCount, xboxDbLoading,
  i2cScanResults, i2cErrlogEntries, i2cLog, nextI2cLogId,
} from './i2c';
import type { I2cLogEntry } from './i2c';
import type { I2cErrlogEntry } from '$lib/api/types';

// i2c stores are thin writables; these tests cover the store-level logic that
// exists: the monotonic id generator, the newest-first log contract + kind
// discriminator, the errlog entry shape, and the nullable xboxDbCount
// semantic (null = "no Xbox DB loaded", a real UI invariant).

describe('nextI2cLogId', () => {
  it('returns strictly increasing, unique ids', () => {
    const ids = Array.from({ length: 50 }, () => nextI2cLogId());
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('i2c log contract', () => {
  beforeEach(() => { i2cLog.set([]); });

  it('prepends new entries newest-first', () => {
    const a: I2cLogEntry = { id: nextI2cLogId(), timestamp_ms: 1, raw: 'first' };
    const b: I2cLogEntry = { id: nextI2cLogId(), timestamp_ms: 2, raw: 'second' };
    i2cLog.update((l) => [a, ...l]);
    i2cLog.update((l) => [b, ...l]);
    expect(get(i2cLog).map((e) => e.raw)).toEqual(['second', 'first']);
  });

  it('distinguishes error entries via the kind discriminator', () => {
    const ok:    I2cLogEntry = { id: 0, timestamp_ms: 0, raw: 'scan ok' };
    const err:   I2cLogEntry = { id: 1, timestamp_ms: 0, raw: 'NACK', kind: 'error' };
    i2cLog.set([ok, err]);
    expect(get(i2cLog).filter((e) => e.kind === 'error')).toHaveLength(1);
    expect(get(i2cLog).filter((e) => e.kind === undefined)).toHaveLength(1);
  });
});

describe('i2c errlog entries', () => {
  beforeEach(() => { i2cErrlogEntries.set([]); });

  it('store Xbox errlog entries verbatim with their string codes', () => {
    const e: I2cErrlogEntry = {
      code: 'E74', timestamp: 123, source: 'SMC', description: 'AV cable / scaler error',
    };
    i2cErrlogEntries.set([e]);
    expect(get(i2cErrlogEntries)[0]).toEqual(e);
    expect(get(i2cErrlogEntries)[0].code).toBe('E74');   // string-keyed, unlike PS5 numeric
  });
});

describe('i2c scan results', () => {
  beforeEach(() => { i2cScanResults.set([]); });

  it('hold the raw 7-bit I2C addresses from a bus scan', () => {
    i2cScanResults.set([0x48, 0x50, 0x68]);
    expect(get(i2cScanResults)).toEqual([0x48, 0x50, 0x68]);
    // All addresses fit in 7 bits — a real contract the scan UI assumes.
    expect(get(i2cScanResults).every((a) => a >= 0 && a < 0x80)).toBe(true);
  });
});

describe('xboxDbCount nullable semantic', () => {
  beforeEach(() => { xboxDbCount.set(null); xboxDbLoading.set(false); });

  it('null means "no Xbox DB loaded"; a count means loaded', () => {
    expect(get(xboxDbCount)).toBeNull();
    xboxDbCount.set(960);
    expect(get(xboxDbCount)).toBe(960);
  });

  it('models the "loading while count unknown" state the UI shows a spinner for', () => {
    xboxDbLoading.set(true);
    // Spinner shows while loading AND no count yet.
    const showSpinner = get(xboxDbLoading) && get(xboxDbCount) === null;
    expect(showSpinner).toBe(true);
    xboxDbCount.set(960);
    xboxDbLoading.set(false);
    expect(get(xboxDbLoading) && get(xboxDbCount) === null).toBe(false);
  });
});