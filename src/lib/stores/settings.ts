import { writable } from 'svelte/store';
import type { AppSettings } from '$lib/api/types';

export const appSettings = writable<AppSettings>({
  flashrom_path: null,
  archive_dir:   null,
  baud_rate:     115200,
});
