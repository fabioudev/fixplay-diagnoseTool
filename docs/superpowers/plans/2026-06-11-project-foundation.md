# Project Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the complete Tauri v2 + Rust Cargo workspace + SvelteKit frontend project foundation with all crates, stores, tooling, and best practices in place — no feature logic yet, just the clean skeleton everything else will build on.

**Architecture:** Cargo workspace with three library crates (`fixplay-core`, `fixplay-ch341`, `fixplay-uart`) and the Tauri binary (`src-tauri`), with a strict unidirectional dependency graph. The frontend is SvelteKit + TypeScript with Tailwind CSS and typed Tauri IPC wrappers.

**Tech Stack:** Rust 2021 edition, Tauri v2, SvelteKit, TypeScript, Tailwind CSS, shadcn-svelte (later), Vitest, thiserror, tracing, rusb, serialport

---

## File Map

| File | Responsibility |
|---|---|
| `Cargo.toml` | Workspace root; shared dependency versions |
| `crates/fixplay-core/src/error.rs` | `AppError`, `Ch341Error`, `UartError` enums |
| `crates/fixplay-core/src/types.rs` | Shared domain types (`DeviceInfo`, `FlashInfo`, `UartMessage`, etc.) |
| `crates/fixplay-core/src/traits.rs` | `FlashDevice` + `UartDevice` traits (enables mocking) |
| `crates/fixplay-core/src/lib.rs` | Re-exports all core modules |
| `crates/fixplay-ch341/src/device.rs` | `Ch341Device` stub + `FlashDevice` impl (returns errors) |
| `crates/fixplay-ch341/src/lib.rs` | Re-exports |
| `crates/fixplay-uart/src/port.rs` | `UartPort` stub + `UartDevice` impl (returns errors) |
| `crates/fixplay-uart/src/lib.rs` | Re-exports |
| `src-tauri/src/state.rs` | `AppState` with `Mutex<Option<…>>` device handles |
| `src-tauri/src/commands/flash.rs` | `scan_devices` Tauri command stub |
| `src-tauri/src/commands/uart.rs` | `list_ports` Tauri command stub |
| `src-tauri/src/commands/mod.rs` | Pub re-export of command modules |
| `src-tauri/src/lib.rs` | `run()` entrypoint; Tauri builder + logging init |
| `src-tauri/src/main.rs` | Binary main; calls `lib::run()` |
| `src/app.html` | SvelteKit HTML shell (dark class on `<html>`) |
| `src/app.css` | Tailwind directives |
| `src/routes/+layout.ts` | SPA mode: `ssr = false`, `prerender = true` |
| `src/routes/+layout.svelte` | Global CSS import + slot |
| `src/routes/+page.svelte` | Main page; renders FlashPanel + UartPanel |
| `src/lib/api/types.ts` | TypeScript mirrors of Rust domain types |
| `src/lib/api/tauri.ts` | Typed `invoke()` wrappers |
| `src/lib/stores/flash.ts` | `flashDevices`, `flashBusy`, `flashProgress` stores |
| `src/lib/stores/uart.ts` | `uartLog`, `uartConnected` stores |
| `src/lib/stores/flash.test.ts` | Vitest tests for flash store |
| `src/lib/stores/uart.test.ts` | Vitest tests for uart store |
| `src/lib/utils.ts` | `cn()` helper (clsx + tailwind-merge) used by shadcn components |
| `components.json` | shadcn-svelte project config |
| `src/lib/components/ui/` | shadcn-svelte primitive components (populated per-component on demand) |
| `src/lib/components/FlashPanel.svelte` | Flash section UI scaffold |
| `src/lib/components/UartPanel.svelte` | UART log section UI scaffold |
| `Makefile` | `dev`, `build`, `test`, `lint`, `fmt` targets |
| `.editorconfig` | Consistent formatting (4-space Rust, 2-space everything else) |
| `eslint.config.js` | ESLint flat config for TS + Svelte |
| `.prettierrc` | Prettier config with svelte plugin |

---

## Task 1: Cargo Workspace Root

**Files:**
- Create: `Cargo.toml`

- [ ] **Create workspace `Cargo.toml`**

