import { writable } from 'svelte/store';
import type { I2cPortInfo, I2cErrlogEntry } from '$lib/api/types';

/** Connection + port state (mirrors the UART store pattern). */
export const i2cConnected = writable<boolean>(false);
export const i2cPorts     = writable<I2cPortInfo[]>([]);

/** Xbox error-code DB status. */
export const xboxDbCount  = writable<number | null>(null);
export const xboxDbLoading = writable<boolean>(false);

/** Most recent scan results (7-bit addresses). */
export const i2cScanResults = writable<number[]>([]);

/** Most recent Xbox errlog entries (decoded + described). */
export const i2cErrlogEntries = writable<I2cErrlogEntry[]>([]);

/** Action log lines shown in the panel footer (newest first). */
export interface I2cLogEntry {
  id:           number;
  timestamp_ms: number;
  raw:          string;
  kind?:        'status' | 'error';
}
export const i2cLog = writable<I2cLogEntry[]>([]);

let _nextId = 0;
export function nextI2cLogId(): number {
  return _nextId++;
}