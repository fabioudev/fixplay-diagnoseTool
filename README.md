# fixplay-diagnoseTool

Cross-platform desktop tool for reading, validating, and archiving NOR flash dumps from gaming consoles. It also features UART error code reading for live diagnostics. Built with [Tauri](https://tauri.app) (Rust + Web) and supports CH341A, RT809H, and other common programmers via [flashrom](https://flashrom.org).

## Features

- Read, validate, and archive NOR flash dumps from gaming consoles
- Live UART diagnostics for reading error codes
- Support for common programmers (CH341A, RT809H, and others) via `flashrom`
- Cross-platform desktop app for Windows and Linux

## Releases

Prebuilt downloads are published via [GitHub Releases](../../releases) for Windows and Linux. For Arch-based systems like CachyOS, an optional [AUR](https://aur.archlinux.org) package can point to the AppImage release.