```toml
[workspace]
resolver = "2"
members = [
    "crates/fixplay-core",
    "crates/fixplay-ch341",
    "crates/fixplay-uart",
    "src-tauri",
]

[workspace.dependencies]
serde       = { version = "1", features = ["derive"] }
thiserror   = "1"
tracing     = "0.1"
tokio       = { version = "1", features = ["full"] }
anyhow      = "1"
serde_json  = "1"
```

- [ ] **Verify workspace syntax**

```bash
cargo metadata --no-deps --quiet > /dev/null
```

Expected: no output, exit code 0. (The member crates don't exist yet — that's fine, they'll be added in subsequent tasks.)

---

## Task 2: fixplay-core — Error Types

**Files:**
- Create: `crates/fixplay-core/Cargo.toml`
- Create: `crates/fixplay-core/src/lib.rs`
- Create: `crates/fixplay-core/src/error.rs`

- [ ] **Create `crates/fixplay-core/Cargo.toml`**

```toml
[package]
name    = "fixplay-core"
version = "0.1.0"
edition = "2021"

[dependencies]
serde     = { workspace = true }
thiserror = { workspace = true }
tracing   = { workspace = true }

[dev-dependencies]
serde_json = { workspace = true }
```

- [ ] **Create stub `crates/fixplay-core/src/lib.rs`** (just enough to compile)

```rust
pub mod error;
```

- [ ] **Write failing tests in `crates/fixplay-core/src/error.rs`**

```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {}

#[derive(Debug, thiserror::Error)]
pub enum Ch341Error {}

#[derive(Debug, thiserror::Error)]
pub enum UartError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ch341_device_not_found_message() {
        let err = Ch341Error::DeviceNotFound;
        assert_eq!(err.to_string(), "device not found");
    }

    #[test]
    fn uart_not_connected_message() {
        let err = UartError::NotConnected;
        assert_eq!(err.to_string(), "not connected");
    }

    #[test]
    fn app_error_from_ch341() {
        let ch_err = Ch341Error::DeviceNotFound;
        let app_err: AppError = ch_err.into();
        assert!(app_err.to_string().contains("CH341"));
    }

    #[test]
    fn app_error_from_uart() {
        let u_err = UartError::NotConnected;
        let app_err: AppError = u_err.into();
        assert!(app_err.to_string().contains("UART"));
    }
}
```

- [ ] **Run tests to verify they fail**

```bash
cargo test -p fixplay-core
```

Expected: compile errors — `DeviceNotFound`, `NotConnected` variants don't exist yet.

- [ ] **Implement full error types in `crates/fixplay-core/src/error.rs`**

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("CH341 error: {0}")]
    Ch341(#[from] Ch341Error),
    #[error("UART error: {0}")]
    Uart(#[from] UartError),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Error)]
pub enum Ch341Error {
    #[error("device not found")]
    DeviceNotFound,
    #[error("USB error: {0}")]
    Usb(String),
    #[error("transfer failed: {0}")]
    Transfer(String),
}

#[derive(Debug, Error)]
pub enum UartError {
    #[error("port not found: {0}")]
    PortNotFound(String),
    #[error("serial error: {0}")]
    Serial(String),
    #[error("not connected")]
    NotConnected,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ch341_device_not_found_message() {
        let err = Ch341Error::DeviceNotFound;
        assert_eq!(err.to_string(), "device not found");
    }

    #[test]
    fn uart_not_connected_message() {
        let err = UartError::NotConnected;
        assert_eq!(err.to_string(), "not connected");
    }

    #[test]
    fn app_error_from_ch341() {
        let ch_err = Ch341Error::DeviceNotFound;
        let app_err: AppError = ch_err.into();
        assert!(app_err.to_string().contains("CH341"));
    }

    #[test]
    fn app_error_from_uart() {
        let u_err = UartError::NotConnected;
        let app_err: AppError = u_err.into();
        assert!(app_err.to_string().contains("UART"));
    }
}
```

- [ ] **Run tests to verify they pass**

```bash
cargo test -p fixplay-core
```

Expected: `test result: ok. 4 passed`

- [ ] **Commit**

```bash
git add crates/fixplay-core/
git commit -m "feat(core): add AppError, Ch341Error, UartError with thiserror"
```

---

## Task 3: fixplay-core — Domain Types and Traits

**Files:**
- Create: `crates/fixplay-core/src/types.rs`
- Create: `crates/fixplay-core/src/traits.rs`
- Modify: `crates/fixplay-core/src/lib.rs`

- [ ] **Write failing test in `crates/fixplay-core/src/types.rs`**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_info_roundtrips_json() {
        let info = DeviceInfo {
            id: "usb:001".into(),
            name: "CH341B".into(),
            device_type: DeviceType::Ch341,
        };
        let json = serde_json::to_string(&info).unwrap();
        let back: DeviceInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, "usb:001");
        assert_eq!(back.name, "CH341B");
    }

    #[test]
    fn flash_progress_percentage() {
        let p = FlashProgress { bytes_done: 512, bytes_total: 1024 };
        assert_eq!(p.percent(), 50);
    }
}
```

- [ ] **Run test to verify it fails**

```bash
cargo test -p fixplay-core types
```

Expected: compile error — types not defined.

- [ ] **Implement `crates/fixplay-core/src/types.rs`**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub id:          String,
    pub name:        String,
    pub device_type: DeviceType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DeviceType {
    Ch341,
    Uart,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChipId {
    pub manufacturer: u8,
    pub device:       u16,
    pub description:  String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashInfo {
    pub chip_id:    ChipId,
    pub size_bytes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashProgress {
    pub bytes_done:  usize,
    pub bytes_total: usize,
}

impl FlashProgress {
    pub fn percent(&self) -> usize {
        if self.bytes_total == 0 {
            return 0;
        }
        self.bytes_done * 100 / self.bytes_total
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UartMessage {
    pub timestamp: u64,
    pub raw:       String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_info_roundtrips_json() {
        let info = DeviceInfo {
            id:          "usb:001".into(),
            name:        "CH341B".into(),
            device_type: DeviceType::Ch341,
        };
        let json = serde_json::to_string(&info).unwrap();
        let back: DeviceInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, "usb:001");
        assert_eq!(back.name, "CH341B");
    }

    #[test]
    fn flash_progress_percentage() {
        let p = FlashProgress { bytes_done: 512, bytes_total: 1024 };
        assert_eq!(p.percent(), 50);
    }

    #[test]
    fn flash_progress_zero_total() {
        let p = FlashProgress { bytes_done: 0, bytes_total: 0 };
        assert_eq!(p.percent(), 0);
    }
}
```

- [ ] **Create `crates/fixplay-core/src/traits.rs`**

```rust
use crate::{
    error::AppError,
    types::{ChipId, FlashProgress},
};

pub trait FlashDevice: Send + Sync {
    fn read_id(&self) -> Result<ChipId, AppError>;
    fn read_flash(&self, on_progress: &dyn Fn(FlashProgress)) -> Result<Vec<u8>, AppError>;
    fn write_flash(
        &self,
        data: &[u8],
        on_progress: &dyn Fn(FlashProgress),
    ) -> Result<(), AppError>;
    fn erase_flash(&self) -> Result<(), AppError>;
}

pub trait UartDevice: Send + Sync {
    fn connect(&mut self, port: &str, baud_rate: u32) -> Result<(), AppError>;
    fn disconnect(&mut self) -> Result<(), AppError>;
    fn read_line(&self) -> Result<Option<String>, AppError>;
    fn is_connected(&self) -> bool;
}
```

- [ ] **Update `crates/fixplay-core/src/lib.rs`**

```rust
pub mod error;
pub mod traits;
pub mod types;

pub use error::{AppError, Ch341Error, UartError};
```

- [ ] **Run all core tests**

```bash
cargo test -p fixplay-core
```

Expected: `test result: ok. 7 passed`

- [ ] **Commit**

```bash
git add crates/fixplay-core/
git commit -m "feat(core): add domain types, FlashDevice and UartDevice traits"
```

---

## Task 4: fixplay-ch341 Stub Crate

**Files:**
- Create: `crates/fixplay-ch341/Cargo.toml`
- Create: `crates/fixplay-ch341/src/lib.rs`
- Create: `crates/fixplay-ch341/src/device.rs`

- [ ] **Create `crates/fixplay-ch341/Cargo.toml`**

```toml
[package]
name    = "fixplay-ch341"
version = "0.1.0"
edition = "2021"

[dependencies]
fixplay-core = { path = "../fixplay-core" }
rusb         = "0.9"
thiserror    = { workspace = true }
tracing      = { workspace = true }
```

- [ ] **Create `crates/fixplay-ch341/src/device.rs`**

```rust
use fixplay_core::{
    error::{AppError, Ch341Error},
    traits::FlashDevice,
    types::{ChipId, FlashProgress},
};
use tracing::info;

pub struct Ch341Device;

pub struct Ch341DeviceInfo {
    pub bus:     u8,
    pub address: u8,
    pub name:    String,
}

impl Ch341Device {
    pub fn scan() -> Result<Vec<Ch341DeviceInfo>, Ch341Error> {
        info!("scanning USB bus for CH341 devices");
        Ok(vec![])
    }
}

impl FlashDevice for Ch341Device {
    fn read_id(&self) -> Result<ChipId, AppError> {
        Err(Ch341Error::Usb("not yet implemented".into()).into())
    }

    fn read_flash(&self, _on_progress: &dyn Fn(FlashProgress)) -> Result<Vec<u8>, AppError> {
        Err(Ch341Error::Usb("not yet implemented".into()).into())
    }

    fn write_flash(
        &self,
        _data: &[u8],
        _on_progress: &dyn Fn(FlashProgress),
    ) -> Result<(), AppError> {
        Err(Ch341Error::Usb("not yet implemented".into()).into())
    }

    fn erase_flash(&self) -> Result<(), AppError> {
        Err(Ch341Error::Usb("not yet implemented".into()).into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_returns_ok() {
        let result = Ch341Device::scan();
        assert!(result.is_ok());
    }

    #[test]
    fn read_id_returns_err_when_stub() {
        let dev = Ch341Device;
        assert!(dev.read_id().is_err());
    }
}
```

- [ ] **Create `crates/fixplay-ch341/src/lib.rs`**

```rust
pub mod device;
pub use device::Ch341Device;
```

- [ ] **Run tests**

```bash
cargo test -p fixplay-ch341
```

Expected: `test result: ok. 2 passed`

- [ ] **Commit**

```bash
git add crates/fixplay-ch341/
git commit -m "feat(ch341): add Ch341Device stub with FlashDevice impl"
```

---

## Task 5: fixplay-uart Stub Crate

**Files:**
- Create: `crates/fixplay-uart/Cargo.toml`
- Create: `crates/fixplay-uart/src/lib.rs`
- Create: `crates/fixplay-uart/src/port.rs`

- [ ] **Create `crates/fixplay-uart/Cargo.toml`**

```toml
[package]
name    = "fixplay-uart"
version = "0.1.0"
edition = "2021"

[dependencies]
fixplay-core = { path = "../fixplay-core" }
serialport   = "4"
thiserror    = { workspace = true }
tracing      = { workspace = true }
```

- [ ] **Create `crates/fixplay-uart/src/port.rs`**

```rust
use fixplay_core::{
    error::{AppError, UartError},
    traits::UartDevice,
};
use tracing::info;

pub struct UartPort {
    connected: bool,
}

impl Default for UartPort {
    fn default() -> Self {
        Self { connected: false }
    }
}

impl UartPort {
    pub fn list_ports() -> Result<Vec<String>, UartError> {
        info!("listing available serial ports");
        let ports = serialport::available_ports()
            .map_err(|e| UartError::Serial(e.to_string()))?;
        Ok(ports.into_iter().map(|p| p.port_name).collect())
    }
}

impl UartDevice for UartPort {
    fn connect(&mut self, _port: &str, _baud_rate: u32) -> Result<(), AppError> {
        Err(UartError::Serial("not yet implemented".into()).into())
    }

    fn disconnect(&mut self) -> Result<(), AppError> {
        self.connected = false;
        Ok(())
    }

    fn read_line(&self) -> Result<Option<String>, AppError> {
        Err(UartError::NotConnected.into())
    }

    fn is_connected(&self) -> bool {
        self.connected
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_port_is_disconnected() {
        let port = UartPort::default();
        assert!(!port.is_connected());
    }

    #[test]
    fn disconnect_on_already_disconnected_is_ok() {
        let mut port = UartPort::default();
        assert!(port.disconnect().is_ok());
    }

    #[test]
    fn read_line_when_disconnected_returns_err() {
        let port = UartPort::default();
        assert!(port.read_line().is_err());
    }
}
```

- [ ] **Create `crates/fixplay-uart/src/lib.rs`**

```rust
pub mod port;
pub use port::UartPort;
```

- [ ] **Run tests**

```bash
cargo test -p fixplay-uart
```

Expected: `test result: ok. 3 passed`

- [ ] **Commit**

```bash
git add crates/fixplay-uart/
git commit -m "feat(uart): add UartPort stub with UartDevice impl"
```

---

## Task 6: src-tauri — State, Commands, and Entry Point

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/state.rs`
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/flash.rs`
- Create: `src-tauri/src/commands/uart.rs`

- [ ] **Create `src-tauri/Cargo.toml`**

```toml
[package]
name    = "fixplay-tauri"
version = "0.1.0"
edition = "2021"

[lib]
name       = "fixplay_tauri"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
fixplay-core  = { path = "../crates/fixplay-core" }
fixplay-ch341 = { path = "../crates/fixplay-ch341" }
fixplay-uart  = { path = "../crates/fixplay-uart" }
tauri         = { version = "2", features = [] }
serde         = { workspace = true }
serde_json    = { workspace = true }
tokio         = { workspace = true }
tracing       = { workspace = true }
tracing-subscriber = { version = "0.3", features = ["env-filter", "fmt"] }
anyhow        = { workspace = true }
```

- [ ] **Create `src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Create `src-tauri/src/state.rs`**

```rust
use fixplay_ch341::Ch341Device;
use fixplay_uart::UartPort;
use std::sync::Mutex;

#[derive(Default)]
pub struct AppState {
    pub ch341: Mutex<Option<Ch341Device>>,
    pub uart:  Mutex<Option<UartPort>>,
}
```

- [ ] **Create `src-tauri/src/commands/flash.rs`**

```rust
use crate::state::AppState;
use fixplay_core::types::DeviceInfo;
use tauri::State;
use tracing::info;

#[tauri::command]
pub async fn scan_devices(_state: State<'_, AppState>) -> Result<Vec<DeviceInfo>, String> {
    info!("scan_devices command invoked");
    Ok(vec![])
}
```

- [ ] **Create `src-tauri/src/commands/uart.rs`**

```rust
use fixplay_core::types::DeviceInfo;
use tracing::info;

#[tauri::command]
pub async fn list_ports() -> Result<Vec<DeviceInfo>, String> {
    info!("list_ports command invoked");
    Ok(vec![])
}
```

- [ ] **Create `src-tauri/src/commands/mod.rs`**

```rust
pub mod flash;
pub mod uart;
```

- [ ] **Create `src-tauri/src/lib.rs`**

```rust
mod commands;
mod state;

use state::AppState;

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::flash::scan_devices,
            commands::uart::list_ports,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Create `src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    fixplay_tauri::run();
}
```

- [ ] **Create minimal `src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "fixplay-diagnoseTool",
  "version": "0.1.0",
  "identifier": "dev.fixplay.diagnosetool",
  "build": {
    "frontendDist": "../build",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "fixplay diagnoseTool",
        "width": 1200,
        "height": 800,
        "resizable": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": []
  }
}
```

- [ ] **Verify the Rust workspace compiles**

```bash
cargo check --workspace
```

Expected: no errors.

- [ ] **Run all workspace tests**

```bash
cargo test --workspace
```

Expected: all tests from `fixplay-core`, `fixplay-ch341`, `fixplay-uart` pass. `fixplay-tauri` has no tests yet (that's fine).

- [ ] **Run clippy on workspace**

```bash
cargo clippy --workspace -- -D warnings
```

Expected: no warnings.

- [ ] **Commit**

```bash
git add src-tauri/ Cargo.lock
git commit -m "feat(tauri): add app state, command stubs, and Tauri builder"
```

---

## Task 7: Frontend Scaffold (SvelteKit + Tailwind)

**Files:**
- Create: `package.json`
- Create: `svelte.config.js`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `src/app.html`
- Create: `src/app.css`
- Create: `src/routes/+layout.ts`
- Create: `src/routes/+layout.svelte`

- [ ] **Create `package.json`**

```json
{
  "name": "fixplay-diagnosetool",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write ."
  }
}
```

- [ ] **Install all frontend dependencies**

```bash
npm install --save-dev \
  @sveltejs/adapter-static \
  @sveltejs/kit \
  @sveltejs/vite-plugin-svelte \
  @tauri-apps/cli@next \
  autoprefixer \
  eslint \
  eslint-config-prettier \
  eslint-plugin-svelte \
  globals \
  @eslint/js \
  typescript-eslint \
  postcss \
  prettier \
  prettier-plugin-svelte \
  svelte \
  svelte-check \
  tailwindcss \
  typescript \
  vite \
  vitest

npm install @tauri-apps/api
```

- [ ] **Create `svelte.config.js`**

```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: 'index.html',
    }),
  },
};

export default config;
```

- [ ] **Create `vite.config.ts`**

```ts
/// <reference types="vitest" />
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [sveltekit()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: 'ws', host, port: 5183 }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
});
```

- [ ] **Create `tsconfig.json`**

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true
  }
}
```

