# Flashrom Integration Design

**Date:** 2026-06-11
**Status:** Approved

## Overview

Integrate `flashrom` as a bundled subprocess to read, write, and verify PS5 NOR flash dumps via CH341A, RT809H, and other supported programmers. Includes PS5-specific NOR validation and an archiving system organized by console serial number.

## Architecture

`fixplay-ch341` is renamed to `fixplay-flashrom` — the existing `FlashDevice` trait stays; the implementation switches from a `rusb` stub to a `std::process::Command` flashrom wrapper. PS5 NOR parsing lives in `fixplay-core/src/nor.rs` as pure domain logic with no hardware dependencies.

**Tech Stack:** `std::process::Command` (flashrom subprocess), `std::thread` + `mpsc` (progress streaming), Tauri resources (bundled binary), SvelteKit + Svelte 5, Tailwind CSS v4.

---

## 1. Rust Backend

### 1.1 Crate rename: `fixplay-ch341` → `fixplay-flashrom`

- Remove `rusb` dependency from `Cargo.toml`
- Rename `device.rs` → `flashrom.rs`; rename `Ch341Device` → `FlashromDevice`
- Update workspace `Cargo.toml` and `src-tauri/Cargo.toml` references
- `Ch341Error` in `fixplay-core/src/error.rs` renamed to `FlashError` (variants: `NotFound`, `Subprocess(String)`, `Io(String)`)

### 1.2 `fixplay-flashrom/src/flashrom.rs`

```rust
pub struct FlashromDevice {
    pub programmer: String,  // e.g. "ch341a_spi", "rt809h_spi"
    pub binary_path: PathBuf,
}
```

**`flashrom_path(resource_dir: &Path) -> PathBuf`** — returns bundled binary:
- Linux: `{resource_dir}/flashrom`
- Windows: `{resource_dir}/flashrom.exe`

**`impl FlashDevice for FlashromDevice`:**

`read_flash(on_progress)`:
- Spawns `flashrom -p {programmer} --read {path}` with `stderr: Piped`
- Reads stderr line-by-line, parses `"Writing at 0x..."  (XX %)"` → calls `on_progress`
- Returns file bytes on success

`write_flash(data, on_progress)`:
- Writes data to temp file, spawns `flashrom -p {programmer} --write {path}`
- Same progress parsing

`erase_flash()`:
- Spawns `flashrom -p {programmer} --erase`

`read_id()`:
- Spawns `flashrom -p {programmer} --flash-name`
- Parses stdout for chip name → returns `ChipId`

**Progress line parsing:**
flashrom stderr format: `Writing at 0x001000... (  5%)`
Regex: `\((\d+)%\)` → extract integer percent.

### 1.3 `fixplay-core/src/nor.rs` (new file)

**PS5 NOR layout (2 MB = 0x200000 bytes):**

| Offset | Size | Name |
|--------|------|------|
| 0x00000 | 0x1000 | NorHeader |
| 0x01000 | 0x1000 | ActiveSlot |
| 0x02000 | 0x1000 | NorMbr1 |
| 0x03000 | 0x1000 | NorMbr2 |
| 0x04000 | 0x7E000 | EmcIplA (Slb2) |
| 0x82000 | 0x7E000 | EmcIplB (Slb2) |
| 0x100000 | 0x10000 | UsbPdcA (Slb2) |
| 0x110000 | 0x10000 | UsbPdcB (Slb2) |
| 0x120000 | 0xA4000 | Unknown |
| 0x1C4000 | 0xB000 | NVS |
| 0x1CF000 | 0x30000 | Reserved |

**Magic bytes:**
- `NorHeader` at 0x00: `SONY COMPUTER ENTERTAINMENT INC.` (32 bytes: `53 4F 4E 59 20 43 4F 4D 50 55 54 45 52 20 45 4E 54 45 52 54 41 49 4E 4D 45 4E 54 20 49 4E 43 2E`)
- `NorMbr` at 0x2000 / 0x3000: `Sony Computer Entertainment Inc.` (32 bytes: `53 6F 6E 79 20 43 6F 6D 70 75 74 65 72 20 45 6E 74 65 72 74 61 69 6E 6D 65 6E 74 20 49 6E 63 2E`)
- `Slb2` header at each Slb2 start: `SLB2` (4 bytes: `53 4C 42 32`)

