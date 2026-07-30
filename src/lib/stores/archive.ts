import { writable, derived, type Readable } from 'svelte/store';
import { archiveListDumps } from '$lib/api/tauri';
import { notifyError } from './notifications';
import type { SerialArchive } from '$lib/api/types';

/** Sort order for the serial-number groups in the archive view. */
export type ArchiveSortMode = 'newest' | 'oldest' | 'serial';

/**
 * Shared archive state. Previously this lived as local `$state` in
 * `ArchiveSection.svelte`; lifting it into a store means the dump count (and the
 * list itself) is available app-wide — e.g. a future home-panel widget or the
 * status bar can show "N Dumps archiviert" without re-fetching.
 */
const _archives = writable<SerialArchive[]>([]);
/** Read-only view of the archive list (write happens via {@link refreshArchives}). */
export const archives: Readable<SerialArchive[]> = _archives;
export const archiveLoading = writable<boolean>(false);
export const archiveQuery = writable<string>('');
export const archiveSortMode = writable<ArchiveSortMode>('newest');

/** Total number of dumps across all serial groups (derived from {@link archives}). */
export const archiveDumpCount: Readable<number> = derived(archives, ($a) =>
  $a.reduce((n, a) => n + a.dumps.length, 0),
);

/**
 * Re-fetch the dump list from the backend. Errors are surfaced as a sticky toast
 * (via the notifications store) rather than swallowed silently, and the list is
 * reset to empty so the UI doesn't show stale data after a failed refresh.
 */
export async function refreshArchives(): Promise<void> {
  archiveLoading.set(true);
  try {
    _archives.set(await archiveListDumps());
  } catch (e) {
    _archives.set([]);
    notifyError(
      'Archiv konnte nicht geladen werden',
      e instanceof Error ? e.message : String(e),
    );
  } finally {
    archiveLoading.set(false);
  }
}