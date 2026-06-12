import { get } from 'svelte/store';
import { describe, it, expect, beforeEach } from 'vitest';
import { uartLog, uartConnected, uartPorts, autoPollEnabled, nextLogId, dbCodeCount, dbLoading, uartReconnecting } from './uart';
import type { UartLogEntry } from '$lib/api/types';

describe('uart store', () => {
  beforeEach(() => {
    uartLog.set([]);
    uartConnected.set(false);
    uartPorts.set([]);
    autoPollEnabled.set(false);
    dbCodeCount.set(null);
    dbLoading.set(false);
    uartReconnecting.set(false);
  });

  it('starts disconnected', () => {
    expect(get(uartConnected)).toBe(false);
  });

  it('starts with empty log', () => {
    expect(get(uartLog)).toEqual([]);
  });

  it('starts with empty ports list', () => {
    expect(get(uartPorts)).toEqual([]);
  });

  it('can set connected state', () => {
    uartConnected.set(true);
    expect(get(uartConnected)).toBe(true);
  });

  it('can append a raw log entry', () => {
    const entry: UartLogEntry = { id: nextLogId(), timestamp_ms: Date.now(), raw: 'test line' };
    uartLog.update((log) => [entry, ...log]);
    expect(get(uartLog)[0].raw).toBe('test line');
  });

  it('can clear log', () => {
    const entry: UartLogEntry = { id: nextLogId(), timestamp_ms: Date.now(), raw: 'line' };
    uartLog.set([entry]);
    uartLog.set([]);
    expect(get(uartLog)).toHaveLength(0);
  });

  it('can append a parsed errlog entry', () => {
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
    expect(get(uartLog)[0].parsed?.entry.temp_soc).toBe(52.5);
    expect(get(uartLog)[0].parsed?.description).toBe('Some error description');
  });

  it('nextLogId increments', () => {
    const a = nextLogId();
    const b = nextLogId();
    expect(b).toBeGreaterThan(a);
  });

  it('dbCodeCount starts as null', () => {
    expect(get(dbCodeCount)).toBeNull();
  });

  it('dbLoading starts as false', () => {
    expect(get(dbLoading)).toBe(false);
  });

  it('dbLoading can be set to true', () => {
    dbLoading.set(true);
    expect(get(dbLoading)).toBe(true);
  });

  it('uartReconnecting starts as false', () => {
    expect(get(uartReconnecting)).toBe(false);
  });

  it('uartReconnecting can be set to true', () => {
    uartReconnecting.set(true);
    expect(get(uartReconnecting)).toBe(true);
  });

  it('UartLogEntry accepts kind status', () => {
    const entry: UartLogEntry = {
      id:           0,
      timestamp_ms: Date.now(),
      raw:          '[Verbunden — /dev/ttyUSB0]',
      kind:         'status',
    };
    expect(entry.kind).toBe('status');
  });

  it('UartLogEntry accepts kind error', () => {
    const entry: UartLogEntry = {
      id:           1,
      timestamp_ms: Date.now(),
      raw:          'Verbindungsfehler: port not found',
      kind:         'error',
    };
    expect(entry.kind).toBe('error');
  });
});
