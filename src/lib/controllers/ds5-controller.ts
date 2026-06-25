
// DualSense (DS5) controller implementation, ported from dualshock-tools.
import { BaseController } from './base-controller';
import type {
  InputConfig,
  BatteryStatus,
  NvStatus,
  CalibResult,
  ControllerInfo,
  InfoItem,
  AdaptiveTriggerConfig,
  HIDDeviceLike,
} from './base-controller';
import { sleep, buf2hex, dec2hex, dec2hex32, dec2hex8, formatMacFromView, reverseStr } from './utils';

const DS5_BUTTON_MAP = [
  { name: 'up', byte: 7, mask: 0x0 },
  { name: 'right', byte: 7, mask: 0x1 },
  { name: 'down', byte: 7, mask: 0x2 },
  { name: 'left', byte: 7, mask: 0x3 },
  { name: 'square', byte: 7, mask: 0x10, svg: 'Square' },
  { name: 'cross', byte: 7, mask: 0x20, svg: 'Cross' },
  { name: 'circle', byte: 7, mask: 0x40, svg: 'Circle' },
  { name: 'triangle', byte: 7, mask: 0x80, svg: 'Triangle' },
  { name: 'l1', byte: 8, mask: 0x01, svg: 'L1' },
  { name: 'l2', byte: 4, mask: 0xff },
  { name: 'r1', byte: 8, mask: 0x02, svg: 'R1' },
  { name: 'r2', byte: 5, mask: 0xff },
  { name: 'create', byte: 8, mask: 0x10, svg: 'Create' },
  { name: 'options', byte: 8, mask: 0x20, svg: 'Options' },
  { name: 'l3', byte: 8, mask: 0x40, svg: 'L3' },
  { name: 'r3', byte: 8, mask: 0x80, svg: 'R3' },
  { name: 'ps', byte: 9, mask: 0x01, svg: 'PS' },
  { name: 'touchpad', byte: 9, mask: 0x02, svg: 'Trackpad' },
  { name: 'mute', byte: 9, mask: 0x04, svg: 'Mute' },
];

const DS5_INPUT_CONFIG: InputConfig = {
  buttonMap: DS5_BUTTON_MAP,
  dpadByte: 7,
  l2AnalogByte: 4,
  r2AnalogByte: 5,
  touchpadOffset: 32,
};

const DS5_TRIGGER_EFFECT_MODE = {
  OFF: 0x00,
  RESISTANCE: 0x01,
  TRIGGER: 0x02,
  AUTO_TRIGGER: 0x06,
} as const;

const DS5_OUTPUT_REPORT = {
  USB_REPORT_ID: 0x02,
  BT_REPORT_ID: 0x31,
} as const;

const DS5_VALID_FLAG0 = {
  RIGHT_VIBRATION: 0x01,
  LEFT_VIBRATION: 0x02,
  LEFT_TRIGGER: 0x04,
  RIGHT_TRIGGER: 0x08,
  HEADPHONE_VOLUME: 0x10,
  SPEAKER_VOLUME: 0x20,
  MIC_VOLUME: 0x40,
  AUDIO_CONTROL: 0x80,
} as const;

const DS5_VALID_FLAG1 = {
  MUTE_LED: 0x01,
  POWER_SAVE_MUTE: 0x02,
  LIGHTBAR_COLOR: 0x04,
  PLAYER_INDICATOR: 0x10,
  LED_BRIGHTNESS: 0x20,
  LIGHTBAR_SETUP: 0x40,
} as const;

interface OutputState {
  validFlag0: number;
  validFlag1: number;
  validFlag2: number;
  bcVibrationRight: number;
  bcVibrationLeft: number;
  headphoneVolume: number;
  speakerVolume: number;
  micVolume: number;
  audioControl: number;
  audioControl2: number;
  muteLedControl: number;
  powerSaveMuteControl: number;
  lightbarSetup: number;
  ledBrightness: number;
  playerIndicator: number;
  ledCRed: number;
  ledCGreen: number;
  ledCBlue: number;
  adaptiveTriggerLeftMode: number;
  adaptiveTriggerLeftParam0: number;
  adaptiveTriggerLeftParam1: number;
  adaptiveTriggerLeftParam2: number;
  adaptiveTriggerRightMode: number;
  adaptiveTriggerRightParam0: number;
  adaptiveTriggerRightParam1: number;
  adaptiveTriggerRightParam2: number;
  hapticVolume: number;
}

