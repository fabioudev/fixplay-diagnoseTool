mod commands;
mod state;

use state::AppState;
use tauri::Manager;

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let cache_path = app
                .path()
                .app_data_dir()?
                .join("error_codes.json");
            let state = app.state::<AppState>();
            match fixplay_uart::ErrorDb::from_cache(&cache_path) {
                Ok(db) => {
                    *state.error_db.lock().unwrap() = Some(db);
                    tracing::info!("error DB loaded from cache");
                }
                Err(e) => tracing::warn!("error DB not cached yet: {}", e),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::flash::open_path,
            commands::flash::flash_list_programmers,
            commands::flash::flash_read,
            commands::flash::flash_write,
            commands::uart::uart_list_ports,
            commands::uart::uart_connect,
            commands::uart::uart_disconnect,
            commands::uart::uart_send_errlog,
            commands::uart::uart_send_version,
            commands::uart::uart_set_auto_poll,
            commands::uart::uart_update_error_db,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
