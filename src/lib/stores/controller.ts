

// Svelte stores for controller state (connection, sticks, buttons, battery).
import { writable } from 'svelte/store';
import type { SticksState, TouchPoint, ProcessedInput } from '$lib/controllers/controller-manager';
import type { ControllerInfo, NvStatus } from '$lib/controllers/base-controller';
import type { TextLogEntry } from '$lib/api/types';
import { createLogStore } from './log';
import { createConnectionStore } from './connection';

// Controller connection state backed by the shared createConnectionStore,
// matching the UART/I2C pattern.
const _controllerConnection = createConnectionStore();
export const controllerConnected = _controllerConnection.connected;
/** Unified controller connection status (coarse lifecycle + booleans). */
export const controllerConnection = _controllerConnection.status;
export const controllerModel = writable<string | null>(null);
export const controllerInfo = writable<ControllerInfo | null>(null);
export const controllerNvStatus = writable<NvStatus | null>(null);
export const controllerHasChanges = writable<boolean>(false);

export const stickState = writable<SticksState>({
  left: { x: 0, y: 0 },
  right: { x: 0, y: 0 },
});

export const buttonState = writable<Record<string, boolean>>({});
export const triggerState = writable<{ l2: number; r2: number }>({ l2: 0, r2: 0 });
export const touchPoints = writable<TouchPoint[]>([]);

/**
 * Last lightbar color applied to the controller (0-255 RGB). Driven by the
 * LightbarTester and mirrored live on the controller graphic's lightbar strip.
 * Ephemeral — not the controller's actual state, just the UI's last command.
 */
export const lightbarColor = writable<{ r: number; g: number; b: number }>({ r: 0, g: 0, b: 255 });

/** Whether a microphone is connected (input report byte 53 bit 1). */
export const micConnected = writable<boolean>(false);
/** Whether headphones are connected (input report byte 53 bit 0). */
export const headphoneConnected = writable<boolean>(false);

/**
 * Latest IMU sample (#56): gyro (°/s) + accel (g) from the DualSense input
 * report. Updated on every processed input; consumed by the IMU visualizer.
 */
export const imuState = writable<{ gyro: { x: number; y: number; z: number }; accel: { x: number; y: number; z: number } }>({
  gyro: { x: 0, y: 0, z: 0 },
  accel: { x: 0, y: 0, z: 0 },
});

/**
 * Stick deadzone radius (0..1 of full deflection) used by the stick
 * visualizers and the range-calibration result. Ephemeral per session — the
 * slider in ControllerPanel adjusts it live; it is not (yet) persisted across
 * restarts.
 */
export const stickDeadzone = writable<number>(0.1);

/**
 * Per-stick circularity polygon produced by range calibration: 48 radii (one
 * per angular bin, see CIRCULARITY_DATA_SIZE), or null when no range
 * calibration has been run yet. Consumed by the stick visualizer to render the
 * green/red circularity overlay.
 */
export const stickCircularity = writable<{ left: number[] | null; right: number[] | null }>({
  left: null,
  right: null,
});

export const batteryStatus = writable<{
  charge_level: number;
  cable_connected: boolean;
  is_charging: boolean;
  is_error: boolean;
  bat_txt: string;
}>({ charge_level: 0, cable_connected: false, is_charging: false, is_error: false, bat_txt: '' });

// Controller log: shares the message+level (TextLogEntry) style with the flash
// log, backed by the common createLogStore (monotonic id + capped prepend).
const _controllerLog = createLogStore<TextLogEntry>();
export const controllerLog = _controllerLog.entries;
export const nextControllerLogId = _controllerLog.nextId;

export function pushControllerLog(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  _controllerLog.push({ id: nextControllerLogId(), timestamp_ms: Date.now(), message, level });
}

export function applyProcessedInput(input: ProcessedInput): void {
  if (input.changes.sticks) stickState.set(input.changes.sticks);
  if (input.changes.l2_analog !== undefined || input.changes.r2_analog !== undefined) {
    triggerState.update((t) => ({
      l2: input.changes.l2_analog ?? t.l2,
      r2: input.changes.r2_analog ?? t.r2,
    }));
  }
  const btnChanges: Record<string, boolean> = {};
  for (const [key, val] of Object.entries(input.changes)) {
    if (key === 'sticks' || key === 'l2_analog' || key === 'r2_analog') continue;
    if (typeof val === 'boolean') btnChanges[key] = val;
  }
  if (Object.keys(btnChanges).length > 0) {
    buttonState.update((b) => ({ ...b, ...btnChanges }));
  }
  touchPoints.set(input.touchPoints);
  if (input.batteryStatus.changed) {
    batteryStatus.set(input.batteryStatus);
  }
  micConnected.set(input.micConnected);
  headphoneConnected.set(input.headphoneConnected);
  imuState.set(input.imu);
}

