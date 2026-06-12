import { writable } from 'svelte/store';
import type { UartLogEntry, UartPortInfo } from '$lib/api/types';

export const uartConnected = writable<boolean>(false);
export const uartPorts = writable<UartPortInfo[]>([]);
export const uartLog = writable<UartLogEntry[]>([]);
export const autoPollEnabled = writable<boolean>(false);
export const dbCodeCount = writable<number | null>(null);
export const dbLoading = writable<boolean>(false);
export const uartReconnecting = writable<boolean>(false);

let _nextId = 0;
export function nextLogId(): number {
  return _nextId++;
}
