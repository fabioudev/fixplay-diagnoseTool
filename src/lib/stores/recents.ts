import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Auto-tracks the most recently visited panels (excluding the Start page) so
// the sidebar can surface a "zuletzt genutzt" quick-row. Backed by localStorage
// so the order survives restarts. Capped to MAX entries, most-recent-first,
// with duplicates collapsed (a re-visit just moves the entry to the front).

const STORAGE_KEY = 'fixplay-recent-views';
const MAX = 4;

export type RecentView = 'flash' | 'uart' | 'i2c' | 'controller' | 'archive';

function read(): RecentView[] {
  if (!browser) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((v) => typeof v === 'string') as RecentView[];
  } catch {
    return [];
  }
}

function write(views: RecentView[]) {
  if (!browser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    /* ignored */
  }
}

export const recentViews = writable<RecentView[]>(read());

/** Record a visit. No-op for the home view and for unknown strings. */
export function pushRecent(view: string) {
  if (view === 'home' || !view) return;
  // Only track real tool panels.
  const allowed: RecentView[] = ['flash', 'uart', 'i2c', 'controller', 'archive'];
  if (!allowed.includes(view as RecentView)) return;
  const v = view as RecentView;
  recentViews.update((prev) => {
    const next = [v, ...prev.filter((x) => x !== v)].slice(0, MAX);
    write(next);
    return next;
  });
}
