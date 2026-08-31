# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cross-platform desktop diagnostic tool for console repair (primarily PS5 and Xbox). Four hardware domains:

- **NOR flash** — two-pass read via `flashrom` (CH341A, RT809H, …), dump validation (header/MBR/EMC IPL/USB PDC), NVS parsing (serial, MAC, SKU, board ID), per-serial dump archiving.
- **UART diagnostics** — PS5 error-code reading via CP2105/FT232R bridges, with auto-reconnect, loopback test, and an offline error-code DB (~1,280 PS5 entries).
- **Xbox I2C** — same idea over a Raspberry Pi Pico bridge running the external `fixplay-pico-i2c` firmware (NDJSON over USB CDC), with its own Xbox error DB (~960 entries).
- **HID controller panel** — DualSense testing/calibration: visualizer, actuator testers, mic FFT, IMU/touchpad, stick calibration, BT support with CRC32 framing.

Built with **Tauri v2**: SvelteKit 2 / Svelte 5 (runes) + TypeScript + Tailwind v4 frontend, Rust 2021 cargo workspace backend.

**Safety-critical context**: classic black CH341A boards drive SPI at ~5 V and can destroy 3.3 V NOR — the in-app hardware guide (`docs/CH341A_GUIDE.md`, `HardwareGuide.svelte`) exists for this. Window-close during a flash operation is intercepted (bricking risk). Don't remove these guards casually.

## Commands

Run from the repo root. The Makefile wraps both languages:

- `make dev` — full app hot-reload (`npm run tauri dev`)
- `make build` — production build (`npm run tauri build`)
- `make test` — all tests (`cargo test --workspace && npm run test`)
- `make lint` — `cargo clippy --workspace -- -D warnings && npm run lint` (CI gate is the same)
- `make fmt` — `cargo fmt --all && npm run format`
- `MOCK=1 npm run dev:mock` — full UI in a browser with a mocked Tauri API (no hardware/backend needed); aliasing wired in `vite.config.ts`
- `npm run check` — regenerates i18n types, then `svelte-check`. The zero-warning type gate; run after i18n edits
- Single frontend test: `npx vitest run src/lib/components/HardwareGuide.test.ts`
- Single Rust test: `cargo test -p fixplay-uart <name>` (all Rust tests are inline `#[cfg(test)]`; there are no `tests/` dirs)
- `npm run i18n` — regenerate typesafe-i18n types after editing translations

## Rust backend

### Workspace layout

Root `Cargo.toml` is the workspace: `crates/{fixplay-core,fixplay-flashrom,fixplay-uart,fixplay-i2c}` + `src-tauri`. Sub-crates depend **only on `fixplay-core`**, never on each other. Crate versions are intentionally unsynced — the displayed app version comes from `tauri.conf.json`, not `CARGO_PKG_VERSION` (see `commands/app.rs`).

- **`fixplay-core`** — hardware-agnostic traits (`FlashDevice`, `UartDevice` in `traits.rs`; `I2cDevice` is an alias of `UartDevice`), the unified `AppError`, **all serde DTOs shared with the frontend** (`types.rs` — add new IPC types here, not in command modules), PS5 NOR validation/NVS parsing (`nor.rs`), and shared error-DB fetch/cache plumbing with size + HTTP-status guards (`error_db.rs`).
- **`fixplay-flashrom`** — `FlashromDevice` shells out to the `flashrom` binary; parses `%` progress from stderr and JEDEC IDs; 5-minute watchdog on read/write.
- **`fixplay-uart`** — `UartPort` (PS5 protocol: `cmd:XX\r\n` framing, checksums, 9-field errlog parsing) + PS5 `ErrorDb`.
- **`fixplay-i2c`** — mirrors fixplay-uart for Xbox: `I2cBridge` is synchronous request/response under one mutex (no reader thread), NDJSON protocol with `#[serde(tag = "cmd")]`.

### src-tauri

