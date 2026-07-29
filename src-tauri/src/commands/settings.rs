use crate::settings::{load_settings, save_settings, AppSettings};
use tauri::AppHandle;

#[tauri::command]
pub fn settings_get(app: AppHandle) -> Result<AppSettings, String> {
    load_settings(&app)
}

#[tauri::command]
pub fn settings_save(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    save_settings(&app, &settings)
}
