use crate::settings::{load_settings, save_settings, AppSettings};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn settings_get(app: AppHandle) -> Result<AppSettings, String> {
    load_settings(&app)
}

#[tauri::command]
pub fn settings_save(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    save_settings(&app, &settings)
}

/// Return the OS app-data directory where settings.json and the default dump
/// archive live. The frontend uses this to offer an "open config folder"
/// shortcut and to show where data is stored.
#[tauri::command]
pub fn app_data_dir_path(app: AppHandle) -> Result<String, String> {
    app.path().app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}
