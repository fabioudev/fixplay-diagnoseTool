import { writable, type Readable } from 'svelte/store';

/**
 * Severity of a toast notification. `error` and `warn` get accent colours; `info`
 * is neutral; `success` is green.
 */
export type NotificationLevel = 'info' | 'success' | 'warn' | 'error';

/**
 * A single toast. `id` is assigned by {@link notify} so callers never need to
 * invent one; `created_ms` lets the Toaster auto-dismiss oldest entries when the
 * queue grows past its cap.
 */
export interface AppNotification {
  /** Monotonic id (assigned by `notify`). */
  id: number;
  /** Severity — drives colour and default timeout. */
  level: NotificationLevel;
  /** One-line title (bold). */
  title: string;
  /** Optional body text shown beneath the title. */
  message?: string;
  /** Auto-dismiss after this many ms; 0 = sticky (manual dismiss only). */
  timeout_ms: number;
  /** When the notification was created (epoch ms). */
  created_ms: number;
}

/** Public read-only view of the toast queue (newest-first). */
export type NotificationList = Readable<AppNotification[]>;

const DEFAULT_TIMEOUT: Record<NotificationLevel, number> = {
  info: 4000,
  success: 4000,
  warn: 6000,
  error: 0, // errors are sticky — the user must acknowledge them
};

const MAX_NOTIFICATIONS = 5;

let _nextId = 0;
const _notifications = writable<AppNotification[]>([]);

/** Read-only toast queue (newest-first, capped at {@link MAX_NOTIFICATIONS}). */
export const notifications: NotificationList = _notifications;

/**
 * Push a toast. Returns the assigned id so a caller can dismiss it later
 * (e.g. to replace a transient "loading…" toast with a final result).
 */
export function notify(
  level: NotificationLevel,
  title: string,
  message?: string,
  timeout_ms?: number
): number {
  const id = _nextId++;
  const entry: AppNotification = {
    id,
    level,
    title,
    message,
    timeout_ms: timeout_ms ?? DEFAULT_TIMEOUT[level],
    created_ms: Date.now(),
  };
  _notifications.update((list) => [entry, ...list].slice(0, MAX_NOTIFICATIONS));
  return id;
}

/** Convenience wrappers for the common severities. */
export const notifyInfo = (title: string, message?: string) => notify('info', title, message);
export const notifySuccess = (title: string, message?: string) => notify('success', title, message);
export const notifyWarn = (title: string, message?: string) => notify('warn', title, message);
export const notifyError = (title: string, message?: string) => notify('error', title, message);

/** Dismiss a single toast by id (no-op if it's already gone). */
export function dismissNotification(id: number): void {
  _notifications.update((list) => list.filter((n) => n.id !== id));
}

/** Clear every toast. */
export function clearNotifications(): void {
  _notifications.set([]);
}