function defaultOutputState(): OutputState {
  return {
    validFlag0: 0,
    validFlag1: 0,
    validFlag2: 0,
    bcVibrationRight: 0,
    bcVibrationLeft: 0,
    headphoneVolume: 0,
    speakerVolume: 0,
    micVolume: 0,
    audioControl: 0,
    audioControl2: 0,
    muteLedControl: 0,
    powerSaveMuteControl: 0,
    lightbarSetup: 0,
    ledBrightness: 0,
    playerIndicator: 0,
    ledCRed: 0,
    ledCGreen: 0,
    ledCBlue: 0,
    adaptiveTriggerLeftMode: 0,
    adaptiveTriggerLeftParam0: 0,
    adaptiveTriggerLeftParam1: 0,
    adaptiveTriggerLeftParam2: 0,
    adaptiveTriggerRightMode: 0,
    adaptiveTriggerRightParam0: 0,
    adaptiveTriggerRightParam1: 0,
    adaptiveTriggerRightParam2: 0,
    hapticVolume: 0,
  };
}

class DS5OutputStruct {
  buffer: ArrayBuffer;
  view: DataView;
  state: OutputState;

  constructor(currentState: Partial<OutputState> = {}) {
    this.buffer = new ArrayBuffer(47);
    this.view = new DataView(this.buffer);
    this.state = { ...defaultOutputState(), ...currentState };
  }

  pack(): ArrayBuffer {
    const s = this.state;
    const v = this.view;
    v.setUint16(0, (s.validFlag1 << 8) | s.validFlag0, true);
    v.setUint8(2, s.bcVibrationRight);
    v.setUint8(3, s.bcVibrationLeft);
    v.setUint8(4, s.headphoneVolume);
    v.setUint8(5, s.speakerVolume);
    v.setUint8(6, s.micVolume);
    v.setUint8(7, s.audioControl);
    v.setUint8(8, s.muteLedControl);
    v.setUint8(9, 0);
    v.setUint8(10, s.adaptiveTriggerRightMode);
    v.setUint8(11, s.adaptiveTriggerRightParam0);
    v.setUint8(12, s.adaptiveTriggerRightParam1);
    v.setUint8(13, s.adaptiveTriggerRightParam2);
    for (let i = 14; i <= 20; i++) v.setUint8(i, 0);
    v.setUint8(21, s.adaptiveTriggerLeftMode);
    v.setUint8(22, s.adaptiveTriggerLeftParam0);
    v.setUint8(23, s.adaptiveTriggerLeftParam1);
    v.setUint8(24, s.adaptiveTriggerLeftParam2);
    for (let i = 25; i <= 31; i++) v.setUint8(i, 0);
    for (let i = 32; i <= 42; i++) v.setUint8(i, 0);
    v.setUint8(43, s.playerIndicator);
    v.setUint8(44, s.ledCRed);
    v.setUint8(45, s.ledCGreen);
    v.setUint8(46, s.ledCBlue);
    return this.buffer;
  }
}

function ds5Color(serialNumber: string): string {
  const colorMap: Record<string, string> = {
    '00': 'White',
    '01': 'Midnight Black',
    '02': 'Cosmic Red',
    '03': 'Nova Pink',
    '04': 'Galactic Purple',
    '05': 'Starlight Blue',
    '06': 'Grey Camouflage',
    '07': 'Volcanic Red',
    '08': 'Sterling Silver',
    '09': 'Cobalt Blue',
    '10': 'Chroma Teal',
    '11': 'Chroma Indigo',
    '12': 'Chroma Pearl',
    '30': '30th Anniversary',
    Z1: 'God of War Ragnarok',
    Z2: 'Spider-Man 2',
    Z3: 'Astro Bot',
    Z4: 'Fortnite',
    Z6: 'The Last of Us',
    ZB: 'Icon Blue Limited Edition',
  };
  const colorCode = serialNumber.slice(4, 6);
  return colorMap[colorCode] ?? 'Unknown';
}

