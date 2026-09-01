# Project Foundation Design — fixplay-diagnoseTool

**Date:** 2026-06-11
**Status:** Approved

## Overview

Cross-platform desktop diagnostic tool (Windows + Linux) for direct CH341B communication and PS5 UART diagnostics. Built with Tauri v2 (Rust backend + SvelteKit frontend). No intermediate programs — the app communicates directly with hardware via USB and serial.

## Architecture

### Cargo Workspace

Three library crates plus the Tauri binary, with a strict unidirectional dependency graph:

```
fixplay-tauri (binary)
    ├── fixplay-ch341  →  fixplay-core
    └── fixplay-uart   →  fixplay-core
```

`fixplay-core` has no hardware dependencies and can be tested in isolation. Hardware crates only depend on `fixplay-core`, never on each other or on Tauri.

### Crate Responsibilities

| Crate           | Purpose                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| `fixplay-core`  | Domain types (`FlashInfo`, `UartMessage`), error enum (`AppError`), hardware traits (for mocking in tests) |
| `fixplay-ch341` | CH341B USB communication via `rusb`; implements core traits                                                |
| `fixplay-uart`  | Serial port communication via `serialport`; implements core traits                                         |
| `src-tauri`     | Tauri app, command handlers, app state, logging setup                                                      |

### Directory Layout

```
fixplay-diagnoseTool/
├── Cargo.toml                        ← Workspace root
├── Makefile                          ← dev, build, test, lint targets
├── .editorconfig
├── crates/
│   ├── fixplay-core/
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── error.rs             ← AppError (thiserror)
│   │       ├── types.rs             ← shared domain types
│   │       └── traits.rs            ← FlashDevice, UartDevice traits
│   ├── fixplay-ch341/
│   │   └── src/
│   │       ├── lib.rs
│   │       └── device.rs
│   └── fixplay-uart/
│       └── src/
│           ├── lib.rs
│           └── port.rs
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── build.rs
    └── src/
        ├── main.rs                  ← tracing-subscriber init, tauri builder
        ├── lib.rs                   ← run() entry point
        ├── state.rs                 ← AppState struct
        └── commands/
            ├── mod.rs
            ├── flash.rs
            └── uart.rs
```

### Frontend Layout

```
src/
├── app.html
├── lib/
│   ├── components/
│   │   ├── ui/                      ← shadcn-svelte primitives
│   │   ├── FlashPanel.svelte
│   │   └── UartPanel.svelte
│   ├── stores/
│   │   ├── flash.ts                 ← writable<FlashState>
│   │   └── uart.ts                  ← writable<string[]> log buffer
│   └── api/
│       └── tauri.ts                 ← typed invoke() wrappers
└── routes/
    └── +page.svelte
```

## Key Technical Decisions

### Error Handling

- Library crates (`fixplay-core`, `fixplay-ch341`, `fixplay-uart`) define their own `#[derive(thiserror::Error)]` enums.
- `AppError` in `fixplay-core` wraps all sub-errors via `#[from]`.
- Tauri commands return `Result<T, String>` — the `String` is the serialized error message passed to the frontend.
- No `unwrap()` or `expect()` outside of `#[cfg(test)]` blocks.

### App State

```rust
pub struct AppState {
    pub ch341: Mutex<Option<Ch341Device>>,
    pub uart:  Mutex<Option<UartPort>>,
}
```

Registered as `tauri::State<AppState>`, injected into every command handler. Devices start as `None` and are populated when the user connects.

### Logging

- `tracing` macros (`info!`, `warn!`, `error!`, `debug!`) used throughout all crates.
- `tracing-subscriber` initialized once in `main.rs` with a formatted layer.
- Real-time log lines forwarded to the frontend via Tauri's `app.emit()` event system from within commands.

### Tauri IPC Pattern

```rust
#[tauri::command]
pub async fn scan_devices(state: tauri::State<'_, AppState>) -> Result<Vec<DeviceInfo>, String> {
    // ...
}
```

Frontend uses typed wrappers — never raw `invoke()` strings scattered through components:

```typescript
// src/lib/api/tauri.ts
export const scanDevices = () => invoke<DeviceInfo[]>('scan_devices');
```

### Hardware Traits

`fixplay-core` defines traits that hardware crates implement:

```rust
pub trait FlashDevice: Send {
    fn read_id(&self) -> Result<ChipId, AppError>;
    fn dump(&self, progress: impl Fn(usize)) -> Result<Vec<u8>, AppError>;
    fn write(&self, data: &[u8], progress: impl Fn(usize)) -> Result<(), AppError>;
}
```

This allows unit tests in `src-tauri` to use mock implementations without real hardware.

## Dependencies

### Rust

| Crate           | Dependency                                       | Purpose                        |
| --------------- | ------------------------------------------------ | ------------------------------ |
| `fixplay-core`  | `thiserror`, `serde`, `tracing`                  | Errors, serialization, logging |
| `fixplay-ch341` | `rusb`, `thiserror`, `tracing`                   | USB communication              |
| `fixplay-uart`  | `serialport`, `thiserror`, `tracing`             | Serial port                    |
| `src-tauri`     | `tauri`, `tokio`, `tracing-subscriber`, `anyhow` | App runtime                    |

### Frontend

| Package                | Purpose                             |
| ---------------------- | ----------------------------------- |
| SvelteKit + TypeScript | Framework                           |
| Tailwind CSS           | Styling                             |
| shadcn-svelte          | Component library (dark-mode-first) |
| Vitest                 | Unit testing                        |
| ESLint + Prettier      | Linting and formatting              |

## Testing Strategy

- **Unit tests**: `#[cfg(test)]` modules within each Rust source file; mock `FlashDevice`/`UartDevice` trait implementations in `fixplay-core`.
- **Integration tests**: `crates/fixplay-ch341/tests/` and `crates/fixplay-uart/tests/` — run against real hardware when available, skipped otherwise via `#[ignore]`.
- **Frontend**: Vitest for store logic and `tauri.ts` API wrappers.

## Makefile Targets

```makefile
dev      # tauri dev (hot-reload)
build    # tauri build (production)
test     # cargo test + vitest
lint     # cargo clippy + eslint
fmt      # cargo fmt + prettier
```

## Out of Scope (this spec)

- CH341B protocol implementation details
- PS5 UART error code database
- Flash chip identification logic
- UI design beyond the component scaffold
