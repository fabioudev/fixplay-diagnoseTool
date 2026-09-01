import { writable } from 'svelte/store';
import type { AppSettings } from '$lib/api/types';

export const appSettings = writable<AppSettings>({
  flashrom_path: null,
  archive_dir: null,
  baud_rate: 115200,
  i2c_baud_rate: 115200,
  auto_reconnect: false,
  tablet_mode: false,
});
