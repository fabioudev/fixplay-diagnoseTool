import { get } from 'svelte/store';
import { describe, it, expect, beforeEach } from 'vitest';
import { flashDevices, flashBusy, flashProgress } from './flash';

describe('flash store', () => {
  beforeEach(() => {
    flashDevices.set([]);
    flashBusy.set(false);
    flashProgress.set(null);
  });

  it('starts with empty device list', () => {
    expect(get(flashDevices)).toEqual([]);
  });

  it('starts with busy=false', () => {
    expect(get(flashBusy)).toBe(false);
  });

  it('starts with no progress', () => {
    expect(get(flashProgress)).toBeNull();
  });

  it('can update devices', () => {
    flashDevices.set([{ id: '1', name: 'CH341B', device_type: 'Ch341' }]);
    expect(get(flashDevices)).toHaveLength(1);
    expect(get(flashDevices)[0].name).toBe('CH341B');
  });

  it('can set progress', () => {
    flashProgress.set({ bytes_done: 256, bytes_total: 1024 });
    expect(get(flashProgress)?.bytes_done).toBe(256);
  });
});
