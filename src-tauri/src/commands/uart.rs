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

#[derive(Clone, Serialize)]
pub struct ErrorSearchResult {
    pub code:        u32,
    pub description: String,
    pub category:    String,
}

#[derive(serde::Serialize, Clone)]
pub(crate) struct DbStatusPayload {
    pub loaded: bool,
    pub count:  Option<usize>,
    pub source: String,
}

#[derive(Clone, Serialize)]
struct ReconnectingPayload {
    active: bool,
}

#[derive(Clone, Serialize)]
pub struct UartPortInfo {
    pub name:        String,
    pub is_bridge:   bool,
    pub description: String,
}

fn detect_bridge(port: &serialport::SerialPortInfo) -> (bool, String) {
    if let serialport::SerialPortType::UsbPort(ref usb) = port.port_type {
        let label = match usb.vid {
            0x1A86 => Some("CH340/CH341"),
            0x10C4 => Some("CP210x"),
            0x0403 => Some("FTDI FT232"),
            0x067B => Some("PL2303"),
            0x0483 => Some("STM32 VCP"),
            0x04D8 => Some("MCP2221"),
            0x2341 => Some("Arduino"),
            0x239A => Some("Adafruit"),
            _      => None,
        };
        if let Some(l) = label {
            return (true, l.to_string());
        }
        // Fallback: check product/manufacturer name for bridge hints
        let prod = usb.product.as_deref().unwrap_or("").to_lowercase();
        let mfr  = usb.manufacturer.as_deref().unwrap_or("").to_lowercase();
        let hint = prod.contains("uart") || prod.contains("serial") || prod.contains("bridge")
                || mfr.contains("uart")  || mfr.contains("silicon");
        if hint {
            let desc = usb.product.clone().unwrap_or_else(|| "UART Bridge".into());
            return (true, desc);
        }
    }
    (false, String::new())
}

