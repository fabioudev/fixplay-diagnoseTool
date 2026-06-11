use crate::state::AppState;
use fixplay_core::types::DeviceInfo;
use tauri::State;
use tracing::info;

#[tauri::command]
pub async fn scan_devices(_state: State<'_, AppState>) -> Result<Vec<DeviceInfo>, String> {
    info!("scan_devices command invoked");
    Ok(vec![])
}
