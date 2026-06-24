import { writable } from 'svelte/store';
import type { FlashReadResult, FlashLogEntry, FlashProgressEvent, FlashPreviewResult } from '$lib/api/types';

export const flashBusy      = writable<boolean>(false);
export const flashProgress  = writable<FlashProgressEvent | null>(null);
export const flashResult    = writable<FlashReadResult | null>(null);
export const flashLog       = writable<FlashLogEntry[]>([]);
export const flashProgrammer = writable<string>('ch341a_spi');
export const flashProgrammers = writable<string[]>([]);
export const flashWritePath = writable<string | null>(null);
export const flashWritePreview = writable<FlashPreviewResult | null>(null);

let _nextId = 0;
export function nextFlashLogId(): number { return _nextId++; }
