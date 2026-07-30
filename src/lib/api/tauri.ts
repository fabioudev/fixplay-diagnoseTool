import { invoke } from '@tauri-apps/api/core';
import type { DeviceInfo, FlashReadResult, ChipId, FlashBinaryStatus, SerialArchive, ErrorSearchResult, FlashPreviewResult, DiskSpace, AppSettings, UartPortInfo, UartPollResult, I2cPortInfo, I2cErrlogEntry, I2cInfo, I2cPollResult, I2cErrorSearchResult, UpdateChannel } from './types';

export const uartListPorts = (): Promise<UartPortInfo[]> => invoke<UartPortInfo[]>('uart_list_ports');
export const uartConnect     = (port: string): Promise<void> => invoke<void>('uart_connect', { port });
export const uartDisconnect  = (): Promise<void>       => invoke<void>('uart_disconnect');
export const uartSendErrlog  = (): Promise<void>       => invoke<void>('uart_send_errlog');
export const uartSendVersion = (): Promise<void>       => invoke<void>('uart_send_version');
export const uartClearErrlog = (): Promise<void>       => invoke<void>('uart_clear_errlog');
export const uartSetAutoPoll = (enabled: boolean): Promise<void> =>
  invoke<void>('uart_set_auto_poll', { enabled });
export const uartSetAutoReconnect = (enabled: boolean): Promise<void> =>
  invoke<void>('uart_set_auto_reconnect', { enabled });
export const uartUpdateDb    = (): Promise<number>     => invoke<number>('uart_update_error_db');

export const uartGetDbInfo    = () => invoke<number | null>('uart_get_db_info');
export const uartPoll         = (): Promise<UartPollResult> => invoke<UartPollResult>('uart_poll');
export const uartLoopbackTest = (): Promise<boolean> => invoke<boolean>('uart_loopback_test');
export const uartSearchErrorDb = (query: string) =>
  invoke<ErrorSearchResult[]>('uart_search_error_db', { query });

export const flashListProgrammers = () => invoke<string[]>('flash_list_programmers');
export const flashGetBinaryStatus = (): Promise<FlashBinaryStatus> =>
  invoke<FlashBinaryStatus>('flash_get_binary_status');
export const flashRead  = (programmer: string) =>
  invoke<FlashReadResult>('flash_read', { programmer });
export const flashReadId = (programmer: string): Promise<ChipId> =>
  invoke<ChipId>('flash_read_id', { programmer });
export const flashWrite = (path: string, programmer: string, verify: boolean): Promise<void> =>
  invoke<void>('flash_write', { path, programmer, verify });
export const openPath   = (path: string) => invoke<void>('open_path', { path });
export const saveTextFile = (path: string, content: string) =>
  invoke<void>('save_text_file', { path, content });
export const flashValidateFile = (path: string) =>
  invoke<FlashPreviewResult>('flash_validate_file', { path });

export const flashFreeDiskSpace = (): Promise<DiskSpace> =>
  invoke<DiskSpace>('flash_free_disk_space');

export const archiveListDumps  = () =>
  invoke<SerialArchive[]>('archive_list_dumps');
export const archiveDeleteDump = (binPath: string) =>
  invoke<void>('archive_delete_dump', { binPath });

export const settingsGet  = ()                       => invoke<AppSettings>('settings_get');
export const settingsSave = (settings: AppSettings)  => invoke<void>('settings_save', { settings });
export const appDataDirPath = () => invoke<string>('app_data_dir_path');

// ───────────────────────── I2C / Pico (USB CDC) ─────────────────────────
// The Pico enumerates as a USB CDC serial device and speaks a line-oriented
// NDJSON request/response protocol (see crates/fixplay-i2c/src/protocol.rs).
// Commands are synchronous: each returns the typed result directly.

export const i2cListPorts     = (): Promise<I2cPortInfo[]> => invoke<I2cPortInfo[]>('i2c_list_ports');
export const i2cConnect       = (port: string): Promise<void> => invoke<void>('i2c_connect', { port });
export const i2cDisconnect    = (): Promise<void>       => invoke<void>('i2c_disconnect');
export const i2cScan          = (): Promise<number[]>   => invoke<number[]>('i2c_scan');
export const i2cRead          = (addr: number, reg: number | null, len: number): Promise<number[]> =>
  invoke<number[]>('i2c_read', { addr, reg, len });
export const i2cWrite         = (addr: number, reg: number | null, data: number[]): Promise<void> =>
  invoke<void>('i2c_write', { addr, reg, data });
export const i2cReadEeprom    = (addr: number, offset: number, len: number): Promise<number[]> =>
  invoke<number[]>('i2c_read_eeprom', { addr, offset, len });
export const i2cErrlog        = (): Promise<I2cErrlogEntry[]> => invoke<I2cErrlogEntry[]>('i2c_errlog');
export const i2cInfo          = (): Promise<I2cInfo | null>   => invoke<I2cInfo | null>('i2c_info');
export const i2cPoll          = (): Promise<I2cPollResult>    => invoke<I2cPollResult>('i2c_poll');
export const i2cUpdateXboxDb  = (): Promise<number>           => invoke<number>('i2c_update_xbox_db');
export const i2cGetDbInfo      = () => invoke<number | null>('i2c_get_db_info');
export const i2cSearchXboxDb  = (query: string): Promise<I2cErrorSearchResult[]> =>
  invoke<I2cErrorSearchResult[]>('i2c_search_xbox_db', { query });

// ───────────────────────── App / Updater ─────────────────────────
// `checkForUpdates` / `relaunchApp` use the Tauri updater + process plugins
// directly (not custom commands). `getUpdateChannel` / `appVersion` are custom
// commands that tell the frontend whether to self-update or defer to pacman.

export const getUpdateChannel = (): Promise<UpdateChannel> => invoke<UpdateChannel>('get_update_channel');
export const appVersion       = (): Promise<string>        => invoke<string>('app_version');
