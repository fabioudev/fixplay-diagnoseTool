import { writable, type Writable } from 'svelte/store';
import type { LogEntry } from '$lib/api/types';

/**
 * A subsystem log store: a `Writable<T[]>` of entries plus the two pieces of
 * logic that were previously copy-pasted into every store file — a monotonic id
 * generator and a capped, newest-first append. Centralizing these gives every
 * log (UART, I2C, flash, controller) identical append/id semantics.
 *
 * Components that already call `entries.update((l) => [e, ...l].slice(0, N))`
 * keep working; `push` is the encouraged helper for new code.
 */
export interface LogStore<T extends LogEntry> {
  /** The underlying log store (newest-first). */
  entries: Writable<T[]>;
  /** Next monotonic id for a new entry. */
  nextId: () => number;
  /** Prepend `entry` (newest-first) and cap history at `cap` (default 200). */
  push: (entry: T) => void;
}

/**
 * Build a log store. `cap` bounds the retained history so a long session can't
 * grow the array without limit.
 */
export function createLogStore<T extends LogEntry>(cap = 200): LogStore<T> {
  let _nextId = 0;
  const entries = writable<T[]>([]) as Writable<T[]>;
  return {
    entries,
    nextId: () => _nextId++,
    push: (entry) => entries.update((log) => [entry, ...log].slice(0, cap)),
  };
}
