import { writable } from 'svelte/store';
import type { FlashReadResult, FlashLogEntry, FlashProgressEvent, FlashPreviewResult } from '$lib/api/types';
import { createLogStore } from './log';

export const flashBusy      = writable<boolean>(false);
export const flashProgress  = writable<FlashProgressEvent | null>(null);
export const flashResult    = writable<FlashReadResult | null>(null);

// Flash log: shared createLogStore backs the writable + monotonic id + capped
// prepend (the contract every component relies on when appending flashrom output).
const _flashLog = createLogStore<FlashLogEntry>();
export const flashLog       = _flashLog.entries;
export const nextFlashLogId = _flashLog.nextId;
/** Prepend a flash log entry (newest-first), capped at 200. */
export const pushFlashLog: (entry: FlashLogEntry) => void = _flashLog.push;

export const flashProgrammer = writable<string>('ch341a_spi');
export const flashProgrammers = writable<string[]>([]);
/**
 * A pending write target requested by another component (the archive panel's
 * "restore" action). FlashPanel consumes it as a one-shot request and clears
 * it. This is an explicit *write-request* channel — not a generic path store
 * repurposed as a cross-component event bus (which is what the old
 * `flashWritePath` was).
 */
export const flashWriteRequest = writable<string | null>(null);

/** Request that the flash panel write the NOR image at `path` (one-shot). */
export function requestFlashWrite(path: string): void {
  flashWriteRequest.set(path);
}
export const flashWritePreview = writable<FlashPreviewResult | null>(null);
