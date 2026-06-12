mod commands;
mod settings;
mod state;

use state::AppState;
use tauri::{Emitter, Manager};

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
            let cache_path    = app.path().app_data_dir()?.join("error_codes.json");
            let resource_path = app.path().resource_dir().ok()
                                   .map(|r| r.join("error_codes.json"));
            let state         = app.state::<AppState>();

            // Step 1: try user cache
            let cache_ok = match fixplay_uart::ErrorDb::from_cache(&cache_path) {
                Ok(db) => {
                    let count = db.len();
                    *state.error_db.lock().unwrap() = Some(db);
                    tracing::info!("error DB loaded from cache ({} codes)", count);
                    let _ = app.handle().emit("uart://db-status",
                        crate::commands::uart::DbStatusPayload {
                            loaded: true, count: Some(count), source: "cache".into(),
                        });
                    true
                }
                Err(e) => { tracing::warn!("error DB cache miss: {}", e); false }
            };

            // Step 2: try bundled resource (only if no user cache)
            if !cache_ok {
                if let Some(ref rpath) = resource_path {
                    if let Ok(db) = fixplay_uart::ErrorDb::from_cache(rpath) {
                        let count = db.len();
                        if count > 0 {
                            *state.error_db.lock().unwrap() = Some(db);
                            tracing::info!("error DB loaded from bundled resource ({} codes)", count);
                            let _ = std::fs::copy(rpath, &cache_path);
                            let _ = app.handle().emit("uart://db-status",
                                crate::commands::uart::DbStatusPayload {
                                    loaded: true, count: Some(count), source: "bundled".into(),
                                });
                        }
                    }
                }

                // Step 3: spawn background fetch
                let error_db   = std::sync::Arc::clone(&state.error_db);
                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    match fixplay_uart::ErrorDb::fetch_and_cache(&cache_path) {
                        Ok(db) => {
                            let count = db.len();
                            *error_db.lock().unwrap() = Some(db);
                            tracing::info!("error DB fetched in background ({} codes)", count);
                            let _ = app_handle.emit("uart://db-status",
                                crate::commands::uart::DbStatusPayload {
                                    loaded: true, count: Some(count), source: "fetched".into(),
                                });
                        }
                        Err(e) => {
                            tracing::warn!("background DB fetch failed: {}", e);
                            let guard  = error_db.lock().unwrap();
                            let loaded = guard.is_some();
                            let count  = guard.as_ref().map(|db| db.len());
                            let _ = app_handle.emit("uart://db-status",
                                crate::commands::uart::DbStatusPayload {
                                    loaded, count, source: "failed".into(),
                                });
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::flash::open_path,
            commands::flash::flash_list_programmers,
            commands::flash::flash_read,
            commands::flash::flash_write,
            commands::flash::archive_list_dumps,
            commands::flash::archive_delete_dump,
            commands::flash::flash_validate_file,
            commands::uart::uart_list_ports,
            commands::uart::uart_connect,
            commands::uart::uart_disconnect,
            commands::uart::uart_send_errlog,
            commands::uart::uart_send_version,
            commands::uart::uart_set_auto_poll,
            commands::uart::uart_update_error_db,
            commands::uart::uart_get_db_info,
            commands::uart::uart_search_error_db,
            commands::settings::settings_get,
            commands::settings::settings_save,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
