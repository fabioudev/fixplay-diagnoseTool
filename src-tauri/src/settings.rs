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

pub fn resolve_flashrom_path(settings: &AppSettings, resource_dir: &std::path::Path) -> std::path::PathBuf {
    settings.flashrom_path.as_ref()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| flashrom_path(resource_dir))
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
    fn resolve_flashrom_path_uses_bundled_when_none() {
        let s    = AppSettings::default();
        let path = resolve_flashrom_path(&s, std::path::Path::new("/res"));
        assert!(path.starts_with("/res"));
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
}
