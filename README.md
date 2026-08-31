# fixplay diagnoseTool

**Cross-platform desktop diagnostic tool for gaming console repair.**  
Read, validate, and archive NOR flash dumps. Live UART error-code diagnostics. DualSense controller testing and calibration. Built with **Tauri v2** (Rust + Svelte 5).

**UI languages:** ![Deutsch](https://img.shields.io/badge/UI-Deutsch-blue) ![English](https://img.shields.io/badge/UI-English-blue) — switchable live via the in-app language toggle; English is fully supported throughout the app.

<p align="center">
  <img src="static/favicon.svg" alt="fixplay logo" width="128" />
</p>

---

## Features

### NOR Flash
- Read NOR flash chips via **flashrom** (CH341A, FT2232, serprog, and 180+ other programmers)
- Automatic two-pass read with progress events
- **Hardware guide:** see [`docs/CH341A_GUIDE.md`](docs/CH341A_GUIDE.md) — pinout, jumpers, and the critical 5 V vs 3.3 V issue (default CH341A boards output 5 V on data lines and can damage 3.3 V NOR flash like the PS5 NOR)
- Validate dump integrity (header, MBR, EMC IPL, USB PDC checks)
- Parse NVS data: serial number, MAC address, SKU, board ID, firmware version
- Archive dumps per serial number with metadata (timestamp, validation status, firmware)
- Write back validated dumps with verify pass

### UART Diagnostics
- Connect to PS5 UART via USB-serial adapters (CP2105, FT232R, etc.)
- Live error-log streaming with parsed error-code descriptions
- Offline error-code database (~1,280 entries) with local cache
- Search error codes by code or description
- Auto-reconnect on cable unplug/replug (remembers VID/PID)
- Loopback test for UART cable verification

### I2C / Pico Bridge
- Connect to Xbox consoles via Raspberry Pi Pico I2C bridge
- Read Xbox error logs with parsed descriptions
- Xbox error-code database (~960 entries) with search
- I2C bus scan, EEPROM read, device info query

### Controller (DualSense)
- **Live graphical visualization** — see every button, stick, and trigger in real time on a DualSense silhouette
- **Manual testers** for lightbar, player LEDs, mute LED, vibration motors, and adaptive triggers
- **One-click test patterns** — automated sequences for lights, vibration, and triggers
- **Quick test modal** — scripted pass/fail tests for all actuator systems including speaker and microphone
- **Microphone live level meter** via WebAudio
- **Microphone frequency spectrum** — live FFT magnitude view (0–5.4 kHz) for mic diagnostics
- **IMU visualization** — live gyro (°/s) + accelerometer (g) bars and a 2-D tilt pad
- **Touchpad gesture recognition** — tap / swipe (with direction) / hold / two-finger detection with a fading trail and gesture log
- **Speaker→Mic loopback test** — plays a tone and verifies the mic picks it up
- **Stick calibration** (center + range/circularity) with before/after diff
- **Bluetooth support** — full CRC32 framing for output and feature reports over BT
- Read controller info: firmware version, MAC address, serial number, board model
- NVS read/write for persistent settings

### General
- **Start screen** with quick-access cards for all tools
- **Mock mode** (`MOCK=1`) — full browser-based preview without hardware or Tauri backend, including a gesture-replay simulator
- **In-app updater** with signed bundles and automatic update checks
- **Dark/light theme** with a persisted toggle
- **Internationalization (i18n)** — German (default) and English with a live language toggle, backed by [typesafe-i18n](https://github.com/ivanhofer/typesafe-i18n) for compile-time type safety: a missing or mis-typed translation key is a TypeScript build error, not a runtime gap
- **Tablet mode** for touch-optimized layout
- Cross-platform: **Windows** (.msi/.exe), **Linux** (.deb/.rpm/.AppImage), **Arch** (AUR), plus **macOS** (.dmg) and **Linux/Windows ARM64**

---

## Installation

### Prebuilt Downloads
Download the latest release from [GitHub Releases](https://github.com/fabioudev/fixplay-diagnoseTool/releases):

| Platform | Package |
|----------|---------|
| Windows (x64) | `.msi` installer or `.exe` setup |
| Windows (ARM64) | `.msi` installer or `.exe` setup |
| Linux x64 (Ubuntu/Debian) | `.deb` |
| Linux x64 (Fedora/RHEL) | `.rpm` |
| Linux x64 (universal) | `.AppImage` |
| Linux ARM64 | `.deb` / `.rpm` |
| macOS | `.dmg` |

### Arch Linux (AUR)
Two packages are auto-published per release:

```bash
# Recommended: builds from source against your system webkit2gtk
paru -S fixplay-diagnosetool

# Alternative: prebuilt AppImage wrapper
paru -S fixplay-diagnosetool-bin
```

> **Note:** The `-bin` package ships the AppImage which bundles an Ubuntu-built WebKit. On some Arch GPU/driver combos this may show a blank window. Prefer the source package.

### Build from Source
**Prerequisites:** Rust (stable), Node.js ≥ 20, system dependencies for Tauri.

```bash
# Linux build deps (Ubuntu/Debian)
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libudev-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf

# Clone and build
git clone https://github.com/fabioudev/fixplay-diagnoseTool.git
cd fixplay-diagnoseTool
npm install
npm run tauri build
```

The bundled `flashrom` binary is included in `src-tauri/binaries/`. On Windows, the release workflow builds `flashrom.exe` from source (v1.4.0, CH341A + serprog enabled).

> **Before flashing with a CH341A:** read [`docs/CH341A_GUIDE.md`](docs/CH341A_GUIDE.md). The classic black CH341A board drives SPI lines at ~5 V and can destroy 3.3 V NOR flash (e.g. PS5 NOR). The guide covers the 3.3 V fix, pinout, jumpers, and in-circuit reading risks.

---

## Development

### Quick Start (Mock Mode)
Run the UI in a browser without any hardware or Rust backend:

```bash
npm install
MOCK=1 npm run dev
```

The mock layer simulates all Tauri commands with reactive state — edit values in the MockPanel drawer and see the UI respond live.

### Full Dev Environment
```bash
npm run tauri dev     # Full app with hot-reload (needs Rust + system deps)
npm run dev           # Frontend-only Vite dev server
npm run build         # Production frontend build
npm run test          # Frontend unit tests (Vitest)
npm run check         # Type-check (svelte-check; also regenerates i18n types)
npm run i18n          # Regenerate typesafe-i18n types after editing translations
cargo test --workspace  # Rust unit tests
cargo clippy --workspace  # Rust lint
```

### Internationalization

The app ships in **two languages**: **Deutsch** (German, the default) and **English** — both fully translated across the entire UI (panels, testers, visualizers, modals, dialogs, status bar, and the dev mock panel). The whole interface is localized, not just navigation chrome.

Translations live in `src/lib/i18n/` — `de/index.ts` is the base locale (source of truth), `en/index.ts` mirrors it. The app reads strings through the `LL` Svelte store (`$LL.group.key()` in markup; `get(LL).group.key()` in script). The user's choice is persisted under the `fixplay-locale` localStorage key and applied without a reload, so live hardware state survives a language switch.

To add or change a string:

1. Edit `src/lib/i18n/de/index.ts` (and `en/index.ts`).
2. Run `npm run i18n` (or `npm run check`, which runs it implicitly) to regenerate `i18n-types.ts`.
3. A missing key in either locale is a TypeScript compile error — `npm run check` / `npm run build` will fail until both locales match the base.

Component tests that render `$LL`-based components must call `initI18n()` (from `$lib/i18n/init`) in their setup, since `LL` is otherwise only initialized in `+layout.svelte` at runtime.

### Project Structure
```
fixplay-diagnoseTool/
├── src/                    # Svelte 5 frontend (TypeScript)
│   ├── lib/
│   │   ├── api/            # Typed Tauri invoke wrappers
│   │   ├── components/     # UI components (panels, visualizer, testers)
│   │   ├── controllers/    # DualSense HID protocol (USB + BT)
│   │   ├── mock/           # Browser mock layer (MOCK=1)
│   │   └── stores/         # Svelte stores (state management)
│   └── routes/             # SvelteKit routes
├── src-tauri/              # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── commands/       # Tauri command handlers (flash, hid, uart, i2c, settings)
│   │   ├── lib.rs          # App setup, invoke handler registration
│   │   └── state.rs        # Shared application state
│   ├── binaries/           # Bundled flashrom binary
│   ├── icons/              # App icons (all sizes)
│   └── resources/          # Bundled error-code database
├── crates/                 # Rust workspace crates
│   ├── fixplay-core/       # Shared types and traits
│   ├── fixplay-flashrom/   # flashrom subprocess integration
│   ├── fixplay-i2c/        # I2C bridge protocol
│   └── fixplay-uart/       # UART serial + error DB
├── static/                 # Static assets (favicons, icons)
└── scripts/                # Build and release scripts
```

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | Svelte 5 (runes), TypeScript, Tailwind CSS v4, Vite |
| Backend | Rust 2021, Tauri v2, hidapi, serialport, reqwest |
| Testing | Vitest (frontend), cargo test (Rust) |
| CI/CD | GitHub Actions (build + release on tag push) |
| Updater | Tauri updater plugin with signed bundles |

---

## Release Process

Releases are fully automated via GitHub Actions. Push a version tag to trigger:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The workflow builds:
- **Linux (x64):** AppImage, `.deb`, `.rpm` (with libwayland-client stripped from AppImage)
- **Linux (ARM64):** `.deb`, `.rpm` (native `ubuntu-24.04-arm` runner; no AppImage — linuxdeploy is x86_64-only)
- **Windows (x64):** `.msi`, `.exe` (with flashrom.exe built from source)
- **Windows (ARM64):** `.msi`, `.exe` (native `windows-11-arm` runner)
- **macOS:** `.dmg` (unsigned; native `macos-latest` runner)
- **Arch:** `.pkg.tar.zst` (built in an `archlinux:latest` container)
- **AUR:** `fixplay-diagnosetool` and `fixplay-diagnosetool-bin` auto-updated
- **Updater:** `latest.json` manifest with SHA256 checksums and signatures

> The macOS and ARM64 targets are built by a separate `build-extra` job with `continue-on-error: true` — they ship when they succeed but never block a release. Native ARM64 flashrom binaries are not yet built, so flashrom features are runtime-unavailable on ARM64/macOS until a native flashrom is added.

Prerelease tags (containing `-`) skip the AUR publish step.

---

## License

MIT — see [LICENSE](LICENSE).

This project is open source. Contributions, issues, and feature requests are welcome.

---

## Acknowledgments

- [flashrom](https://www.flashrom.org/) — the universal flash programming utility
- [daidr/dualsense-tester](https://github.com/daidr/dualsense-tester) — reference DualSense HID protocol implementation
- [Console-Service-Tool](https://github.com/amoamare/Console-Service-Tool) — error-code database source
- Built with [Tauri](https://tauri.app/) and [Svelte](https://svelte.dev/)
