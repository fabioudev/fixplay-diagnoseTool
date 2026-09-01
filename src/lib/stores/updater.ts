import { writable, get } from 'svelte/store';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getUpdateChannel, appVersion } from '$lib/api/tauri';
import type { UpdateChannel } from '$lib/api/types';

/** An available update, once `checkUpdates()` finds one. */
export const updateAvailable = writable<Update | null>(null);
/** True while a check / download is in flight. */
export const updateBusy = writable<boolean>(false);
/** Download progress 0..1 (null when not downloading). */
export const updateProgress = writable<number | null>(null);
/** Last user-facing error from the updater, if any. */
export const updateError = writable<string | null>(null);
/** How this install was deployed — decides self-update vs. package manager. */
export const updateChannel = writable<UpdateChannel | null>(null);
/** Current app version, for "du bist auf X.Y.Z" display. */
export const currentVersion = writable<string>('');
/** User dismissed the banner for this session. */
export const updateDismissed = writable<boolean>(false);

/** Load the install channel + current version (cheap; safe to call on startup). */
export async function refreshUpdateContext(): Promise<void> {
  try {
    const [ch, ver] = await Promise.all([getUpdateChannel(), appVersion()]);
    updateChannel.set(ch ?? { managed: false, hint: '' });
    currentVersion.set(ver ?? '');
  } catch {
    // Non-Tauri / mock environment — leave defaults, the banner just stays hidden.
    updateChannel.set({ managed: false, hint: '' });
  }
}

/**
 * Ask the Tauri updater plugin whether a newer release is published at the
 * configured endpoint. On success sets `updateAvailable` (and clears a prior
 * dismissal only if a *different* version is now available). Errors are surfaced
 * via `updateError` but never thrown, so the startup auto-check can't crash the
 * app.
 */
export async function checkUpdates(): Promise<void> {
  updateBusy.set(true);
  updateError.set(null);
  try {
    const update = await check();
    updateAvailable.set(update);
    if (update) {
      // Check if user clicked "Später" (24h snooze) — if still within the
      // snooze window, keep the banner dismissed.
      let snoozed = false;
      try {
        const remind = localStorage.getItem('fixplay-update-remind');
        if (remind) snoozed = Date.now() < parseInt(remind, 10);
      } catch {
        /* ignored */
      }
      if (!snoozed) updateDismissed.set(false);
    }
  } catch (e) {
    updateError.set(e instanceof Error ? e.message : String(e));
    updateAvailable.set(null);
  } finally {
    updateBusy.set(false);
  }
}

/**
 * Download + install the pending update, then relaunch. For package-manager
 * installs (`channel.managed`) this is a no-op — the caller should show the
 * "via Paketmanager updaten" hint instead of calling this.
 */
export async function installUpdate(): Promise<void> {
  const update = get(updateAvailable);
  if (!update) return;

  updateBusy.set(true);
  updateProgress.set(0);
  updateError.set(null);
  try {
    let total = 0;
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          total = Number((event.data as { contentLength?: number }).contentLength ?? 0);
          updateProgress.set(total > 0 ? 0 : null);
          break;
        case 'Progress': {
          const chunk = Number((event.data as { chunkLength?: number }).chunkLength ?? 0);
          updateProgress.update((p) =>
            total > 0 && p !== null ? Math.min(1, p + chunk / total) : p
          );
          break;
        }
        case 'Finished':
          updateProgress.set(1);
          break;
      }
    });
    await relaunch();
  } catch (e) {
    updateError.set(e instanceof Error ? e.message : String(e));
  } finally {
    updateBusy.set(false);
  }
}
