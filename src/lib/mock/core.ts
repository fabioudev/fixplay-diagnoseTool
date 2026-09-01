// Mock replacement for '@tauri-apps/api/core'.
// Returns fake data for every command the frontend invokes, so the UI can be
// exercised in a plain browser without the Tauri Rust backend or hardware.
// Only active in MOCK mode via the vite alias; the Tauri build is unaffected.
//
// Every fake value is read from the reactive `mockState` store (./state.ts) so
// the MockPanel can change it at runtime — edits apply to the next invoke().
import { emitLocal, delay, settingsStore } from './_shared';
import { getMockState } from './state';
import type { MockControllerInput } from './state';
import type {
  DeviceInfo,
  FlashReadResult,
  SerialArchive,
  ErrorSearchResult,
  FlashPreviewResult,
  AppSettings,
  UartPortInfo,
  UartPollResult,
  I2cPortInfo,
  I2cErrlogEntry,
  I2cInfo,
  I2cPollResult,
  I2cErrorSearchResult,
} from '../api/types';
import type { HidDeviceInfo, HidPollResult } from '../controllers/tauri-hid-device';

const warn = (cmd: string) =>
  console.warn(`[mock] invoke('${cmd}') has no fake handler — returning undefined`);

/**
 * Build a 64-byte DualSense USB input-report body (report id stripped) from the
 * simulated controller state, mirroring the byte layout the real DS5 emits and
 * the ControllerManager parses: sticks @0-3, L2/R2 @4/5, dpad+face @7,
 * shoulder/misc @8, ps/touch/mute @9, battery @52.
 */
function buildDs5InputReport(input: MockControllerInput): number[] {
  const r = new Array<number>(64).fill(0);
  const axis = (v: number) => Math.round(((Math.max(-1, Math.min(1, v)) + 1) / 2) * 255);
  r[0] = axis(input.lx);
  r[1] = axis(input.ly);
  r[2] = axis(input.rx);
  r[3] = axis(input.ry);
  r[4] = Math.max(0, Math.min(255, Math.round(input.l2)));
  r[5] = Math.max(0, Math.min(255, Math.round(input.r2)));

  const b = input.buttons;
  // D-pad hat (low nibble of byte 7): 0=U 1=UR 2=R 3=DR 4=D 5=DL 6=L 7=UL 8=neutral
  const up = !!b.up;
  const down = !!b.down;
  const left = !!b.left;
  const right = !!b.right;
  let hat = 8;
  if (up && left) hat = 7;
  else if (up && right) hat = 1;
  else if (down && left) hat = 5;
  else if (down && right) hat = 3;
  else if (up) hat = 0;
  else if (right) hat = 2;
  else if (down) hat = 4;
  else if (left) hat = 6;
  r[7] =
    hat |
    (b.square ? 0x10 : 0) |
    (b.cross ? 0x20 : 0) |
    (b.circle ? 0x40 : 0) |
    (b.triangle ? 0x80 : 0);

  r[8] =
    (b.l1 ? 0x01 : 0) |
    (b.r1 ? 0x02 : 0) |
    (b.create ? 0x10 : 0) |
    (b.options ? 0x20 : 0) |
    (b.l3 ? 0x40 : 0) |
    (b.r3 ? 0x80 : 0);

  r[9] = (b.ps ? 0x01 : 0) | (b.touchpad ? 0x02 : 0) | (b.mute ? 0x04 : 0);

  // Battery @52: status<<4 | charge. status 0=discharge, 1=charging, 2=complete.
  const charge = Math.max(0, Math.min(10, Math.floor(input.battery / 10)));
  let status = 0;
  if (input.battery >= 100) status = 2;
  else if (input.charging) status = 1;
  r[52] = (status << 4) | charge;

  // IMU at rest (#56): accel Z = 1 g (8192 raw = 0x2000, little-endian at
  // struct offset 25 → low byte 25, high byte 26) so the dev-mode IMU
  // visualizer shows a realistic rest state instead of zeros.
  r[25] = 0x00;
  r[26] = 0x20;

  // Touchpad touch points (#57): two 4-byte points at touchpad offset 32.
  // Layout (mirrors ControllerManager._parseTouchPoints): byte0 = active flag
  // (bit7 set = NOT active) | finger id (low 7 bits); byte1 = x low;
  // byte2 = (x high nibble) | (y high nibble << 4); byte3 = y low.
  // x: 0..1919 (12-bit), y: 0..941 (11-bit).
  const tp = input.touchPoints ?? [];
  for (let i = 0; i < 2; i++) {
    const p = tp[i] ?? { active: false, x: 0, y: 0 };
    const base = 32 + i * 4;
    const cx = Math.max(0, Math.min(1919, Math.round(p.x)));
    const cy = Math.max(0, Math.min(941, Math.round(p.y)));
    r[base] = (p.active ? 0x00 : 0x80) | (i & 0x7f);
    r[base + 1] = cx & 0xff;
    r[base + 2] = ((cx >> 8) & 0x0f) | ((cy >> 4) & 0xf0);
    r[base + 3] = cy & 0xff;
  }

  return r;
}

