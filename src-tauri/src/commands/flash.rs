use crate::state::AppState;
use tauri::State;
use tracing::info;

#[tauri::command]
pub async fn scan_devices(_state: State<'_, AppState>) -> Result<Vec<String>, String> {
    info!("scan_devices stub");
    Ok(vec![])
}
