import { writable } from 'svelte/store';
import type { UartLogEntry, UartPortInfo } from '$lib/api/types';
import { createLogStore } from './log';
import { createConnectionStore } from './connection';

// UART connection state is backed by the shared createConnectionStore — one
// source of truth for `connected` + `reconnecting` — while still exposing the
// boolean Writable API the panel already uses (`uartConnected.set(true)`, …).
const _uartConnection = createConnectionStore();
export const uartConnected = _uartConnection.connected;
export const uartReconnecting = _uartConnection.reconnecting;
/** Unified UART connection status (coarse lifecycle + booleans). */
export const uartConnection = _uartConnection.status;

export const uartPorts = writable<UartPortInfo[]>([]);
const _uartLog = createLogStore<UartLogEntry>();
export const uartLog = _uartLog.entries;
export const nextLogId = _uartLog.nextId;
/** Prepend a UART log entry (newest-first), capped at 200. */
export const pushUartLog: (entry: UartLogEntry) => void = _uartLog.push;
export const autoPollEnabled = writable<boolean>(false);
export const dbCodeCount = writable<number | null>(null);
export const dbLoading = writable<boolean>(false);