**NVS offsets (relative to start of NVS at 0x1C4000):**
- `+0x0020`: MAC address (6 bytes)
- `+0x3010`: ConsoleType (u32 big-endian)
- `+0x3200`: MotherboardSerial (16 bytes, null-terminated)
- `+0x3210`: Serial (32 bytes, 0xFF-terminated)
- `+0x3230`: SKU (16 bytes, null-terminated)
- `+0x3250`: BoardId (13 bytes, null-terminated)
- `+0x33C0`: WifiMac1 (6 bytes)
- `+0x33C6`: WifiMac2 (6 bytes)
- `+0x33CC`: WifiMac3 (6 bytes)
- `+0x4000`: NvsOS1 — FirmwareVersion at `+0x4000+0x08` (u32 big-endian, display as `XX.XX.XX.XX`)

**Structs:**

```rust
pub const EXPECTED_SIZE: usize = 0x200000; // 2 MB

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NorValidation {
    pub size_ok:       bool,
    pub header_ok:     bool,
    pub mbr1_ok:       bool,
    pub mbr2_ok:       bool,
    pub emc_ipl_a_ok:  bool,
    pub emc_ipl_b_ok:  bool,
    pub usb_pdc_a_ok:  bool,
    pub usb_pdc_b_ok:  bool,
}

impl NorValidation {
    pub fn is_valid(&self) -> bool {
        self.size_ok && self.header_ok && self.mbr1_ok && self.mbr2_ok
            && self.emc_ipl_a_ok && self.emc_ipl_b_ok
            && self.usb_pdc_a_ok && self.usb_pdc_b_ok
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NvsData {
    pub serial:      String,
    pub mac_address: String,
    pub sku:         String,
    pub board_id:    String,
    pub console_type: u32,
    pub fw_version:  String,  // e.g. "02.50.00.01"
}

pub fn validate(data: &[u8]) -> NorValidation { ... }
pub fn parse_nvs(data: &[u8]) -> Option<NvsData> { ... }
```

**`validate(data: &[u8]) -> NorValidation`:** Checks each magic at its fixed offset. Returns `NorValidation` with all fields set.

**`parse_nvs(data: &[u8]) -> Option<NvsData>`:** Returns `None` if `data.len() < EXPECTED_SIZE`. Reads fields at fixed absolute offsets.

**Helper `read_cstring(bytes: &[u8]) -> String`:** Reads until null byte or end; filters non-ASCII.
**Helper `read_ff_string(bytes: &[u8]) -> String`:** Reads until `0xFF` byte or end.
**Helper `bytes_to_mac(bytes: &[u8; 6]) -> String`:** Returns `"AA:BB:CC:DD:EE:FF"` format.
**Helper `fw_version_from_u32(v: u32) -> String`:** Big-endian bytes → `"XX.XX.XX.XX"`.

