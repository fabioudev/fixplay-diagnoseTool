# fixplay diagnoseTool

**Cross-platform desktop diagnostic tool for gaming console repair.**  
Read, validate, and archive NOR flash dumps. Live UART error-code diagnostics. DualSense controller testing and calibration. Built with **Tauri v2** (Rust + Svelte 5).

<p align="center">
  <img src="static/favicon.svg" alt="fixplay logo" width="128" />
</p>

---

## Features

### NOR Flash
- Read NOR flash chips via **flashrom** (CH341A, FT2232, serprog, and 180+ other programmers)
- Automatic two-pass read with progress events
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
- **Stick calibration** (center + range/circularity)
- **Bluetooth support** — full CRC32 framing for output and feature reports over BT
- Read controller info: firmware version, MAC address, serial number, board model
- NVS read/write for persistent settings

### General
- **Start screen** with quick-access cards for all tools
- **Mock mode** (`MOCK=1`) — full browser-based preview without hardware or Tauri backend
- **In-app updater** with signed bundles and automatic update checks
- **Dark theme** throughout
- **Tablet mode** for touch-optimized layout
- Cross-platform: **Windows** (.msi/.exe), **Linux** (.deb/.rpm/.AppImage), **Arch** (AUR)

---

## Installation

### Prebuilt Downloads
Download the latest release from [GitHub Releases](https://github.com/fabioudev/fixplay-diagnoseTool/releases):

| Platform | Package |
|----------|---------|
| Windows | `.msi` installer or `.exe` setup |
| Linux (Ubuntu/Debian) | `.deb` |
| Linux (Fedora/RHEL) | `.rpm` |
| Linux (universal) | `.AppImage` |

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
npm run check         # Type-check (svelte-check)
cargo test --workspace  # Rust unit tests
cargo clippy --workspace  # Rust lint
```

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
- **Linux:** AppImage, `.deb`, `.rpm` (with libwayland-client stripped from AppImage)
- **Windows:** `.msi`, `.exe` (with flashrom.exe built from source)
- **Arch:** `.pkg.tar.zst` (built in an `archlinux:latest` container)
- **AUR:** `fixplay-diagnosetool` and `fixplay-diagnosetool-bin` auto-updated
- **Updater:** `latest.json` manifest with SHA256 checksums and signatures

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
