# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cross-platform desktop diagnostic tool for gaming consoles. Reads, validates, and archives NOR flash dumps via common programmers (CH341A, RT809H, etc.) through `flashrom`. Also supports live UART diagnostics for error code reading. Built with **Tauri v2** (Rust backend + web frontend).

## Commands

Once the project is scaffolded, standard Tauri + npm commands apply:

```bash
npm install            # Install frontend dependencies
npm run tauri dev      # Run in development mode (hot-reload)
npm run tauri build    # Build production app
npm run dev            # Frontend-only dev server (if configured)
npm run lint           # Lint frontend code
npm run test           # Run frontend tests
cargo test             # Run Rust unit tests (from src-tauri/)
cargo clippy           # Lint Rust code
cargo fmt              # Format Rust code
```

## Architecture

Tauri splits the codebase into two layers that communicate via Tauri commands (IPC):

- **`src-tauri/`** — Rust backend. Handles all privileged/hardware operations: invoking `flashrom`, reading serial/UART ports, file I/O for dump archives, and OS-level interactions. Exposes functionality to the frontend via `#[tauri::command]` functions registered in `main.rs`.
- **`src/`** (or `ui/`) — Web frontend (TypeScript). Renders the UI, drives user workflows, and calls Rust commands via `@tauri-apps/api/core`'s `invoke()`.

### Key domain areas

| Area | Where it lives |
|---|---|
| Flash programmer integration (`flashrom` subprocess) | Rust backend |
| UART / serial port reading | Rust backend (likely `serialport` crate) |
| NOR dump validation & parsing | Rust backend |
| Archive/storage of dump files | Rust backend |
| UI for flash operations & diagnostics | Frontend |

### Tauri IPC pattern

Frontend calls Rust like this:
```ts
import { invoke } from '@tauri-apps/api/core';
const result = await invoke('command_name', { arg: value });
```

Rust exposes commands like this:
```rust
#[tauri::command]
fn command_name(arg: String) -> Result<SomeType, String> { ... }
```

Commands must be registered in `tauri::Builder::default().invoke_handler(tauri::generate_handler![...])`.

## Hardware Integration Notes

- `flashrom` is shelled out as a subprocess from Rust; the backend must locate it on `PATH` or bundle it.
- UART reading requires the user to have permission to access serial devices (`/dev/ttyUSB*` on Linux, `COM*` on Windows).
- Target programmers: CH341A, RT809H, and other `flashrom`-compatible devices.