async function flashReadSequence(): Promise<FlashReadResult> {
  const s = getMockState();
  // Simulate the read1 / read2 progress events the real backend emits.
  for (let pct = 0; pct <= 100; pct += 10) {
    emitLocal('flash://progress', { phase: 'read1', percent: pct });
    await delay(s.flash.read_step_ms);
  }
  for (let pct = 0; pct <= 100; pct += 10) {
    emitLocal('flash://progress', { phase: 'read2', percent: pct });
    await delay(s.flash.read_step_ms);
  }
  const serial = s.flash.nvs.serial;
  const result: FlashReadResult = {
    dumps_match: s.flash.dumps_match,
    validation: { ...s.flash.validation },
    nvs: { ...s.flash.nvs },
    archive_path: `/mock/archive/${serial}/2026-07-01_read.bin`,
  };
  emitLocal('flash://status', {
    message: 'NOR-Dump erfolgreich gelesen und archiviert.',
    level: 'info',
  });
  emitLocal('flash://result', result);
  return result;
}

async function flashWriteSequence(): Promise<void> {
  const s = getMockState();
  for (let pct = 0; pct <= 100; pct += 10) {
    emitLocal('flash://progress', { phase: 'write', percent: pct });
    await delay(s.flash.write_step_ms);
  }
  emitLocal('flash://status', {
    message: 'Schreiben abgeschlossen, starte Verify …',
    level: 'info',
  });
  for (let pct = 0; pct <= 100; pct += 10) {
    emitLocal('flash://progress', { phase: 'verify', percent: pct });
    await delay(s.flash.verify_step_ms);
  }
  emitLocal('flash://status', {
    message: 'Verify OK — NOR erfolgreich beschrieben.',
    level: 'info',
  });
}

