

// Svelte stores for controller state (connection, sticks, buttons, battery).
import { writable } from 'svelte/store';
import type { SticksState, TouchPoint, ProcessedInput } from '$lib/controllers/controller-manager';
import type { ControllerInfo, NvStatus } from '$lib/controllers/base-controller';

export const controllerConnected = writable<boolean>(false);
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

export const controllerLog = writable<{ id: number; timestamp_ms: number; message: string; level: 'info' | 'warn' | 'error' }[]>([]);

let _nextLogId = 0;
export function nextControllerLogId(): number {
  return _nextLogId++;
}

export function pushControllerLog(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  const entry = { id: nextControllerLogId(), timestamp_ms: Date.now(), message, level };
  controllerLog.update((log) => [entry, ...log].slice(0, 200));
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
}

