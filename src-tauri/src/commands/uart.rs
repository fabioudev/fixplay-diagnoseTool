use fixplay_core::types::DeviceInfo;
use tracing::info;

#[tauri::command]
pub async fn list_ports() -> Result<Vec<DeviceInfo>, String> {
    info!("list_ports command invoked");
    Ok(vec![])
}
