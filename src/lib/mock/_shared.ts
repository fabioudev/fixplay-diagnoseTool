// Shared infrastructure for the browser mock layer.
// This file is only loaded when the @tauri-apps/* imports are aliased to the
// mock modules (VITE_MOCK / MOCK mode). The real Tauri build never touches it.

type Listener = (event: { event: string; payload: unknown }) => void;

const listeners = new Map<string, Set<Listener>>();

/** Register a listener for a Tauri event name. Returns an unlisten function. */
export function on(event: string, cb: Listener): () => void {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
  };
}

/** Emit an event to all registered listeners (mock replacement for backend app.emit). */
export function emitLocal(event: string, payload: unknown): void {
  const set = listeners.get(event);
  if (!set) return;
  for (const cb of set) {
    try {
      cb({ event, payload });
    } catch (err) {
      console.warn(`[mock] listener for ${event} threw`, err);
    }
  }
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export { delay };

// --- In-memory settings store (so settings_save is reflected by settings_get) ---
import type { AppSettings } from '../api/types';

export const settingsStore: AppSettings = {
  flashrom_path: null,
  archive_dir: null,
  baud_rate: 115200,
  i2c_baud_rate: 115200,
  auto_reconnect: false,
  tablet_mode: false,
};