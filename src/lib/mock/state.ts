// Reactive, runtime-editable backing store for the browser mock layer.
//
// In MOCK mode the `@tauri-apps/api/core` alias points at `./core.ts`, whose
// handlers read every fake value from this store instead of from hardcoded
// literals. The MockPanel component binds inputs to the same store, so editing
// a field in the hosted web preview changes what the next `invoke()` returns —
// no source edits, no restart.
//
// The store persists to localStorage so preview tweaks survive reloads.
// This module is bundled in both builds, but it is only *read* in MOCK mode
// (the real Tauri backend never imports it); the MockPanel is guarded by
// `__MOCK_MODE__` and tree-shaken out of the desktop build.

import { writable, get } from 'svelte/store';
import type {
  DeviceInfo,
  NvsData,
  NorValidation,
  SerialArchive,
  UartPortInfo,
  UartEntryEvent,
  ErrorSearchResult,
  I2cPortInfo,
  I2cErrlogEntry,
  I2cInfo,
  I2cErrorSearchResult,
} from '$lib/api/types';
import type { HidDeviceInfo } from '$lib/controllers/tauri-hid-device';

export interface MockFlashState {
  devices: DeviceInfo[];
  programmers: string[];
  nvs: NvsData;
  validation: NorValidation;
  dumps_match: boolean;
  /** Delay per 10% progress step for the read1/read2 sequence. */
  read_step_ms: number;
  /** Delay per 10% progress step for the write sequence. */
  write_step_ms: number;
  /** Delay per 10% progress step for the verify sequence. */
  verify_step_ms: number;
  archive: SerialArchive[];
}

export interface MockUartState {
  ports: UartPortInfo[];
  connected: boolean;
  reconnecting: boolean;
  /** Error-DB entry count, or null if "no DB". */
  db_count: number | null;
  lines: string[];
  entries: UartEntryEvent[];
  search_results: ErrorSearchResult[];
  loopback_ok: boolean;
}

export interface MockHidState {
  devices: HidDeviceInfo[];
  connected: boolean;
}

export interface MockI2cState {
  ports: I2cPortInfo[];
  connected: boolean;
  /** Xbox error-DB entry count, or null if "no DB". */
  db_count: number | null;
  /** Addresses returned by `i2c_scan`. */
  scan_results: number[];
  errlog: I2cErrlogEntry[];
  info: I2cInfo | null;
  search_results: I2cErrorSearchResult[];
}

export interface MockState {
  flash: MockFlashState;
  uart: MockUartState;
  hid: MockHidState;
  i2c: MockI2cState;
}

const STORAGE_KEY = 'fixplay-mock-state';

const defaultValidation: NorValidation = {
  size_ok: true,
  header_ok: true,
  mbr1_ok: true,
  mbr2_ok: true,
  emc_ipl_a_ok: true,
  emc_ipl_b_ok: true,
  usb_pdc_a_ok: true,
  usb_pdc_b_ok: true,
};

function defaultNvs(): NvsData {
  return {
    serial: 'SN9X-MOCK-0001',
    mac_address: 'A4:B5:C6:D7:E8:F9',
    sku: 'CFI-1000',
    board_id: 'MOCK-BOARD-001',
    console_type: 1,
    fw_version: '21.01.04.00',
  };
}

function defaultArchive(): SerialArchive[] {
  return [
    {
      serial: 'SN9X-MOCK-0001',
      dumps: [
        {
          bin_path: '/mock/archive/SN9X-MOCK-0001/2026-07-01_read.bin',
          timestamp: Date.now(),
          size_bytes: 2 * 1024 * 1024,
          validation_ok: true,
          fw_version: '21.01.04.00',
          serial: 'SN9X-MOCK-0001',
        },
      ],
    },
  ];
}

function defaultUartEntries(): UartEntryEvent[] {
  return [
    {
      entry: {
        error_code: 0xe0000001,
        timestamp: Date.now(),
        power_states: 1,
        up_cause: 1,
        temp_soc: 45,
        raw_fields: ['E0000001', '0001', '0001', '0031'],
      },
      description: 'Beispiel-Fehlereintrag (Mock)',
    },
  ];
}

