use crate::settings::{load_settings, save_settings, AppSettings};
use tauri::AppHandle;

#[tauri::command]
pub fn settings_get(app: AppHandle) -> AppSettings {
    load_settings(&app)
}

#[tauri::command]
pub fn settings_save(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    save_settings(&app, &settings)
}
