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

export interface ErrlogEntry {
  error_code: number;
  timestamp: number;
  power_states: number;
  up_cause: number;
  temp_soc: number;
  raw_fields: [string, string, string, string];
}

export interface UartEntryEvent {
  entry: ErrlogEntry;
  description: string | null;
}

export interface UartLogEntry {
  id: number;
  timestamp_ms: number;
  raw: string;
  parsed?: UartEntryEvent;
}

export interface UartStatusEvent {
  connected: boolean;
}