#[tauri::command]
pub async fn uart_list_ports() -> Result<Vec<UartPortInfo>, String> {
    info!("uart_list_ports invoked");
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    Ok(ports.into_iter().map(|p| {
        let (is_bridge, description) = detect_bridge(&p);
        UartPortInfo { name: p.port_name, is_bridge, description }
    }).collect())
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

    let baud_rate = crate::settings::load_settings(&app).baud_rate;
    let open_port = serialport::new(&port, baud_rate)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(|e| match e.kind() {
            serialport::ErrorKind::Io(std::io::ErrorKind::NotFound) =>
                format!("Port {} nicht gefunden — Gerät eingesteckt und ↻ geklickt?", port),
            serialport::ErrorKind::Io(std::io::ErrorKind::PermissionDenied) =>
                format!("Kein Zugriff auf {} — fehlende Berechtigung (dialout-Gruppe?)", port),
            _ if e.to_string().contains("lock") || e.to_string().contains("busy") =>
                format!("Port {} bereits in Benutzung — andere App geöffnet?", port),
            _ => e.to_string(),
        })?;

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

    *state.reconnect_port.lock().unwrap() = Some(port);

    let saved_auto_reconnect = crate::settings::load_settings(&app).auto_reconnect;
    state.auto_reconnect.store(saved_auto_reconnect, Ordering::Release);

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

    // Stop reconnect thread and disable auto-reconnect on manual disconnect
    if let Some(flag) = state.reconnect_stop.lock().unwrap().take() {
        flag.store(true, Ordering::Relaxed);
    }
    if let Some(handle) = state.reconnect_thread.lock().unwrap().take() {
        let _ = handle.join();
    }
    state.auto_reconnect.store(false, Ordering::Release);

    // The reconnect thread may have opened a port and spawned a reader between our stop
    // signal and the join above. Stop any reader it left behind.
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
pub async fn uart_set_auto_reconnect(
    enabled: bool,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    // Always stop any running reconnect thread first
    if let Some(flag) = state.reconnect_stop.lock().unwrap().take() {
        flag.store(true, Ordering::Relaxed);
    }
    if let Some(handle) = state.reconnect_thread.lock().unwrap().take() {
        let _ = handle.join();
    }

    state.auto_reconnect.store(enabled, Ordering::Release);

    if enabled {
        spawn_reconnect_if_enabled(&state, &app);
    }
    Ok(())
}

#[tauri::command]
pub async fn uart_update_error_db(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<usize, String> {
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

    let count = db.len();
    *state.error_db.lock().unwrap() = Some(db);
    app.emit("uart://db-status", DbStatusPayload {
        loaded: true,
        count:  Some(count),
        source: "fetched".into(),
    }).map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
pub fn uart_get_db_info(state: State<'_, AppState>) -> Result<Option<usize>, String> {
    Ok(state.error_db.lock().unwrap().as_ref().map(|db| db.len()))
}

#[derive(Clone, Serialize)]
pub struct UartConnectionStatus {
    pub connected:    bool,
    pub reconnecting: bool,
}

#[tauri::command]
pub fn uart_connection_status(state: State<'_, AppState>) -> UartConnectionStatus {
    let connected = state.uart_thread.lock().unwrap()
        .as_ref()
        .map(|h| !h.is_finished())
        .unwrap_or(false);
    let reconnecting = state.reconnect_thread.lock().unwrap()
        .as_ref()
        .map(|h| !h.is_finished())
        .unwrap_or(false);
    UartConnectionStatus { connected, reconnecting }
}

#[tauri::command]
pub fn uart_search_error_db(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<ErrorSearchResult>, String> {
    let db_lock = state.error_db.lock().unwrap();
    let Some(db) = db_lock.as_ref() else { return Ok(vec![]) };

    let results = if let Ok(code) = query.trim().parse::<u32>() {
        db.lookup(code)
            .map(|e| vec![ErrorSearchResult {
                code:        e.code,
                description: e.description.clone(),
                category:    e.category.clone(),
            }])
            .unwrap_or_default()
    } else if query.trim().is_empty() {
        vec![]
    } else {
        db.search(&query, 20)
            .into_iter()
            .map(|e| ErrorSearchResult {
                code:        e.code,
                description: e.description.clone(),
                category:    e.category.clone(),
            })
            .collect()
    };

    Ok(results)
}

fn spawn_reconnect_if_enabled(state: &AppState, app: &AppHandle) {
    if !state.auto_reconnect.load(Ordering::Acquire) {
        return;
    }
    if state.reconnect_stop.lock().unwrap().is_some() {
        return; // reconnect thread already running
    }
    let port = match state.reconnect_port.lock().unwrap().clone() {
        Some(p) => p,
        None => return,
    };
    let baud_rate  = crate::settings::load_settings(app).baud_rate;
    let stop_flag  = Arc::new(AtomicBool::new(false));
    let stop_clone = Arc::clone(&stop_flag);
    let app_clone  = app.clone();
    let handle = std::thread::spawn(move || {
        reconnect_loop(port, baud_rate, app_clone, stop_clone);
    });
    *state.reconnect_stop.lock().unwrap()   = Some(stop_flag);
    *state.reconnect_thread.lock().unwrap() = Some(handle);
}

fn reconnect_loop(port: String, baud_rate: u32, app: AppHandle, stop: Arc<AtomicBool>) {
    let _ = app.emit("uart://reconnecting", ReconnectingPayload { active: true });

    loop {
        // 2 seconds in 100ms increments so stop flag is checked often
        for _ in 0..20 {
            if stop.load(Ordering::Relaxed) {
                let _ = app.emit("uart://reconnecting", ReconnectingPayload { active: false });
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        if stop.load(Ordering::Relaxed) {
            let _ = app.emit("uart://reconnecting", ReconnectingPayload { active: false });
            return;
        }

        let open_result = serialport::new(&port, baud_rate)
            .timeout(Duration::from_millis(100))
            .open();

        if let Ok(open_port) = open_result {
            let write_port = match open_port.try_clone() {
                Ok(p) => p,
                Err(e) => { error!("reconnect_loop: try_clone (write) failed: {}", e); continue }
            };
            let read_port = match open_port.try_clone() {
                Ok(p) => p,
                Err(e) => { error!("reconnect_loop: try_clone (read) failed: {}", e); continue }
            };
            drop(open_port);

            let state      = app.state::<AppState>();
            let db_clone   = Arc::clone(&state.error_db);
            let app_clone  = app.clone();

            {
                let mut uart_guard = state.uart.lock().unwrap();
                let uart = uart_guard.get_or_insert_with(UartPort::default);
                uart.set_port(write_port);
            }

            let new_stop   = Arc::new(AtomicBool::new(false));
            let stop_clone = Arc::clone(&new_stop);
            let handle = std::thread::spawn(move || {
                reader_loop(read_port, stop_clone, app_clone, db_clone);
            });

            *state.uart_stop.lock().unwrap()   = Some(new_stop);
            *state.uart_thread.lock().unwrap() = Some(handle);

            // Remove our own handles from state (thread exits after this return)
            state.reconnect_thread.lock().unwrap().take();
            state.reconnect_stop.lock().unwrap().take();

            let _ = app.emit("uart://reconnecting", ReconnectingPayload { active: false });
            let _ = app.emit("uart://status", StatusPayload { connected: true });
            return;
        }
    }
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
                spawn_reconnect_if_enabled(&state, &app);
                break;
            }
        }
    }
}

#[cfg(test)]
mod db_status_tests {
    use super::*;

    #[test]
    fn db_status_payload_serializes_loaded() {
        let p = DbStatusPayload { loaded: true, count: Some(1234), source: "cache".into() };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"loaded\":true"));
        assert!(json.contains("\"count\":1234"));
        assert!(json.contains("\"source\":\"cache\""));
    }

    #[test]
    fn db_status_payload_serializes_failed() {
        let p = DbStatusPayload { loaded: false, count: None, source: "failed".into() };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"loaded\":false"));
        assert!(json.contains("\"count\":null"));
    }
}

#[cfg(test)]
mod reconnect_tests {
    use super::*;

    #[test]
    fn reconnecting_payload_serializes_active() {
        let p = ReconnectingPayload { active: true };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"active\":true"));
    }

    #[test]
    fn reconnecting_payload_serializes_inactive() {
        let p = ReconnectingPayload { active: false };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"active\":false"));
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

        // Scope block so uart lock is released before spawn_reconnect_if_enabled
        let had_write_error = {
            let state = app.state::<AppState>();
            let mut guard = state.uart.lock().unwrap();
            if let Some(uart) = guard.as_mut() {
                if uart.is_connected() {
                    let cmd = build_command("errlog");
                    if let Err(e) = uart.write_line(&cmd) {
                        error!("poll_loop write error: {}", e);
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            } else {
                false
            }
        }; // uart lock released here

        if had_write_error {
            let state = app.state::<AppState>();
            if let Some(uart) = state.uart.lock().unwrap().as_mut() {
                let _ = uart.disconnect();
            }
            state.uart_stop.lock().unwrap().take();
            state.uart_thread.lock().unwrap().take();
            let _ = app.emit("uart://status", StatusPayload { connected: false });
            spawn_reconnect_if_enabled(&state, &app);
            return;
        }
    }
}