- [ ] **Create `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Create `postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Create `src/app.html`**

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

- [ ] **Create `src/app.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Create `src/routes/+layout.ts`** (SPA mode for Tauri — no SSR)

```ts
export const prerender = true;
export const ssr = false;
```

- [ ] **Create `src/routes/+layout.svelte`**

```svelte
<script>
  import '../app.css';
</script>

<slot />
```

- [ ] **Sync SvelteKit and type-check**

```bash
npx svelte-kit sync && npm run check
```

Expected: no errors (tsconfig.json might warn until routes are added — that's fine).

- [ ] **Commit**

```bash
git add package.json package-lock.json svelte.config.js vite.config.ts tsconfig.json tailwind.config.ts postcss.config.js src/app.html src/app.css src/routes/
git commit -m "feat(frontend): add SvelteKit + Tailwind + Tauri scaffold"
```

---

## Task 8: Frontend API Layer

**Files:**
- Create: `src/lib/api/types.ts`
- Create: `src/lib/api/tauri.ts`

- [ ] **Create `src/lib/api/types.ts`** (TypeScript mirrors of Rust types)

```ts
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
```

- [ ] **Create `src/lib/api/tauri.ts`**

```ts
import { invoke } from '@tauri-apps/api/core';
import type { DeviceInfo } from './types';