`main.rs` is a 5-line wrapper; everything is in `lib.rs`. `#[tauri::command]` handlers live in `src-tauri/src/commands/{app,flash,uart,i2c,settings,hid}.rs`, registered in `lib.rs`'s `invoke_handler!`. Shared mutable state is a single `tauri::manage`'d `AppState` (`state.rs`): `Mutex`/`Arc<Mutex<...>>` slots for the UART port + reader thread + reconnect loop, the error DBs, bounded ring buffers with drop counters, the HID command channel, and the I2C bridge. Settings live on disk (`settings.json`, app-data dir), not in state.

### Critical architectural rules

1. **Background threads never emit data events** — events from non-main threads aren't reliably delivered to the webview. Reader threads write into `AppState` ring buffers; the frontend drains via polling commands (`uart_poll`, `i2c_poll`, `hid_poll`, `uart://db-status` style events are setup-time only). Flash progress is the exception (`flash://progress|status|result` via `app.emit`).
2. **Sync hardware, async commands**: all device I/O is blocking; async Tauri commands wrap it in `tokio::task::spawn_blocking`.
3. **Command boundary is `Result<T, String>`**: sub-crates use typed `thiserror` errors, flattened with `.map_err(|e| e.to_string())` at the command boundary. Never return `AppError` from a command.
4. **User-facing strings are German** (errors, status messages); code/comments/identifiers are English. Match the existing language.
5. **Defense-in-depth is required** for any command taking a path or device parameter — see `validate_programmer`, `ensure_within_dir` (canonicalize-and-prefix check), serial-number traversal rejection in `archive_dump`, `validate_baud_rate`, the 512-byte feature-report cap. Follow this pattern for new commands.
6. **Tauri resource dirs preserve `bundle.resources` subpaths**: bundled files live at `<resource_dir>/binaries/...` and `<resource_dir>/resources/...`. Joining without the subdirectory has caused bugs before (comments in `flashrom.rs`/`settings.rs`).
7. **PS5 UART echoes input** — every write must go through `send_tracked` (echo suppression via `recent_sent`).
8. Locking style is `lock().unwrap()`; scope guards before calling code that re-locks.
9. Crates use `#![warn(missing_docs)]` — public items need doc comments.

### Flashrom

`src-tauri/binaries/flashrom{,.exe}` are committed 12-byte placeholder stubs (real binaries are gitignored). Runtime resolution (`settings.rs` `resolve_flashrom_path`): user setting → bundled binary → `flashrom` on PATH. Windows releases build a real `flashrom.exe` from source in CI (pinned to flashrom v1.4.0; v1.5.0+ is meson-only). A startup self-check emits `flash://binary-status` so the UI can warn before the first flash.

### Error-code DB lifecycle (PS5 + Xbox, identical)

