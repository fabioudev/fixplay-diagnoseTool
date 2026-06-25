
// Controller manager: manages the current controller instance and processes input.
// Ported from dualshock-tools/js/controller-manager.js

import { BaseController } from './base-controller';
import { DS5Controller } from './ds5-controller';
import type { InputConfig, BatteryStatus, NvStatus, AdaptiveTriggerConfig, HIDDeviceLike, HIDInputReportEvent } from './base-controller';
import { sleep } from './utils';

export interface StickPosition {
  x: number;
  y: number;
}

export interface SticksState {
  left: StickPosition;
  right: StickPosition;
}

export interface TouchPoint {
  active: boolean;
  id: number;
  x: number;
  y: number;
}

export interface InputChanges {
  sticks?: SticksState;
  l2_analog?: number;
  r2_analog?: number;
  [key: string]: boolean | number | SticksState | undefined;
}

export interface ProcessedInput {
  changes: InputChanges;
  touchPoints: TouchPoint[];
  batteryStatus: BatteryStatus & { bat_txt: string; changed: boolean };
}

export class ControllerManager {
  currentController: BaseController | null = null;
  hasChangesToWrite: boolean | null = null;
  inputHandler: ((input: ProcessedInput) => void) | null = null;

  button_states: { sticks: SticksState; [key: string]: boolean | number | SticksState } = {
    sticks: { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } },
  };

  touchPoints: TouchPoint[] = [];
  batteryStatus: BatteryStatus & { bat_txt: string; changed: boolean } = {
    charge_level: 0,
    cable_connected: false,
    is_charging: false,
    is_error: false,
    bat_txt: '',
    changed: false,
  };
  private _lastBatteryText = '';

  setControllerInstance(instance: BaseController | null): void {
    this.currentController = instance;
  }

  getDevice(): HIDDeviceLike | null {
    return this.currentController?.getDevice() ?? null;
  }

  getInputConfig(): InputConfig | null {
    return this.currentController?.getInputConfig() ?? null;
  }

  getFinetuneMaxValue(): number | null {
    return this.currentController?.getFinetuneMaxValue() ?? null;
  }

  setInputReportHandler(handler: ((event: HIDInputReportEvent) => void) | null): void {
    if (!this.currentController) return;
    this.currentController.getDevice().oninputreport = handler;
  }

  async queryNvStatus(): Promise<NvStatus | null> {
    if (!this.currentController) return null;
    return await this.currentController.queryNvStatus();
  }

  async getInMemoryModuleData(): Promise<number[] | null> {
    if (!this.currentController) return null;
    return await this.currentController.getInMemoryModuleData();
  }

  async writeFinetuneData(data: number[]): Promise<void> {
    if (!this.currentController) return;
    await this.currentController.writeFinetuneData(data);
  }

  getModel(): string | null {
    return this.currentController?.getModel() ?? null;
  }

  getSupportedQuickTests(): string[] {
    return this.currentController?.getSupportedQuickTests() ?? [];
  }

  isConnected(): boolean {
    return this.currentController !== null;
  }

  setInputHandler(callback: ((input: ProcessedInput) => void) | null): void {
    this.inputHandler = callback;
  }

  async disconnect(): Promise<void> {
    if (this.currentController) {
      await this.currentController.close();
      this.currentController = null;
    }
  }

  setHasChangesToWrite(hasChanges: boolean): void {
    this.hasChangesToWrite = hasChanges;
  }

  async flash(progressCallback: ((p: number) => void) | null = null): Promise<{ success: boolean; message: string }> {
    if (!this.currentController) throw new Error('No controller connected');
    this.setHasChangesToWrite(false);
    return this.currentController.flash(progressCallback);
  }

  async reset(): Promise<void> {
    if (!this.currentController) return;
    this.setHasChangesToWrite(false);
    await this.currentController.reset();
  }

  async nvsUnlock(): Promise<void> {
    if (!this.currentController) return;
    await this.currentController.nvsUnlock();
    await this.queryNvStatus();
  }

  async nvsLock(): Promise<void> {
    if (!this.currentController) return;
    const res = await this.currentController.nvsLock();
    if (!res.ok) throw new Error('NVS Lock failed');
    await this.queryNvStatus();
  }

  async calibrateSticksBegin(): Promise<void> {
    if (!this.currentController) return;
    const res = await this.currentController.calibrateSticksBegin();
    if (!res.ok) throw new Error('Stick calibration begin failed');
  }

  async calibrateSticksSample(): Promise<void> {
    if (!this.currentController) return;
    const res = await this.currentController.calibrateSticksSample();
    if (!res.ok) {
      await sleep(500);
      throw new Error('Stick calibration sample failed');
    }
  }

  async calibrateSticksEnd(): Promise<void> {
    if (!this.currentController) return;
    const res = await this.currentController.calibrateSticksEnd();
    if (!res.ok) {
      await sleep(500);
      throw new Error('Stick calibration end failed');
    }
    this.setHasChangesToWrite(true);
  }

  async calibrateRangeBegin(): Promise<void> {
    if (!this.currentController) return;
    const res = await this.currentController.calibrateRangeBegin();
    if (!res.ok) throw new Error('Range calibration begin failed');
  }

  async calibrateRangeEnd(): Promise<void> {
    if (!this.currentController) return;
    const res = await this.currentController.calibrateRangeEnd();
    if (!res.ok) throw new Error('Range calibration end failed');
    this.setHasChangesToWrite(true);
  }

  async setAdaptiveTrigger(left: AdaptiveTriggerConfig, right: AdaptiveTriggerConfig): Promise<void> {
    if (!this.currentController) return;
    await this.currentController.setAdaptiveTrigger(left, right);
  }

  async setVibration(heavyLeft: number, lightRight: number): Promise<void> {
    if (!this.currentController) return;
    await this.currentController.setVibration(heavyLeft, lightRight);
  }

  async setSpeakerTone(output: 'speaker' | 'headphones' = 'speaker', duration = 0, doneCb?: (r: { success: boolean }) => void): Promise<void> {
    if (!this.currentController) return;
    await this.currentController.setSpeakerTone(output);
    if (duration > 0) {
      setTimeout(async () => {
        try {
          await this.currentController?.resetSpeakerSettings();
          doneCb?.({ success: true });
        } catch {
          doneCb?.({ success: false });
        }
      }, duration);
    }
  }

  async resetSpeakerSettings(): Promise<void> {
    if (!this.currentController) return;
    await this.currentController.resetSpeakerSettings();
  }

  async resetLights(): Promise<void> {
    if (!this.currentController) return;
    await this.currentController.resetLights();
  }

  async setLightbarColor(r: number, g: number, b: number): Promise<void> {
    if (!this.currentController) return;
    await this.currentController.setLightbarColor(r, g, b);
  }

  async setPlayerIndicator(pattern: number): Promise<void> {
    if (!this.currentController) return;
    await this.currentController.setPlayerIndicator(pattern);
  }

  async setMuteLed(mode: number): Promise<void> {
    if (!this.currentController) return;
    await this.currentController.setMuteLed(mode);
  }

  private _sticksChanged(current: SticksState, newValues: SticksState): boolean {
    return (
      current.left.x !== newValues.left.x ||
      current.left.y !== newValues.left.y ||
      current.right.x !== newValues.right.x ||
      current.right.y !== newValues.right.y
    );
  }

  private _recordButtonStates(
    data: DataView,
    buttonMap: InputConfig['buttonMap'],
    dpadByte: number,
    l2AnalogByte: number,
    r2AnalogByte: number
  ): InputChanges {
    const changes: InputChanges = {};

    const [newLx, newLy, newRx, newRy] = [0, 1, 2, 3]
      .map((i) => data.getUint8(i))
      .map((v) => Math.round(((v - 127.5) / 128) * 100) / 100);

    const newSticks: SticksState = { left: { x: newLx, y: newLy }, right: { x: newRx, y: newRy } };
    if (this._sticksChanged(this.button_states.sticks as SticksState, newSticks)) {
      this.button_states.sticks = newSticks;
      changes.sticks = newSticks;
    }

    ([
      ['l2', l2AnalogByte],
      ['r2', r2AnalogByte],
    ] as const).forEach(([name, byte]) => {
      const val = data.getUint8(byte);
      const key = name + '_analog';
      if (val !== this.button_states[key]) {
        this.button_states[key] = val;
        changes[key] = val;
      }
    });

    const hat = data.getUint8(dpadByte) & 0x0f;
    const dpadMap: Record<string, boolean> = {
      up: hat === 0 || hat === 1 || hat === 7,
      right: hat === 1 || hat === 2 || hat === 3,
      down: hat === 3 || hat === 4 || hat === 5,
      left: hat === 5 || hat === 6 || hat === 7,
    };
    for (const dir of ['up', 'right', 'down', 'left']) {
      const pressed = dpadMap[dir];
      if (this.button_states[dir] !== pressed) {
        this.button_states[dir] = pressed;
        changes[dir] = pressed;
      }
    }

    for (const btn of buttonMap) {
      if (['up', 'right', 'down', 'left'].includes(btn.name)) continue;
      const pressed = (data.getUint8(btn.byte) & btn.mask) !== 0;
      if (this.button_states[btn.name] !== pressed) {
        this.button_states[btn.name] = pressed;
        changes[btn.name] = pressed;
      }
    }

    return changes;
  }

  private _parseTouchPoints(data: DataView, offset: number): TouchPoint[] {
    const points: TouchPoint[] = [];
    for (let i = 0; i < 2; i++) {
      const base = offset + i * 4;
      const b0 = data.getUint8(base);
      const active = (b0 & 0x80) === 0;
      const id = b0 & 0x7f;
      const b1 = data.getUint8(base + 1);
      const b2 = data.getUint8(base + 2);
      const b3 = data.getUint8(base + 3);
      const x = ((b2 & 0x0f) << 8) | b1;
      const y = (b3 << 4) | (b2 >> 4);
      points.push({ active, id, x, y });
    }
    return points;
  }

  private _batteryPercentToText(info: BatteryStatus): string {
    if (info.is_error) return 'error';
    return `${info.charge_level}%${info.is_charging ? ' ⚡' : ''}`;
  }

  private _parseBatteryStatus(data: DataView): BatteryStatus & { bat_txt: string; changed: boolean } {
    const batteryInfo = this.currentController!.parseBatteryStatus(data);
    const batTxt = this._batteryPercentToText(batteryInfo);
    const changed = batTxt !== this._lastBatteryText;
    this._lastBatteryText = batTxt;
    return { ...batteryInfo, bat_txt: batTxt, changed };
  }

  processControllerInput(inputData: { data: DataView }): void {
    if (!this.currentController) return;
    const { data } = inputData;
    const inputConfig = this.currentController.getInputConfig();
    const { buttonMap, dpadByte, l2AnalogByte, r2AnalogByte, touchpadOffset } = inputConfig;

    const changes = this._recordButtonStates(data, buttonMap, dpadByte, l2AnalogByte, r2AnalogByte);
    if (touchpadOffset) this.touchPoints = this._parseTouchPoints(data, touchpadOffset);
    this.batteryStatus = this._parseBatteryStatus(data);

    const result: ProcessedInput = {
      changes,
      touchPoints: this.touchPoints,
      batteryStatus: this.batteryStatus,
    };
    this.inputHandler?.(result);
  }

  getInputHandler(): (event: HIDInputReportEvent) => void {
    return this.processControllerInput.bind(this) as (event: HIDInputReportEvent) => void;
  }
}

export function createControllerForDevice(device: HIDDeviceLike): BaseController | null {
  const productId = (device as unknown as { productId?: number }).productId;
  // DualSense: 0x0ce6 vendor, 0x0df2 product
  const vendorId = (device as unknown as { vendorId?: number }).vendorId;
  if (vendorId === 0x054c && (productId === 0x0ce6 || productId === 0x0df2)) {
    return new DS5Controller(device);
  }
  return null;
}

export function createControllerManager(): ControllerManager {
  const mgr = new ControllerManager();
  mgr.setHasChangesToWrite(false);
  return mgr;
}
