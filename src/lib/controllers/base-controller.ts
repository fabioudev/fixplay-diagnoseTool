
// Base controller class providing common functionality for all controller types.
// Ported from dualshock-tools/js/controllers/base-controller.js

export interface InputConfig {
  buttonMap: ButtonMapEntry[];
  dpadByte: number;
  l2AnalogByte: number;
  r2AnalogByte: number;
  touchpadOffset: number;
}

export interface ButtonMapEntry {
  name: string;
  byte: number;
  mask: number;
  svg?: string;
}

export interface BatteryStatus {
  charge_level: number;
  cable_connected: boolean;
  is_charging: boolean;
  is_error: boolean;
}

export interface NvStatus {
  device: string;
  status: string;
  locked: boolean | null;
  code: number;
  raw: number;
}

export interface CalibResult {
  ok: boolean;
  error?: unknown;
}

export interface InfoItem {
  key: string;
  value: string;
  cat: string;
  isExtra?: boolean;
  copyable?: boolean;
}

export interface ControllerInfo {
  ok: boolean;
  infoItems?: InfoItem[];
  nv?: NvStatus;
  disable_bits?: number;
  pending_reboot?: boolean;
  error?: unknown;
}

export interface AdaptiveTriggerConfig {
  mode: 'off' | 'single' | 'auto' | 'resistance';
  start: number;
  end: number;
  force: number;
}

// Minimal HIDInputReportEvent type (WebHID).
export interface HIDInputReportEvent {
  device: HIDDeviceLike;
  reportId: number;
  data: DataView;
}

// Minimal HIDDevice type for the parts we use (WebHID).
export interface HIDDeviceLike {
  opened: boolean;
  collections: Array<{
    featureReports: Array<{ reportId: number; items: Array<{ reportCount?: number }> }>;
  }>;
  oninputreport: ((event: HIDInputReportEvent) => void) | null;
  sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<DataView>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  close(): Promise<void>;
}

export abstract class BaseController {
  protected device: HIDDeviceLike;
  model = 'undefined';
  finetuneMaxValue = 0;

  constructor(device: HIDDeviceLike) {
    this.device = device;
  }

  getModel(): string {
    return this.model;
  }

  getDevice(): HIDDeviceLike {
    return this.device;
  }

  abstract getInputConfig(): InputConfig;

  getFinetuneMaxValue(): number {
    if (!this.finetuneMaxValue) throw new Error('getFinetuneMaxValue() must be implemented by subclass');
    return this.finetuneMaxValue;
  }

  getNumberOfSticks(): number {
    return 0;
  }

  setInputReportHandler(handler: (event: HIDInputReportEvent) => void): void {
    this.device.oninputreport = handler;
  }

  allocReq(id: number, data: number[] = []): Uint8Array {
    const fr = this.device.collections[0]?.featureReports ?? [];
    const report = fr.find((e) => e.reportId === id)?.items?.[0];
    const maxLen = report?.reportCount ?? data.length;
    const len = Math.min(data.length, maxLen);
    const out = new Uint8Array(maxLen);
    out.set(data.slice(0, len));
    return out;
  }

  async sendFeatureReport(reportId: number, data: ArrayBuffer | number[] | Uint8Array): Promise<void> {
    if (Array.isArray(data)) {
      data = this.allocReq(reportId, data);
    }
    try {
      await this.device.sendFeatureReport(reportId, data as BufferSource);
    } catch (error) {
      throw new Error(error instanceof Error ? error.stack ?? error.message : String(error), { cause: error });
    }
  }

  async receiveFeatureReport(reportId: number): Promise<DataView> {
    return await this.device.receiveFeatureReport(reportId);
  }

  async close(): Promise<void> {
    if (this.device?.opened) {
      await this.device.close();
    }
  }

  abstract getSerialNumber(): Promise<string>;
  abstract getInfo(): Promise<ControllerInfo>;
  abstract flash(progressCallback?: ((p: number) => void) | null): Promise<{ success: boolean; message: string }>;
  abstract reset(): Promise<void>;
  abstract nvsLock(): Promise<CalibResult>;
  abstract nvsUnlock(): Promise<void>;
  abstract calibrateSticksBegin(): Promise<CalibResult>;
  abstract calibrateSticksSample(): Promise<CalibResult>;
  abstract calibrateSticksEnd(): Promise<CalibResult>;
  abstract calibrateRangeBegin(): Promise<CalibResult>;
  abstract calibrateRangeEnd(): Promise<CalibResult>;
  abstract parseBatteryStatus(data: DataView): BatteryStatus;
  abstract queryNvStatus(): Promise<NvStatus>;
  abstract getInMemoryModuleData(): Promise<number[] | null>;
  abstract writeFinetuneData(data: number[]): Promise<void>;

  async setAdaptiveTrigger(_left: AdaptiveTriggerConfig, _right: AdaptiveTriggerConfig): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'This controller does not support adaptive triggers' };
  }

  async setVibration(_heavyLeft = 0, _lightRight = 0): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'This controller does not support vibration' };
  }

  async setSpeakerTone(_output = 'speaker'): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'This controller does not support speaker audio' };
  }

  async resetSpeakerSettings(): Promise<void> {}

  async resetLights(): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'This controller does not support controllable lights' };
  }

  async setMuteLed(_mode: number): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'This controller does not support mute LED' };
  }

  async setLightbarColor(_r: number, _g: number, _b: number): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'This controller does not support lightbar colors' };
  }

  async setPlayerIndicator(_pattern: number): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'This controller does not support player indicators' };
  }

  getSupportedQuickTests(): string[] {
    return ['usb', 'buttons', 'adaptive', 'haptic', 'lights', 'speaker', 'headphone', 'microphone'];
  }
}
