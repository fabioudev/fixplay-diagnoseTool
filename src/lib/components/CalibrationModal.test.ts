// @vitest-environment jsdom
import { render, screen } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CalibrationModal from './CalibrationModal.svelte';
import { initI18n } from '$lib/i18n/init';

/**
 * Tests for the before/after finetune comparison (#48). The modal auto-starts
 * center calibration on open via a `$effect`; a fake manager resolves every
 * calibration call and serves canned finetune data (a "before" snapshot then a
 * changed "after" snapshot) so the diff table renders without real hardware.
 */
beforeEach(() => {
  document.body.innerHTML = '';
  // CalibrationModal renders all labels via the reactive i18n store (`$LL`),
  // so the locales must be loaded before render. Idempotent.
  initI18n();
  // StickVisualizer renders to a <canvas>; jsdom has no 2D context, so its
  // $effect logs a harmless "Not implemented: getContext" warning. Stub a
  // minimal 2D context (with the methods StickVisualizer actually calls) so
  // the test output stays clean.
  const stubCtx = {
    setTransform() {}, clearRect() {}, save() {}, restore() {},
    translate() {}, scale() {}, rotate() {},
    beginPath() {}, arc() {}, ellipse() {}, moveTo() {}, lineTo() {},
    closePath() {}, stroke() {}, fill() {}, fillRect() {}, strokeRect() {},
    fillText() {}, strokeText() {}, measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '',
  } as unknown as CanvasRenderingContext2D;
  HTMLCanvasElement.prototype.getContext = (() => stubCtx) as unknown as
    typeof HTMLCanvasElement.prototype.getContext;
});

function makeManager(before: number[], after: number[]) {
  let calls = 0;
  return {
    calibrateSticksBegin:  vi.fn(async () => {}),
    calibrateSticksSample: vi.fn(async () => {}),
    calibrateSticksEnd:    vi.fn(async () => {}),
    calibrateRangeBegin:   vi.fn(async () => {}),
    calibrateRangeEnd:     vi.fn(async () => {}),
    getInMemoryModuleData: vi.fn(async () => {
      calls += 1;
      return calls === 1 ? before : after;
    }),
  };
}

describe('CalibrationModal before/after comparison (#48)', () => {
  it('shows the diff table with the per-value delta after a successful calibration', async () => {
    vi.useFakeTimers();
    try {
      // 12 u16 finetune values; index 1 changes 200 → 210 (+10), rest unchanged.
      const before = [100, 200, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const after  = [100, 210, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
      const manager = makeManager(before, after);
      render(CalibrationModal, { props: { open: true, manager } });

      // Drive the modal through its sleeps + async calibration calls.
      await vi.advanceTimersByTimeAsync(2000);

      expect(screen.getByText('Vorher → Nachher')).toBeInTheDocument();
      expect(screen.getByText(/1 von 12 Werten geändert/)).toBeInTheDocument();
      // The changed value's delta (+10) is rendered.
      expect(screen.getByText('+10')).toBeInTheDocument();
      // The after value 210 is shown in the changed cell.
      expect(screen.getByText('210')).toBeInTheDocument();
      // Before + after snapshots were both read.
      expect(manager.getInMemoryModuleData).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not render the diff table when the finetune read fails', async () => {
    vi.useFakeTimers();
    try {
      const manager = {
        calibrateSticksBegin:  async () => {},
        calibrateSticksSample: async () => {},
        calibrateSticksEnd:    async () => {},
        calibrateRangeBegin:   async () => {},
        calibrateRangeEnd:     async () => {},
        getInMemoryModuleData: async () => null,
      };
      render(CalibrationModal, { props: { open: true, manager } });
      await vi.advanceTimersByTimeAsync(2000);
      expect(screen.queryByText('Vorher → Nachher')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

afterEach(() => { vi.useRealTimers(); });