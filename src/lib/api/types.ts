export interface DeviceInfo {
  id: string;
  name: string;
  device_type: 'Ch341' | 'Uart';
}

export interface ChipId {
  manufacturer: number;
  device: number;
  description: string;
}

export interface FlashInfo {
  chip_id: ChipId;
  size_bytes: number;
}

export interface FlashProgress {
  bytes_done: number;
  bytes_total: number;
}

export interface UartMessage {
  timestamp: number;
  raw: string;
}