function defaultHidDevices(): HidDeviceInfo[] {
  return [
    {
      vendor_id: 0x054c,
      product_id: 0x0ce6,
      manufacturer: 'Sony Interactive Entertainment',
      product: 'DualSense Wireless Controller',
      serial_number: null,
      usage_page: 1,
      usage: 5,
    },
  ];
}

export const DEFAULT_MOCK_STATE: MockState = {
  flash: {
    devices: [
      { id: 'ch341a-0', name: 'CH341A Programmer #0', device_type: 'Ch341' },
      { id: 'ch341a-1', name: 'CH341A Programmer #1', device_type: 'Ch341' },
    ],
    programmers: ['ch341a_spi', 'dummy', 'ft2232_spi'],
    nvs: defaultNvs(),
    validation: { ...defaultValidation },
    dumps_match: true,
    read_step_ms: 60,
    write_step_ms: 60,
    verify_step_ms: 40,
    archive: defaultArchive(),
  },
  uart: {
    ports: [
      { name: '/dev/ttyUSB0', is_bridge: true, description: 'CP2105 UART Bridge (Mock)' },
      { name: '/dev/ttyUSB1', is_bridge: false, description: 'FTDI FT232R (Mock)' },
    ],
    connected: true,
    reconnecting: false,
    db_count: 1280,
    lines: ['> errlog read', 'E0000001 0001 0001 0031', '> version', '21.01.04.00'],
    entries: defaultUartEntries(),
    search_results: [
      { code: 0xe0000001, description: 'Mock-Treffer für "{query}"', category: 'generic' },
    ],
    loopback_ok: true,
  },
  hid: {
    devices: defaultHidDevices(),
    connected: true,
  },
  i2c: {
    ports: [
      { name: '/dev/i2c-1', is_pico: true, is_bridge: true, description: 'Pico I2C Bridge (Mock)' },
      { name: '/dev/i2c-0', is_pico: false, is_bridge: false, description: 'On-board I2C bus (Mock)' },
    ],
    connected: true,
    db_count: 960,
    scan_results: [0x48, 0x50, 0x68],
    errlog: [
      {
        code: 'E2000001',
        timestamp: Date.now(),
        source: 'GPU',
        description: 'Beispiel-Xbox-Fehlereintrag (Mock)',
      },
    ],
    info: {
      firmware: 'pico-i2c-bridge 1.2.0 (Mock)',
      bus: 'i2c-1',
      scl: 3,
      sda: 2,
      voltage: '3.3V',
    },
    search_results: [
      { code: 'E2000001', description: 'Mock-Xbox-Treffer für "{query}"', category: 'generic' },
    ],
  },
};

function clone(state: MockState): MockState {
  return JSON.parse(JSON.stringify(state)) as MockState;
}

/** Deep-ish merge of saved state over defaults so new fields stay populated. */
function load(): MockState {
  const base = clone(DEFAULT_MOCK_STATE);
  if (typeof localStorage === 'undefined') return base;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<MockState>;
    if (saved.flash) {
      Object.assign(base.flash, saved.flash);
      if (saved.flash.nvs) Object.assign(base.flash.nvs, saved.flash.nvs);
      if (saved.flash.validation) Object.assign(base.flash.validation, saved.flash.validation);
    }
    if (saved.uart) Object.assign(base.uart, saved.uart);
    if (saved.hid) Object.assign(base.hid, saved.hid);
    if (saved.i2c) Object.assign(base.i2c, saved.i2c);
  } catch {
    // Corrupt entry — fall back to defaults.
  }
  return base;
}

export const mockState = writable<MockState>(load());

// Persist on every change (browser only).
mockState.subscribe((v) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    // Quota / private mode — ignore; the store still works in-memory.
  }
});

/** Reset every mock value back to the shipped defaults and clear saved state. */
export function resetMockState(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  mockState.set(clone(DEFAULT_MOCK_STATE));
}

/** Convenience for the mock core handlers: read the current state once. */
export function getMockState(): MockState {
  return get(mockState);
}