export class DS5Controller extends BaseController {
  currentOutputState: OutputState;

  constructor(device: HIDDeviceLike) {
    super(device);
    this.model = 'DS5';
    this.finetuneMaxValue = 65535;
    this.currentOutputState = defaultOutputState();
  }

  getInputConfig(): InputConfig {
    return DS5_INPUT_CONFIG;
  }

  getNumberOfSticks(): number {
    return 2;
  }

  async sendOutputReport(data: ArrayBuffer, _reason = ''): Promise<void> {
    if (!this.device?.opened) throw new Error('Device is not opened');
    await this.device.sendReport(DS5_OUTPUT_REPORT.USB_REPORT_ID, new Uint8Array(data));
  }

  updateCurrentOutputState(outputStruct: DS5OutputStruct): void {
    this.currentOutputState = { ...outputStruct.state };
  }

  async initializeCurrentOutputState(): Promise<void> {
    try {
      this.currentOutputState = {
        ...this.currentOutputState,
        validFlag1: 0b1111_0111,
        ledCRed: 0,
        ledCGreen: 0,
        ledCBlue: 255,
      };
      const resetOutputStruct = new DS5OutputStruct(this.currentOutputState);
      await this.sendOutputReport(resetOutputStruct.pack(), 'init default states');
      this.updateCurrentOutputState(resetOutputStruct);
    } catch (error) {
      console.warn('Failed to initialize DS5 output state:', error);
    }
  }

  async getSerialNumber(): Promise<string> {
    return await this.getSystemInfo(1, 19, 17);
  }

  async getInfo(): Promise<ControllerInfo> {
    return this._getInfo(false);
  }

  async _getInfo(_isEdge: boolean): Promise<ControllerInfo> {
    try {
      const view = await this.receiveFeatureReport(0x20);
      const cmd = view.getUint8(0);
      if (cmd != 0x20 || view.buffer.byteLength != 64) {
        return { ok: false, error: new Error('Invalid response for ds5_info'), disable_bits: 1 };
      }

      const buildDate = new TextDecoder().decode(view.buffer.slice(1, 1 + 11));
      const buildTime = new TextDecoder().decode(view.buffer.slice(12, 20));
      const fwtype = view.getUint16(20, true);
      const swseries = view.getUint16(22, true);
      const hwinfo = view.getUint32(24, true);
      const fwversion = view.getUint32(28, true);
      const updversion = view.getUint16(44, true);
      const unk = view.getUint8(46);
      const fwversion1 = view.getUint32(48, true);
      const fwversion2 = view.getUint32(52, true);
      const fwversion3 = view.getUint32(56, true);

      const serialNumber = await this.getSystemInfo(1, 19, 17);
      const color = ds5Color(serialNumber);
      const infoItems: InfoItem[] = [
        { key: 'Serial Number', value: serialNumber, cat: 'hw', copyable: true },
        { key: 'MCU Unique ID', value: await this.getSystemInfo(1, 9, 9, false), cat: 'hw', isExtra: true, copyable: true },
        { key: 'PCBA ID', value: reverseStr(await this.getSystemInfo(1, 17, 14)), cat: 'hw', isExtra: true },
        { key: 'Battery Barcode', value: await this.getSystemInfo(1, 24, 23), cat: 'hw', isExtra: true, copyable: true },
        { key: 'VCM Left Barcode', value: await this.getSystemInfo(1, 26, 16), cat: 'hw', isExtra: true, copyable: true },
        { key: 'VCM Right Barcode', value: await this.getSystemInfo(1, 28, 16), cat: 'hw', isExtra: true, copyable: true },
        { key: 'Color', value: color, cat: 'hw', copyable: true },
        { key: 'Board Model', value: this.hwToBoardModel(hwinfo), cat: 'hw', copyable: true },
        { key: 'FW Build Date', value: buildDate + ' ' + buildTime, cat: 'fw' },
        { key: 'FW Type', value: '0x' + dec2hex(fwtype), cat: 'fw', isExtra: true },
        { key: 'FW Series', value: '0x' + dec2hex(swseries), cat: 'fw', isExtra: true },
        { key: 'HW Model', value: '0x' + dec2hex32(hwinfo), cat: 'hw', isExtra: true },
        { key: 'FW Version', value: '0x' + dec2hex32(fwversion), cat: 'fw', isExtra: true },
        { key: 'FW Update', value: '0x' + dec2hex(updversion), cat: 'fw', isExtra: true },
        { key: 'FW Update Info', value: '0x' + dec2hex8(unk), cat: 'fw', isExtra: true },
        { key: 'SBL FW Version', value: '0x' + dec2hex32(fwversion1), cat: 'fw', isExtra: true },
        { key: 'Venom FW Version', value: '0x' + dec2hex32(fwversion2), cat: 'fw', isExtra: true },
        { key: 'Spider FW Version', value: '0x' + dec2hex32(fwversion3), cat: 'fw', isExtra: true },
        { key: 'Touchpad ID', value: await this.getSystemInfo(5, 2, 8, false), cat: 'hw', isExtra: true, copyable: true },
        { key: 'Touchpad FW Version', value: await this.getSystemInfo(5, 4, 8, false), cat: 'fw', isExtra: true },
      ];

      let disableBits = 0;
      if (buildDate.search(/ 2020| 2021/) != -1) disableBits |= 2;

      const nv = await this.queryNvStatus();
      const bdAddr = await this.getBdAddr();
      infoItems.push({ key: 'Bluetooth Address', value: bdAddr, cat: 'hw', isExtra: true });

      const pendingReboot = nv?.status === 'pending_reboot';
      return { ok: true, infoItems, nv, disable_bits: disableBits, pending_reboot: pendingReboot };
    } catch (error) {
      return { ok: false, error, disable_bits: 1 };
    }
  }

