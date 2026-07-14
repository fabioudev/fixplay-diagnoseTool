import { get } from 'svelte/store';
import { describe, it, expect, beforeEach } from 'vitest';
import { appSettings } from './settings';

describe('appSettings store', () => {
  beforeEach(() => {
    appSettings.set({ flashrom_path: null, archive_dir: null, baud_rate: 115200, i2c_baud_rate: 115200, auto_reconnect: false, tablet_mode: false });
  });

  it('starts with null paths and 115200 baud', () => {
    const s = get(appSettings);
    expect(s.flashrom_path).toBeNull();
    expect(s.archive_dir).toBeNull();
    expect(s.baud_rate).toBe(115200);
    expect(s.i2c_baud_rate).toBe(115200);
  });

  it('can update baud_rate', () => {
    appSettings.update(s => ({ ...s, baud_rate: 9600 }));
    expect(get(appSettings).baud_rate).toBe(9600);
  });

  it('can update flashrom_path', () => {
    appSettings.update(s => ({ ...s, flashrom_path: '/usr/bin/flashrom' }));
    expect(get(appSettings).flashrom_path).toBe('/usr/bin/flashrom');
  });
});
