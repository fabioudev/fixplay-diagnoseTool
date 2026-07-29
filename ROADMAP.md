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
- [ ] **#42** No estimated time remaining for flash operations
- [ ] **#43** No disk space indicator
- [x] **#44** No "what's new" dialog after update — WhatsNewDialog on version change

## 🔵 Features

- [ ] **#45** No UART raw terminal mode
- [ ] **#46** No stick drift visualization
- [ ] **#47** No test report generation
- [ ] **#48** No calibration before/after comparison
- [ ] **#49** No "undo" or "restore defaults" for controller operations
- [ ] **#50** No speaker-to-mic loopback test
- [x] **#51** No I2C mock tab in MockPanel — added I2C tab (ports, db, scan, errlog, info)
- [ ] **#52** No dark/light theme support
- [ ] **#53** No i18n infrastructure; all strings hardcoded in German
- [x] **#54** No battery level on controller visualizer — battery bar + % below PS button
- [x] **#55** No headphone connection indicator on visualizer — 🎧 icon when connected
- [ ] **#56** No gyro/accelerometer visualization
- [ ] **#57** No touchpad gesture visualization
- [x] **#58** No peak hold on mic level meter — peak hold with 2s decay
- [ ] **#59** No frequency spectrum view for mic
- [x] **#60** No "copy state as JSON" in MockPanel — copy-state-as-JSON button
- [x] **#61** No `flashrom` PATH fallback — bundled-missing → bare `flashrom` (PATH)
- [x] **#62** No tooltip/detail on info bar items — all four controller info cards have tooltips
- [x] **#63** No animation/transition on state changes — fade+scale transitions on all modals

## 🟢 Quality

- [x] **#64** No CI on PRs or branch pushes — `ci.yml` runs frontend+rust+audit on push/PR to main
- [ ] **#65** Zero component tests (5,001 lines of Svelte with 0% coverage)
- [x] **#66** Controller input processing pipeline has zero tests — applyProcessedInput store tests (sticks/triggers/buttons/battery/mic)
- [ ] **#67** DS5Controller calibration and NVS operations have zero tests
- [x] **#68** Mock layer has zero tests (600 lines of infrastructure code) — 13 tests covering invoke routing, settings round-trip, search {query} substitution, DS5 report encoding, flash progress events, no-op commands
- [ ] **#69** HID backend commands have zero tests
- [x] **#70** Stick renderer has zero tests despite being pure math — calculateCircularityError tests
- [ ] **#71** Store tests are tautological (test Svelte's `writable()`, not app logic)
- [x] **#72** No mock error-state simulation — MockPanel "Fehler simulieren" section arms per-command errors (errors map in mock state); invoke() rejects with the armed message; 3 tests
- [ ] **#73** No integration tests anywhere
- [x] **#74** No `rust-toolchain.toml` for reproducible builds — added
- [x] **#75** No Dependabot or Renovate for automated dependency updates — `.github/dependabot.yml` (npm + all 5 cargo workspaces, weekly)
- [x] **#76** No `cargo audit` or vulnerability scanning in CI — `audit` job in CI (advisory, continue-on-error)
- [x] **#77** No `rustfmt.toml`; formatting is inconsistent across contributors — added
- [x] **#78** No `.prettierignore`; Prettier may scan build artifacts — added
- [x] **#79** No `engine-strict=true` in `.npmrc` — added
- [x] **#80** No `.nvmrc` or `.node-version` for local development — `.nvmrc` → Node 22
- [x] **#81** No `.vscode/extensions.json` for contributor onboarding — added
- [x] **#82** No `[workspace.package]` in root `Cargo.toml` — added (version/edition/license/repository)
- [ ] **#83** Duplicate `reqwest` (0.12 + 0.13) in `Cargo.lock`
- [ ] **#84** `#[allow(dead_code)]` on entire `AppState` struct masks unused fields
- [ ] **#85** Inconsistent log entry types across stores
- [ ] **#86** Inconsistent connection state models across subsystems
- [ ] **#87** `flashWritePath` used as ad-hoc cross-component event bus
- [ ] **#88** Missing shared stores: archive, notifications, app state
- [ ] **#89** `I2cDevice` and `UartDevice` traits are identical (4 same method signatures)
- [ ] **#90** `ErrorDb` (PS5) and `XboxErrorDb` (Xbox) are ~90% duplicated code
- [ ] **#91** `UartPort::read_line()` is dead code (stub, never called)
- [ ] **#92** `UartPort` and `I2cBridge` have `pub` fields breaking encapsulation
- [ ] **#93** Inconsistent `write_line` signatures: `&mut self` vs `&self`
- [ ] **#94** Error chain loss in `FlashError::Io(String)`, `UartError::Serial(String)`, `I2cError::Serial(String)`
- [x] **#95** `ErrorDb::from_cache()` uses semantically wrong error variant — file-read error now maps to `DbFetch` (was `Serial`) in both uart + i2c crates
- [ ] **#96** No `#[deny(missing_docs)]` or `#[warn(missing_docs)]` in any crate
- [ ] **#97** No file-based logging for release builds on Windows
- [ ] **#98** Single-byte UART read loop is inefficient
- [ ] **#99** `FlashromDevice` cloned unnecessarily in `flash_read`/`flash_write`
- [ ] **#100** No macOS build target in CI
- [ ] **#101** No ARM64 Linux or Windows ARM64 builds

## 🟣 Security

- [x] **#102** No server-side validation of `programmer` argument (flashrom flag injection) — `validate_programmer` allowlist in all flash commands
- [x] **#103** Unvalidated file paths in four Tauri commands (path traversal from frontend) — archive_delete_dump contained to archive root via canonicalize check
- [x] **#104** CSP disabled entirely (`null`) — restrictive CSP set in tauri.conf.json
- [x] **#105** No baud rate range validation — validate_baud_rate/clamp_baud_rate at all use sites
