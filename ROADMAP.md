# fixplay diagnoseTool — Roadmap & Audit

> 105 findings from a comprehensive codebase audit (2026-07-28).  
> Checked = done, unchecked = pending.

## 🔴 Bugs

- [x] **#1** `scan_devices` command called by frontend but not registered in backend — removed dead code
- [x] **#2** `reader_loop` panics during app shutdown — changed to `try_state` in background threads
- [x] **#3** `settings_get` silently returns defaults on corrupt file — now returns `Result` with error message
- [x] **#4** HID report buffer silently drops data — added `hid_dropped_reports` counter
- [x] **#5** `binaries/` directory missing from repository — created with placeholders
- [x] **#6** `npm audit` broken — regenerated package-lock.json, 6 low vulns (transitive deps)
- [x] **#7** Path traversal via crafted NOR dump serial number — validate serial for `../` and separators
- [x] **#8** No subprocess timeout on flashrom operations — 5-minute timeout with kill
- [x] **#9** `I2cBridge::list_ports()` doc fixed — tagging happens in Tauri command layer
- [x] **#10** `I2cBridge::read_line()` conflates serial errors with timeouts — distinguish WouldBlock/TimedOut
- [x] **#11** No size limit on error DB download — 5 MB Content-Length check in both uart and i2c
- [x] **#12** No upper bound on `hid_receive_feature_report` length — max 512 bytes
- [x] **#13** `FlashProgress` renamed `bytes_done`→`percent_done`, `bytes_total`→`percent_total`
- [x] **#14** `Cargo.toml` version bumped to 0.2.1
- [x] **#15** I2C Cargo.toml syntax — false positive, no double brace found

## 🟡 UX

- [x] **#16** No cancel/abort for flash operations — Force Stop button added
- [x] **#17** No confirmation dialog for destructive operations — ConfirmDialog component created
- [x] **#18** No window close confirmation during flash operations — onCloseRequested guard added
- [x] **#19** No error boundary or crash isolation — ErrorBoundary wraps all panels
- [x] **#20** No keyboard navigation anywhere — Ctrl/Cmd+1..6 panel shortcuts, Ctrl/Cmd+, settings, sidebar hints
- [x] **#21** No log export or copy functionality — copy + save-to-file buttons on controller log
- [x] **#22** No archive search, sort, or filter — search field + sort (newest/oldest/serial)
- [x] **#23** No "first run" experience or onboarding — OnboardingModal shown once per install
- [x] **#24** No offline detection or degraded-mode handling — StatusBar offline badge via navigator.onLine
- [x] **#25** No "copy to clipboard" for displayed data values — copyToClipboard utility + MAC/FW copy buttons
- [x] **#26** No "clear log" button on any log view — added to ControllerPanel log
- [x] **#27** No word wrap toggle in log views — added to ControllerPanel log
- [x] **#28** No "always on top" toggle — Pin button in Header
- [x] **#29** Status bar items are not clickable for navigation — all items now navigate to panels
- [x] **#30** No "open logs directory" or "open config directory" shortcuts — "Archiv"/"Konfig" folder buttons in settings
- [x] **#31** No "check for updates" in settings — manual update-check button
- [x] **#32** No "reset all settings" button — reset-to-defaults in settings footer
- [x] **#33** No "about" dialog — AboutDialog with version, credits, links
- [x] **#34** No changelog link in update banner — "What's new" link to release tag
- [x] **#35** No "remind me later" for updates — "Später" 24h localStorage snooze
- [x] **#36** No "recently used" or "favorites" in sidebar — "Zuletzt genutzt" quick-row auto-tracked in localStorage (recents store + navigate helper)
- [x] **#37** No timestamp format option in logs — Clock toggle (local/iso/seconds) in log toolbars, shared formatLogTimestamp util across flash/uart/i2c/controller logs
- [x] **#38** No focus management in modals — `trapFocus` action + Escape-to-close on all modals
- [x] **#39** No loading skeletons; bare text placeholders — pulse skeleton in archive list
- [x] **#40** No progress indicator for background DB fetches — spinner shown during DB load/update
- [x] **#41** No "flashrom version" display — binary status (found/missing + reason) in settings
- [x] **#42** No estimated time remaining for flash operations — per-phase ETA extrapolated from observed progress rate (shown at ≥20% of each phase)
- [x] **#43** No disk space indicator — `flash_free_disk_space` Tauri command (via `fs4`) reports free/total bytes for the volume holding the dump archive (walks up to the nearest existing ancestor so it works before the archive dir exists, and respects a custom archive path); shown in the Flash panel as "Speicher: X frei von Y", red warning when free < 64 MiB, refreshed on mount and after each read/write
- [x] **#44** No "what's new" dialog after update — WhatsNewDialog on version change

