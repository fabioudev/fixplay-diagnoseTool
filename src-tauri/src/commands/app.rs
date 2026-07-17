//! App-level commands: version + update-channel detection.
//!
//! `get_update_channel` tells the frontend whether this binary is managed by a
//! system package manager (pacman/AUR install under `/usr/bin` or
//! `/opt/fixplay-diagnosetool-bin`) or a self-contained, user-writable install
//! (standalone AppImage run directly, Windows installer). For a managed install
//! the frontend must NOT self-update (the package manager owns the binary) and
//! instead points the user at `yay -Syu` / their AUR helper.

use serde::Serialize;
use tauri::AppHandle;

#[derive(Clone, Copy, Serialize)]
pub struct UpdateChannel {
    /// `true` when the running binary lives in a package-manager-owned path —
    /// the frontend should defer to the package manager instead of self-updating.
    pub managed: bool,
    /// Human-facing update hint shown next to the banner (e.g. `yay -Syu`).
    pub hint: &'static str,
}

/// Heuristic: does this look like a pacman/AUR-managed install?
///
/// Kept as a free function so the path logic is unit-testable without a running
/// Tauri app. Returns the static hint string alongside the boolean.
///
/// `exe` is `current_exe()`; `appimage` is the `APPIMAGE` env var (set by the
/// AppImage runtime to the absolute path of the running .AppImage file). Both
/// are needed: the AUR `-bin` wrapper runs the AppImage with
/// `APPIMAGE_EXTRACT_AND_RUN=1`, which extracts to a /tmp dir and makes
/// `current_exe()` point at that extraction — NOT at the real
/// `/opt/fixplay-diagnosetool-bin/…AppImage`. So `exe` alone misses the managed
/// case, the UI offers self-update, and Tauri's updater tries to write its
/// `tauri_current_app<rand>` temp file next to the real AppImage in /opt
/// (root-owned) → EACCES (os error 13). Checking `APPIMAGE` recovers it.
fn classify_exe(exe: &str, appimage: &str) -> UpdateChannel {
    // pacman installs the wrapper to /usr/bin/fixplay-diagnosetool and the
    // AppImage to /opt/fixplay-diagnosetool-bin/. A standalone AppImage run
    // directly extracts to /tmp/.mount_<name>/ and is user-writable.
    let managed = exe.starts_with("/usr/bin/")
        || exe.starts_with("/usr/local/bin/")
        || exe.contains("/opt/fixplay-diagnosetool-bin/")
        || appimage.contains("/opt/fixplay-diagnosetool-bin/");
    let hint = if managed { "yay -Syu" } else { "" };
    UpdateChannel { managed, hint }
}

/// Detect how this app was installed so the frontend can pick the right update
/// UX (self-update vs. "update via your package manager").
#[tauri::command]
pub fn get_update_channel() -> UpdateChannel {
    let exe = std::env::current_exe()
        .ok()
        .and_then(|p| p.to_str().map(|s| s.to_string()))
        .unwrap_or_default();
    let appimage = std::env::var("APPIMAGE").unwrap_or_default();
    classify_exe(&exe, &appimage)
}

/// Current app version, exposed so the frontend can show "you're on X.Y.Z"
/// next to an available update. Reads the `tauri.conf.json` `version` (the
/// canonical release version, bumped every release) via Tauri's
/// `package_info()` — NOT `env!("CARGO_PKG_VERSION")`, which reads
/// `src-tauri/Cargo.toml` and is intentionally kept back at 0.1.6, so the
/// displayed version would otherwise lag the installed release forever.
#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usr_bin_is_managed() {
        let c = classify_exe("/usr/bin/fixplay-diagnosetool", "");
        assert!(c.managed);
        assert_eq!(c.hint, "yay -Syu");
    }

    #[test]
    fn opt_bin_is_managed() {
        let c = classify_exe("/opt/fixplay-diagnosetool-bin/fixplay-diagnosetool.AppImage", "");
        assert!(c.managed);
    }

    #[test]
    fn aur_extract_and_run_detected_via_appimage_env() {
        // The AUR -bin wrapper runs with APPIMAGE_EXTRACT_AND_RUN=1, so
        // current_exe() is a /tmp extraction while APPIMAGE points at the real
        // /opt AppImage. This is the case that used to wrongly fall through to
        // self-update → EACCES writing tauri_current_app<rand> into /opt.
        let c = classify_exe(
            "/tmp/.appimage-ABCD/usr/bin/fixplay-tauri",
            "/opt/fixplay-diagnosetool-bin/fixplay-diagnosetool.AppImage",
        );
        assert!(c.managed);
        assert_eq!(c.hint, "yay -Syu");
    }

    #[test]
    fn appimage_mount_is_self_update() {
        // Standalone AppImage run directly mounts under /tmp/.mount_<name>/;
        // APPIMAGE is the user-writable file the user downloaded, not /opt.
        let c = classify_exe("/tmp/.mount_fixplay-diDiag/AppRun", "/home/user/Applications/fixplay.AppImage");
        assert!(!c.managed);
        assert_eq!(c.hint, "");
    }

    #[test]
    fn home_dir_install_is_self_update() {
        let c = classify_exe("/home/user/Applications/fixplay-diagnoseTool_0.1.6_amd64.AppImage", "");
        assert!(!c.managed);
    }

    #[test]
    fn windows_path_is_self_update() {
        // current_exe on Windows uses backslashes — never matches the Unix
        // managed prefixes, so the MSI/NSIS install is treated as self-update.
        let c = classify_exe("C:\\Program Files\\fixplay-diagnoseTool\\fixplay-diagnoseTool.exe", "");
        assert!(!c.managed);
    }
}