import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// User-selectable timestamp format for the various log views (controller,
// UART, I2C, flash). Kept as a small frontend-only persisted store rather than
// a full AppSettings field so it doesn't round-trip through the Rust backend.

export type LogTimestampFormat = 'local' | 'iso' | 'seconds';

const STORAGE_KEY = 'fixplay-log-ts-format';

const ALLOWED: LogTimestampFormat[] = ['local', 'iso', 'seconds'];

function read(): LogTimestampFormat {
  if (!browser) return 'local';
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && ALLOWED.includes(v as LogTimestampFormat)) return v as LogTimestampFormat;
  } catch {
    /* ignored */
  }
  return 'local';
}

export const logTimestampFormat = writable<LogTimestampFormat>(read());

export function setLogTimestampFormat(f: LogTimestampFormat) {
  logTimestampFormat.set(f);
  if (browser) {
    try {
      localStorage.setItem(STORAGE_KEY, f);
    } catch {
      /* ignored */
    }
  }
}

/**
 * Format a epoch-millis timestamp according to the active log format.
 * - `local`:   HH:MM:SS in the user's locale  (default, compact)
 * - `iso`:     full ISO-8601 with milliseconds (sortable, unambiguous)
 * - `seconds`: seconds.millis since epoch      (cheap, monotonic feel)
 */
export function formatLogTimestamp(tsMs: number, fmt: LogTimestampFormat = 'local'): string {
  switch (fmt) {
    case 'iso':
      return new Date(tsMs).toISOString();
    case 'seconds':
      return (tsMs / 1000).toFixed(3);
    case 'local':
    default:
      return new Date(tsMs).toLocaleTimeString();
  }
}