## 🔵 Features

- [x] **#45** No UART raw terminal mode — `uart_send_raw` command writes an arbitrary line with a chosen line ending (none/CR/LF/CRLF, no PS5 checksum framing) so it can talk to non-PS5 devices or probe undocumented commands; the sent content is tracked so the PS5 echo is dropped (frontend shows a local "→" marker). UartPanel shows a raw input row + line-ending selector (Enter to send) while connected; mock handler echoes the round-trip in dev mode
- [x] **#46** No stick drift visualization — DriftSparkline rolling history (80-sample magnitude sparkline with green/amber/red threshold bands) under each stick, complementing the instantaneous drift %
- [x] **#47** No test report generation — QuickTestModal "Report" button builds a timestamped .txt (controller identity, per-test OK/FEHLER, pass/fail/skipped totals + overall verdict) via saveDialog + saveTextFile
- [x] **#48** No calibration before/after comparison — CalibrationModal snapshots the 12 in-memory finetune u16 values before calibration starts and reads them again after a successful center/range calibration, then renders a 12-cell "Vorher → Nachher" grid highlighting changed values (with per-value Δ, green for +/red for −) and a "X von 12 Werten geändert" summary; 2 component tests (diff renders + no table when the finetune read fails)
- [x] **#49** No "undo" or "restore defaults" for controller operations — "Verwerfen" button restores the in-memory finetune snapshot (taken on connect + after each successful flash) via writeFinetuneData, discarding calibration changes without touching persisted NVS
- [x] **#50** No speaker-to-mic loopback test — `SpeakerMicLoopback.svelte` plays a DualSense speaker tone while capturing the DualSense USB mic (raw stream, no echo-cancellation/noise-suppression), compares the mic peak during the tone against a 500 ms silent baseline, and reports OK/FEHLER (absolute floor ≥25% AND rise >15% over baseline so ambient noise alone can't pass it); wired into TesterPanel's audio section with baseline/peak readout
- [x] **#51** No I2C mock tab in MockPanel — added I2C tab (ports, db, scan, errlog, info)
- [x] **#52** No dark/light theme support — `stores/theme.ts` (persisted `dark`/`light`, applied to `<html data-theme>` from the root layout) + a Sun/Moon toggle in the Header; light mode inverts the Tailwind gray ramp via `[data-theme="light"]` CSS-variable overrides in app.css, so every `bg-gray-*`/`text-gray-*`/`border-gray-*` utility re-themes app-wide without per-component changes (colored accent buttons keep working in both). 5 store tests
- [x] **#53** No i18n infrastructure; all strings hardcoded in German — `i18n/index.ts` (persisted `locale` writable `de`/`en` + reactive `t` derived store with `{param}` interpolation + de→key fallback + `setLocale`/`toggleLocale`/non-reactive `translate`) and `i18n/translations.ts` (flat dotted-key de/en dictionary covering nav chrome + header titles + tester tabs); a Languages toggle in the Header switches DE/EN live; Sidebar + Header + TesterPanel tabs wired to `$t(...)`. 9 i18n tests. Domain-panel strings migrate key-by-key without structural changes.
- [x] **#54** No battery level on controller visualizer — battery bar + % below PS button
- [x] **#55** No headphone connection indicator on visualizer — 🎧 icon when connected
- [x] **#56** No gyro/accelerometer visualization — `parseDs5Imu(common)` pure parser in `controller-manager.ts` (gyro xyz @ struct offsets 15/17/19 → °/s ÷1024, accel xyz @ 21/23/25 → g ÷8192, signed LE, zeros for short reports) feeds an `imuState` store; `ImuVisualizer.svelte` renders centered per-axis bars (gyro ±2000 °/s teal/amber, accel ±2 g blue/purple) plus a 2-D tilt-dot pad driven by accel X/Y; an 'imu' tab in TesterPanel surfaces it; mock report emits a 1 g rest state on accel Z. 5 parser tests
- [x] **#57** No touchpad gesture visualization — `touch-gesture.ts` (`classifyLift` pure classifier → tap/hold/swipe±direction + `TouchGestureTracker` stateful tracker emitting events on lift & two-finger onset, live contact label, capped event log + per-finger fading trail) feeds `TouchpadGestureVisualizer.svelte` (pad surface with finger dots + fading trails + gesture log); a 'touchpad' tab in TesterPanel surfaces it; mock emits two touch points at offset 32 and MockPanel replays Tipp/Wischen/Halten/2-Finger gestures. 13 tracker/classifier tests
- [x] **#58** No peak hold on mic level meter — peak hold with 2s decay
- [x] **#59** No frequency spectrum view for mic — `MicSpectrumView.svelte` opens the DualSense USB mic (same device discovery as MicLevelMeter), runs a 1024-bin WebAudio FFT, and renders a live magnitude spectrum on a canvas (128 low-freq bars, teal→amber hue gradient, falling peak-hold markers, 0 Hz–5.4 kHz axis); a „Spektrum an/aus” toggle in the TesterPanel audio tab
- [x] **#60** No "copy state as JSON" in MockPanel — copy-state-as-JSON button
- [x] **#61** No `flashrom` PATH fallback — bundled-missing → bare `flashrom` (PATH)
- [x] **#62** No tooltip/detail on info bar items — all four controller info cards have tooltips
- [x] **#63** No animation/transition on state changes — fade+scale transitions on all modals