  async flash(_progressCallback: ((p: number) => void) | null = null): Promise<{ success: boolean; message: string }> {
    try {
      await this.nvsUnlock();
      const lockRes = await this.nvsLock();
      if (!lockRes.ok) throw lockRes.error ?? new Error('NVS lock failed');
      return { success: true, message: 'Changes saved successfully' };
    } catch (error) {
      throw new Error('Error while saving changes', { cause: error });
    }
  }

  async reset(): Promise<void> {
    try {
      await this.sendFeatureReport(0x80, [1, 1]);
    } catch {
      // ignore
    }
  }

  async nvsLock(): Promise<CalibResult> {
    try {
      await this.sendFeatureReport(0x80, [3, 1]);
      await this.receiveFeatureReport(0x81);
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async nvsUnlock(): Promise<void> {
    try {
      await this.sendFeatureReport(0x80, [3, 2, 101, 50, 64, 12]);
      await this.receiveFeatureReport(0x81);
    } catch (error) {
      await sleep(500);
      throw new Error('NVS Unlock failed', { cause: error });
    }
  }

  async getBdAddr(): Promise<string> {
    await this.sendFeatureReport(0x80, [9, 2]);
    const data = await this.receiveFeatureReport(0x81);
    return formatMacFromView(data, 4);
  }

  async getSystemInfo(base: number, num: number, length: number, decode = true): Promise<string> {
    await this.sendFeatureReport(128, [base, num]);
    const pcbaId = await this.receiveFeatureReport(129);
    if (pcbaId.getUint8(1) != base || pcbaId.getUint8(2) != num || pcbaId.getUint8(3) != 2) {
      return 'error';
    }
    if (decode) return new TextDecoder().decode(pcbaId.buffer.slice(4, 4 + length) as ArrayBuffer);
    return buf2hex(pcbaId.buffer.slice(4, 4 + length) as ArrayBuffer);
  }

  async calibrateSticksBegin(): Promise<CalibResult> {
    try {
      await this.sendFeatureReport(0x82, [1, 1, 1]);
      const data = await this.receiveFeatureReport(0x83);
      if (data.getUint32(0, false) != 0x83010101) {
        throw new Error(`Stick center calibration begin failed: ${dec2hex32(data.getUint32(0, false))}`);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async calibrateSticksSample(): Promise<CalibResult> {
    try {
      await this.sendFeatureReport(0x82, [3, 1, 1]);
      const data = await this.receiveFeatureReport(0x83);
      if (data.getUint32(0, false) != 0x83010101) {
        throw new Error(`Stick center calibration sample failed: ${dec2hex32(data.getUint32(0, false))}`);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async calibrateSticksEnd(): Promise<CalibResult> {
    try {
      await this.sendFeatureReport(0x82, [2, 1, 1]);
      const data = await this.receiveFeatureReport(0x83);
      if (data.getUint32(0, false) != 0x83010102) {
        throw new Error(`Stick center calibration end failed: ${dec2hex32(data.getUint32(0, false))}`);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async calibrateRangeBegin(): Promise<CalibResult> {
    try {
      await this.sendFeatureReport(0x82, [1, 1, 2]);
      const data = await this.receiveFeatureReport(0x83);
      if (data.getUint32(0, false) != 0x83010201) {
        throw new Error(`Stick range calibration begin failed: ${dec2hex32(data.getUint32(0, false))}`);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async calibrateRangeEnd(): Promise<CalibResult> {
    try {
      await this.sendFeatureReport(0x82, [2, 1, 2]);
      const data = await this.receiveFeatureReport(0x83);
      if (data.getUint32(0, false) != 0x83010202) {
        throw new Error(`Stick range calibration end failed: ${dec2hex32(data.getUint32(0, false))}`);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async queryNvStatus(): Promise<NvStatus> {
    try {
      await this.sendFeatureReport(0x80, [3, 3]);
      const data = await this.receiveFeatureReport(0x81);
      const ret = data.getUint32(1, false);
      if (ret === 0x15010100) return { device: 'ds5', status: 'pending_reboot', locked: null, code: 4, raw: ret };
      if (ret === 0x03030201) return { device: 'ds5', status: 'locked', locked: true, mode: 'temporary', code: 1, raw: ret } as NvStatus;
      if (ret === 0x03030200) return { device: 'ds5', status: 'unlocked', locked: false, mode: 'permanent', code: 0, raw: ret } as NvStatus;
      if (ret === 1 || ret === 2) return { device: 'ds5', status: 'unknown', locked: null, code: 2, raw: ret };
      return { device: 'ds5', status: 'unknown', locked: null, code: ret, raw: ret };
    } catch (error) {
      return { device: 'ds5', status: 'error', locked: null, code: 2, raw: 0, error } as NvStatus;
    }
  }

  hwToBoardModel(hwVer: number): string {
    const a = (hwVer >> 8) & 0xff;
    if (a == 0x03) return 'BDM-010';
    if (a == 0x04) return 'BDM-020';
    if (a == 0x05) return 'BDM-030';
    if (a == 0x06) return 'BDM-040';
    if (a == 0x07 || a == 0x08) return 'BDM-050';
    if (a == 0x11) return 'BDM-060M';
    if (a == 0x13) return 'BDM-060X';
    return 'Unknown';
  }

  async getInMemoryModuleData(): Promise<number[] | null> {
    await this.sendFeatureReport(0x80, [12, 2]);
    await sleep(100);
    const data = await this.receiveFeatureReport(0x81);
    const cmd = data.getUint8(0);
    const [p1, p2, p3] = [1, 2, 3].map((i) => data.getUint8(i));
    if (cmd != 129 || p1 != 12 || (p2 != 2 && p2 != 4) || p3 != 2) return null;
    return Array.from({ length: 12 }, (_, i) => data.getUint16(4 + i * 2, true));
  }

  async writeFinetuneData(data: number[]): Promise<void> {
    const pkg = data.reduce((acc: number[], val) => acc.concat([val & 0xff, val >> 8]), [12, 1]);
    await this.sendFeatureReport(0x80, pkg);
  }

  async setAdaptiveTrigger(left: AdaptiveTriggerConfig, right: AdaptiveTriggerConfig): Promise<{ success: boolean; message: string }> {
    try {
      const modeMap: Record<string, number> = {
        off: DS5_TRIGGER_EFFECT_MODE.OFF,
        single: DS5_TRIGGER_EFFECT_MODE.TRIGGER,
        auto: DS5_TRIGGER_EFFECT_MODE.AUTO_TRIGGER,
        resistance: DS5_TRIGGER_EFFECT_MODE.RESISTANCE,
      };
      const { validFlag0 } = this.currentOutputState;
      const outputStruct = new DS5OutputStruct({
        ...this.currentOutputState,
        adaptiveTriggerLeftMode: modeMap[left.mode],
        adaptiveTriggerLeftParam0: left.start,
        adaptiveTriggerLeftParam1: left.end,
        adaptiveTriggerLeftParam2: left.force,
        adaptiveTriggerRightMode: modeMap[right.mode],
        adaptiveTriggerRightParam0: right.start,
        adaptiveTriggerRightParam1: right.end,
        adaptiveTriggerRightParam2: right.force,
        validFlag0: validFlag0 | DS5_VALID_FLAG0.LEFT_TRIGGER | DS5_VALID_FLAG0.RIGHT_TRIGGER,
      });
      await this.sendOutputReport(outputStruct.pack(), 'set adaptive trigger mode');
      outputStruct.state.validFlag0 &= ~(DS5_VALID_FLAG0.LEFT_TRIGGER | DS5_VALID_FLAG0.RIGHT_TRIGGER);
      this.updateCurrentOutputState(outputStruct);
      return { success: true, message: '' };
    } catch (error) {
      throw new Error('Failed to set adaptive trigger mode', { cause: error });
    }
  }

  async setVibration(heavyLeft = 0, lightRight = 0): Promise<{ success: boolean; message: string }> {
    try {
      const { validFlag0 } = this.currentOutputState;
      const outputStruct = new DS5OutputStruct({
        ...this.currentOutputState,
        bcVibrationLeft: Math.max(0, Math.min(255, heavyLeft)),
        bcVibrationRight: Math.max(0, Math.min(255, lightRight)),
        validFlag0: validFlag0 | DS5_VALID_FLAG0.LEFT_VIBRATION | DS5_VALID_FLAG0.RIGHT_VIBRATION,
      });
      await this.sendOutputReport(outputStruct.pack(), 'set vibration');
      outputStruct.state.validFlag0 &= ~(DS5_VALID_FLAG0.LEFT_VIBRATION | DS5_VALID_FLAG0.RIGHT_VIBRATION);
      this.updateCurrentOutputState(outputStruct);
      return { success: true, message: '' };
    } catch (error) {
      throw new Error('Failed to set vibration', { cause: error });
    }
  }

  async setSpeakerTone(output = 'speaker'): Promise<{ success: boolean; message: string }> {
    try {
      const { validFlag0 } = this.currentOutputState;
      const outputStruct = new DS5OutputStruct({
        ...this.currentOutputState,
        speakerVolume: 85,
        headphoneVolume: 55,
        validFlag0: validFlag0 | DS5_VALID_FLAG0.HEADPHONE_VOLUME | DS5_VALID_FLAG0.SPEAKER_VOLUME | DS5_VALID_FLAG0.AUDIO_CONTROL,
      });
      await this.sendOutputReport(outputStruct.pack(), output === 'headphones' ? 'play headphone tone' : 'play speaker tone');
      outputStruct.state.validFlag0 &= ~(DS5_VALID_FLAG0.HEADPHONE_VOLUME | DS5_VALID_FLAG0.SPEAKER_VOLUME | DS5_VALID_FLAG0.AUDIO_CONTROL);
      if (output === 'headphones') {
        await this.sendFeatureReport(128, [6, 4, 0, 0, 0, 0, 4, 0, 6]);
        await this.sendFeatureReport(128, [6, 2, 1, 1, 0]);
      } else {
        await this.sendFeatureReport(128, [6, 4, 0, 0, 8]);
        await this.sendFeatureReport(128, [6, 2, 1, 1, 0]);
      }
      this.updateCurrentOutputState(outputStruct);
      return { success: true, message: '' };
    } catch (error) {
      throw new Error('Failed to set speaker tone', { cause: error });
    }
  }

  async resetSpeakerSettings(): Promise<void> {
    try {
      await this.sendFeatureReport(128, [6, 2, 0, 1, 0]);
      const { validFlag0 } = this.currentOutputState;
      const outputStruct = new DS5OutputStruct({
        ...this.currentOutputState,
        speakerVolume: 0,
        validFlag0: validFlag0 | DS5_VALID_FLAG0.SPEAKER_VOLUME | DS5_VALID_FLAG0.AUDIO_CONTROL,
      });
      await this.sendOutputReport(outputStruct.pack(), 'stop speaker tone');
      outputStruct.state.validFlag0 &= ~(DS5_VALID_FLAG0.SPEAKER_VOLUME | DS5_VALID_FLAG0.AUDIO_CONTROL);
      this.updateCurrentOutputState(outputStruct);
    } catch (error) {
      throw new Error('Failed to reset speaker settings', { cause: error });
    }
  }

  async setLightbarColor(red = 0, green = 0, blue = 0): Promise<{ success: boolean; message: string }> {
    try {
      const { validFlag1 } = this.currentOutputState;
      const outputStruct = new DS5OutputStruct({
        ...this.currentOutputState,
        ledCRed: Math.max(0, Math.min(255, red)),
        ledCGreen: Math.max(0, Math.min(255, green)),
        ledCBlue: Math.max(0, Math.min(255, blue)),
        validFlag1: validFlag1 | DS5_VALID_FLAG1.LIGHTBAR_COLOR,
      });
      await this.sendOutputReport(outputStruct.pack(), 'set lightbar color');
      outputStruct.state.validFlag1 &= ~DS5_VALID_FLAG1.LIGHTBAR_COLOR;
      this.updateCurrentOutputState(outputStruct);
      return { success: true, message: '' };
    } catch (error) {
      throw new Error('Failed to set lightbar color', { cause: error });
    }
  }

  async setPlayerIndicator(pattern = 0): Promise<{ success: boolean; message: string }> {
    try {
      const { validFlag1 } = this.currentOutputState;
      const outputStruct = new DS5OutputStruct({
        ...this.currentOutputState,
        playerIndicator: Math.max(0, Math.min(31, pattern)),
        validFlag1: validFlag1 | DS5_VALID_FLAG1.PLAYER_INDICATOR,
      });
      await this.sendOutputReport(outputStruct.pack(), 'set player indicator');
      outputStruct.state.validFlag1 &= ~DS5_VALID_FLAG1.PLAYER_INDICATOR;
      this.updateCurrentOutputState(outputStruct);
      return { success: true, message: '' };
    } catch (error) {
      throw new Error('Failed to set player indicator', { cause: error });
    }
  }

  async setMuteLed(state = 0): Promise<{ success: boolean; message: string }> {
    try {
      const { validFlag1 } = this.currentOutputState;
      const outputStruct = new DS5OutputStruct({
        ...this.currentOutputState,
        muteLedControl: Math.max(0, Math.min(2, state)),
        validFlag1: validFlag1 | DS5_VALID_FLAG1.MUTE_LED,
      });
      await this.sendOutputReport(outputStruct.pack(), 'set mute LED');
      outputStruct.state.validFlag1 &= ~DS5_VALID_FLAG1.MUTE_LED;
      this.updateCurrentOutputState(outputStruct);
      return { success: true, message: '' };
    } catch (error) {
      throw new Error('Failed to set mute LED', { cause: error });
    }
  }

  async resetLights(): Promise<{ success: boolean; message: string }> {
    try {
      await this.setLightbarColor(0, 0, 0);
      await this.setPlayerIndicator(0);
      await this.setMuteLed(0);
      return { success: true, message: '' };
    } catch (error) {
      throw new Error('Failed to reset lights', { cause: error });
    }
  }

  parseBatteryStatus(data: DataView): BatteryStatus {
    const bat = data.getUint8(52);
    const batCharge = bat & 0x0f;
    const batStatus = bat >> 4;
    let chargeLevel = 0;
    let cableConnected = false;
    let isCharging = false;
    let isError = false;
    switch (batStatus) {
      case 0:
        chargeLevel = Math.min(batCharge * 10 + 5, 100);
        break;
      case 1:
        chargeLevel = Math.min(batCharge * 10 + 5, 100);
        isCharging = true;
        cableConnected = true;
        break;
      case 2:
        chargeLevel = 100;
        cableConnected = true;
        break;
      case 15:
        chargeLevel = 0;
        isCharging = true;
        cableConnected = true;
        break;
      case 11:
      default:
        isError = true;
        break;
    }
    return { charge_level: chargeLevel, cable_connected: cableConnected, is_charging: isCharging, is_error: isError };
  }
}
