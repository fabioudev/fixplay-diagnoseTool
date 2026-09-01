import { describe, it, expect, beforeEach } from 'vitest';
import { invoke } from './core';
import { mockState, resetMockState, getMockState } from './state';
import { on } from './_shared';

// The mock layer is ~700 lines of infrastructure that previously had zero
// tests. These exercise the invoke() routing, state-backed handlers, and the
// DualSense report builder — all without the Tauri backend.

beforeEach(() => {
  resetMockState();
  // Make the simulated flash sequences instant (no real delays in tests).
  mockState.update((s) => ({
    ...s,
    flash: { ...s.flash, read_step_ms: 0, write_step_ms: 0, verify_step_ms: 0 },
  }));
});

describe('mock invoke() routing', () => {
  it('returns undefined and warns for an unknown command', async () => {
    const r = await invoke('does_not_exist');
    expect(r).toBeUndefined();
  });

  it('returns the programmer list from state', async () => {
    mockState.update((s) => ({ ...s, flash: { ...s.flash, programmers: ['ch341a', 'rt809h'] } }));
    const r = await invoke<string[]>('flash_list_programmers');
    expect(r).toEqual(['ch341a', 'rt809h']);
  });

  it('returns the archive list from state', async () => {
    const r = await invoke<unknown[]>('archive_list_dumps');
    expect(Array.isArray(r)).toBe(true);
  });
});

describe('mock settings round-trip', () => {
  it('settings_save is reflected by a subsequent settings_get', async () => {
    await invoke('settings_save', { settings: { baud_rate: 9600, tablet_mode: true } });
    const got = await invoke<{ baud_rate: number; tablet_mode: boolean }>('settings_get');
    expect(got.baud_rate).toBe(9600);
    expect(got.tablet_mode).toBe(true);
  });
});

describe('mock search handlers substitute {query}', () => {
  it('uart_search_error_db interpolates the query into descriptions', async () => {
    const r = await invoke<{ description: string }[]>('uart_search_error_db', { query: 'thermal' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => !x.description.includes('{query}'))).toBe(true);
    expect(r.some((x) => x.description.includes('thermal'))).toBe(true);
  });

  it('i2c_search_xbox_db interpolates the query into descriptions', async () => {
    const r = await invoke<{ description: string }[]>('i2c_search_xbox_db', { query: 'overheat' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => !x.description.includes('{query}'))).toBe(true);
  });
});

describe('mock hid_poll builds a DS5 report from input state', () => {
  it('emits one report when connected, none when disconnected', async () => {
    mockState.update((s) => ({ ...s, hid: { ...s.hid, connected: true } }));
    const connected = await invoke<{
      connected: boolean;
      reports: { report_id: number; data: number[] }[];
    }>('hid_poll');
    expect(connected.connected).toBe(true);
    expect(connected.reports).toHaveLength(1);
    expect(connected.reports[0].data).toHaveLength(64);

    mockState.update((s) => ({ ...s, hid: { ...s.hid, connected: false } }));
    const off = await invoke<{ connected: boolean; reports: unknown[] }>('hid_poll');
    expect(off.connected).toBe(false);
    expect(off.reports).toHaveLength(0);
  });

  it('encodes a full-throw left stick and cross button into the report bytes', async () => {
    mockState.update((s) => ({
      ...s,
      hid: {
        ...s.hid,
        connected: true,
        input: {
          ...s.hid.input,
          lx: 1,
          ly: 1, // full up-right → axis saturates to 255
          buttons: { ...s.hid.input.buttons, cross: true },
        },
      },
    }));
    const r = await invoke<{ reports: { data: number[] }[] }>('hid_poll');
    const data = r.reports[0].data;
    expect(data[0]).toBe(255); // lx saturated
    expect(data[1]).toBe(255); // ly saturated
    // cross is bit 0x20 of byte 7 (face-button nibble)
    expect(data[7] & 0x20).toBe(0x20);
  });

  it('encodes battery 100% as "complete" status (high nibble = 2)', async () => {
    mockState.update((s) => ({
      ...s,
      hid: { ...s.hid, connected: true, input: { ...s.hid.input, battery: 100, charging: false } },
    }));
    const r = await invoke<{ reports: { data: number[] }[] }>('hid_poll');
    const b = r.reports[0].data[52];
    expect((b >> 4) & 0x0f).toBe(2); // status = complete
    expect(b & 0x0f).toBe(10); // charge = 10 (100/10)
  });
});

describe('mock flash_read emits progress events', () => {
  it('fires read1 then read2 progress events through the event bus', async () => {
    const phases: string[] = [];
    const unlisten = on('flash://progress', (e) => {
      phases.push((e.payload as { phase: string }).phase);
    });
    await invoke('flash_read');
    unlisten();
    expect(phases[0]).toBe('read1');
    expect(phases.filter((p) => p === 'read2').length).toBeGreaterThan(0);
    expect(phases.filter((p) => p === 'read1').length).toBeGreaterThan(0);
  });

  it('returns a FlashReadResult with the serial from state', async () => {
    mockState.update((s) => ({
      ...s,
      flash: { ...s.flash, nvs: { ...s.flash.nvs, serial: 'MOCK12345' } },
    }));
    const r = await invoke<{ archive_path: string; nvs: { serial: string } }>('flash_read');
    expect(r.nvs.serial).toBe('MOCK12345');
    expect(r.archive_path).toContain('MOCK12345');
  });
});

describe('mock no-op commands', () => {
  it('open_path, save_text_file, archive_delete_dump resolve without throwing', async () => {
    await expect(invoke('open_path', { path: '/x' })).resolves.toBeUndefined();
    await expect(invoke('save_text_file', { path: '/x', content: 'hi' })).resolves.toBeUndefined();
    await expect(invoke('archive_delete_dump', { binPath: '/x' })).resolves.toBeUndefined();
  });
});

describe('getMockState', () => {
  it('reflects live edits to the mockState store', () => {
    mockState.update((s) => ({ ...s, uart: { ...s.uart, db_count: 42 } }));
    expect(getMockState().uart.db_count).toBe(42);
  });
});

describe('mock error injection (#72)', () => {
  it('rejects with the armed message instead of running the handler', async () => {
    mockState.update((s) => ({ ...s, errors: { flash_read: 'Programmer nicht gefunden' } }));
    await expect(invoke('flash_read')).rejects.toThrow('Programmer nicht gefunden');
  });

  it('clears the armed error when the message is removed', async () => {
    mockState.update((s) => ({ ...s, errors: { uart_connect: 'port busy' } }));
    await expect(invoke('uart_connect')).rejects.toThrow('port busy');
    mockState.update((s) => {
      const e = { ...s.errors };
      delete e.uart_connect;
      return { ...s, errors: e };
    });
    await expect(invoke('uart_connect')).resolves.toBeUndefined();
  });

  it('leaves commands without an armed error unaffected', async () => {
    mockState.update((s) => ({ ...s, errors: { flash_read: 'boom' } }));
    const r = await invoke<string[]>('flash_list_programmers');
    expect(Array.isArray(r)).toBe(true);
  });
});
