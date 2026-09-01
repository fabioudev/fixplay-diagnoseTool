# Flashrom Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate flashrom as a bundled subprocess to read, write, and verify PS5 NOR flash dumps, with PS5-specific validation and archive-by-serial-number storage.

**Architecture:** `fixplay-ch341` is renamed to `fixplay-flashrom` (subprocess wrapper instead of direct USB). PS5 NOR parsing lives in `fixplay-core/src/nor.rs` as pure domain logic. Four Tauri commands orchestrate the workflow; a new FlashPanel.svelte renders progress, validation results, and NVS metadata.

**Tech Stack:** `std::process::Command` (flashrom subprocess), `tokio::task::spawn_blocking` (blocking I/O in async context), `open` crate (cross-platform folder opener), `tauri-plugin-dialog` v2 (file picker), SvelteKit + Svelte 5, Tailwind CSS v4.

---

## File Map

| Action      | Path                                                    |
| ----------- | ------------------------------------------------------- |
| Rename dir  | `crates/fixplay-ch341/` → `crates/fixplay-flashrom/`    |
| Rename file | `crates/fixplay-flashrom/src/device.rs` → `flashrom.rs` |
| Modify      | `crates/fixplay-flashrom/Cargo.toml`                    |
| Modify      | `crates/fixplay-flashrom/src/lib.rs`                    |
| Modify      | `crates/fixplay-core/src/error.rs`                      |
| Modify      | `crates/fixplay-core/src/types.rs`                      |
| Create      | `crates/fixplay-core/src/nor.rs`                        |
| Modify      | `crates/fixplay-core/src/lib.rs`                        |
| Modify      | `Cargo.toml` (workspace)                                |
| Modify      | `src-tauri/Cargo.toml`                                  |
| Modify      | `src-tauri/src/state.rs`                                |
| Rewrite     | `src-tauri/src/commands/flash.rs`                       |
| Modify      | `src-tauri/src/lib.rs`                                  |
| Modify      | `src-tauri/tauri.conf.json`                             |
| Modify      | `src/lib/api/types.ts`                                  |
| Create      | `src/lib/stores/flash.ts`                               |
| Create      | `src/lib/stores/flash.test.ts`                          |
| Modify      | `src/lib/api/tauri.ts`                                  |
| Rewrite     | `src/lib/components/FlashPanel.svelte`                  |

---

## Task 1: Rename `fixplay-ch341` → `fixplay-flashrom` + refactor error types

**Files:**

- Rename dir: `crates/fixplay-ch341/` → `crates/fixplay-flashrom/`
- Rename file: `crates/fixplay-flashrom/src/device.rs` → `crates/fixplay-flashrom/src/flashrom.rs`
- Modify: `crates/fixplay-flashrom/Cargo.toml`
- Modify: `crates/fixplay-flashrom/src/lib.rs`
- Modify: `crates/fixplay-core/src/error.rs`
- Modify: `crates/fixplay-core/src/lib.rs`
- Modify: `Cargo.toml` (workspace root)
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/state.rs`

- [ ] **Step 1: Rename the crate directory and device file**

```bash
mv crates/fixplay-ch341 crates/fixplay-flashrom
mv crates/fixplay-flashrom/src/device.rs crates/fixplay-flashrom/src/flashrom.rs
```

- [ ] **Step 2: Update `crates/fixplay-flashrom/Cargo.toml`**

Replace the entire file:

```toml
[package]
name    = "fixplay-flashrom"
version = "0.1.0"
edition = "2021"

[dependencies]
fixplay-core = { path = "../fixplay-core" }
thiserror    = { workspace = true }
tracing      = { workspace = true }
serde        = { workspace = true }
```

- [ ] **Step 3: Update `crates/fixplay-flashrom/src/lib.rs`**

```rust
pub mod flashrom;
pub use flashrom::FlashromDevice;
```

- [ ] **Step 4: Update `crates/fixplay-flashrom/src/flashrom.rs`**

Replace the entire file (still a stub, will be implemented in Task 3):

```rust
use fixplay_core::{
    error::{AppError, FlashError},
    traits::FlashDevice,
    types::{ChipId, FlashProgress},
};
use std::path::PathBuf;
use tracing::info;

#[derive(Clone)]
pub struct FlashromDevice {
    pub programmer:  String,
    pub binary_path: PathBuf,
}

pub fn flashrom_path(resource_dir: &std::path::Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    return resource_dir.join("flashrom.exe");
    #[cfg(not(target_os = "windows"))]
    resource_dir.join("flashrom")
}

impl FlashDevice for FlashromDevice {
    fn read_flash(&self, _on_progress: &dyn Fn(FlashProgress)) -> Result<Vec<u8>, AppError> {
        info!("read_flash stub");
        Err(FlashError::Subprocess("not yet implemented".into()).into())
    }

    fn write_flash(&self, _data: &[u8], _on_progress: &dyn Fn(FlashProgress)) -> Result<(), AppError> {
        Err(FlashError::Subprocess("not yet implemented".into()).into())
    }

    fn erase_flash(&self) -> Result<(), AppError> {
        Err(FlashError::Subprocess("not yet implemented".into()).into())
    }

