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

/** flashrom binary self-check result (queried on mount; see flash_get_binary_status). */
export interface FlashBinaryStatus {
  ok:     boolean;
  reason: string | null;
  path:   string;
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

export interface UartPortInfo {
  name:        string;
  is_bridge:   boolean;
  description: string;
}

export interface UartLogEntry {
  id: number;
  timestamp_ms: number;
  raw: string;
  parsed?: UartEntryEvent;
  kind?: 'status' | 'error';
}

export interface UartPollResult {
  connected:    boolean;
  reconnecting: boolean;
  lines:        string[];
  entries:      UartEntryEvent[];
  db_count:     number | null;
  /** Lines dropped at the backend buffer cap since the last poll (overflow). */
  dropped_lines: number;
}

// ───────────────────────── I2C / Pico (USB CDC) ─────────────────────────

export interface I2cPortInfo {
  name:        string;
  is_pico:     boolean;
  is_bridge:   boolean;
  description: string;
}

export interface I2cErrlogEntry {
  code:        string;
  timestamp:   number | null;
  source:      string | null;
  description: string | null;
}

export interface I2cInfo {
  firmware: string;
  bus:      string;
  scl:      number;
  sda:      number;
  voltage?: string | null;
}

export interface I2cPollResult {
  connected: boolean;
  db_count:  number | null;
}

export interface I2cErrorSearchResult {
  code:        string;
  description: string;
  category:    string;
}

export interface NorValidation {
  size_ok:       boolean;
  header_ok:     boolean;
  mbr1_ok:       boolean;
  mbr2_ok:       boolean;
  emc_ipl_a_ok:  boolean;
  emc_ipl_b_ok:  boolean;
  usb_pdc_a_ok:  boolean;
  usb_pdc_b_ok:  boolean;
}

export interface NvsData {
  serial:       string;
  mac_address:  string;
  sku:          string;
  board_id:     string;
  console_type: number;
  fw_version:   string;
}

export interface FlashReadResult {
  dumps_match:  boolean;
  validation:   NorValidation;
  nvs:          NvsData | null;
  archive_path: string;
}

export interface FlashProgressEvent {
  phase:   'read1' | 'read2' | 'write' | 'verify';
  percent: number;
}

export interface FlashStatusEvent {
  message: string;
  level:   'info' | 'warn' | 'error';
}

export interface FlashLogEntry {
  id:           number;
  timestamp_ms: number;
  message:      string;
  level:        'info' | 'warn' | 'error';
}

export interface DumpEntry {
  bin_path:      string;
  timestamp:     number;
  size_bytes:    number;
  validation_ok: boolean;
  fw_version:    string | null;
  serial:        string;
}

export interface SerialArchive {
  serial: string;
  dumps:  DumpEntry[];
}

export interface ErrorSearchResult {
  code:        number;
  description: string;
  category:    string;
}

export interface FlashPreviewResult {
  path:       string;
  size_bytes: number;
  validation: NorValidation;
  nvs:        NvsData | null;
}

export interface AppSettings {
  flashrom_path:  string | null;
  archive_dir:    string | null;
  baud_rate:      number;
  i2c_baud_rate:  number;
  auto_reconnect: boolean;
  tablet_mode:    boolean;
}

/** How the running app was installed — decides self-update vs. package manager. */
export interface UpdateChannel {
  managed: boolean;
  hint:    string;
}
