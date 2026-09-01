use fixplay_flashrom::flashrom_path;
use tauri::Manager;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct AppSettings {
    pub flashrom_path:  Option<String>,
    pub archive_dir:    Option<String>,
    #[serde(default = "default_baud_rate")]
    pub baud_rate:      u32,
    /// Baud rate for the I2C-over-USB-CDC bridge (Pico). USB CDC ignores the
    /// value in practice, but the serialport API still requires one.
    #[serde(default = "default_baud_rate")]
    pub i2c_baud_rate:  u32,
    #[serde(default)]
    pub auto_reconnect: bool,
    #[serde(default)]
    pub tablet_mode:    bool,
}

fn default_baud_rate() -> u32 { 115200 }

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            flashrom_path:  None,
            archive_dir:    None,
            baud_rate:      default_baud_rate(),
            i2c_baud_rate:  default_baud_rate(),
            auto_reconnect: false,
            tablet_mode:    false,
        }
    }
}

pub fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("settings.json"))
}

pub fn load_settings(app: &tauri::AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(app)?;
    match std::fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents).map_err(|e| {
            format!("Settings-Datei ist beschädigt: {}. Bitte lösche {} oder korrigiere die JSON-Syntax.", e, path.display())
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(AppSettings::default()),
        Err(e) => Err(format!("Settings-Datei kann nicht gelesen werden ({}): {}", path.display(), e)),
    }
}

/// Convenience: load settings, falling back to defaults on any error.
/// Use in internal code paths where a corrupt file shouldn't crash the app.
pub fn load_settings_or_default(app: &tauri::AppHandle) -> AppSettings {
    load_settings(app).unwrap_or_default()
}

