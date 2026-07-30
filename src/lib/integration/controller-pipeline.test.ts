// @vitest-environment jsdom
// Integration test (#73): exercises the full controller input pipeline end to
// end — the mock `hid_poll` report builder (core.ts buildDs5InputReport) → the
// real ControllerManager parser (processControllerInput) → the real store
// updater (applyProcessedInput) — and asserts every controller store reflects
// the simulated input together. No single unit test covers this seam; the
// units are individually tested but their wiring is only proven here.
import { describe, it, expect, beforeEach } from 'vitest';
import { invoke } from '$lib/mock/core';
import { mockState, resetMockState } from '$lib/mock/state';
import { createControllerForDevice, createControllerManager } from '$lib/controllers/controller-manager';
import type { HIDDeviceLike, HIDInputReportEvent } from '$lib/controllers/base-controller';
import type { HidPollResult } from '$lib/controllers/tauri-hid-device';
import {
  applyProcessedInput,
  stickState,
  buttonState,
  triggerState,
  batteryStatus,
  imuState,
  touchPoints,
  micConnected,
  headphoneConnected,
} from '$lib/stores/controller';
import { get } from 'svelte/store';

/** Minimal fake DS5 HID device (same shape as ds5-controller.test.ts). */
function makeFakeDevice(): HIDDeviceLike {
  return {
    opened: true,
    collections: [
      { featureReports: Array.from({ length: 256 }, (_, i) => ({ reportId: i, items: [{ reportCount: 64 }] })) },
    ],
    oninputreport: null,
    async sendFeatureReport() {},
    async receiveFeatureReport() { return new DataView(new ArrayBuffer(64)); },
    async sendReport() {},
    async close() {},
  } as unknown as HIDDeviceLike;
}

/** Read the current value of a store once. */
function cur<T>(s: { subscribe: (fn: (v: T) => void) => () => void }): T {
  return get(s as unknown as Parameters<typeof get>[0]) as T;
}

beforeEach(() => {
  resetMockState();
});

describe('controller input pipeline (integration, #73)', () => {
  it('flows a mock hid_poll report through the manager into all stores', async () => {
    // Configure the simulated controller: right stick up-right, L2 half, cross
    // + R1 pressed, battery 50% charging, one touch point mid-pad. IMU stays at
    // its rest default (1 g on accel Z) from buildDs5InputReport.
    mockState.update((s) => ({
      ...s,
      hid: {
        ...s.hid,
        connected: true,
        input: {
          ...s.hid.input,
          lx: 0, ly: 0,
          rx: 0.8, ry: -0.6,
          l2: 128, r2: 0,
          buttons: { cross: true, r1: true },
          battery: 50,
          charging: true,
          touchPoints: [
            { active: true, x: 960, y: 470 },
            { active: false, x: 0, y: 0 },
          ],
        },
      },
    }));

    // Wire the real manager + store updater, exactly as ControllerPanel does.
    const device = makeFakeDevice();
    (device as unknown as { vendorId: number }).vendorId = 0x054c;
    (device as unknown as { productId: number }).productId = 0x0ce6;
    const ctrl = createControllerForDevice(device);
    expect(ctrl).not.toBeNull();
    const manager = createControllerManager();
    manager.setControllerInstance(ctrl);
    manager.setInputHandler((input) => applyProcessedInput(input));

    // Poll via the mock invoke (builds the DS5 report from the state above).
    const result = await invoke<HidPollResult>('hid_poll');
    expect(result.connected).toBe(true);
    expect(result.reports.length).toBe(1);

    // Feed the report through the real parser → store updater.
    for (const report of result.reports) {
      const data = new DataView(new Uint8Array(report.data).buffer);
      manager.processControllerInput({ data, reportId: report.report_id });
    }

    // Sticks: right stick should be deflected up-right; left centered.
    const sticks = cur(stickState);
    expect(sticks.left.x).toBeCloseTo(0, 1);
    expect(sticks.left.y).toBeCloseTo(0, 1);
    expect(sticks.right.x).toBeGreaterThan(0.7);
    expect(sticks.right.y).toBeLessThan(-0.5);

    // Triggers: L2 half, R2 released.
    expect(cur(triggerState).l2).toBe(128);
    expect(cur(triggerState).r2).toBe(0);

    // Buttons: cross + r1 pressed, others not.
    const btn = cur(buttonState);
    expect(btn.cross).toBe(true);
    expect(btn.r1).toBe(true);
    expect(btn.triangle).toBeFalsy();

    // Battery: input 50% quantizes to a 0-10 nibble (floor(50/10)=5), which the
    // real DS5 parser maps back to 5*10+5 = 55 — the controller's 10%-step
    // battery reporting. Charging flag comes from the status nibble.
    const bat = cur(batteryStatus);
    expect(bat.charge_level).toBe(55);
    expect(bat.is_charging).toBe(true);
    expect(bat.cable_connected).toBe(true);

    // IMU: rest state → 1 g on accel Z, zero gyro.
    const imu = cur(imuState);
    expect(imu.accel.z).toBeCloseTo(1, 3);
    expect(imu.gyro.x).toBe(0);

    // Touch: one active point mid-pad.
    const tp = cur(touchPoints);
    expect(tp.filter((p) => p.active).length).toBe(1);
    expect(tp[0].active).toBe(true);
  });

  it('disconnects the pipeline when hid_poll reports connected=false', async () => {
    mockState.update((s) => ({ ...s, hid: { ...s.hid, connected: false } }));
    const result = await invoke<HidPollResult>('hid_poll');
    expect(result.connected).toBe(false);
    expect(result.reports).toEqual([]);
  });

  it('updates stores incrementally across two distinct reports', async () => {
    const device = makeFakeDevice();
    (device as unknown as { vendorId: number }).vendorId = 0x054c;
    (device as unknown as { productId: number }).productId = 0x0ce6;
    const manager = createControllerManager();
    manager.setControllerInstance(createControllerForDevice(device));
    manager.setInputHandler((input) => applyProcessedInput(input));

    async function pollOnce(): Promise<void> {
      const r = await invoke<HidPollResult>('hid_poll');
      for (const report of r.reports) {
        manager.processControllerInput({
          data: new DataView(new Uint8Array(report.data).buffer),
          reportId: report.report_id,
        });
      }
    }

    // Frame 1: cross pressed.
    mockState.update((s) => ({ ...s, hid: { ...s.hid, input: { ...s.hid.input, buttons: { cross: true } } } }));
    await pollOnce();
    expect(cur(buttonState).cross).toBe(true);

    // Frame 2: cross released, circle pressed.
    mockState.update((s) => ({ ...s, hid: { ...s.hid, input: { ...s.hid.input, buttons: { circle: true } } } }));
    await pollOnce();
    expect(cur(buttonState).cross).toBe(false);
    expect(cur(buttonState).circle).toBe(true);
  });
});