### 1.4 `fixplay-core/src/types.rs` additions

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashReadResult {
    pub dumps_match:   bool,
    pub validation:    NorValidation,
    pub nvs:           Option<NvsData>,
    pub archive_path:  String,
}
```

### 1.5 `fixplay-core/src/error.rs` changes

Rename `Ch341Error` → `FlashError`:
```rust
#[derive(Debug, Error)]
pub enum FlashError {
    #[error("flashrom not found")]
    NotFound,
    #[error("subprocess error: {0}")]
    Subprocess(String),
    #[error("I/O error: {0}")]
    Io(String),
}
```

Update `AppError::Ch341` → `AppError::Flash`.

### 1.6 `src-tauri/src/commands/flash.rs`

**Four commands:**

`open_path(path: String) -> Result<(), String>`:
- Calls `opener::open(&path)` or `std::process::Command::new("xdg-open").arg(&path)` on Linux, `explorer` on Windows
- Used by the frontend to open the archive folder in the file manager

`flash_list_programmers() -> Vec<String>`:
- Returns static list: `["ch341a_spi", "rt809h_spi", "serprog", "buspirate_spi", "ft2232_spi"]`

`flash_read(programmer: String, state: State<AppState>, app: AppHandle) -> Result<FlashReadResult, String>`:
1. Get resource dir from `app.path().resource_dir()`
2. Create `FlashromDevice { programmer, binary_path }`
3. Emit `flash://status { message: "Erster Lesevorgang...", level: "info" }`
4. Read to temp file 1 via reader thread → emit `flash://progress { phase: "read1", percent }`
5. Emit status "Zweiter Lesevorgang..."
6. Read to temp file 2 → emit `flash://progress { phase: "read2", percent }`
7. Compare bytes → `dumps_match` bool; emit status (warn if mismatch)
8. Parse NOR: `validate(&bytes)` + `parse_nvs(&bytes)`
9. Archive: create `{app_data}/dumps/{serial_or_unknown}/nor_{timestamp}.bin` + `.json`
10. Emit `flash://result { ... }`
11. Return `Ok(FlashReadResult)`

`flash_write(path: String, programmer: String, state: State<AppState>, app: AppHandle) -> Result<(), String>`:
1. Read file bytes from `path`
2. Emit status "Schreibe NOR..."
3. Run `flashrom -p {programmer} --write {path}` — flashrom performs erase + write + built-in verify internally
4. Parse progress from stderr → emit `flash://progress { phase: "write", percent }` during erase/write, `{ phase: "verify", percent }` during flashrom's verify pass
5. Emit result status
6. Return `Ok(())`

**Progress streaming pattern** (same as UART reader):
- `on_progress` callback runs in flashrom thread
- Uses `app_handle.emit("flash://progress", ...)` directly (no separate thread needed — flashrom is synchronous)

**Archive helper `archive_dump`:**
```rust
fn archive_dump(app: &AppHandle, bytes: &[u8], nvs: &Option<NvsData>, validation: &NorValidation) -> Result<String, String>
```
- `serial_dir = nvs.as_ref().map(|n| n.serial.clone()).unwrap_or_else(|| format!("unknown_{}", timestamp))`
- `base = app.path().app_data_dir() / "dumps" / serial_dir`
- `std::fs::create_dir_all(&base)`
- Write `.bin` and `.json` (serde_json serialized metadata struct)
- Returns archive path as String

### 1.7 Tauri Events

| Event | Payload type | When |
|-------|-------------|------|
| `flash://progress` | `{ phase: String, percent: u8 }` | Each parsed flashrom progress line |
| `flash://status` | `{ message: String, level: String }` | Phase transitions and errors |
| `flash://result` | `FlashReadResult` | After successful `flash_read` |

### 1.8 Bundled flashrom binary

`tauri.conf.json`:
```json
"bundle": {
  "resources": {
    "binaries/flashrom": "flashrom",
    "binaries/flashrom.exe": "flashrom.exe"
  }
}
```

Binary placed at `src-tauri/binaries/flashrom` (Linux) and `src-tauri/binaries/flashrom.exe` (Windows) before building. Not committed to git (`.gitignore`).

---

## 2. Frontend

### 2.1 `src/lib/api/types.ts` additions

```ts
export interface NorValidation {
  size_ok: boolean;
  header_ok: boolean;
  mbr1_ok: boolean;
  mbr2_ok: boolean;
  emc_ipl_a_ok: boolean;
  emc_ipl_b_ok: boolean;
  usb_pdc_a_ok: boolean;
  usb_pdc_b_ok: boolean;
}

export interface NvsData {
  serial: string;
  mac_address: string;
  sku: string;
  board_id: string;
  console_type: number;
  fw_version: string;
}

export interface FlashReadResult {
  dumps_match: boolean;
  validation: NorValidation;
  nvs: NvsData | null;
  archive_path: string;
}

export interface FlashProgressEvent {
  phase: 'read1' | 'read2' | 'write' | 'verify';
  percent: number;
}

export interface FlashStatusEvent {
  message: string;
  level: 'info' | 'warn' | 'error';
}

export interface FlashLogEntry {
  id: number;
  timestamp_ms: number;
  message: string;
  level: 'info' | 'warn' | 'error';
}
```

