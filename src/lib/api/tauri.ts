import { invoke } from '@tauri-apps/api/core';
import type { DeviceInfo, FlashReadResult, SerialArchive, ErrorSearchResult, FlashPreviewResult, AppSettings } from './types';

export const scanDevices = (): Promise<DeviceInfo[]> =>
  invoke<DeviceInfo[]>('scan_devices');

export const uartListPorts   = (): Promise<string[]>  => invoke<string[]>('uart_list_ports');
export const uartConnect     = (port: string): Promise<void> => invoke<void>('uart_connect', { port });
export const uartDisconnect  = (): Promise<void>       => invoke<void>('uart_disconnect');
export const uartSendErrlog  = (): Promise<void>       => invoke<void>('uart_send_errlog');
export const uartSendVersion = (): Promise<void>       => invoke<void>('uart_send_version');
export const uartSetAutoPoll = (enabled: boolean): Promise<void> =>
  invoke<void>('uart_set_auto_poll', { enabled });
export const uartUpdateDb    = (): Promise<number>     => invoke<number>('uart_update_error_db');

export const uartGetDbInfo     = () => invoke<number | null>('uart_get_db_info');
export const uartSearchErrorDb = (query: string) =>
  invoke<ErrorSearchResult[]>('uart_search_error_db', { query });

export const flashListProgrammers = () => invoke<string[]>('flash_list_programmers');
export const flashRead  = (programmer: string) =>
  invoke<FlashReadResult>('flash_read', { programmer });
export const flashWrite = (path: string, programmer: string) =>
  invoke<void>('flash_write', { path, programmer });
export const openPath   = (path: string) => invoke<void>('open_path', { path });
export const flashValidateFile = (path: string) =>
  invoke<FlashPreviewResult>('flash_validate_file', { path });

export const archiveListDumps  = () =>
  invoke<SerialArchive[]>('archive_list_dumps');
export const archiveDeleteDump = (binPath: string) =>
  invoke<void>('archive_delete_dump', { binPath });

export const settingsGet  = ()                       => invoke<AppSettings>('settings_get');
export const settingsSave = (settings: AppSettings)  => invoke<void>('settings_save', { settings });
