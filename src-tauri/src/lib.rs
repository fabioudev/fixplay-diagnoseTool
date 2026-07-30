mod commands;
mod settings;
mod state;

use state::AppState;
use tauri::{Emitter, Manager};

/// Initialize the tracing subscriber.
///
/// In debug builds this is a simple console (stderr) subscriber — fast feedback
/// during development, no log files written. In release builds a second layer
/// writes a rolling daily log file (`fixplay.log.YYYY-MM-DD`) under the app's
/// local-data dir so users on Windows — where a GUI `.exe` has no attached
/// terminal to read stderr — can still share the log for support. If the log
/// directory can't be created the file layer is skipped and we fall back to
/// console-only so a logging failure never prevents the app from starting.
fn init_logging() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "info".into());

    #[cfg(debug_assertions)]
    {
        // Dev: console only.
        tracing_subscriber::fmt().with_env_filter(filter).init();
    }

    #[cfg(not(debug_assertions))]
    {
        init_release_logging(filter);
    }
}

/// Release-build logging: console + a rolling daily file under the app's
/// local-data dir. See [`init_logging`] for the rationale.
#[cfg(not(debug_assertions))]
fn init_release_logging(filter: tracing_subscriber::EnvFilter) {
    use tracing_subscriber::{fmt, prelude::*};

    let console_layer = fmt::layer();

    // Resolve the log dir: `<local-data>/fixplay-diagnoseTool/logs`. Use the
    // platform local-data dir (e.g. %LOCALAPPDATA% on Windows, ~/.local/share
    // on Linux, ~/Library/Application Support on macOS). Fall back to
    // console-only if the dir can't be determined or created.
    let Some(log_dir) = dirs::data_local_dir().map(|d| d.join("fixplay-diagnoseTool").join("logs"))
    else {
        tracing_subscriber::registry()
            .with(filter)
            .with(console_layer)
            .init();
        return;
    };
    if std::fs::create_dir_all(&log_dir).is_err() {
        tracing_subscriber::registry()
            .with(filter)
            .with(console_layer)
            .init();
        return;
    }

    // Rolling daily appender: one file per day, auto-rotated. `with_ansi(false)`
    // keeps colour codes out of the file. The appender is a synchronous writer
    // (logs are written on the emitting thread) — fine for this app's volume and
    // avoids the non-blocking guard lifetime entanglement.
    let file_appender = tracing_appender::rolling::daily(&log_dir, "fixplay.log");
    let file_layer = fmt::layer()
        .with_ansi(false)
        .with_writer(file_appender);

    tracing_subscriber::registry()
        .with(filter)
        .with(console_layer)
        .with(file_layer)
        .init();

    tracing::info!("file logging enabled → {}", log_dir.display());
}

pub fn run() {
    init_logging();

    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let cache_path    = app.path().app_data_dir()?.join("error_codes.json");
            // Tauri preserves the `resources/` subdir from tauri.conf.json
            // `bundle.resources`, so the bundled PS5 DB lives at
            // `<resource_dir>/resources/error_codes.json`.
            let resource_path = app.path().resource_dir().ok()
                                   .map(|r| r.join("resources").join("error_codes.json"));
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

            // ── flashrom binary self-check ──────────────────────────────────
            // The bundled Windows `flashrom.exe` is a 0-byte placeholder that CI
            // replaces at release-build time; in dev or a broken install the
            // binary may be missing/empty/not executable. Warn the UI up front
            // (via `flash://binary-status`) instead of letting the first flash
            // fail with an opaque subprocess error. The app still starts — a
            // later flash attempt surfaces `FlashError::NotFound`.
            {
                #[derive(serde::Serialize, Clone)]
                struct BinaryStatus {
                    ok:     bool,
                    reason: Option<String>,
                    path:   String,
                }
                let resource_dir = app.path().resource_dir().ok();
                let settings     = crate::settings::load_settings_or_default(app.handle());
                let binary_path  = resource_dir
                    .as_ref()
                    .map(|r| crate::settings::resolve_flashrom_path(&settings, r))
                    .unwrap_or_default();

                let (ok, reason) = check_flashrom_binary(&binary_path);
                if !ok {
                    tracing::error!(
                        "flashrom binary self-check failed: {:?} ({})",
                        binary_path,
                        reason.as_deref().unwrap_or("?")
                    );
                }
                let _ = app.handle().emit(
                    "flash://binary-status",
                    BinaryStatus {
                        ok,
                        reason,
                        path: binary_path.to_string_lossy().to_string(),
                    },
                );
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::get_update_channel,
            commands::app::app_version,
            commands::flash::open_path,
            commands::flash::save_text_file,
            commands::flash::flash_list_programmers,
            commands::flash::flash_get_binary_status,
            commands::flash::flash_read,
            commands::flash::flash_read_id,
            commands::flash::flash_write,
            commands::flash::archive_list_dumps,
            commands::flash::archive_delete_dump,
            commands::flash::flash_validate_file,
            commands::flash::flash_free_disk_space,
            commands::uart::uart_list_ports,
            commands::uart::uart_connect,
            commands::uart::uart_disconnect,
            commands::uart::uart_send_errlog,
            commands::uart::uart_send_version,
            commands::uart::uart_send_raw,
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
            commands::settings::app_data_dir_path,
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

/// Verify the flashrom binary is usable: present, non-empty, and (on Unix)
/// executable. Returns `(false, Some(reason))` when a check fails so the setup
/// block can emit a `flash://binary-status` warning to the UI.
pub fn check_flashrom_binary(path: &std::path::Path) -> (bool, Option<String>) {
    if path.as_os_str().is_empty() {
        return (false, Some("flashrom path is empty".into()));
    }
    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return (false, Some("flashrom binary not found".into())),
    };
    if !meta.is_file() {
        return (false, Some("flashrom path is not a file".into()));
    }
    if meta.len() == 0 {
        return (false, Some("flashrom binary is empty (0 bytes)".into()));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        const EXEC_BITS: u32 = 0o111;
        if meta.permissions().mode() & EXEC_BITS == 0 {
            return (false, Some("flashrom binary is not executable".into()));
        }
    }
    (true, None)
}
