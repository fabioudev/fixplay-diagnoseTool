// Mock replacement for '@tauri-apps/api/core'.
// Returns fake data for every command the frontend invokes, so the UI can be
// exercised in a plain browser without the Tauri Rust backend or hardware.
// Only active in MOCK mode via the vite alias; the Tauri build is unaffected.
//
// Every fake value is read from the reactive `mockState` store (./state.ts) so
// the MockPanel can change it at runtime — edits apply to the next invoke().
import { emitLocal, delay, settingsStore } from './_shared';
import { getMockState } from './state';
import type {
  DeviceInfo,
  FlashReadResult,
  SerialArchive,
  ErrorSearchResult,
  FlashPreviewResult,
  AppSettings,
  UartPortInfo,
  UartPollResult,
} from '../api/types';
import type { HidDeviceInfo, HidPollResult } from '../controllers/tauri-hid-device';

const warn = (cmd: string) =>
  console.warn(`[mock] invoke('${cmd}') has no fake handler — returning undefined`);

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
  emitLocal('flash://status', { message: 'NOR-Dump erfolgreich gelesen und archiviert.', level: 'info' });
  emitLocal('flash://result', result);
  return result;
}

async function flashWriteSequence(): Promise<void> {
  const s = getMockState();
  for (let pct = 0; pct <= 100; pct += 10) {
    emitLocal('flash://progress', { phase: 'write', percent: pct });
    await delay(s.flash.write_step_ms);
  }
  emitLocal('flash://status', { message: 'Schreiben abgeschlossen, starte Verify …', level: 'info' });
  for (let pct = 0; pct <= 100; pct += 10) {
    emitLocal('flash://progress', { phase: 'verify', percent: pct });
    await delay(s.flash.verify_step_ms);
  }
  emitLocal('flash://status', { message: 'Verify OK — NOR erfolgreich beschrieben.', level: 'info' });
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

  // --- archive ---
  archive_list_dumps: () => {
    const s = getMockState();
    return <SerialArchive[]>s.flash.archive;
  },
  archive_delete_dump: (args) => {
    console.log(`[mock] archive_delete_dump(${args?.binPath}) — no-op in browser`);
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
      reports: [{ report_id: 1, data: Array.from({ length: 64 }, (_, i) => (i % 7 === 0 ? 128 : 0)) }],
    };
  },
};

/** Drop-in replacement for Tauri's `invoke`. */
export async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const handler = handlers[cmd];
  if (!handler) {
    warn(cmd);
    return undefined as T;
  }
  const result = await handler(args ?? {});
  return result as T;
}