### 2.2 `src/lib/stores/flash.ts` (new file)

```ts
export const flashBusy      = writable<boolean>(false);
export const flashProgress  = writable<{ phase: string; percent: number } | null>(null);
export const flashResult    = writable<FlashReadResult | null>(null);
export const flashLog       = writable<FlashLogEntry[]>([]);
export const flashProgrammer = writable<string>('ch341a_spi');
let _nextId = 0;
export function nextFlashLogId(): number { return _nextId++; }
```

### 2.3 `src/lib/api/tauri.ts` additions

```ts
export const flashListProgrammers = () => invoke<string[]>('flash_list_programmers');
export const flashRead  = (programmer: string) => invoke<FlashReadResult>('flash_read', { programmer });
export const flashWrite = (path: string, programmer: string) => invoke<void>('flash_write', { path, programmer });
export const openPath   = (path: string) => invoke<void>('open_path', { path });
```

### 2.4 `src/lib/components/FlashPanel.svelte` (rewrite)

**Controls bar:**
- Programmer `<select>` populated from `flash_list_programmers()` (loaded on mount)
- "Lesen" button — calls `flashRead`, disabled while `$flashBusy`
- "Schreiben" button — opens Tauri file dialog (`.bin` filter), calls `flashWrite`, disabled while `$flashBusy`
- Fortschrittsbalken: `<progress value={$flashProgress?.percent ?? 0} max={100}>` with phase label

**Ergebnis-Card** (shown when `$flashResult !== null`):
- `dumps_match` badge (✓ Dumps identisch / ⚠ Dumps weichen ab)
- Validation checklist: 8 rows with ✓/✗ icons
- NVS info table: Serial, MAC, SKU, Board-ID, Firmware, Console-Type
- Archive path with "Ordner öffnen" button (`invoke('open_path', { path })`)

**Status-Log:**
- Scrollable list, newest first, max 200 entries
- Color coded: `text-green-400` info, `text-yellow-400` warn, `text-red-400` error

**Event listeners (on mount, cleaned up on destroy):**
- `listen('flash://progress', ...)` → updates `flashProgress` store
- `listen('flash://status', ...)` → prepends to `flashLog`
- `listen('flash://result', ...)` → sets `flashResult`, clears `flashBusy`

**Svelte 5 syntax:** `$state()`, `onclick=`, `onchange=`.

---

## 3. Error Handling

- `FlashError::NotFound` — flashrom binary missing from resources
- `FlashError::Subprocess(String)` — flashrom exited non-zero
- `FlashError::Io(String)` — file read/write failure
- All Tauri commands return `Result<T, String>` (`.map_err(|e| e.to_string())`)
- Dump mismatch on double-read is a **warning**, not an error — operation continues

---

## 4. Testing

**`fixplay-core` NOR tests (`nor.rs`):**
- `validate` on buffer of correct size with valid magics → all fields true
- `validate` on buffer with corrupted NorHeader magic → `header_ok = false`
- `validate` on buffer shorter than 2MB → `size_ok = false`
- `parse_nvs` returns correct serial from fixture bytes
- `is_valid()` returns false when any field is false

**`fixplay-flashrom` tests:**
- `flashrom_path` returns correct platform-specific path
- Progress line parsing: `"Writing at 0x001000...  (  5%)"` → `5u8`
- Progress line parsing: `"Reading flash... done."` → `None`

**Frontend store tests (`flash.test.ts`):**
- `flashBusy` starts as `false`
- `flashProgress` starts as `null`
- `flashResult` starts as `null`

---

## 5. Out of Scope

- NOR editing (changing serial, MAC, firmware flags) — separate feature
- flashrom binary download/auto-update — user provides binary at build time
- Multiple simultaneous flash operations
