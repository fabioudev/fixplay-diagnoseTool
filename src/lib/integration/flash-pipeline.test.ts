// @vitest-environment jsdom
// Integration test (#73): exercises the mock flash-read pipeline end to end —
// invoke('flash_read') drives the simulated read1/read2/verify progress
// sequence, emits `flash://progress` and `flash://result` events through the
// mock event bus, and returns a FlashReadResult carrying the NVS data + archive
// path configured in mock state. Proves the mock flash orchestration, event
// bus, and result shape all fit together (units are tested in mock/core.test).
import { describe, it, expect, beforeEach } from 'vitest';
import { invoke } from '$lib/mock/core';
import { mockState, resetMockState } from '$lib/mock/state';
import { on } from '$lib/mock/_shared';
import type { FlashReadResult, FlashProgressEvent } from '$lib/api/types';

beforeEach(() => {
  resetMockState();
  // Make the simulated flash sequences instant (no real delays in tests).
  mockState.update((s) => ({
    ...s,
    flash: { ...s.flash, read_step_ms: 0, write_step_ms: 0, verify_step_ms: 0 },
  }));
});

describe('flash-read pipeline (integration, #73)', () => {
  it('emits read1/read2 progress events and a result with the configured NVS', async () => {
    mockState.update((s) => ({
      ...s,
      flash: {
        ...s.flash,
        nvs: { ...s.flash.nvs, serial: 'MOCK12345', mac_address: 'AA:BB:CC:DD:EE:FF' },
        validation: { ...s.flash.validation, size_ok: true, header_ok: true },
      },
    }));

    const progress: FlashProgressEvent[] = [];
    let resultEvent: FlashReadResult | null = null;
    const offProgress = on('flash://progress', (e) => progress.push(e.payload as FlashProgressEvent));
    const offResult = on('flash://result', (e) => (resultEvent = e.payload as FlashReadResult));

    const result = await invoke<FlashReadResult>('flash_read');

    offProgress();
    offResult();

    // Progress: read1 0..100 then read2 0..100 (11 steps each, inclusive).
    const phases = progress.map((p) => p.phase);
    expect(phases.filter((p) => p === 'read1').length).toBe(11);
    expect(phases.filter((p) => p === 'read2').length).toBe(11);
    expect(progress[0].percent).toBe(0);
    expect(progress[progress.length - 1].percent).toBe(100);

    // Result: returned value and the emitted event carry the configured NVS.
    expect(result.nvs).not.toBeNull();
    expect(result.nvs!.serial).toBe('MOCK12345');
    expect(result.nvs!.mac_address).toBe('AA:BB:CC:DD:EE:FF');
    expect(result.validation.size_ok).toBe(true);
    expect(result.validation.header_ok).toBe(true);
    expect(result.archive_path).toContain('MOCK12345');
    expect(resultEvent).not.toBeNull();
    expect(resultEvent!.nvs!.serial).toBe('MOCK12345');
  });

  it('honours an armed error (error-injection interplay with the pipeline)', async () => {
    mockState.update((s) => ({ ...s, errors: { ...s.errors, flash_read: 'Programmer nicht gefunden' } }));
    await expect(invoke('flash_read')).rejects.toThrow('Programmer nicht gefunden');
  });
});