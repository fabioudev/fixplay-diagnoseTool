import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  flashBusy, flashProgress, flashResult, flashLog, flashWritePreview, nextFlashLogId,
  isValidationOk, failedValidationKeys, formatFlashDuration, computeEta,
} from './flash';
import type { FlashLogEntry, FlashReadResult, NorValidation } from '$lib/api/types';

// The flash stores are intentionally thin writable wrappers — the real state
// machine lives in the Rust backend and the component event handlers. These
// tests cover the store-level logic that actually exists here: the monotonic
// id generator and the prepend-and-cap log contract that every component
// relies on when appending flashrom output.

describe('nextFlashLogId', () => {
  it('returns strictly increasing, unique ids', () => {
    const ids = Array.from({ length: 50 }, () => nextFlashLogId());
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('flash log append contract', () => {
  beforeEach(() => { flashLog.set([]); });

  it('prepends new entries (newest-first) using the id helper, matching the component pattern', () => {
    const a: FlashLogEntry = { id: nextFlashLogId(), timestamp_ms: 1, message: 'first',  level: 'info' };
    flashLog.update((l) => [a, ...l]);
    const b: FlashLogEntry = { id: nextFlashLogId(), timestamp_ms: 2, message: 'second', level: 'info' };
    flashLog.update((l) => [b, ...l]);
    expect(get(flashLog).map((e) => e.message)).toEqual(['second', 'first']);
  });

  it('caps the log at 200 entries via the slice(0,199) pattern components use', () => {
    const big = Array.from({ length: 250 }, (_, i) => ({ id: nextFlashLogId(), timestamp_ms: i, message: `m${i}`, level: 'info' as const }));
    flashLog.update(() => big);
    flashLog.update((l) => [{ id: nextFlashLogId(), timestamp_ms: 999, message: 'new', level: 'info' }, ...l.slice(0, 199)]);
    expect(get(flashLog)).toHaveLength(200);
    expect(get(flashLog)[0].message).toBe('new');
  });
});

// A fully valid NorValidation — every check the PS5 dump validator performs.
const VALID_VALIDATION = {
  size_ok: true, header_ok: true, mbr1_ok: true, mbr2_ok: true,
  emc_ipl_a_ok: true, emc_ipl_b_ok: true, usb_pdc_a_ok: true, usb_pdc_b_ok: true,
};

describe('isValidationOk', () => {
  it('returns true only when every check passes', () => {
    expect(isValidationOk(VALID_VALIDATION as NorValidation)).toBe(true);
  });

  it('returns false when a single check fails or a key is missing', () => {
    expect(isValidationOk({ ...VALID_VALIDATION, mbr2_ok: false } as NorValidation)).toBe(false);
    expect(isValidationOk({ ...VALID_VALIDATION, usb_pdc_a_ok: false } as NorValidation)).toBe(false);
    // A missing key is not a pass — the write gate must fail closed.
    const partial = { ...VALID_VALIDATION };
    delete (partial as Partial<NorValidation>).emc_ipl_b_ok;
    expect(isValidationOk(partial as NorValidation)).toBe(false);
  });
});

describe('failedValidationKeys', () => {
  it('lists only failing keys, in stable checklist order', () => {
    expect(
      failedValidationKeys({ ...VALID_VALIDATION, mbr2_ok: false, usb_pdc_b_ok: false } as NorValidation),
    ).toEqual(['mbr2_ok', 'usb_pdc_b_ok']);
  });

  it('treats a missing key as failing (partial validation data must not arm a write)', () => {
    const partial = { ...VALID_VALIDATION };
    delete (partial as Partial<NorValidation>).header_ok;
    expect(failedValidationKeys(partial as NorValidation)).toEqual(['header_ok']);
  });

  it('returns an empty list for a fully valid dump', () => {
    expect(failedValidationKeys(VALID_VALIDATION as NorValidation)).toEqual([]);
  });

  it('fails closed on unrecognized check keys (a future backend check must not pass silently)', () => {
    const withNewCheck = { ...VALID_VALIDATION, cid_ok: false } as unknown as NorValidation;
    expect(isValidationOk(withNewCheck)).toBe(false);
    expect(failedValidationKeys(withNewCheck)).toContain('cid_ok');
  });

  it('even an unknown key claiming to pass blocks the write gate (unknown ≠ verified)', () => {
    const withUnknownPass = { ...VALID_VALIDATION, ecc_ok: true } as unknown as NorValidation;
    expect(isValidationOk(withUnknownPass)).toBe(false);
  });
});

describe('formatFlashDuration', () => {
  it('formats short durations as seconds and longer ones as minutes + seconds', () => {
    expect(formatFlashDuration(4_500)).toBe('~5s');
    expect(formatFlashDuration(42_000)).toBe('~42s');
    expect(formatFlashDuration(125_000)).toBe('~2m 5s');
  });

  it('yields an empty string for non-finite or negative input', () => {
    expect(formatFlashDuration(NaN)).toBe('');
    expect(formatFlashDuration(-1)).toBe('');
  });
});

describe('computeEta (pure phase-anchored ETA tracking)', () => {
  it('re-anchors when the phase changes and yields no estimate yet', () => {
    const first = computeEta({ phase: 'read1', start: 1_000 }, 'read2', 50, 5_000);
    expect(first.state).toEqual({ phase: 'read2', start: 5_000 });
    expect(first.remainingMs).toBeNull();
  });

  it('extrapolates remaining time from the observed rate once ≥20 % is done', () => {
    // 50 % took 10 s → 10 s remaining.
    const r = computeEta({ phase: 'write', start: 0 }, 'write', 50, 10_000);
    expect(r.remainingMs).toBe(10_000);
  });

  it('stays silent below 20 % progress (rate too noisy)', () => {
    expect(computeEta({ phase: 'write', start: 0 }, 'write', 10, 10_000).remainingMs).toBeNull();
    expect(computeEta({ phase: 'write', start: 0 }, 'write', 75, 10_000).remainingMs).toBe(3_333);
  });

  it('clears the estimate once the phase completes', () => {
    expect(computeEta({ phase: 'verify', start: 0 }, 'verify', 100, 10_000).remainingMs).toBeNull();
    expect(computeEta({ phase: 'verify', start: 0 }, 'verify', 0, 10_000).remainingMs).toBeNull();
  });
});

describe('flashBusy / flashProgress / flashResult / flashWritePreview', () => {
  beforeEach(() => {
    flashBusy.set(false);
    flashProgress.set(null);
    flashResult.set(null);
    flashWritePreview.set(null);
  });

  it('reflects an active operation once busy + progress are set together (the real invariant)', () => {
    flashBusy.set(true);
    flashProgress.set({ phase: 'write', percent: 50 });
    // An operation is "in progress" iff busy AND a progress payload exists.
    const inProgress = get(flashBusy) && get(flashProgress) !== null;
    expect(inProgress).toBe(true);
  });

  it('is idle again after result clears progress and busy (the completion transition)', () => {
    flashBusy.set(true);
    flashProgress.set({ phase: 'verify', percent: 100 });
    flashResult.set({ dumps_match: true, validation: {} as FlashReadResult['validation'], nvs: null, archive_path: '/x' } as FlashReadResult);
    flashBusy.set(false);
    flashProgress.set(null);
    expect(get(flashBusy)).toBe(false);
    expect(get(flashProgress)).toBeNull();
    expect(get(flashResult)).not.toBeNull();
  });
});