pub fn save_settings(app: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

/// Sane baud-rate bounds. Covers every standard rate from 300 (old industrial
/// devices) up to 921600 (high-speed USB-serial bridges). Anything outside
/// this range is almost certainly a corrupt settings file or a malicious
/// invoke() call — the serialport crate would accept nonsense like 0 or
/// 4_000_000_000 and either fail opaquely or misbehave.
pub const MIN_BAUD: u32 = 300;
pub const MAX_BAUD: u32 = 921600;

/// Validate a baud rate, returning it unchanged if in range or an error
/// otherwise. Callers that should never hard-fail (background reconnect loops)
/// can use `clamp_baud_rate` instead.
pub fn validate_baud_rate(baud: u32) -> Result<u32, String> {
    if (MIN_BAUD..=MAX_BAUD).contains(&baud) {
        Ok(baud)
    } else {
        Err(format!(
            "Baudrate {} liegt außerhalb des gültigen Bereichs ({}–{}).",
            baud, MIN_BAUD, MAX_BAUD
        ))
    }
}

/// Clamp a baud rate into the valid range. Used where a bad value must not
/// abort the operation (e.g. auto-reconnect) — a corrupt settings file with
/// baud_rate=0 would otherwise repeatedly fail to open the port.
pub fn clamp_baud_rate(baud: u32) -> u32 {
    baud.clamp(MIN_BAUD, MAX_BAUD)
}

pub fn resolve_flashrom_path(settings: &AppSettings, resource_dir: &std::path::Path) -> std::path::PathBuf {
    if let Some(custom) = settings.flashrom_path.as_ref() {
        return std::path::PathBuf::from(custom);
    }
    let bundled = flashrom_path(resource_dir);
    // If the bundled binary is missing (e.g. dev build without the resource
    // step, or a stripped package), fall back to a system `flashrom` resolved
    // via PATH at spawn time. Returning the bare name lets the OS search PATH.
    // Same for the committed dev placeholder stub — shipping it as a "binary"
    // would shadow a working system flashrom and fail every flash operation
    // at spawn with an opaque error.
    if !bundled.exists() || fixplay_flashrom::is_placeholder_binary(&bundled) {
        return std::path::PathBuf::from("flashrom");
    }
    bundled
}

pub fn resolve_archive_base(settings: &AppSettings, default_data_dir: &std::path::Path) -> std::path::PathBuf {
    settings.archive_dir.as_ref()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| default_data_dir.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_has_expected_values() {
        let s = AppSettings::default();
        assert_eq!(s.baud_rate, 115200);
        assert_eq!(s.i2c_baud_rate, 115200);
        assert!(s.flashrom_path.is_none());
        assert!(s.archive_dir.is_none());
    }

    #[test]
    fn save_and_load_round_trips_via_json() {
        let settings = AppSettings {
            flashrom_path:  Some("/usr/bin/flashrom".to_string()),
            archive_dir:    Some("/tmp/dumps".to_string()),
            baud_rate:      9600,
            i2c_baud_rate:  115200,
            auto_reconnect: true,
            tablet_mode:    false,
        };
        let json   = serde_json::to_string_pretty(&settings).unwrap();
        let loaded: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(loaded.baud_rate, 9600);
        assert_eq!(loaded.i2c_baud_rate, 115200);
        assert_eq!(loaded.flashrom_path,  Some("/usr/bin/flashrom".to_string()));
        assert_eq!(loaded.archive_dir,    Some("/tmp/dumps".to_string()));
        assert!(loaded.auto_reconnect);
    }

    #[test]
    fn auto_reconnect_defaults_to_false_for_legacy_settings() {
        let json   = r#"{"baud_rate": 9600}"#;
        let loaded: AppSettings = serde_json::from_str(json).unwrap();
        assert!(!loaded.auto_reconnect);
    }

    #[test]
    fn deserialize_invalid_json_returns_none() {
        let result: Option<AppSettings> = serde_json::from_str("NOT_VALID").ok();
        assert!(result.is_none());
        let fallback = result.unwrap_or_default();
        assert_eq!(fallback.baud_rate, 115200);
    }

    #[test]
    fn resolve_flashrom_path_uses_custom_when_some() {
        let s = AppSettings {
            flashrom_path: Some("/custom/flashrom".to_string()),
            ..Default::default()
        };
        let path = resolve_flashrom_path(&s, std::path::Path::new("/res"));
        assert_eq!(path, std::path::PathBuf::from("/custom/flashrom"));
    }

    #[test]
    fn resolve_flashrom_path_uses_bundled_when_present() {
        // Create the bundled binary location so the fallback to PATH isn't taken.
        let tmp = std::env::temp_dir().join("fp_res_bundled");
        std::fs::create_dir_all(tmp.join("binaries")).unwrap();
        let bin = tmp.join("binaries").join("flashrom");
        std::fs::write(&bin, b"#!/bin/sh\n").unwrap();
        let s    = AppSettings::default();
        let path = resolve_flashrom_path(&s, &tmp);
        assert_eq!(path, bin);
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn resolve_flashrom_path_skips_bundled_placeholder() {
        // The committed dev stub (`placeholder\n`) must never shadow a working
        // system flashrom — fall through to the PATH-resolved bare name.
        let tmp = std::env::temp_dir().join("fp_res_placeholder");
        std::fs::create_dir_all(tmp.join("binaries")).unwrap();
        let bin = tmp.join("binaries").join("flashrom");
        std::fs::write(&bin, b"placeholder\n").unwrap();
        let s    = AppSettings::default();
        let path = resolve_flashrom_path(&s, &tmp);
        assert_eq!(path, std::path::PathBuf::from("flashrom"));
        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn resolve_flashrom_path_falls_back_to_path_when_bundled_missing() {
        // /res does not exist on disk → bundled binary missing → bare "flashrom"
        // so the OS resolves it via PATH at spawn time.
        let s    = AppSettings::default();
        let path = resolve_flashrom_path(&s, std::path::Path::new("/res/does/not/exist"));
        assert_eq!(path, std::path::PathBuf::from("flashrom"));
    }

    #[test]
    fn resolve_archive_base_uses_custom_when_some() {
        let s = AppSettings {
            archive_dir: Some("/custom/archive".to_string()),
            ..Default::default()
        };
        let base = resolve_archive_base(&s, std::path::Path::new("/default"));
        assert_eq!(base, std::path::PathBuf::from("/custom/archive"));
    }

    #[test]
    fn resolve_archive_base_uses_default_when_none() {
        let s    = AppSettings::default();
        let base = resolve_archive_base(&s, std::path::Path::new("/default"));
        assert_eq!(base, std::path::PathBuf::from("/default"));
    }

    #[test]
    fn validate_baud_rate_accepts_standard_rates() {
        for &rate in &[300, 9600, 115200, 460800, 921600] {
            assert_eq!(validate_baud_rate(rate).unwrap(), rate);
        }
    }

    #[test]
    fn validate_baud_rate_rejects_out_of_range() {
        assert!(validate_baud_rate(0).is_err());
        assert!(validate_baud_rate(299).is_err());
        assert!(validate_baud_rate(921601).is_err());
        assert!(validate_baud_rate(u32::MAX).is_err());
    }

    #[test]
    fn clamp_baud_rate_pulls_into_range() {
        assert_eq!(clamp_baud_rate(0), MIN_BAUD);
        assert_eq!(clamp_baud_rate(u32::MAX), MAX_BAUD);
        assert_eq!(clamp_baud_rate(115200), 115200);
    }
}