export const scanDevices = (): Promise<DeviceInfo[]> =>
  invoke<DeviceInfo[]>('scan_devices');

export const listPorts = (): Promise<DeviceInfo[]> =>
  invoke<DeviceInfo[]>('list_ports');
```

- [ ] **Type-check**

```bash
npm run check
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/lib/api/
git commit -m "feat(frontend): add typed API layer and domain types"
```

---

## Task 9: Frontend Stores + Tests (TDD)

**Files:**
- Create: `src/lib/stores/flash.ts`
- Create: `src/lib/stores/uart.ts`
- Create: `src/lib/stores/flash.test.ts`
- Create: `src/lib/stores/uart.test.ts`

- [ ] **Write failing tests in `src/lib/stores/flash.test.ts`**

```ts
import { get } from 'svelte/store';
import { describe, it, expect, beforeEach } from 'vitest';
import { flashDevices, flashBusy, flashProgress } from './flash';

describe('flash store', () => {
  beforeEach(() => {
    flashDevices.set([]);
    flashBusy.set(false);
    flashProgress.set(null);
  });

  it('starts with empty device list', () => {
    expect(get(flashDevices)).toEqual([]);
  });

  it('starts with busy=false', () => {
    expect(get(flashBusy)).toBe(false);
  });

  it('starts with no progress', () => {
    expect(get(flashProgress)).toBeNull();
  });

  it('can update devices', () => {
    flashDevices.set([{ id: '1', name: 'CH341B', device_type: 'Ch341' }]);
    expect(get(flashDevices)).toHaveLength(1);
    expect(get(flashDevices)[0].name).toBe('CH341B');
  });

  it('can set progress', () => {
    flashProgress.set({ bytes_done: 256, bytes_total: 1024 });
    expect(get(flashProgress)?.bytes_done).toBe(256);
  });
});
```

- [ ] **Write failing tests in `src/lib/stores/uart.test.ts`**

```ts
import { get } from 'svelte/store';
import { describe, it, expect, beforeEach } from 'vitest';
import { uartLog, uartConnected } from './uart';