const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown> | unknown> = {
  // --- flash ---
  scan_devices: () => {
    const s = getMockState();
    return <DeviceInfo[]>s.flash.devices;
  },
  flash_list_programmers: () => {
    const s = getMockState();
    return <string[]>s.flash.programmers;
  },
  flash_read: () => flashReadSequence(),
  flash_write: () => flashWriteSequence(),
  flash_validate_file: (args) => {
    const s = getMockState();
    return <FlashPreviewResult>{
      path: String(args?.path ?? '/mock/dump.bin'),
      size_bytes: 2 * 1024 * 1024,
      validation: { ...s.flash.validation },
      nvs: { ...s.flash.nvs },
    };
  },
  open_path: (args) => {
    console.log(`[mock] open_path(${args?.path}) — no-op in browser`);
  },
  save_text_file: (args) => {
    const len = (args?.content as string | undefined)?.length ?? 0;
    console.log(`[mock] save_text_file(${args?.path}, ${len} bytes) — no-op in browser`);
  },
  app_data_dir_path: () => {
    return '/mock/app-data';
  },

  // --- archive ---
  archive_list_dumps: () => {
    const s = getMockState();
    return <SerialArchive[]>s.flash.archive;
  },
  archive_delete_dump: (args) => {
    console.log(`[mock] archive_delete_dump(${args?.binPath}) — no-op in browser`);
  },
  flash_free_disk_space: () => {
    // Mock: 12 GiB free of a 256 GiB volume — plenty for NOR dumps.
    return { free_bytes: 12 * 1024 * 1024 * 1024, total_bytes: 256 * 1024 * 1024 * 1024 };
  },

  // --- uart ---
  uart_list_ports: () => {
    const s = getMockState();
    return <UartPortInfo[]>s.uart.ports;
  },
  uart_connect: async () => {
    await delay(150);
  },
  uart_disconnect: () => {},
  uart_send_errlog: async () => {
    await delay(120);
    emitLocal('uart://status', { message: 'errlog gesendet', level: 'info' });
  },
  uart_send_version: async () => {
    await delay(120);
  },
  uart_send_raw: async (args) => {
    // Mock raw terminal: echo the sent line back as a received line so the
    // terminal shows the round-trip in dev mode (real devices mirror input).
    await delay(60);
    const line = String(args?.line ?? '');
    if (line) {
      emitLocal('uart://status', { message: `↩ ${line}`, level: 'info' });
    }
  },
  uart_clear_errlog: () => {},
  uart_set_auto_poll: () => {},
  uart_set_auto_reconnect: () => {},
  uart_update_error_db: async () => {
    await delay(400);
    emitLocal('uart://db-status', { count: 1280, status: 'cached' });
    return 1280;
  },
  uart_get_db_info: () => {
    const s = getMockState();
    return <number | null>s.uart.db_count;
  },
  uart_poll: () => {
    const s = getMockState();
    return <UartPollResult>{
      connected: s.uart.connected,
      reconnecting: s.uart.reconnecting,
      lines: [...s.uart.lines],
      entries: s.uart.entries.map((e) => ({ ...e, entry: { ...e.entry } })),
      db_count: s.uart.db_count,
      dropped_lines: 0,
    };
  },
  uart_loopback_test: async () => {
    await delay(200);
    return getMockState().uart.loopback_ok;
  },
  uart_search_error_db: (args) => {
    const s = getMockState();
    const query = String(args?.query ?? '');
    return <ErrorSearchResult[]>s.uart.search_results.map((r) => ({
      ...r,
      description: r.description.replace('{query}', query),
    }));
  },

  // --- settings ---
  settings_get: () => ({ ...settingsStore }) as AppSettings,
  settings_save: (args) => {
    Object.assign(settingsStore, args?.settings);
  },

  // --- hid / controller ---
  hid_connect: async (args) => {
    await delay(100);
    console.log(`[mock] hid_connect(vid=${args?.vendorId}, pid=${args?.productId})`);
  },
  hid_disconnect: () => {},
  hid_list_devices: () => {
    const s = getMockState();
    return <HidDeviceInfo[]>s.hid.devices;
  },
  hid_send_feature_report: () => {},
  hid_receive_feature_report: (args) => {
    const len = Number(args?.length ?? 64);
    return Array.from({ length: len }, (_, i) => i % 256);
  },
  hid_send_output_report: () => {},
  hid_poll: () => {
    const s = getMockState();
    return <HidPollResult>{
      connected: s.hid.connected,
      reports: s.hid.connected ? [{ report_id: 1, data: buildDs5InputReport(s.hid.input) }] : [],
      dropped_reports: 0,
    };
  },

  // --- i2c / Pico bridge / Xbox error-DB ---
  i2c_list_ports: () => {
    const s = getMockState();
    return <I2cPortInfo[]>s.i2c.ports;
  },
  i2c_connect: async () => {
    await delay(120);
  },
  i2c_disconnect: () => {},
  i2c_scan: () => {
    const s = getMockState();
    return <number[]>[...s.i2c.scan_results];
  },
  i2c_read: (args) => {
    const len = Number(args?.len ?? 16);
    return <number[]>Array.from({ length: len }, (_, i) => (i % 17 === 0 ? 0xff : i & 0xff));
  },
  i2c_write: () => {},
  i2c_read_eeprom: (args) => {
    const len = Number(args?.len ?? 256);
    return <number[]>Array.from({ length: len }, (_, i) => (i * 7 + 3) & 0xff);
  },
  i2c_errlog: () => {
    const s = getMockState();
    return <I2cErrlogEntry[]>s.i2c.errlog.map((e) => ({ ...e }));
  },
  i2c_info: () => {
    const s = getMockState();
    return <I2cInfo | null>(s.i2c.info ? { ...s.i2c.info } : null);
  },
  i2c_poll: () => {
    const s = getMockState();
    return <I2cPollResult>{
      connected: s.i2c.connected,
      db_count: s.i2c.db_count,
    };
  },
  i2c_update_xbox_db: async () => {
    await delay(400);
    emitLocal('i2c://db-status', { count: 960, status: 'cached' });
    return 960;
  },
  i2c_get_db_info: () => {
    const s = getMockState();
    return <number | null>s.i2c.db_count;
  },
  i2c_search_xbox_db: (args) => {
    const s = getMockState();
    const query = String(args?.query ?? '');
    return <I2cErrorSearchResult[]>s.i2c.search_results.map((r) => ({
      ...r,
      description: r.description.replace('{query}', query),
    }));
  },
};

/** Drop-in replacement for Tauri's `invoke`. */
export async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // Error injection: if the MockPanel armed an error for this command, reject
  // with the configured message so the UI's error handling is exercised.
  const err = getMockState().errors[cmd];
  if (err) {
    throw new Error(err);
  }
  const handler = handlers[cmd];
  if (!handler) {
    warn(cmd);
    return undefined as T;
  }
  const result = await handler(args ?? {});
  return result as T;
}
