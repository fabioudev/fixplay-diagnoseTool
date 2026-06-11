import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { flashBusy, flashProgress, flashResult, flashLog } from './flash';

describe('flash stores', () => {
  beforeEach(() => {
    flashBusy.set(false);
    flashProgress.set(null);
    flashResult.set(null);
    flashLog.set([]);
  });

  it('flashBusy starts as false', () => {
    expect(get(flashBusy)).toBe(false);
  });

  it('flashProgress starts as null', () => {
    expect(get(flashProgress)).toBeNull();
  });

  it('flashResult starts as null', () => {
    expect(get(flashResult)).toBeNull();
  });

  it('flashLog starts empty', () => {
    expect(get(flashLog)).toHaveLength(0);
  });

  it('flashBusy can be set', () => {
    flashBusy.set(true);
    expect(get(flashBusy)).toBe(true);
  });

  it('flashProgress can be updated', () => {
    flashProgress.set({ phase: 'read1', percent: 42 });
    expect(get(flashProgress)).toEqual({ phase: 'read1', percent: 42 });
  });
});
