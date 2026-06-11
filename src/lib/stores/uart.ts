import { writable } from 'svelte/store';
import type { UartLogEntry } from '$lib/api/types';

export const uartConnected = writable<boolean>(false);
export const uartPorts = writable<string[]>([]);
export const uartLog = writable<UartLogEntry[]>([]);
export const autoPollEnabled = writable<boolean>(false);
export const dbCodeCount = writable<number | null>(null);

let _nextId = 0;
export function nextLogId(): number {
  return _nextId++;
}
