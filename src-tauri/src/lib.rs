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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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

            // Xbox error-code DB (I2C path) — same 3-step lifecycle as the PS5
            // DB: user cache → bundled resource → background fetch.
            let xbox_cache_path    = app.path().app_data_dir()?.join("xbox_error_codes.json");
            let xbox_resource_path = crate::commands::i2c::xbox_db_resource_path(app.handle());
            let xbox_cache_ok = match fixplay_i2c::XboxErrorDb::from_cache(&xbox_cache_path) {
                Ok(db) => {
                    let count = db.len();
                    *state.xbox_error_db.lock().unwrap() = Some(db);
                    tracing::info!("Xbox error DB loaded from cache ({} codes)", count);
                    let _ = app.handle().emit("i2c://db-status",
                        crate::commands::i2c::I2cDbStatusPayload {
                            loaded: true, count: Some(count), source: "cache".into(),
                        });
                    true
                }
                Err(e) => { tracing::warn!("Xbox error DB cache miss: {}", e); false }
            };
            if !xbox_cache_ok {
                if let Some(ref rpath) = xbox_resource_path {
                    if let Ok(db) = fixplay_i2c::XboxErrorDb::from_cache(rpath) {
                        let count = db.len();
                        if count > 0 {
                            *state.xbox_error_db.lock().unwrap() = Some(db);
                            tracing::info!("Xbox error DB loaded from bundled resource ({} codes)", count);
                            let _ = std::fs::copy(rpath, &xbox_cache_path);
                            let _ = app.handle().emit("i2c://db-status",
                                crate::commands::i2c::I2cDbStatusPayload {
                                    loaded: true, count: Some(count), source: "bundled".into(),
                                });
                        }
                    }
                }
                let xbox_db   = std::sync::Arc::clone(&state.xbox_error_db);
                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    match fixplay_i2c::XboxErrorDb::fetch_and_cache(&xbox_cache_path) {
                        Ok(db) => {
                            let count = db.len();
                            *xbox_db.lock().unwrap() = Some(db);
                            tracing::info!("Xbox error DB fetched in background ({} codes)", count);
                            let _ = app_handle.emit("i2c://db-status",
                                crate::commands::i2c::I2cDbStatusPayload {
                                    loaded: true, count: Some(count), source: "fetched".into(),
                                });
                        }
                        Err(e) => {
                            tracing::warn!("background Xbox DB fetch failed: {}", e);
                            let guard  = xbox_db.lock().unwrap();
                            let loaded = guard.is_some();
                            let count  = guard.as_ref().map(|db| db.len());
                            let _ = app_handle.emit("i2c://db-status",
                                crate::commands::i2c::I2cDbStatusPayload {
                                    loaded, count, source: "failed".into(),
                                });
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::get_update_channel,
            commands::app::app_version,
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
            commands::uart::uart_clear_errlog,
            commands::uart::uart_set_auto_poll,
            commands::uart::uart_set_auto_reconnect,
            commands::uart::uart_update_error_db,
            commands::uart::uart_get_db_info,
            commands::uart::uart_search_error_db,
            commands::uart::uart_poll,
            commands::uart::uart_loopback_test,
            commands::i2c::i2c_list_ports,
            commands::i2c::i2c_connect,
            commands::i2c::i2c_disconnect,
            commands::i2c::i2c_scan,
            commands::i2c::i2c_read,
            commands::i2c::i2c_write,
            commands::i2c::i2c_read_eeprom,
            commands::i2c::i2c_errlog,
            commands::i2c::i2c_info,
            commands::i2c::i2c_poll,
            commands::i2c::i2c_update_xbox_db,
            commands::i2c::i2c_get_db_info,
            commands::i2c::i2c_search_xbox_db,
            commands::settings::settings_get,
            commands::settings::settings_save,
            commands::hid::hid_list_devices,
            commands::hid::hid_connect,
            commands::hid::hid_disconnect,
            commands::hid::hid_send_feature_report,
            commands::hid::hid_receive_feature_report,
            commands::hid::hid_send_output_report,
            commands::hid::hid_poll,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
