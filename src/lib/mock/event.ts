// Mock replacement for '@tauri-apps/api/event'.
// Only active in MOCK mode via the vite alias.
import { on } from './_shared';

type EventCallback<T> = (event: { event: string; payload: T }) => void;

/** Drop-in replacement for Tauri's `listen`. Returns a Promise<unlisten>. */
export function listen<T = unknown>(event: string, cb: EventCallback<T>): Promise<() => void> {
  const unlisten = on(event, cb as (e: { event: string; payload: unknown }) => void);
  return Promise.resolve(unlisten);
}

/** Drop-in replacement for Tauri's `once`. */
export function once<T = unknown>(event: string, cb: EventCallback<T>): Promise<() => void> {
  const unlistenP = listen<T>(event, (e) => {
    unlistenP.then((un) => un());
    cb(e);
  });
  return unlistenP;
}
