import { writable } from 'svelte/store';
import type { I2cPortInfo, I2cErrlogEntry, I2cLogEntry } from '$lib/api/types';
import { createLogStore } from './log';
import { createConnectionStore } from './connection';

/** Connection + port state (mirrors the UART store pattern). */
const _i2cConnection = createConnectionStore();
export const i2cConnected = _i2cConnection.connected;
/** Unified I2C connection status (coarse lifecycle + booleans). */
export const i2cConnection = _i2cConnection.status;
export const i2cPorts     = writable<I2cPortInfo[]>([]);

/** Xbox error-code DB status. */
export const xboxDbCount  = writable<number | null>(null);
export const xboxDbLoading = writable<boolean>(false);

/** Most recent scan results (7-bit addresses). */
export const i2cScanResults = writable<number[]>([]);

/** Most recent Xbox errlog entries (decoded + described). */
export const i2cErrlogEntries = writable<I2cErrlogEntry[]>([]);

/** Action log lines shown in the panel footer (newest first). */
export type { I2cLogEntry } from '$lib/api/types';
const _i2cLog = createLogStore<I2cLogEntry>();
export const i2cLog = _i2cLog.entries;
export const nextI2cLogId = _i2cLog.nextId;
/** Prepend an I2C log entry (newest-first), capped at 200. */
export const pushI2cLog: (entry: I2cLogEntry) => void = _i2cLog.push;