import { describe, it, expect } from 'vitest';
import { formatErrorCodeHex, uartLogMatches } from './uartLog';
import type { UartLogEntry } from '$lib/api/types';

// The UART panel's search box serves two roles: live DB search input and log
// filter. Clicking a search result used to put the *decimal* code string into
// the box, which can never match the hex-formatted log text (verified bug) —
// these tests pin the contract of the fixed filter: results click in as
// canonical `0xXXXXXXXX`, and the filter matches parsed entries by code, description
// and wire hex fields, unparsed entries by raw text.

function entry(overrides: Partial<UartLogEntry>): UartLogEntry {
  return { id: 1, timestamp_ms: 0, raw: '', ...overrides };
}

describe('formatErrorCodeHex', () => {
  it('formats a code as canonical 0x + 8 padded hex digits', () => {
    expect(formatErrorCodeHex(0x00c00401)).toBe('0x00C00401');
    expect(formatErrorCodeHex(0xf)).toBe('0x0000000F');
  });
});

describe('uartLogMatches', () => {
  const parsedEntry = entry({
    raw: 'OK 00C00401,0212BE20:2F1F',
    parsed: {
      entry: {
        error_code: 0x00c00401,
        timestamp: 0x0212be20,
        power_states: 0x00000001,
        up_cause: 0x00000002,
        temp_soc: 55.5,
        raw_fields: ['a', 'b', 'c', 'd'],
      },
      description: 'WLAN defekt',
    },
  });

  it('matches parsed entries by canonical error-code hex, including the 0x prefix', () => {
    expect(uartLogMatches(parsedEntry, '0x00C00401')).toBe(true);
    expect(uartLogMatches(parsedEntry, '0x00c00401')).toBe(true);
    expect(uartLogMatches(parsedEntry, '00c00401')).toBe(true);
  });

  it('matches parsed entries by description text', () => {
    expect(uartLogMatches(parsedEntry, 'wlan')).toBe(true);
    expect(uartLogMatches(parsedEntry, 'defekt')).toBe(true);
  });

  it('matches parsed entries by the padded up_cause / power_state wire hex', () => {
    expect(uartLogMatches(parsedEntry, '00000002')).toBe(true); // up_cause
    expect(uartLogMatches(parsedEntry, '00000001')).toBe(true); // power_states
  });

  it('matches unparsed entries by raw text', () => {
    expect(uartLogMatches(entry({ raw: 'LOOPBACK:PING ✓' }), 'loopback')).toBe(true);
    expect(uartLogMatches(entry({ raw: 'FW: 2.26' }), 'loopback')).toBe(false);
  });

  it('rejects a parsed entry whose code does not contain the query', () => {
    expect(uartLogMatches(parsedEntry, '0xFFFFFFFF')).toBe(false);
  });

  it('is true for empty/whitespace queries (caller handles the empty-branch)', () => {
    expect(uartLogMatches(parsedEntry, '')).toBe(true);
    expect(uartLogMatches(parsedEntry, '   ')).toBe(true);
  });
});