In the `lib.rs` `setup` closure: user cache in app-data → bundled `resources/error_codes.json` / `xbox_error_codes.json` (copied to cache on first success) → background thread fetch (`reqwest` blocking; PS5 DB from `amoamare/Console-Service-Tool`, Xbox DB from this repo's `main` branch; the CSP in `tauri.conf.json` allows only `raw.githubusercontent.com` for this). Each step emits a db-status event with `{loaded, count, source}`. Manual refresh: `uart_update_error_db` / `i2c_update_xbox_db`.

## Frontend

### Structure

**Single-page app — no SvelteKit routing.** `src/routes/+page.svelte` is the entire app shell; "pages" are panels toggled by the `View` union (`'home' | 'flash' | 'uart' | 'i2c' | 'archive' | 'controller'`) in `src/lib/stores/app.ts` via `navigate()`. A new screen = a `View` member + panel component + sidebar entry + `SHORTCUT_VIEWS` slot + `+page.svelte` wiring — never a new route. `+layout.ts` sets `prerender = true`, `ssr = false` (adapter-static SPA).

- `src/lib/api/tauri.ts` — the single choke-point of typed `invoke()` wrappers, one per Rust command (HID commands are the exception: invoked directly from `src/lib/controllers/tauri-hid-device.ts`). IPC payload types in `api/types.ts`; the authoritative serde source is `crates/fixplay-core/src/types.rs`.
- `src/lib/stores/` — shared state. Cross-component state = classic Svelte `writable` stores; component-local state = Svelte 5 runes (`$state`/`$derived`/`$effect`). Reuse the factory stores `createLogStore()` (`log.ts`) and `createConnectionStore()` (`connection.ts`) instead of inventing per-panel logic.
- `src/lib/controllers/` — DualSense logic (report parsing, gestures, CRC32); `controller-manager.ts` matches DualSense by VID `0x054c` / PID `0x0ce6` (USB) or `0x0df2` (BT).
- `src/lib/mock/` — browser-mode replacement for `@tauri-apps/api/*`, aliased in via `MOCK=1` builds; guards use the `__MOCK_MODE__` global.
- Tauri event names use `scheme://topic`: `flash://progress|status|result|binary-status`, `uart://db-status`, `i2c://db-status`. Listeners collect unlisten fns and clean up `onDestroy`.

### Styling

Tailwind v4 via the Vite plugin (no `tailwind.config.js`; CSS entry is `src/app.css`). **Dark-first**: components use `bg-gray-950 text-gray-100` etc.; the light theme works by remapping the whole `--color-gray-*` ramp to slate values under `[data-theme="light"]` — new UI must use gray utilities, not fixed colors, to stay theme-compatible. Icons from `lucide-svelte`. `[data-tablet="true"]` on the root enlarges touch targets. **Never reload the page** on locale/theme change — it would drop live hardware state.

### i18n (typesafe-i18n)

`baseLocale: "de"` — edit `src/lib/i18n/de/index.ts` **first**, mirror the key in `en/index.ts` (a missing `en` key is a TypeScript compile error), then `npm run i18n` to regenerate types. Use `$LL.group.key()` in markup / `get(LL).group.key()` in script. Keys are hierarchical, grouped by UI surface (`flash`, `uart`, `hwGuide`, …). The generated files (`i18n-types.ts` etc.) are never hand-edited. Locale persists at `localStorage['fixplay-locale']`; all localStorage keys use the `fixplay-` prefix and are try/catch'd.

### Testing (Vitest)

Config lives in `vite.config.ts`; tests are colocated with source (`*.test.ts`), opt into jsdom via a first-line `// @vitest-environment jsdom` directive. Component tests need `initI18n()` in `beforeEach`. **Tests never `vi.mock` `@tauri-apps/api`** — they import the mock layer (`$lib/mock/core`, `$lib/mock/_shared`) and drive behavior via `mockState` / `resetMockState()` (`src/lib/mock/state.ts`). `src/tests-setup.ts` polyfills `Element.prototype.animate` (jsdom lacks Web Animations; Svelte transitions would hang otherwise).

Rust-side testability follows the same idea: extract pure logic from thread/command bodies into free functions (`parse_progress`, `parse_input_report`, `detect_bridge`, `ensure_within_dir`, …) and pin frontend-facing wire shapes with serde JSON-substring assertions.

## Conventions

- **Commits**: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `ci:`, `i18n:`), with **ROADMAP.md item numbers** in parens — `feat(#106): …`. `ROADMAP.md` is the project's issue tracker of record, not GitHub issues.
- **Load-bearing comments**: mock byte-layouts, IMU struct offsets, theme remap rationale, resource-dir pitfalls — read comments before refactoring.
- Empty `catch { /* ignored */ }` blocks around localStorage access are intentional (SSR safety).
- `src-tauri/` and `crates/` are eslint/prettier-ignored; Rust tooling is cargo fmt (max_width 120) / clippy.

## Release

Push a `v*.*.*` tag → `.github/workflows/release.yml` builds Linux (AppImage/.deb/.rpm + ARM64 .deb/.rpm), Windows (.msi/.exe), Arch `.pkg.tar.zst` (PKGBUILD generated on the fly), plus unsigned macOS/ARM extras. Publishes a GitHub Release with `SHA256SUMS.txt` and `latest.json` (Tauri updater manifest, `scripts/generate-latest-json.mjs`). **Tags containing `-` are prereleases and skip the AUR step.** The AUR job publishes both `fixplay-diagnosetool` (source) and `fixplay-diagnosetool-bin` (AppImage) packages via `packaging/aur/`, requiring the `AUR_SSH_PRIVATE_KEY` secret and the `aur-release` environment — see `RELEASE_SETUP.md` and `docs/AUR_SSH_SETUP.md` (both German). `aur-publish.yml` re-runs just the AUR push on demand.