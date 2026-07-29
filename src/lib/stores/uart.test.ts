import { get } from 'svelte/store';
import { describe, it, expect, beforeEach } from 'vitest';
import { uartLog, uartConnected, uartPorts, autoPollEnabled, nextLogId, dbCodeCount, dbLoading, uartReconnecting } from './uart';
import type { UartLogEntry } from '$lib/api/types';

// The uart stores are thin writables; the interesting store-level behaviour
// is the monotonic id generator, the newest-first log contract, the parsed
// errlog entry shape, and the nullable dbCodeCount semantic (null = "no DB
// loaded", a real invariant the UI branches on).

describe('nextLogId', () => {
  it('returns strictly increasing, unique ids', () => {
    const ids = Array.from({ length: 50 }, () => nextLogId());
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('uart log contract', () => {
  beforeEach(() => { uartLog.set([]); });

  it('prepends new entries newest-first', () => {
    const a: UartLogEntry = { id: nextLogId(), timestamp_ms: 1, raw: 'first' };
    const b: UartLogEntry = { id: nextLogId(), timestamp_ms: 2, raw: 'second' };
    uartLog.update((l) => [a, ...l]);
    uartLog.update((l) => [b, ...l]);
    expect(get(uartLog).map((e) => e.raw)).toEqual(['second', 'first']);
  });

  it('preserves the parsed errlog sub-structure through an append', () => {
    const entry: UartLogEntry = {
      id: nextLogId(),
      timestamp_ms: Date.now(),
      raw: '80000001,00001234,00000003,00000001,3480,0,0,0,0',
      parsed: {
        entry: {
          error_code: 0x80000001,
          timestamp: 0x1234,
          power_states: 3,
          up_cause: 1,
          temp_soc: 52.5,
          raw_fields: ['0', '0', '0', '0'],
        },
        description: 'Some error description',
      },
    };
    uartLog.update((log) => [entry, ...log]);
    const got = get(uartLog)[0];
    expect(got.parsed?.entry.temp_soc).toBe(52.5);
    expect(got.parsed?.description).toBe('Some error description');
  });

  it('distinguishes status vs error entries via the kind discriminator', () => {
    const status: UartLogEntry = { id: 0, timestamp_ms: 0, raw: '[Verbunden]', kind: 'status' };
    const error:  UartLogEntry = { id: 1, timestamp_ms: 0, raw: 'Verbindungsfehler', kind: 'error' };
    uartLog.set([status, error]);
    expect(get(uartLog).filter((e) => e.kind === 'error')).toHaveLength(1);
    expect(get(uartLog).filter((e) => e.kind === 'status')).toHaveLength(1);
  });
});

describe('dbCodeCount nullable semantic', () => {
  beforeEach(() => { dbCodeCount.set(null); });

  it('null means "no DB loaded" and a number means "DB loaded"', () => {
    expect(get(dbCodeCount) === null).toBe(true);            // no DB
    dbCodeCount.set(1280);
    expect(get(dbCodeCount) === null).toBe(false);            // DB loaded
    expect(get(dbCodeCount)).toBe(1280);
  });

  it('transitions back to null when the DB is cleared (re-fetch failure path)', () => {
    dbCodeCount.set(1280);
    dbCodeCount.set(null);
    expect(get(dbCodeCount)).toBeNull();
  });
});

describe('connection / poll / loading flags together', () => {
  beforeEach(() => {
    uartConnected.set(false);
    autoPollEnabled.set(false);
    dbLoading.set(false);
    uartReconnecting.set(false);
    uartPorts.set([]);
  });

  it('models the "reconnecting while loading" composite state the UI shows', () => {
    uartReconnecting.set(true);
    dbLoading.set(true);
    // The UI treats (reconnecting || loading) as a single "transient" badge.
    const transient = get(uartReconnecting) || get(dbLoading);
    expect(transient).toBe(true);
  });

  it('does not report transient once both flags clear', () => {
    uartReconnecting.set(true);
    dbLoading.set(true);
    uartReconnecting.set(false);
    dbLoading.set(false);
    expect(get(uartReconnecting) || get(dbLoading)).toBe(false);
  });
});