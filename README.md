# fixplay-diagnoseTool
Cross-platform desktop tool for reading, validating and archiving NOR flash dumps from gaming consoles. Features UART error code reading for live diagnostics. Built with Tauri (Rust + Web). Supports CH341A, RT809H and other common programmers via flashrom.

## Releases

Prebuilt downloads are published via GitHub Releases for Windows and Linux. For Arch-based systems like CachyOS, two AUR packages are auto-published per release:

- **`fixplay-diagnosetool`** (recommended on Arch) — builds from source and links against your **system `webkit2gtk-4.1`**, which matches your distro's Mesa/GPU stack. Install: `paru -S fixplay-diagnosetool` (or `git clone https://aur.archlinux.org/fixplay-diagnosetool.git && makepkg -si`).
- **`fixplay-diagnosetool-bin`** — ships the prebuilt AppImage from the GitHub release. Mainly for Ubuntu/Debian. **On Arch it may show an empty window** ("Could not create default EGL display: EGL_BAD_PARAMETER") because the AppImage bundles a WebKit built on Ubuntu that some Arch/Mesa GPU drivers (e.g. older Intel) reject. On Arch, prefer the source package above. The `-bin` PKGBUILD uses `options=('!strip' '!debug')` so makepkg does not mangle the AppImage.

> AUR search (RPC) can lag ~10–15 min for a brand-new release; until then `git clone https://aur.archlinux.org/<pkg>.git && makepkg -si` works immediately.

