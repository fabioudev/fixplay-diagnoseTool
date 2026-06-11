import { get } from 'svelte/store';
import { describe, it, expect, beforeEach } from 'vitest';
import { uartLog, uartConnected } from './uart';

describe('uart store', () => {
  beforeEach(() => {
    uartLog.set([]);
    uartConnected.set(false);
  });

  it('starts disconnected', () => {
    expect(get(uartConnected)).toBe(false);
  });

  it('starts with empty log', () => {
    expect(get(uartLog)).toEqual([]);
  });

  it('can append log lines', () => {
    uartLog.update((lines) => [...lines, '[0x01] error code']);
    expect(get(uartLog)).toContain('[0x01] error code');
  });

  it('can clear log', () => {
    uartLog.set(['line1', 'line2']);
    uartLog.set([]);
    expect(get(uartLog)).toHaveLength(0);
  });
});
