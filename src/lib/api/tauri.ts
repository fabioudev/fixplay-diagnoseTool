import { invoke } from '@tauri-apps/api/core';
import type { DeviceInfo } from './types';

export const scanDevices = (): Promise<DeviceInfo[]> =>
  invoke<DeviceInfo[]>('scan_devices');

export const listPorts = (): Promise<DeviceInfo[]> =>
  invoke<DeviceInfo[]>('list_ports');
