import { get } from 'svelte/store';
import { describe, it, expect, beforeEach } from 'vitest';
import { appSettings } from './settings';
import type { AppSettings } from '$lib/api/types';

// appSettings is the single source of truth for the persisted config. The
// meaningful invariant is that a partial update (the pattern every component
// uses via `update(s => ({ ...s, field: val }))`) preserves every other field
// — a regression here would silently wipe the user's config on a single edit.

const FULL: AppSettings = {
  flashrom_path: '/usr/bin/flashrom',
  archive_dir: '/var/lib/fixplay/archive',
  baud_rate: 9600,
  i2c_baud_rate: 400000,
  auto_reconnect: true,
  tablet_mode: false,
};

describe('appSettings partial-update contract', () => {
  beforeEach(() => { appSettings.set({ ...FULL }); });

  it('updating one field preserves all the others', () => {
    appSettings.update((s) => ({ ...s, baud_rate: 115200 }));
    const s = get(appSettings);
    expect(s.baud_rate).toBe(115200);          // changed
    expect(s.flashrom_path).toBe(FULL.flashrom_path);
    expect(s.archive_dir).toBe(FULL.archive_dir);
    expect(s.i2c_baud_rate).toBe(FULL.i2c_baud_rate);
    expect(s.auto_reconnect).toBe(FULL.auto_reconnect);
    expect(s.tablet_mode).toBe(FULL.tablet_mode);
  });

  it('toggling tablet_mode does not touch baud or paths', () => {
    appSettings.update((s) => ({ ...s, tablet_mode: !s.tablet_mode }));
    const s = get(appSettings);
    expect(s.tablet_mode).toBe(true);
    expect(s.baud_rate).toBe(FULL.baud_rate);
    expect(s.i2c_baud_rate).toBe(FULL.i2c_baud_rate);
    expect(s.flashrom_path).toBe(FULL.flashrom_path);
  });

  it('clearing a path via null keeps the rest intact', () => {
    appSettings.update((s) => ({ ...s, flashrom_path: null }));
    const s = get(appSettings);
    expect(s.flashrom_path).toBeNull();
    expect(s.archive_dir).toBe(FULL.archive_dir);
    expect(s.baud_rate).toBe(FULL.baud_rate);
  });

  it('always exposes the full AppSettings shape after any edit', () => {
    appSettings.update((s) => ({ ...s, auto_reconnect: false }));
    const s = get(appSettings);
    const keys: (keyof AppSettings)[] = ['flashrom_path', 'archive_dir', 'baud_rate', 'i2c_baud_rate', 'auto_reconnect', 'tablet_mode'];
    for (const k of keys) expect(s).toHaveProperty(k);
  });
});