describe('uart store', () => {
  beforeEach(() => {
    uartLog.set([]);
    uartConnected.set(false);
  });

  it('starts disconnected', () => {
    expect(get(uartConnected)).toBe(false);
  });

  it('starts with empty log', () => {
    expect(get(uartLog)).toEqual([]);
  });

  it('can append log lines', () => {
    uartLog.update((lines) => [...lines, '[0x01] error code']);
    expect(get(uartLog)).toContain('[0x01] error code');
  });

  it('can clear log', () => {
    uartLog.set(['line1', 'line2']);
    uartLog.set([]);
    expect(get(uartLog)).toHaveLength(0);
  });
});
```

- [ ] **Run tests to verify they fail**

```bash
npm run test
```

Expected: module not found errors for `./flash` and `./uart`.

- [ ] **Create `src/lib/stores/flash.ts`**

```ts
import { writable } from 'svelte/store';
import type { DeviceInfo, FlashProgress } from '$lib/api/types';

export const flashDevices = writable<DeviceInfo[]>([]);
export const flashBusy = writable<boolean>(false);
export const flashProgress = writable<FlashProgress | null>(null);
```

- [ ] **Create `src/lib/stores/uart.ts`**

```ts
import { writable } from 'svelte/store';

export const uartLog = writable<string[]>([]);
export const uartConnected = writable<boolean>(false);
```

- [ ] **Run tests to verify they pass**

```bash
npm run test
```

Expected: `Tests 9 passed`

- [ ] **Commit**

```bash
git add src/lib/stores/
git commit -m "feat(frontend): add flash and uart stores with tests"
```

---

## Task 10: Frontend Components and Main Route

**Files:**
- Create: `src/lib/components/FlashPanel.svelte`
- Create: `src/lib/components/UartPanel.svelte`
- Create: `src/routes/+page.svelte`

- [ ] **Create `src/lib/components/FlashPanel.svelte`**

```svelte
<script lang="ts">
  import { scanDevices } from '$lib/api/tauri';
  import { flashDevices, flashBusy } from '$lib/stores/flash';

  async function handleScan() {
    flashBusy.set(true);
    try {
      const devices = await scanDevices();
      flashDevices.set(devices);
    } catch (err) {
      console.error('scan failed:', err);
    } finally {
      flashBusy.set(false);
    }
  }