    fn read_id(&self) -> Result<ChipId, AppError> {
        Err(FlashError::Subprocess("not yet implemented".into()).into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flashrom_path_has_correct_name() {
        let dir = std::path::PathBuf::from("/tmp");
        let p = flashrom_path(&dir);
        #[cfg(target_os = "windows")]
        assert_eq!(p.file_name().unwrap(), "flashrom.exe");
        #[cfg(not(target_os = "windows"))]
        assert_eq!(p.file_name().unwrap(), "flashrom");
    }
}
```

- [ ] **Step 5: Replace `Ch341Error` with `FlashError` in `crates/fixplay-core/src/error.rs`**

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("flash error: {0}")]
    Flash(#[from] FlashError),
    #[error("UART error: {0}")]
    Uart(#[from] UartError),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Error)]
pub enum FlashError {
    #[error("flashrom not found")]
    NotFound,
    #[error("subprocess error: {0}")]
    Subprocess(String),
    #[error("I/O error: {0}")]
    Io(String),
}

#[derive(Debug, Error)]
pub enum UartError {
    #[error("port not found: {0}")]
    PortNotFound(String),
    #[error("serial error: {0}")]
    Serial(String),
    #[error("not connected")]
    NotConnected,
    #[error("database fetch error: {0}")]
    DbFetch(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flash_not_found_message() {
        let err = FlashError::NotFound;
        assert_eq!(err.to_string(), "flashrom not found");
    }

    #[test]
    fn uart_not_connected_message() {
        let err = UartError::NotConnected;
        assert_eq!(err.to_string(), "not connected");
    }

    #[test]
    fn app_error_from_flash() {
        let err = FlashError::NotFound;
        let app_err: AppError = err.into();
        assert!(app_err.to_string().contains("flash"));
    }

    #[test]
    fn app_error_from_uart() {
        let u_err = UartError::NotConnected;
        let app_err: AppError = u_err.into();
        assert!(app_err.to_string().contains("UART"));
    }
}
```

- [ ] **Step 6: Update `crates/fixplay-core/src/lib.rs`**

```rust
pub mod error;
pub mod nor;
pub mod traits;
pub mod types;

pub use error::{AppError, FlashError, UartError};
```

Note: `nor` module is created in Task 2. For now, create an empty placeholder:

```bash
touch crates/fixplay-core/src/nor.rs
```

Add to `nor.rs`:

```rust
// PS5 NOR parser — implemented in Task 2
```

- [ ] **Step 7: Update workspace `Cargo.toml`**

Change:

```toml
members = [
    "crates/fixplay-core",
    "crates/fixplay-ch341",
    "crates/fixplay-uart",
    "src-tauri",
]
```

To:

```toml
members = [
    "crates/fixplay-core",
    "crates/fixplay-flashrom",
    "crates/fixplay-uart",
    "src-tauri",
]
```

- [ ] **Step 8: Update `src-tauri/Cargo.toml`**

Change `fixplay-ch341 = { path = "../crates/fixplay-ch341" }` to:

```toml
fixplay-flashrom = { path = "../crates/fixplay-flashrom" }
```

- [ ] **Step 9: Update `src-tauri/src/state.rs`**

Remove the `ch341` field entirely. Replace the entire file:

```rust
use fixplay_uart::{ErrorDb, UartPort};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

#[allow(dead_code)]
pub struct AppState {
    pub uart:             Mutex<Option<UartPort>>,
    pub uart_stop:        Mutex<Option<Arc<AtomicBool>>>,
    pub uart_thread:      Mutex<Option<JoinHandle<()>>>,
    pub uart_poll_stop:   Mutex<Option<Arc<AtomicBool>>>,
    pub uart_poll_thread: Mutex<Option<JoinHandle<()>>>,
    pub error_db:         Arc<Mutex<Option<ErrorDb>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            uart:             Mutex::new(None),
            uart_stop:        Mutex::new(None),
            uart_thread:      Mutex::new(None),
            uart_poll_stop:   Mutex::new(None),
            uart_poll_thread: Mutex::new(None),
            error_db:         Arc::new(Mutex::new(None)),
        }
    }
}
```

- [ ] **Step 10: Verify compilation**

```bash
/usr/bin/cargo build --workspace
```

Expected: compiles without errors.

- [ ] **Step 11: Run tests**

```bash
/usr/bin/cargo test --workspace
```

Expected: all existing tests pass (uart tests, core tests, flashrom stub test).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: rename fixplay-ch341 to fixplay-flashrom, Ch341Error to FlashError"
```

---

## Task 2: PS5 NOR types + parser/validator

**Files:**

- Modify: `crates/fixplay-core/src/types.rs`
- Rewrite: `crates/fixplay-core/src/nor.rs`

- [ ] **Step 1: Write the failing tests for NOR validation**

Replace `crates/fixplay-core/src/nor.rs` with tests first:

```rust
use crate::types::{NorValidation, NvsData};

pub const EXPECTED_SIZE: usize = 0x200000; // 2 MB

const HEADER_MAGIC:    &[u8; 32] = b"SONY COMPUTER ENTERTAINMENT INC.";
const MBR_MAGIC:       &[u8; 32] = b"Sony Computer Entertainment Inc.";
const SLB2_MAGIC:      &[u8; 4]  = b"SLB2";

const HEADER_OFFSET:    usize = 0x00000;
const MBR1_OFFSET:      usize = 0x02000;
const MBR2_OFFSET:      usize = 0x03000;
const EMC_IPL_A_OFFSET: usize = 0x04000;
const EMC_IPL_B_OFFSET: usize = 0x82000;
const USB_PDC_A_OFFSET: usize = 0x100000;
const USB_PDC_B_OFFSET: usize = 0x110000;

const MAC_OFFSET:          usize = 0x1C4020;
const SERIAL_OFFSET:       usize = 0x1C7210;
const SKU_OFFSET:          usize = 0x1C7230;
const BOARD_ID_OFFSET:     usize = 0x1C7250;
const FW_VERSION_OFFSET:   usize = 0x1C8068;

pub fn validate(_data: &[u8]) -> NorValidation { todo!() }
pub fn parse_nvs(_data: &[u8]) -> Option<NvsData> { todo!() }

fn read_cstring(_bytes: &[u8]) -> String { todo!() }
fn read_ff_string(_bytes: &[u8]) -> String { todo!() }
fn bytes_to_mac(_bytes: &[u8; 6]) -> String { todo!() }
fn fw_version_from_u32(_v: u32) -> String { todo!() }

#[cfg(test)]
mod tests {
    use super::*;

    fn make_valid_nor() -> Vec<u8> {
        let mut data = vec![0u8; EXPECTED_SIZE];
        data[HEADER_OFFSET..HEADER_OFFSET + 32].copy_from_slice(HEADER_MAGIC);
        data[MBR1_OFFSET..MBR1_OFFSET + 32].copy_from_slice(MBR_MAGIC);
        data[MBR2_OFFSET..MBR2_OFFSET + 32].copy_from_slice(MBR_MAGIC);
        data[EMC_IPL_A_OFFSET..EMC_IPL_A_OFFSET + 4].copy_from_slice(SLB2_MAGIC);
        data[EMC_IPL_B_OFFSET..EMC_IPL_B_OFFSET + 4].copy_from_slice(SLB2_MAGIC);
        data[USB_PDC_A_OFFSET..USB_PDC_A_OFFSET + 4].copy_from_slice(SLB2_MAGIC);
        data[USB_PDC_B_OFFSET..USB_PDC_B_OFFSET + 4].copy_from_slice(SLB2_MAGIC);
        data
    }

    #[test]
    fn validate_all_ok() {
        let v = validate(&make_valid_nor());
        assert!(v.size_ok && v.header_ok && v.mbr1_ok && v.mbr2_ok
            && v.emc_ipl_a_ok && v.emc_ipl_b_ok && v.usb_pdc_a_ok && v.usb_pdc_b_ok);
        assert!(v.is_valid());
    }

    #[test]
    fn validate_corrupted_header() {
        let mut data = make_valid_nor();
        data[0] = 0xFF;
        let v = validate(&data);
        assert!(!v.header_ok);
        assert!(!v.is_valid());
    }

    #[test]
    fn validate_wrong_size() {
        let v = validate(&vec![0u8; 1024]);
        assert!(!v.size_ok);
        assert!(!v.is_valid());
    }

    #[test]
    fn parse_nvs_serial() {
        let mut data = make_valid_nor();
        let serial = b"AE12345678";
        data[SERIAL_OFFSET..SERIAL_OFFSET + serial.len()].copy_from_slice(serial);
        for i in (SERIAL_OFFSET + serial.len())..(SERIAL_OFFSET + 32) {
            data[i] = 0xFF;
        }
        let nvs = parse_nvs(&data).unwrap();
        assert_eq!(nvs.serial, "AE12345678");
    }

    #[test]
    fn parse_nvs_fw_version() {
        let mut data = make_valid_nor();
        // 02.50.00.01 stored as u32 LE: [0x01, 0x00, 0x50, 0x02]
        data[FW_VERSION_OFFSET..FW_VERSION_OFFSET + 4].copy_from_slice(&[0x01, 0x00, 0x50, 0x02]);
        let nvs = parse_nvs(&data).unwrap();
        assert_eq!(nvs.fw_version, "02.50.00.01");
    }

    #[test]
    fn parse_nvs_too_short() {
        assert!(parse_nvs(&vec![0u8; 1024]).is_none());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
/usr/bin/cargo test -p fixplay-core nor 2>&1 | tail -20
```

Expected: FAIL with panics on `todo!()`.

- [ ] **Step 3: Add `NorValidation`, `NvsData`, `FlashReadResult` to `crates/fixplay-core/src/types.rs`**

Append after the existing `ErrlogEntry` struct:

```rust
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
    pub serial:       String,
    pub mac_address:  String,
    pub sku:          String,
    pub board_id:     String,
    pub console_type: u32,
    pub fw_version:   String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashReadResult {
    pub dumps_match:  bool,
    pub validation:   NorValidation,
    pub nvs:          Option<NvsData>,
    pub archive_path: String,
}
```

- [ ] **Step 4: Implement `validate`, `parse_nvs`, and helpers in `nor.rs`**

Replace the `pub fn validate`, `pub fn parse_nvs`, and helper stubs with real implementations:

```rust
use crate::types::{NorValidation, NvsData};

pub const EXPECTED_SIZE: usize = 0x200000;

const HEADER_MAGIC:    &[u8; 32] = b"SONY COMPUTER ENTERTAINMENT INC.";
const MBR_MAGIC:       &[u8; 32] = b"Sony Computer Entertainment Inc.";
const SLB2_MAGIC:      &[u8; 4]  = b"SLB2";

const HEADER_OFFSET:    usize = 0x00000;
const MBR1_OFFSET:      usize = 0x02000;
const MBR2_OFFSET:      usize = 0x03000;
const EMC_IPL_A_OFFSET: usize = 0x04000;
const EMC_IPL_B_OFFSET: usize = 0x82000;
const USB_PDC_A_OFFSET: usize = 0x100000;
const USB_PDC_B_OFFSET: usize = 0x110000;

const MAC_OFFSET:        usize = 0x1C4020;
const SERIAL_OFFSET:     usize = 0x1C7210;
const SKU_OFFSET:        usize = 0x1C7230;
const BOARD_ID_OFFSET:   usize = 0x1C7250;
const FW_VERSION_OFFSET: usize = 0x1C8068;

pub fn validate(data: &[u8]) -> NorValidation {
    let check = |offset: usize, magic: &[u8]| -> bool {
        data.len() >= offset + magic.len() && &data[offset..offset + magic.len()] == magic
    };
    NorValidation {
        size_ok:       data.len() == EXPECTED_SIZE,
        header_ok:     check(HEADER_OFFSET,    HEADER_MAGIC),
        mbr1_ok:       check(MBR1_OFFSET,      MBR_MAGIC),
        mbr2_ok:       check(MBR2_OFFSET,      MBR_MAGIC),
        emc_ipl_a_ok:  check(EMC_IPL_A_OFFSET, SLB2_MAGIC),
        emc_ipl_b_ok:  check(EMC_IPL_B_OFFSET, SLB2_MAGIC),
        usb_pdc_a_ok:  check(USB_PDC_A_OFFSET, SLB2_MAGIC),
        usb_pdc_b_ok:  check(USB_PDC_B_OFFSET, SLB2_MAGIC),
    }
}

pub fn parse_nvs(data: &[u8]) -> Option<NvsData> {
    if data.len() < EXPECTED_SIZE {
        return None;
    }
    let mac_bytes: [u8; 6] = data[MAC_OFFSET..MAC_OFFSET + 6].try_into().ok()?;
    let console_type = u32::from_be_bytes(
        data[0x1C7010..0x1C7010 + 4].try_into().ok()?
    );
    let fw_bytes: [u8; 4] = data[FW_VERSION_OFFSET..FW_VERSION_OFFSET + 4].try_into().ok()?;
    let fw_raw = u32::from_le_bytes(fw_bytes);
    Some(NvsData {
        serial:       read_ff_string(&data[SERIAL_OFFSET..SERIAL_OFFSET + 32]),
        mac_address:  bytes_to_mac(&mac_bytes),
        sku:          read_cstring(&data[SKU_OFFSET..SKU_OFFSET + 16]),
        board_id:     read_cstring(&data[BOARD_ID_OFFSET..BOARD_ID_OFFSET + 13]),
        console_type,
        fw_version:   fw_version_from_u32(fw_raw),
    })
}

fn read_cstring(bytes: &[u8]) -> String {
    let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
    bytes[..end].iter()
        .filter(|&&b| b.is_ascii_graphic() || b == b' ')
        .map(|&b| b as char)
        .collect()
}

fn read_ff_string(bytes: &[u8]) -> String {
    let end = bytes.iter().position(|&b| b == 0xFF).unwrap_or(bytes.len());
    bytes[..end].iter()
        .filter(|&&b| b.is_ascii_graphic() || b == b' ')
        .map(|&b| b as char)
        .collect()
}

fn bytes_to_mac(bytes: &[u8; 6]) -> String {
    format!(
        "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]
    )
}

fn fw_version_from_u32(v: u32) -> String {
    let b = v.to_be_bytes();
    format!("{:02X}.{:02X}.{:02X}.{:02X}", b[0], b[1], b[2], b[3])
}
```

Keep the `#[cfg(test)]` block from Step 1 at the bottom of the file.

- [ ] **Step 5: Run tests to verify they pass**

```bash
/usr/bin/cargo test -p fixplay-core nor
```

Expected: 5 tests pass.

- [ ] **Step 6: Run full test suite**

```bash
/usr/bin/cargo test --workspace
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add crates/fixplay-core/src/nor.rs crates/fixplay-core/src/types.rs crates/fixplay-core/src/lib.rs
git commit -m "feat(core): add PS5 NOR validator, NVS parser, and flash result types"
```

---

## Task 3: `FlashromDevice` subprocess implementation

**Files:**

- Rewrite: `crates/fixplay-flashrom/src/flashrom.rs`

- [ ] **Step 1: Write failing tests for progress parsing**

Add these tests to the bottom of `crates/fixplay-flashrom/src/flashrom.rs` (replace the existing `#[cfg(test)]` block):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flashrom_path_has_correct_extension() {
        let dir = std::path::PathBuf::from("/tmp");
        let p = flashrom_path(&dir);
        #[cfg(target_os = "windows")]
        assert_eq!(p.file_name().unwrap(), "flashrom.exe");
        #[cfg(not(target_os = "windows"))]
        assert_eq!(p.file_name().unwrap(), "flashrom");
    }

    #[test]
    fn parse_progress_5_percent() {
        assert_eq!(parse_progress("Writing at 0x001000...  (  5%)"), Some(5));
    }

    #[test]
    fn parse_progress_100_percent() {
        assert_eq!(parse_progress("Reading at 0x1fe000... (100%)"), Some(100));
    }

    #[test]
    fn parse_progress_no_match() {
        assert_eq!(parse_progress("Reading flash... done."), None);
    }

    #[test]
    fn parse_progress_empty_line() {
        assert_eq!(parse_progress(""), None);
    }
}
```

- [ ] **Step 2: Run tests to verify `parse_progress` fails (not yet defined)**

```bash
/usr/bin/cargo test -p fixplay-flashrom 2>&1 | tail -10
```

Expected: FAIL — `parse_progress` not defined.

- [ ] **Step 3: Implement `FlashromDevice` with full subprocess logic**

Replace the entire `crates/fixplay-flashrom/src/flashrom.rs`:

```rust
use fixplay_core::{
    error::{AppError, FlashError},
    traits::FlashDevice,
    types::{ChipId, FlashProgress},
};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tracing::info;

#[derive(Clone)]
pub struct FlashromDevice {
    pub programmer:  String,
    pub binary_path: PathBuf,
}

pub fn flashrom_path(resource_dir: &std::path::Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    return resource_dir.join("flashrom.exe");
    #[cfg(not(target_os = "windows"))]
    resource_dir.join("flashrom")
}

fn parse_progress(line: &str) -> Option<u8> {
    let start = line.rfind('(')?;
    let end = line[start..].find('%').map(|i| start + i)?;
    line[start + 1..end].trim().parse::<u8>().ok()
}

impl FlashDevice for FlashromDevice {
    fn read_flash(&self, on_progress: &dyn Fn(FlashProgress)) -> Result<Vec<u8>, AppError> {
        info!("reading flash with programmer {}", self.programmer);
        let tmp = std::env::temp_dir()
            .join(format!("fixplay_read_{}.bin", std::process::id()));

        let mut child = Command::new(&self.binary_path)
            .args(["-p", &self.programmer, "--read", tmp.to_str().unwrap()])
            .stderr(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .map_err(|e| FlashError::Subprocess(e.to_string()))?;

        if let Some(stderr) = child.stderr.take() {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if let Some(pct) = parse_progress(&line) {
                    on_progress(FlashProgress { bytes_done: pct as usize, bytes_total: 100 });
                }
            }
        }

        let status = child.wait().map_err(|e| FlashError::Subprocess(e.to_string()))?;
        if !status.success() {
            let _ = std::fs::remove_file(&tmp);
            return Err(FlashError::Subprocess(
                format!("flashrom exited with status {}", status)
            ).into());
        }

        let bytes = std::fs::read(&tmp).map_err(|e| FlashError::Io(e.to_string()))?;
        let _ = std::fs::remove_file(&tmp);
        Ok(bytes)
    }

    fn write_flash(&self, data: &[u8], on_progress: &dyn Fn(FlashProgress)) -> Result<(), AppError> {
        info!("writing flash with programmer {}", self.programmer);
        let tmp = std::env::temp_dir()
            .join(format!("fixplay_write_{}.bin", std::process::id()));
        std::fs::write(&tmp, data).map_err(|e| FlashError::Io(e.to_string()))?;

        let mut child = Command::new(&self.binary_path)
            .args(["-p", &self.programmer, "--write", tmp.to_str().unwrap()])
            .stderr(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .map_err(|e| FlashError::Subprocess(e.to_string()))?;

        if let Some(stderr) = child.stderr.take() {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if let Some(pct) = parse_progress(&line) {
                    on_progress(FlashProgress { bytes_done: pct as usize, bytes_total: 100 });
                }
            }
        }

        let status = child.wait().map_err(|e| FlashError::Subprocess(e.to_string()))?;
        let _ = std::fs::remove_file(&tmp);
        if !status.success() {
            return Err(FlashError::Subprocess(
                format!("flashrom exited with status {}", status)
            ).into());
        }
        Ok(())
    }

    fn erase_flash(&self) -> Result<(), AppError> {
        info!("erasing flash with programmer {}", self.programmer);
        let status = Command::new(&self.binary_path)
            .args(["-p", &self.programmer, "--erase"])
            .status()
            .map_err(|e| FlashError::Subprocess(e.to_string()))?;
        if !status.success() {
            return Err(FlashError::Subprocess(
                format!("flashrom erase exited with status {}", status)
            ).into());
        }
        Ok(())
    }

    fn read_id(&self) -> Result<ChipId, AppError> {
        info!("reading chip ID with programmer {}", self.programmer);
        let output = Command::new(&self.binary_path)
            .args(["-p", &self.programmer, "--flash-name"])
            .output()
            .map_err(|e| FlashError::Subprocess(e.to_string()))?;
        let text = String::from_utf8_lossy(&output.stdout).to_string();
        let name = text
            .lines()
            .find(|l| l.contains("name="))
            .and_then(|l| l.split("name=").nth(1))
            .unwrap_or("Unknown")
            .trim()
            .to_string();
        Ok(ChipId { manufacturer: 0, device: 0, description: name })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flashrom_path_has_correct_extension() {
        let dir = std::path::PathBuf::from("/tmp");
        let p = flashrom_path(&dir);
        #[cfg(target_os = "windows")]
        assert_eq!(p.file_name().unwrap(), "flashrom.exe");
        #[cfg(not(target_os = "windows"))]
        assert_eq!(p.file_name().unwrap(), "flashrom");
    }

    #[test]
    fn parse_progress_5_percent() {
        assert_eq!(parse_progress("Writing at 0x001000...  (  5%)"), Some(5));
    }

    #[test]
    fn parse_progress_100_percent() {
        assert_eq!(parse_progress("Reading at 0x1fe000... (100%)"), Some(100));
    }

    #[test]
    fn parse_progress_no_match() {
        assert_eq!(parse_progress("Reading flash... done."), None);
    }

    #[test]
    fn parse_progress_empty_line() {
        assert_eq!(parse_progress(""), None);
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
/usr/bin/cargo test -p fixplay-flashrom
```

Expected: 5 tests pass.

- [ ] **Step 5: Run clippy**

```bash
/usr/bin/cargo clippy --workspace -- -D warnings
```

Expected: no warnings.

- [ ] **Step 6: Commit**

```bash
git add crates/fixplay-flashrom/src/flashrom.rs
git commit -m "feat(flashrom): implement FlashromDevice with subprocess I/O and progress parsing"
```

---

## Task 4: Tauri flash commands

**Files:**

- Rewrite: `src-tauri/src/commands/flash.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Add dependencies to `src-tauri/Cargo.toml`**

Add to `[dependencies]`:

```toml
fixplay-flashrom    = { path = "../crates/fixplay-flashrom" }
open                = "5"
tauri-plugin-dialog = "2"
```

Remove `fixplay-ch341 = { path = "../crates/fixplay-ch341" }`.

- [ ] **Step 2: Update `src-tauri/tauri.conf.json`** — add resources section

Add inside `"bundle": { ... }`, after the `"icon"` array:

```json
"resources": ["binaries/flashrom", "binaries/flashrom.exe"]
```

Full updated bundle section:

```json
"bundle": {
  "active": true,
  "targets": "all",
  "icon": [
    "icons/icon.png",
    "icons/icon_32x32.png",
    "icons/icon_128x128.png",
    "icons/icon_256x256.png"
  ],
  "resources": ["binaries/flashrom", "binaries/flashrom.exe"]
}
```

Also create the placeholder directory (the actual binaries are NOT committed):

```bash
mkdir -p src-tauri/binaries
echo "binaries/flashrom" >> .gitignore
echo "binaries/flashrom.exe" >> .gitignore
```

- [ ] **Step 3: Rewrite `src-tauri/src/commands/flash.rs`**

```rust
use fixplay_core::{
    nor,
    types::{FlashProgress, FlashReadResult, NorValidation, NvsData},
};
use fixplay_flashrom::{flashrom_path, FlashromDevice};
use fixplay_core::traits::FlashDevice;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tracing::info;

#[derive(Serialize, Clone)]
struct FlashProgressEvent {
    phase:   String,
    percent: u8,
}

#[derive(Serialize, Clone)]
struct FlashStatusEvent {
    message: String,
    level:   String,
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    open::that(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn flash_list_programmers() -> Vec<String> {
    vec![
        "ch341a_spi".into(),
        "rt809h_spi".into(),
        "serprog".into(),
        "buspirate_spi".into(),
        "ft2232_spi".into(),
    ]
}

#[tauri::command]
pub async fn flash_read(
    programmer: String,
    app: AppHandle,
) -> Result<FlashReadResult, String> {
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let device = FlashromDevice {
        programmer: programmer.clone(),
        binary_path: flashrom_path(&resource_dir),
    };

    emit_status(&app, "Erster Lesevorgang...", "info");
    info!("flash_read: first pass, programmer={}", programmer);

    let bytes1 = {
        let app_c  = app.clone();
        let dev    = device.clone();
        tokio::task::spawn_blocking(move || {
            dev.read_flash(&|p: FlashProgress| {
                let _ = app_c.emit("flash://progress", FlashProgressEvent {
                    phase:   "read1".into(),
                    percent: p.percent() as u8,
                });
            })
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?
    };

    emit_status(&app, "Zweiter Lesevorgang...", "info");
    info!("flash_read: second pass");

    let bytes2 = {
        let app_c = app.clone();
        let dev   = device.clone();
        tokio::task::spawn_blocking(move || {
            dev.read_flash(&|p: FlashProgress| {
                let _ = app_c.emit("flash://progress", FlashProgressEvent {
                    phase:   "read2".into(),
                    percent: p.percent() as u8,
                });
            })
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?
    };

    let dumps_match = bytes1 == bytes2;
    if dumps_match {
        emit_status(&app, "Beide Dumps identisch ✓", "info");
    } else {
        emit_status(&app, "Warnung: Dumps weichen voneinander ab!", "warn");
    }

    let validation = nor::validate(&bytes1);
    let nvs        = nor::parse_nvs(&bytes1);

    if validation.is_valid() {
        emit_status(&app, "NOR-Validierung bestanden ✓", "info");
    } else {
        emit_status(&app, "Warnung: NOR-Validierung fehlgeschlagen!", "warn");
    }

    let archive_path = archive_dump(&app, &bytes1, &nvs, &validation)?;
    emit_status(&app, &format!("Archiviert: {}", archive_path), "info");

    let result = FlashReadResult { dumps_match, validation, nvs, archive_path };
    app.emit("flash://result", result.clone()).map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn flash_write(
    path: String,
    programmer: String,
    app: AppHandle,
) -> Result<(), String> {
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let device = FlashromDevice {
        programmer: programmer.clone(),
        binary_path: flashrom_path(&resource_dir),
    };

    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    emit_status(&app, "Schreibe NOR (Löschen + Schreiben + Verifizieren)...", "info");
    info!("flash_write: path={}, programmer={}", path, programmer);

    {
        let app_c = app.clone();
        let dev   = device.clone();
        tokio::task::spawn_blocking(move || {
            dev.write_flash(&data, &|p: FlashProgress| {
                let _ = app_c.emit("flash://progress", FlashProgressEvent {
                    phase:   "write".into(),
                    percent: p.percent() as u8,
                });
            })
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    }

    emit_status(&app, "NOR erfolgreich geschrieben ✓", "info");
    Ok(())
}

fn emit_status(app: &AppHandle, message: &str, level: &str) {
    let _ = app.emit("flash://status", FlashStatusEvent {
        message: message.to_string(),
        level:   level.to_string(),
    });
}

fn archive_dump(
    app:        &AppHandle,
    bytes:      &[u8],
    nvs:        &Option<NvsData>,
    validation: &NorValidation,
) -> Result<String, String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let serial_dir = nvs
        .as_ref()
        .map(|n| n.serial.clone())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("unknown_{}", timestamp));

    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("dumps")
        .join(&serial_dir);

    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;

    let stem     = format!("nor_{}", timestamp);
    let bin_path = base.join(format!("{}.bin", stem));
    let json_path = base.join(format!("{}.json", stem));

    std::fs::write(&bin_path, bytes).map_err(|e| e.to_string())?;

    #[derive(serde::Serialize)]
    struct Meta<'a> {
        timestamp:  u64,
        nvs:        &'a Option<NvsData>,
        validation: &'a NorValidation,
        size_bytes: usize,
    }
    let meta = Meta { timestamp, nvs, validation, size_bytes: bytes.len() };
    std::fs::write(
        &json_path,
        serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    Ok(base.to_string_lossy().to_string())
}
```

- [ ] **Step 4: Update `src-tauri/src/lib.rs`**

Replace the entire file:

```rust
mod commands;
mod state;

use state::AppState;
use tauri::Manager;

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let cache_path = app
                .path()
                .app_data_dir()?
                .join("error_codes.json");
            let state = app.state::<AppState>();
            match fixplay_uart::ErrorDb::from_cache(&cache_path) {
                Ok(db) => {
                    *state.error_db.lock().unwrap() = Some(db);
                    tracing::info!("error DB loaded from cache");
                }
                Err(e) => tracing::warn!("error DB not cached yet: {}", e),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::flash::open_path,
            commands::flash::flash_list_programmers,
            commands::flash::flash_read,
            commands::flash::flash_write,
            commands::uart::uart_list_ports,
            commands::uart::uart_connect,
            commands::uart::uart_disconnect,
            commands::uart::uart_send_errlog,
            commands::uart::uart_send_version,
            commands::uart::uart_set_auto_poll,
            commands::uart::uart_update_error_db,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Verify compilation**

```bash
/usr/bin/cargo build -p fixplay-tauri
```

Expected: compiles without errors.

- [ ] **Step 6: Run full tests + clippy**

```bash
/usr/bin/cargo test --workspace && /usr/bin/cargo clippy --workspace -- -D warnings
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/flash.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/tauri.conf.json .gitignore
git commit -m "feat(tauri): add flash_read, flash_write, flash_list_programmers, open_path commands"
```

---

## Task 5: Frontend types, stores, API, and tests

**Files:**

- Modify: `src/lib/api/types.ts`
- Create: `src/lib/stores/flash.ts`
- Create: `src/lib/stores/flash.test.ts`
- Modify: `src/lib/api/tauri.ts`

- [ ] **Step 1: Write failing store tests**

Create `src/lib/stores/flash.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { flashBusy, flashProgress, flashResult, flashLog } from './flash';

describe('flash stores', () => {
  beforeEach(() => {
    flashBusy.set(false);
    flashProgress.set(null);
    flashResult.set(null);
    flashLog.set([]);
  });

  it('flashBusy starts as false', () => {
    expect(get(flashBusy)).toBe(false);
  });

  it('flashProgress starts as null', () => {
    expect(get(flashProgress)).toBeNull();
  });

  it('flashResult starts as null', () => {
    expect(get(flashResult)).toBeNull();
  });

  it('flashLog starts empty', () => {
    expect(get(flashLog)).toHaveLength(0);
  });

  it('flashBusy can be set', () => {
    flashBusy.set(true);
    expect(get(flashBusy)).toBe(true);
  });

  it('flashProgress can be updated', () => {
    flashProgress.set({ phase: 'read1', percent: 42 });
    expect(get(flashProgress)).toEqual({ phase: 'read1', percent: 42 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- --run 2>&1 | tail -10
```

Expected: FAIL — `./flash` not found.

- [ ] **Step 3: Append flash types to `src/lib/api/types.ts`**

Add after the last existing type:

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

- [ ] **Step 4: Create `src/lib/stores/flash.ts`**

```ts
import { writable } from 'svelte/store';
import type { FlashReadResult, FlashLogEntry } from '$lib/api/types';

export const flashBusy = writable<boolean>(false);
export const flashProgress = writable<{ phase: string; percent: number } | null>(null);
export const flashResult = writable<FlashReadResult | null>(null);
export const flashLog = writable<FlashLogEntry[]>([]);
export const flashProgrammer = writable<string>('ch341a_spi');

let _nextId = 0;
export function nextFlashLogId(): number {
  return _nextId++;
}
```

- [ ] **Step 5: Add flash wrappers to `src/lib/api/tauri.ts`**

Find the existing `import type { ... } from './types'` line at the top of the file and add `FlashReadResult` to it. Then append the four new exports at the bottom:

```ts
// Merge FlashReadResult into the existing import type line, e.g.:
// import type { UartEntryEvent, UartLogEntry, UartStatusEvent, FlashReadResult } from './types';

export const flashListProgrammers = () => invoke<string[]>('flash_list_programmers');
export const flashRead = (programmer: string) =>
  invoke<FlashReadResult>('flash_read', { programmer });
export const flashWrite = (path: string, programmer: string) =>
  invoke<void>('flash_write', { path, programmer });
export const openPath = (path: string) => invoke<void>('open_path', { path });
```

`invoke` is already imported at the top — do not duplicate it.

- [ ] **Step 6: Install dialog plugin**

```bash
npm install @tauri-apps/plugin-dialog
```

- [ ] **Step 7: Run tests**

```bash
npm run test -- --run
```

Expected: 19 total tests pass (13 existing + 6 new flash store tests).

- [ ] **Step 8: Run type check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/api/types.ts src/lib/stores/flash.ts src/lib/stores/flash.test.ts src/lib/api/tauri.ts package.json package-lock.json
git commit -m "feat(frontend): add flash types, stores, API wrappers, and tests"
```

---

## Task 6: FlashPanel.svelte rewrite

**Files:**

- Rewrite: `src/lib/components/FlashPanel.svelte`

- [ ] **Step 1: Rewrite `src/lib/components/FlashPanel.svelte`**

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
  import { open as openDialog } from '@tauri-apps/plugin-dialog';
  import {
    flashBusy,
    flashProgress,
    flashResult,
    flashLog,
    flashProgrammer,
    nextFlashLogId,
  } from '$lib/stores/flash';
  import { flashListProgrammers, flashRead, flashWrite, openPath } from '$lib/api/tauri';
  import type { FlashProgressEvent, FlashStatusEvent, FlashReadResult } from '$lib/api/types';

  let programmers = $state<string[]>([]);
  let phaseLabel = $state('');

  const PHASE_LABELS: Record<string, string> = {
    read1: 'Lesen 1/2…',
    read2: 'Lesen 2/2…',
    write: 'Schreiben…',
    verify: 'Verifizieren…',
  };

  const unlisten: Array<() => void> = [];

  onMount(async () => {
    programmers = await flashListProgrammers().catch(() => []);
    if (programmers.length > 0 && !$flashProgrammer) {
      flashProgrammer.set(programmers[0]);
    }

    const [u1, u2, u3] = await Promise.all([
      listen<FlashProgressEvent>('flash://progress', (e) => {
        flashProgress.set(e.payload);
        phaseLabel = PHASE_LABELS[e.payload.phase] ?? e.payload.phase;
      }),
      listen<FlashStatusEvent>('flash://status', (e) => {
        flashLog.update((log) => [
          {
            id: nextFlashLogId(),
            timestamp_ms: Date.now(),
            message: e.payload.message,
            level: e.payload.level as 'info' | 'warn' | 'error',
          },
          ...log.slice(0, 199),
        ]);
      }),
      listen<FlashReadResult>('flash://result', (e) => {
        flashResult.set(e.payload);
        flashBusy.set(false);
        flashProgress.set(null);
      }),
    ]);
    unlisten.push(u1, u2, u3);
  });

  onDestroy(() => unlisten.forEach((fn) => fn()));

  async function handleRead() {
    flashBusy.set(true);
    flashResult.set(null);
    flashLog.set([]);
    flashProgress.set(null);
    await flashRead($flashProgrammer).catch((e: unknown) => {
      flashLog.update((log) => [
        { id: nextFlashLogId(), timestamp_ms: Date.now(), message: String(e), level: 'error' },
        ...log,
      ]);
      flashBusy.set(false);
      flashProgress.set(null);
    });
  }

  async function handleWrite() {
    const selected = await openDialog({
      title: 'NOR-Datei wählen',
      filters: [{ name: 'NOR Binary', extensions: ['bin'] }],
    });
    if (!selected || typeof selected !== 'string') return;

    flashBusy.set(true);
    flashLog.set([]);
    flashProgress.set(null);
    try {
      await flashWrite(selected, $flashProgrammer);
    } catch (e: unknown) {
      flashLog.update((log) => [
        { id: nextFlashLogId(), timestamp_ms: Date.now(), message: String(e), level: 'error' },
        ...log,
      ]);
    } finally {
      flashBusy.set(false);
      flashProgress.set(null);
    }
  }
</script>

<section class="flex flex-col gap-4 flex-1 bg-gray-900 rounded-lg p-4 min-h-0">
  <h2 class="text-lg font-semibold text-gray-100">Flash Diagnose</h2>

  <!-- Controls -->
  <div class="flex flex-wrap items-center gap-2">
    <select
      bind:value={$flashProgrammer}
      disabled={$flashBusy}
      class="bg-gray-800 text-gray-100 text-sm rounded px-2 py-1 border border-gray-700
             disabled:opacity-50"
    >
      {#each programmers as p}
        <option value={p}>{p}</option>
      {:else}
        <option value="">Keine Programmer gefunden</option>
      {/each}
    </select>

    <button
      onclick={handleRead}
      disabled={$flashBusy || !$flashProgrammer}
      class="px-3 py-1 text-sm rounded bg-blue-700 hover:bg-blue-600 text-white
             disabled:opacity-40"
    >
      {$flashBusy ? 'Läuft…' : 'Lesen'}
    </button>

    <button
      onclick={handleWrite}
      disabled={$flashBusy || !$flashProgrammer}
      class="px-3 py-1 text-sm rounded bg-orange-700 hover:bg-orange-600 text-white
             disabled:opacity-40"
    >
      Schreiben
    </button>
  </div>

  <!-- Progress bar -->
  {#if $flashProgress !== null}
    <div class="flex flex-col gap-1">
      <div class="flex justify-between text-xs text-gray-400">
        <span>{phaseLabel}</span>
        <span>{$flashProgress.percent}%</span>
      </div>
      <div class="w-full bg-gray-700 rounded-full h-2">
        <div
          class="bg-blue-500 h-2 rounded-full transition-all duration-200"
          style="width: {$flashProgress.percent}%"
        ></div>
      </div>
    </div>
  {/if}

  <!-- Result card -->
  {#if $flashResult}
    {@const r = $flashResult}
    <div class="rounded bg-gray-800 border border-gray-700 p-3 text-xs flex flex-col gap-3">
      <!-- Dump match badge -->
      <div class="flex items-center gap-2">
        <span class="text-gray-400 font-semibold">Dump-Vergleich:</span>
        <span class={r.dumps_match ? 'text-green-400' : 'text-yellow-400'}>
          {r.dumps_match ? '✓ Identisch' : '⚠ Abweichung erkannt'}
        </span>
      </div>

      <!-- Validation checklist -->
      <div>
        <p class="text-gray-400 font-semibold mb-1">Validierung:</p>
        <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
          {#each [{ label: 'NOR Header', ok: r.validation.header_ok }, { label: 'MBR 1', ok: r.validation.mbr1_ok }, { label: 'MBR 2', ok: r.validation.mbr2_ok }, { label: 'EmcIpl A', ok: r.validation.emc_ipl_a_ok }, { label: 'EmcIpl B', ok: r.validation.emc_ipl_b_ok }, { label: 'USB PDC A', ok: r.validation.usb_pdc_a_ok }, { label: 'USB PDC B', ok: r.validation.usb_pdc_b_ok }, { label: 'Größe (2 MB)', ok: r.validation.size_ok }] as item}
            <div class="flex items-center gap-1">
              <span class={item.ok ? 'text-green-400' : 'text-red-400'}>{item.ok ? '✓' : '✗'}</span>
              <span class="text-gray-300">{item.label}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- NVS info -->
      {#if r.nvs}
        <div>
          <p class="text-gray-400 font-semibold mb-1">Konsoleninfo:</p>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt class="text-gray-500">Serial:</dt>
            <dd class="text-gray-200 font-mono">{r.nvs.serial || '—'}</dd>
            <dt class="text-gray-500">MAC:</dt>
            <dd class="text-gray-200 font-mono">{r.nvs.mac_address}</dd>
            <dt class="text-gray-500">SKU:</dt>
            <dd class="text-gray-200">{r.nvs.sku || '—'}</dd>
            <dt class="text-gray-500">Board ID:</dt>
            <dd class="text-gray-200 font-mono">{r.nvs.board_id || '—'}</dd>
            <dt class="text-gray-500">Firmware:</dt>
            <dd class="text-gray-200 font-mono">{r.nvs.fw_version}</dd>
          </dl>
        </div>
      {/if}

      <!-- Archive path -->
      <div class="flex items-center gap-2">
        <span class="text-gray-500 shrink-0">Archiv:</span>
        <span class="text-gray-300 font-mono text-xs truncate flex-1">{r.archive_path}</span>
        <button
          onclick={() => openPath(r.archive_path)}
          class="text-xs text-blue-400 hover:text-blue-300 shrink-0"
        >
          Öffnen
        </button>
      </div>
    </div>
  {/if}

  <!-- Status log -->
  <div class="flex-1 min-h-32 overflow-y-auto bg-gray-950 rounded p-3 flex flex-col gap-1">
    {#each $flashLog as entry (entry.id)}
      <div
        class="font-mono text-xs leading-relaxed {entry.level === 'error'
          ? 'text-red-400'
          : entry.level === 'warn'
            ? 'text-yellow-400'
            : 'text-green-400'}"
      >
        <span class="text-gray-600 mr-2">{new Date(entry.timestamp_ms).toLocaleTimeString()}</span>
        {entry.message}
      </div>
    {:else}
      <span class="text-gray-600 text-xs">Kein Output…</span>
    {/each}
  </div>
</section>
```

- [ ] **Step 2: Run type check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 3: Run all tests**

```bash
npm run test -- --run
```

Expected: 19 tests pass.

- [ ] **Step 4: Run Rust tests + clippy**

```bash
/usr/bin/cargo test --workspace && /usr/bin/cargo clippy --workspace -- -D warnings
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/FlashPanel.svelte
git commit -m "feat(ui): rewrite FlashPanel with progress, NOR validation, and NVS info display"
```
