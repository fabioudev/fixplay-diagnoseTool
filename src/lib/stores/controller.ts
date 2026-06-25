

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
}