</script>

<section class="flex flex-col gap-4 flex-1 bg-gray-900 rounded-lg p-4">
  <h2 class="text-lg font-semibold text-gray-100">Flash</h2>

  <button
    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded text-sm font-medium
           disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    on:click={handleScan}
    disabled={$flashBusy}
  >
    {$flashBusy ? 'Scanning…' : 'Scan Devices'}
  </button>

  {#if $flashDevices.length > 0}
    <ul class="flex flex-col gap-1">
      {#each $flashDevices as device (device.id)}
        <li class="text-sm text-gray-300 bg-gray-800 rounded px-3 py-2">
          {device.name}
        </li>
      {/each}
    </ul>
  {:else if !$flashBusy}
    <p class="text-sm text-gray-500">No devices found. Connect a CH341B and scan.</p>
  {/if}
</section>
```

- [ ] **Create `src/lib/components/UartPanel.svelte`**

```svelte
<script lang="ts">
  import { uartLog, uartConnected } from '$lib/stores/uart';
</script>

<section class="flex flex-col gap-4 flex-1 bg-gray-900 rounded-lg p-4">
  <h2 class="text-lg font-semibold text-gray-100">UART</h2>

  <div class="flex items-center gap-2">
    <span
      class="w-2 h-2 rounded-full {$uartConnected ? 'bg-green-400' : 'bg-gray-600'}"
    ></span>
    <span class="text-sm text-gray-400">
      {$uartConnected ? 'Connected' : 'Disconnected'}
    </span>
  </div>

  <div
    class="flex-1 min-h-48 bg-gray-950 rounded p-3 font-mono text-xs text-green-400
           overflow-y-auto leading-relaxed"
  >
    {#each $uartLog as line}
      <div>{line}</div>
    {:else}
      <span class="text-gray-600">No output yet…</span>
    {/each}
  </div>
</section>
```

- [ ] **Create `src/routes/+page.svelte`**

```svelte
<script lang="ts">
  import FlashPanel from '$lib/components/FlashPanel.svelte';
  import UartPanel from '$lib/components/UartPanel.svelte';
</script>

<svelte:head>
  <title>fixplay diagnoseTool</title>
</svelte:head>

<main class="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
  <div class="flex flex-1 gap-4 p-4">
    <FlashPanel />
    <UartPanel />
  </div>
</main>
```

- [ ] **Type-check and verify tests still pass**

```bash
npm run check && npm run test
```

Expected: no errors, all 9 tests pass.

- [ ] **Commit**

```bash
git add src/lib/components/ src/routes/+page.svelte
git commit -m "feat(frontend): add FlashPanel, UartPanel components and main route"
```

---

## Task 11: Tooling — Makefile, .editorconfig, ESLint, Prettier

**Files:**
- Create: `Makefile`
- Create: `.editorconfig`
- Create: `eslint.config.js`
- Create: `.prettierrc`

- [ ] **Create `Makefile`**

```makefile
.PHONY: dev build test lint fmt

dev:
	npm run tauri dev

build:
	npm run tauri build

test:
	cargo test --workspace && npm run test

lint:
	cargo clippy --workspace -- -D warnings && npm run lint

fmt:
	cargo fmt --all && npm run format
```

- [ ] **Create `.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.rs]
indent_size = 4

[Makefile]
indent_style = tab
```

- [ ] **Create `eslint.config.js`**

```js
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  prettier,
  ...svelte.configs['flat/prettier'],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: ts.parser },
    },
  },
  {
    ignores: ['build/', '.svelte-kit/', 'dist/', 'src-tauri/'],
  },
];
```

- [ ] **Create `.prettierrc`**

```json
{
  "useTabs": false,
  "tabWidth": 2,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "plugins": ["prettier-plugin-svelte"],
  "overrides": [
    {
      "files": "*.svelte",
      "options": { "parser": "svelte" }
    }
  ]
}
```

- [ ] **Set up shadcn-svelte**

Install peer dependencies and create the config:

```bash
npm install clsx tailwind-merge bits-ui
```

Create `components.json`:

```json
{
  "$schema": "https://shadcn-svelte.com/schema.json",
  "style": "default",
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app.css",
    "baseColor": "slate"
  },
  "aliases": {
    "components": "$lib/components",
    "utils": "$lib/utils"
  }
}
```

Create `src/lib/utils.ts`:

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

Create the placeholder directory so the import path `$lib/components/ui/` is ready:

```bash
mkdir -p src/lib/components/ui
```

Add shadcn CSS variables to `src/app.css` (append after Tailwind directives):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --ring: 212.7 26.8% 83.9%;
  }
}

* {
  border-color: hsl(var(--border));
}
```

