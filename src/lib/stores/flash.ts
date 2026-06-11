import { writable } from 'svelte/store';
import type { FlashReadResult, FlashLogEntry } from '$lib/api/types';

export const flashBusy      = writable<boolean>(false);
export const flashProgress  = writable<{ phase: string; percent: number } | null>(null);
export const flashResult    = writable<FlashReadResult | null>(null);
export const flashLog       = writable<FlashLogEntry[]>([]);
export const flashProgrammer = writable<string>('ch341a_spi');

let _nextId = 0;
export function nextFlashLogId(): number { return _nextId++; }
