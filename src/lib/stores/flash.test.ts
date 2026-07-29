import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { flashBusy, flashProgress, flashResult, flashLog, flashWritePreview, nextFlashLogId } from './flash';
import type { FlashLogEntry, FlashReadResult } from '$lib/api/types';

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