- [ ] **Run lint to verify it works**

```bash
npm run lint
```

Expected: no errors (or only fixable style warnings).

- [ ] **Commit**

```bash
git add Makefile .editorconfig eslint.config.js .prettierrc
git commit -m "chore: add Makefile, .editorconfig, ESLint and Prettier config"
```

---

## Task 12: Final Integration Check

- [ ] **Run full Rust test suite**

```bash
cargo test --workspace
```

Expected: all tests pass across `fixplay-core` (7), `fixplay-ch341` (2), `fixplay-uart` (3).

- [ ] **Run Clippy**

```bash
cargo clippy --workspace -- -D warnings
```

Expected: 0 warnings.

- [ ] **Run Rust formatter check**

```bash
cargo fmt --all -- --check
```

Expected: no diff output.

- [ ] **Run frontend tests**

```bash
npm run test
```

Expected: 9 tests pass.

- [ ] **Run frontend type-check**

```bash
npm run check
```

Expected: no errors.

- [ ] **Run frontend lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Final commit**

```bash
git add -A
git commit -m "chore: project foundation complete — all checks pass"
```

---

## Post-Foundation

The next implementation cycles will build on this foundation:

1. **CH341B USB protocol** — implement `fixplay-ch341` using `rusb` to communicate with the CH341B SPI interface
2. **Flash chip identification** — implement `read_id()` and add a chip database in `fixplay-core`
3. **NOR dump logic** — implement `read_flash()` with progress reporting via Tauri events
4. **UART connection** — implement `fixplay-uart` using `serialport` and stream lines to the frontend
