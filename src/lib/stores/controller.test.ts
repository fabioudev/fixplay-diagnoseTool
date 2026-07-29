import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  applyProcessedInput,
  stickState,
  triggerState,
  buttonState,
  touchPoints,
  batteryStatus,
  micConnected,
  headphoneConnected,
} from './controller';
import type { ProcessedInput } from '$lib/controllers/controller-manager';

// Helper: build a minimal ProcessedInput with only the fields under test set.
function makeInput(partial: Partial<ProcessedInput>): ProcessedInput {
  return {
    changes: {},
    touchPoints: [],
    batteryStatus: {
      charge_level: 0,
      cable_connected: false,
      is_charging: false,
      is_error: false,
      bat_txt: '',
      changed: false,
    },
    micConnected: false,
    headphoneConnected: false,
    ...partial,
  };
}

describe('applyProcessedInput', () => {
  beforeEach(() => {
    stickState.set({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } });
    triggerState.set({ l2: 0, r2: 0 });
    buttonState.set({});
    touchPoints.set([]);
    micConnected.set(false);
    headphoneConnected.set(false);
  });

  it('sets stick state when sticks change is present', () => {
    applyProcessedInput(makeInput({
      changes: { sticks: { left: { x: 0.5, y: -0.25 }, right: { x: 0, y: 0 } } },
    }));
    expect(get(stickState).left).toEqual({ x: 0.5, y: -0.25 });
  });

  it('updates only the trigger that changed, preserving the other', () => {
    triggerState.set({ l2: 100, r2: 50 });
    applyProcessedInput(makeInput({ changes: { r2_analog: 200 } }));
    expect(get(triggerState)).toEqual({ l2: 100, r2: 200 });
  });

  it('merges boolean button changes into buttonState without clearing others', () => {
    buttonState.set({ cross: true });
    applyProcessedInput(makeInput({ changes: { circle: true, cross: false } }));
    expect(get(buttonState)).toEqual({ cross: false, circle: true });
  });

  it('ignores non-boolean change entries (sticks/triggers) when collecting buttons', () => {
    applyProcessedInput(makeInput({
      changes: {
        sticks: { left: { x: 1, y: 1 }, right: { x: 0, y: 0 } },
        l2_analog: 99,
        triangle: true,
      },
    }));
    // Only `triangle` should land in buttonState, not sticks/l2_analog.
    expect(get(buttonState)).toEqual({ triangle: true });
  });

  it('only writes battery status when changed: true', () => {
    applyProcessedInput(makeInput({
      batteryStatus: {
        charge_level: 5, cable_connected: true, is_charging: true, is_error: false,
        bat_txt: 'High', changed: false,
      },
    }));
    expect(get(batteryStatus).bat_txt).toBe('');
    applyProcessedInput(makeInput({
      batteryStatus: {
        charge_level: 5, cable_connected: true, is_charging: true, is_error: false,
        bat_txt: 'High', changed: true,
      },
    }));
    expect(get(batteryStatus).bat_txt).toBe('High');
    expect(get(batteryStatus).is_charging).toBe(true);
  });

  it('reflects mic and headphone connection flags', () => {
    applyProcessedInput(makeInput({ micConnected: true, headphoneConnected: true }));
    expect(get(micConnected)).toBe(true);
    expect(get(headphoneConnected)).toBe(true);
  });

  it('always overwrites touch points (even on a no-change frame)', () => {
    const tp = [{ active: true, id: 1, x: 0.5, y: 0.5 }];
    applyProcessedInput(makeInput({ touchPoints: tp }));
    expect(get(touchPoints)).toEqual(tp);
  });
});