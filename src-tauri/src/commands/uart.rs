use crate::state::AppState;
use fixplay_core::traits::UartDevice;
use fixplay_uart::{build_command, parse_errlog_line, ErrorDb, UartPort};
use serde::Serialize;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tracing::{error, info};

#[derive(Clone, Serialize)]
struct StatusPayload {
    connected: bool,
}

#[derive(Clone, Serialize)]
struct UartEntryPayload {
    entry:       fixplay_core::types::ErrlogEntry,
    description: Option<String>,
}

#[tauri::command]
pub async fn uart_list_ports() -> Result<Vec<String>, String> {
    info!("uart_list_ports invoked");
    UartPort::list_ports().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn uart_connect(
    port: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    info!("uart_connect: {}", port);

    // Stop any existing reader thread first
    if let Some(flag) = state.uart_stop.lock().unwrap().take() {
        flag.store(true, Ordering::Relaxed);
    }
    if let Some(handle) = state.uart_thread.lock().unwrap().take() {
        let _ = handle.join();
    }

    let open_port = serialport::new(&port, 115200)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(|e| e.to_string())?;

    let write_port = open_port.try_clone().map_err(|e| e.to_string())?;
    let read_port  = open_port.try_clone().map_err(|e| e.to_string())?;
    drop(open_port);

    {
        let mut uart_guard = state.uart.lock().unwrap();
        let uart = uart_guard.get_or_insert_with(UartPort::default);
        uart.set_port(write_port);
    }

    let stop_flag  = Arc::new(AtomicBool::new(false));
    let stop_clone = Arc::clone(&stop_flag);
    let db_clone   = Arc::clone(&state.error_db);
    let app_clone  = app.clone();

    let handle = std::thread::spawn(move || {
        reader_loop(read_port, stop_clone, app_clone, db_clone);
    });

    *state.uart_stop.lock().unwrap()   = Some(stop_flag);
    *state.uart_thread.lock().unwrap() = Some(handle);

    app.emit("uart://status", StatusPayload { connected: true })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn uart_disconnect(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    info!("uart_disconnect invoked");

    if let Some(flag) = state.uart_stop.lock().unwrap().take() {
        flag.store(true, Ordering::Relaxed);
    }
    if let Some(handle) = state.uart_thread.lock().unwrap().take() {
        let _ = handle.join();
    }
    if let Some(uart) = state.uart.lock().unwrap().as_mut() {
        let _ = uart.disconnect();
    }

    app.emit("uart://status", StatusPayload { connected: false })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn uart_send_errlog(state: State<'_, AppState>) -> Result<(), String> {
    let cmd = build_command("errlog");
    let mut guard = state.uart.lock().unwrap();
    guard
        .as_mut()
        .ok_or("not connected")?
        .write_line(&cmd)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn uart_send_version(state: State<'_, AppState>) -> Result<(), String> {
    let cmd = build_command("version");
    let mut guard = state.uart.lock().unwrap();
    guard
        .as_mut()
        .ok_or("not connected")?
        .write_line(&cmd)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn uart_set_auto_poll(
    enabled: bool,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    // Stop any existing poll thread
    if let Some(flag) = state.uart_poll_stop.lock().unwrap().take() {
        flag.store(true, Ordering::Relaxed);
    }
    if let Some(handle) = state.uart_poll_thread.lock().unwrap().take() {
        let _ = handle.join();
    }

    if enabled {
        let stop       = Arc::new(AtomicBool::new(false));
        let stop_clone = Arc::clone(&stop);
        let app_clone  = app.clone();

        let handle = std::thread::spawn(move || {
            poll_loop(app_clone, stop_clone);
        });

        *state.uart_poll_stop.lock().unwrap()   = Some(stop);
        *state.uart_poll_thread.lock().unwrap() = Some(handle);
    }
    Ok(())
}

#[tauri::command]
pub async fn uart_update_error_db(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    info!("uart_update_error_db invoked");
    let cache_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("error_codes.json");

    let db = tokio::task::spawn_blocking(move || {
        fixplay_uart::ErrorDb::fetch_and_cache(&cache_path)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    *state.error_db.lock().unwrap() = Some(db);
    app.emit("uart://db_updated", ()).map_err(|e| e.to_string())?;
    Ok(())
}

fn reader_loop(
    mut port: Box<dyn serialport::SerialPort + Send>,
    stop: Arc<AtomicBool>,
    app: AppHandle,
    error_db: Arc<Mutex<Option<ErrorDb>>>,
) {
    let mut buf = Vec::<u8>::with_capacity(256);
    let mut byte = [0u8; 1];

    loop {
        if stop.load(Ordering::Relaxed) {
            break;
        }
        match port.read(&mut byte) {
            Ok(1) => {
                if byte[0] == b'\n' {
                    let line = String::from_utf8_lossy(&buf)
                        .trim_end_matches('\r')
                        .to_string();
                    buf.clear();
                    if line.is_empty() {
                        continue;
                    }
                    let _ = app.emit("uart://line", &line);
                    if let Some(entry) = parse_errlog_line(&line) {
                        let description = error_db
                            .lock()
                            .unwrap()
                            .as_ref()
                            .and_then(|db| db.lookup(entry.error_code))
                            .map(|e| e.description.clone());
                        let _ = app.emit("uart://entry", &UartEntryPayload { entry, description });
                    }
                } else {
                    buf.push(byte[0]);
                }
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(e) => {
                error!("reader_loop error: {}", e);
                let state = app.state::<AppState>();
                if let Some(uart) = state.uart.lock().unwrap().as_mut() {
                    let _ = uart.disconnect();
                }
                state.uart_stop.lock().unwrap().take();
                state.uart_thread.lock().unwrap().take();
                let _ = app.emit("uart://status", StatusPayload { connected: false });
                break;
            }
        }
    }
}

fn poll_loop(app: AppHandle, stop: Arc<AtomicBool>) {
    loop {
        // Sleep 5 seconds in 100ms increments to check stop flag often
        for _ in 0..50 {
            if stop.load(Ordering::Relaxed) {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        if stop.load(Ordering::Relaxed) {
            return;
        }
        {
            let state = app.state::<AppState>();
            let mut guard = state.uart.lock().unwrap();
            if let Some(uart) = guard.as_mut() {
                if uart.is_connected() {
                    let cmd = build_command("errlog");
                    if let Err(e) = uart.write_line(&cmd) {
                        error!("poll_loop write error: {}", e);
                        let _ = app.emit("uart://status", StatusPayload { connected: false });
                        return;
                    }
                }
            }
        }
    }
}