## 🟢 Quality

- [x] **#64** No CI on PRs or branch pushes — `ci.yml` runs frontend+rust+audit on push/PR to main
- [x] **#65** Zero component tests (5,001 lines of Svelte with 0% coverage) — infrastructure added (@testing-library/svelte + jest-dom + jsdom; VITEST-only `svelte`→client alias; jsdom Web Animations polyfill in tests-setup.ts); 9 component tests (StatusBar store→badge wiring, ConfirmDialog render/gate/closure/danger); suite now 75 tests / 10 files green
- [x] **#66** Controller input processing pipeline has zero tests — applyProcessedInput store tests (sticks/triggers/buttons/battery/mic)
- [x] **#67** DS5Controller calibration and NVS operations have zero tests — `ds5-calibration.test.ts` adds 24 tests covering NVS lock/unlock (success + HID-failure paths, incl. the 500 ms retry-delay throw via fake timers), stick center calibration (begin/sample/end ack decoding + wrong-ack failure), stick range calibration (begin/end + failure), the `queryNvStatus` decode table (pending_reboot / locked / unlocked / unknown-ret / HID-error), `getInMemoryModuleData` (valid header, p2=4 variant, wrong-cmd null), `writeFinetuneData` little-endian packing, and `hwToBoardModel` mapping — all via a fake HID device with canned feature-report responses, no hardware
- [x] **#68** Mock layer has zero tests (600 lines of infrastructure code) — 13 tests covering invoke routing, settings round-trip, search {query} substitution, DS5 report encoding, flash progress events, no-op commands
- [x] **#69** HID backend commands have zero tests — the reader-thread's pure logic was extracted from `run_hid_thread` into testable helpers (`feature_report_packet`, `make_get_feature_buf`, `parse_input_report`, `push_report` + `MAX_REPORT_QUEUE`) and covered with 9 unit tests (packet framing, 128-byte read-buffer floor + id byte, report-id stripping, queue cap + drop-counter, `AliveGuard` flip-on-drop); the Tauri command wrappers themselves still need a live `HidApi`/`State` so they're exercised via the helpers rather than invoked directly
- [x] **#70** Stick renderer has zero tests despite being pure math — calculateCircularityError tests
- [x] **#71** Store tests are tautological (test Svelte's `writable()`, not app logic) — rewritten to test id-generator uniqueness/monotonicity, log prepend+cap contracts, parsed-entry shape, nullable db-count semantic, and partial-update preservation instead of bare set/get round-trips
- [x] **#72** No mock error-state simulation — MockPanel "Fehler simulieren" section arms per-command errors (errors map in mock state); invoke() rejects with the armed message; 3 tests
- [x] **#73** No integration tests anywhere — `integration/controller-pipeline.test.ts` drives the full mock `hid_poll` → `ControllerManager.processControllerInput` → `applyProcessedInput` seam and asserts sticks/triggers/buttons/battery/IMU/touch stores all reflect one configured input together (incl. the real DS5 10%-step battery quantization 50→55, incremental button updates across frames, and connected=false disconnect); `integration/flash-pipeline.test.ts` drives `invoke('flash_read')` → `flash://progress`/`flash://result` events → result NVS/archive, plus error-injection interplay. 5 integration tests
- [x] **#74** No `rust-toolchain.toml` for reproducible builds — added
- [x] **#75** No Dependabot or Renovate for automated dependency updates — `.github/dependabot.yml` (npm + all 5 cargo workspaces, weekly)
- [x] **#76** No `cargo audit` or vulnerability scanning in CI — `audit` job in CI (advisory, continue-on-error)
- [x] **#77** No `rustfmt.toml`; formatting is inconsistent across contributors — added
- [x] **#78** No `.prettierignore`; Prettier may scan build artifacts — added
- [x] **#79** No `engine-strict=true` in `.npmrc` — added
- [x] **#80** No `.nvmrc` or `.node-version` for local development — `.nvmrc` → Node 22
- [x] **#81** No `.vscode/extensions.json` for contributor onboarding — added
- [x] **#82** No `[workspace.package]` in root `Cargo.toml` — added (version/edition/license/repository)
- [x] **#83** Duplicate `reqwest` (0.12 + 0.13) in `Cargo.lock` — uart + i2c crates bumped to `reqwest = "0.13"` (matching tauri-plugin-updater); lock now resolves a single reqwest 0.13.4
- [x] **#84** `#[allow(dead_code)]` on entire `AppState` struct masks unused fields — blanket allow removed; clippy -D warnings confirms every field is used (per-field allows added if any go unused)
- [x] **#85** Inconsistent log entry types across stores — shared `LogLevel`/`LogEntry`/`TextLogEntry`/`RawLogEntry` types in `api/types.ts`; a `createLogStore<T>()` factory in `stores/log.ts` (monotonic id + capped newest-first prepend) now backs the UART, I2C, flash, and controller logs; `I2cLogEntry` is re-exported instead of redefined
- [x] **#86** Inconsistent connection state models across subsystems — `stores/connection.ts` defines a `ConnectionState` lifecycle + `createConnectionStore()` (one source of truth for `connected`+`reconnecting`); UART/I2C/controller connection stores migrated to it while keeping the existing `.set(boolean)` API (panels unchanged) and also exposing a unified `uartConnection`/`i2cConnection`/`controllerConnection` status store
- [x] **#87** `flashWritePath` used as ad-hoc cross-component event bus — replaced with an explicit `flashWriteRequest` writable + `requestFlashWrite(path)` action consumed one-shot by FlashPanel (cleared on consume); ArchiveSection calls the action instead of writing the path store directly
- [x] **#88** Missing shared stores: archive, notifications, app state — added `stores/app.ts` (active view + `navigate()` + onboarding flag, consumed by `+page.svelte` and `OnboardingModal`), `stores/archive.ts` (list/loading/query/sort + `refreshArchives()` + derived dump count, consumed by `ArchiveSection`), and `stores/notifications.ts` + a `Toaster.svelte` renderer (severity-tagged, auto-dismissing toast queue) wired into `+page.svelte`; archive load failures now surface as a sticky toast
- [x] **#89** `I2cDevice` and `UartDevice` traits are identical (4 same method signatures) — `I2cDevice` is now `pub use UartDevice as I2cDevice` (a trait alias); single definition, existing call sites unchanged
- [x] **#90** `ErrorDb` (PS5) and `XboxErrorDb` (Xbox) are ~90% duplicated code — the shared cache-read (poisoned-guard) + remote-fetch (HTTP-status + 5 MB size guard) + write-back plumbing now lives once in `fixplay_core::error_db` (`read_cache_json` / `fetch_and_cache_json`); each crate's `from_cache`/`fetch_and_cache` are thin wrappers that map the `String` reason into their own `DbFetch` variant. `reqwest` moved from the uart/i2c crates to fixplay-core (single dep declaration; lock still resolves one reqwest 0.13.4). The genuinely-different parts (PS5 `u32` hex key vs Xbox normalized string key, JSON schema, search) stay per-crate
- [x] **#91** `UartPort::read_line()` is dead code (stub, never called) — removed from the `UartDevice` trait and both impls (UartPort stub + I2cBridge's unused trait method); the i2c free-function `read_line` used by `request()` is unaffected
- [x] **#92** `UartPort` and `I2cBridge` have `pub` fields breaking encapsulation — `connected`/`stop_flag` are now private; `stop_flag()` accessor returns a cloned `Arc`
- [x] **#93** Inconsistent `write_line` signatures: `&mut self` vs `&self` — `UartPort::write_line` is now `&self` (matching `I2cBridge`); uart command call sites use `as_ref()` instead of `as_mut()`
- [x] **#94** Error chain loss in `FlashError::Io(String)`, `UartError::Serial(String)`, `I2cError::Serial(String)` — variants now hold `#[source] Box<dyn std::error::Error + Send + Sync>` (keeps fixplay-core free of hardware deps while preserving `Error::source()`); Display unchanged
- [x] **#95** `ErrorDb::from_cache()` uses semantically wrong error variant — file-read error now maps to `DbFetch` (was `Serial`) in both uart + i2c crates
- [x] **#96** No `#[deny(missing_docs)]` or `#[warn(missing_docs)]` in any crate — `#![warn(missing_docs)]` added to all 4 library crates (fixplay-core/flashrom/uart/i2c); every public item, struct field, enum variant, and trait method now documented (clippy --all-targets -D warnings clean)
- [x] **#97** No file-based logging for release builds on Windows — `init_logging()` now installs a second `tracing` layer in release builds that writes a rolling daily `fixplay.log.YYYY-MM-DD` (no ANSI codes) under `<local-data>/fixplay-diagnoseTool/logs` via `tracing-appender`, alongside the console layer; debug builds stay console-only. If the log dir can't be created it falls back to console-only so a logging failure never blocks startup. Validated in both debug and release (`cargo clippy --release` exercises the `#[cfg(not(debug_assertions))]` code that CI's debug run skips)
- [x] **#98** Single-byte UART read loop is inefficient — `reader_loop` now reads into a 256-byte buffer per syscall (consuming a full line in one read) and accumulates across reads; plus a 64 KB runaway-line guard
- [x] **#99** `FlashromDevice` cloned unnecessarily in `flash_read`/`flash_write` — the device is now shared via `Arc<FlashromDevice>` and `Arc::clone`d into each `spawn_blocking` thread instead of cloning the `String`+`PathBuf`
- [ ] **#100** No macOS build target in CI
- [ ] **#101** No ARM64 Linux or Windows ARM64 builds

## 🟣 Security

- [x] **#102** No server-side validation of `programmer` argument (flashrom flag injection) — `validate_programmer` allowlist in all flash commands
- [x] **#103** Unvalidated file paths in four Tauri commands (path traversal from frontend) — archive_delete_dump contained to archive root via canonicalize check
- [x] **#104** CSP disabled entirely (`null`) — restrictive CSP set in tauri.conf.json
- [x] **#105** No baud rate range validation — validate_baud_rate/clamp_baud_rate at all use sites
