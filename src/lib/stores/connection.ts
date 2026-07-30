import { writable, get, type Readable, type Writable } from 'svelte/store';

/**
 * Lifecycle of a hardware-device connection (UART, I2C, controller).
 *
 * - `disconnected`  — idle, no device.
 * - `connecting`    — a connect attempt is in flight (not yet used by every
 *   subsystem, but the state is modelled so a panel can express it without
 *   overloading `reconnecting`).
 * - `connected`     — device is live and readable.
 * - `reconnecting`  — lost the device and the backend is auto-retrying.
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * Full connection status. Kept as one object so a single `writable` is the
 * source of truth; the boolean views below are derived *and* settable.
 */
export interface ConnectionStatus {
  /** Coarse lifecycle. */
  state: ConnectionState;
  /** Convenience boolean: `state === 'connected'`. */
  connected: boolean;
  /** Convenience boolean: `state === 'reconnecting'`. */
  reconnecting: boolean;
}

/**
 * A connection store: the unified status plus the two boolean views the panels
 * already consume (`$uartConnected`, `$uartReconnecting`, …). The booleans are
 * full {@link Writable}s — calling `.set(boolean)` on them writes back into the
 * shared status, so existing call sites (`uartConnected.set(true)`,
 * `uartReconnecting.set(false)`, …) keep working unchanged while everything
 * stays backed by one source of truth.
 */
export interface ConnectionStore {
  /** Unified status (the single source of truth). */
  status: Writable<ConnectionStatus>;
  /** Boolean view of `connected`; settable, writes back to `status`. */
  connected: Writable<boolean>;
  /** Boolean view of `reconnecting`; settable, writes back to `status`. */
  reconnecting: Writable<boolean>;
}

function statusFrom(connected: boolean, reconnecting: boolean): ConnectionStatus {
  const state: ConnectionState = reconnecting
    ? 'reconnecting'
    : connected
      ? 'connected'
      : 'disconnected';
  return { state, connected, reconnecting };
}

/**
 * Build a connection store. All three views (`status`, `connected`,
 * `reconnecting`) read and write the same underlying `ConnectionStatus`, so the
 * panels can keep using the boolean API they already have while the unified
 * state is available for new code.
 */
export function createConnectionStore(): ConnectionStore {
  const status = writable<ConnectionStatus>(statusFrom(false, false));

  const booleanView = (field: 'connected' | 'reconnecting'): Writable<boolean> => ({
    subscribe: (run) => {
      let last: boolean | undefined;
      return status.subscribe((s) => {
        const v = s[field];
        if (v !== last) {
          last = v;
          run(v);
        }
      });
    },
    set: (value: boolean) =>
      status.update((s) => {
        const connected = field === 'connected' ? value : s.connected;
        const reconnecting = field === 'reconnecting' ? value : s.reconnecting;
        return statusFrom(connected, reconnecting);
      }),
    update: (fn: (v: boolean) => boolean) =>
      status.update((s) => {
        const next = fn(s[field]);
        const connected = field === 'connected' ? next : s.connected;
        const reconnecting = field === 'reconnecting' ? next : s.reconnecting;
        return statusFrom(connected, reconnecting);
      }),
  });

  return {
    status,
    connected: booleanView('connected'),
    reconnecting: booleanView('reconnecting'),
  };
}

/** Read-only snapshot helper (kept off the hot path — only for tests/debug). */
export function snapshotConnection(store: ConnectionStore): ConnectionStatus {
  return get(store.status);
}

// `Readable` is re-exported so callers typing derived views can import it from
// here alongside the connection helpers, matching the log-store convention.
export type { Readable };