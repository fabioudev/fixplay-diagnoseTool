import { invoke } from '@tauri-apps/api/core';
import type { DeviceInfo } from './types';

export const scanDevices = (): Promise<DeviceInfo[]> =>
  invoke<DeviceInfo[]>('scan_devices');

export const uartListPorts   = (): Promise<string[]>  => invoke<string[]>('uart_list_ports');
export const uartConnect     = (port: string): Promise<void> => invoke<void>('uart_connect', { port });
export const uartDisconnect  = (): Promise<void>       => invoke<void>('uart_disconnect');
export const uartSendErrlog  = (): Promise<void>       => invoke<void>('uart_send_errlog');
export const uartSendVersion = (): Promise<void>       => invoke<void>('uart_send_version');
export const uartSetAutoPoll = (enabled: boolean): Promise<void> =>
  invoke<void>('uart_set_auto_poll', { enabled });
export const uartUpdateDb    = (): Promise<void>       => invoke<void>('uart_update_error_db');
