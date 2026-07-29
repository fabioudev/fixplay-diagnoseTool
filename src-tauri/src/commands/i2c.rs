//! Tauri commands for the I2C-over-USB-CDC bridge (Raspberry Pi Pico running
//! the `fixplay-pico-i2c` firmware) and the Xbox error-code database.
//!
//! Mirrors [`super::uart`] but simpler: I2C traffic is strictly request/
//! response, so there is no background reader thread and no shared poll
//! buffer. Each action command (`i2c_scan`, `i2c_read`, …) sends one JSON
//! request to the Pico and returns the typed result directly. `i2c_poll`
//! exists only to expose connection + DB status to the frontend status bar.

use crate::state::AppState;
use fixplay_core::traits::I2cDevice;
use fixplay_i2c::{I2cBridge, I2cRequest, InfoPayload, XboxErrorDb};
use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use tracing::info;

#[derive(Clone, Serialize)]
pub struct I2cPortInfo {
    pub name:        String,
    pub is_pico:     bool,
    pub is_bridge:   bool,
    pub description: String,
}

#[derive(Clone, Serialize)]
pub struct I2cErrlogEntryPayload {
    pub code:        String,
    pub timestamp:   Option<u32>,
    pub source:      Option<String>,
    pub description: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct I2cErrorSearchResult {
    pub code:        String,
    pub description: String,
    pub category:    String,
}

#[derive(Serialize)]
pub struct I2cPollResult {
    pub connected: bool,
    pub db_count:  Option<usize>,
}

#[derive(serde::Serialize, Clone)]
pub(crate) struct I2cDbStatusPayload {
    pub loaded: bool,
    pub count:  Option<usize>,
    pub source: String,
}

/// Tag a serial port as a Pico CDC bridge (RP2040 VID 0x2E8A) or a generic
/// USB-CDC bridge, mirroring [`super::uart::detect_bridge`].
fn detect_pico(port: &serialport::SerialPortInfo) -> (bool, bool, String) {
    if let serialport::SerialPortType::UsbPort(ref usb) = port.port_type {
        if usb.vid == 0x2E8A {
            let label = usb.product.clone().unwrap_or_else(|| "Raspberry Pi Pico (RP2040)".into());
            return (true, true, label);
        }
        // Fallback: name-based hints for a generic CDC bridge (incl. non-Pico
        // RP2040 boards that re-use other VIDs).
        let prod = usb.product.as_deref().unwrap_or("").to_lowercase();
        let mfr  = usb.manufacturer.as_deref().unwrap_or("").to_lowercase();
        let hint = prod.contains("pico") || prod.contains("cdc")
                || prod.contains("uart") || prod.contains("serial")
                || prod.contains("bridge") || mfr.contains("raspberry");
        if hint {
            let desc = usb.product.clone().unwrap_or_else(|| "USB CDC Bridge".into());
            return (false, true, desc);
        }
    }
    (false, false, String::new())
}

#[tauri::command]
pub async fn i2c_list_ports() -> Result<Vec<I2cPortInfo>, String> {
    info!("i2c_list_ports invoked");
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    Ok(ports.into_iter().map(|p| {
        let (is_pico, is_bridge, description) = detect_pico(&p);
        I2cPortInfo { name: p.port_name, is_pico, is_bridge, description }
    }).collect())
}

#[tauri::command]
pub async fn i2c_connect(
    port: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    info!("i2c_connect: {}", port);

    let baud_rate = crate::settings::load_settings_or_default(&app).i2c_baud_rate;

    // Open the new port and swap it in under a single lock so that a concurrent
    // `i2c_disconnect` cannot leave us in a half-applied state: disconnect
    // blocks on this lock until connect has finished, then cleanly tears down
    // whatever connect stored. On open failure the existing bridge is left
    // untouched.
    let mut guard = state.i2c.lock().unwrap();
    let open_port = serialport::new(&port, baud_rate)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(|e| match e.kind() {
            serialport::ErrorKind::Io(std::io::ErrorKind::NotFound) =>
                format!("Port {} nicht gefunden — Pico eingesteckt und ↻ geklickt?", port),
            serialport::ErrorKind::Io(std::io::ErrorKind::PermissionDenied) =>
                format!("Kein Zugriff auf {} — fehlende Berechtigung (dialout-Gruppe?)", port),
            _ if e.to_string().contains("lock") || e.to_string().contains("busy") =>
                format!("Port {} bereits in Benutzung — andere App geöffnet?", port),
            _ => e.to_string(),
        })?;

    if let Some(mut old) = guard.take() {
        let _ = old.disconnect();
    }
    let mut bridge = I2cBridge::default();
    bridge.set_port(open_port);
    *guard = Some(bridge);
    Ok(())
}

#[tauri::command]
pub async fn i2c_disconnect(state: State<'_, AppState>) -> Result<(), String> {
    info!("i2c_disconnect invoked");
    let mut guard = state.i2c.lock().unwrap();
    if let Some(mut b) = guard.take() {
        let _ = b.disconnect();
    }
    Ok(())
}

/// Run a closure against the connected bridge on the blocking thread pool, so
/// the synchronous request/response round-trip (which may block up to ~2 s on
/// a slow or absent bridge) does not pin a tokio worker and freeze `i2c_poll`
/// and other async commands. On a transport-level (`Serial`) error the bridge
/// is marked disconnected so the status bar stops reporting a phantom
/// connection after an unplug.
async fn with_bridge_blocking<T, F>(app: AppHandle, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&I2cBridge) -> Result<T, fixplay_core::I2cError> + Send + 'static,
{
    tokio::task::spawn_blocking(move || -> Result<T, String> {
        let state = app.state::<AppState>();
        let mut guard = state.i2c.lock().unwrap();
        let bridge = guard
            .as_mut()
            .ok_or("Nicht verbunden — zuerst \"Verbinden\" klicken")?;
        // f only needs `&I2cBridge` (request_ok takes &self), so the &mut stays
        // available afterwards for the disconnect-on-transport-death path.
        match f(bridge) {
            Ok(v) => Ok(v),
            Err(fixplay_core::I2cError::Serial(msg)) => {
                // Transport is gone — disconnect so `i2c_poll` reflects reality.
                let _ = bridge.disconnect();
                Err(format!("Verbindung verloren — Pico getrennt? ({})", msg))
            }
            Err(e) => Err(format!("I2C-Fehler: {e}")),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn i2c_scan(app: AppHandle) -> Result<Vec<u8>, String> {
    with_bridge_blocking(app, move |b| {
        let resp = b.request_ok(&I2cRequest::Scan)?;
        Ok(resp.addresses.unwrap_or_default())
    })
    .await
}

#[tauri::command]
pub async fn i2c_read(addr: u8, reg: Option<u8>, len: u16, app: AppHandle) -> Result<Vec<u8>, String> {
    with_bridge_blocking(app, move |b| {
        let resp = b.request_ok(&I2cRequest::Read { addr, reg, len })?;
        Ok(resp.data.unwrap_or_default())
    })
    .await
}

#[tauri::command]
pub async fn i2c_write(addr: u8, reg: Option<u8>, data: Vec<u8>, app: AppHandle) -> Result<(), String> {
    with_bridge_blocking(app, move |b| {
        b.request_ok(&I2cRequest::Write { addr, reg, data })?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn i2c_read_eeprom(
    addr: u8,
    offset: u16,
    len: u16,
    app: AppHandle,
) -> Result<Vec<u8>, String> {
    with_bridge_blocking(app, move |b| {
        let resp = b.request_ok(&I2cRequest::ReadEeprom { addr, offset, len })?;
        Ok(resp.data.unwrap_or_default())
    })
    .await
}

#[tauri::command]
pub async fn i2c_errlog(app: AppHandle) -> Result<Vec<I2cErrlogEntryPayload>, String> {
    use fixplay_i2c::ErrlogItem;
    let items = with_bridge_blocking::<Vec<ErrlogItem>, _>(app.clone(), move |b| {
        let resp = b.request_ok(&I2cRequest::Errlog)?;
        Ok(resp.entries.unwrap_or_default())
    })
    .await?;

    let state = app.state::<AppState>();
    let db_lock = state.xbox_error_db.lock().unwrap();
    let db = db_lock.as_ref();
    let payloads = items
        .into_iter()
        .map(|item| {
            let description = db.and_then(|db| db.lookup(&item.code)).map(|e| e.description.clone());
            I2cErrlogEntryPayload {
                code:        item.code,
                timestamp:   item.timestamp,
                source:      item.source,
                description,
            }
        })
        .collect();
    Ok(payloads)
}

#[tauri::command]
pub async fn i2c_info(app: AppHandle) -> Result<Option<InfoPayload>, String> {
    with_bridge_blocking(app, move |b| {
        let resp = b.request_ok(&I2cRequest::Info)?;
        Ok(resp.info)
    })
    .await
}

#[tauri::command]
pub fn i2c_poll(state: State<'_, AppState>) -> I2cPollResult {
    let connected = state.i2c.lock().unwrap()
        .as_ref()
        .map(|b| b.is_connected())
        .unwrap_or(false);
    let db_count = state.xbox_error_db.lock().unwrap().as_ref().map(|db| db.len());
    I2cPollResult { connected, db_count }
}

#[tauri::command]
pub async fn i2c_update_xbox_db(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<usize, String> {
    info!("i2c_update_xbox_db invoked");
    let cache_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("xbox_error_codes.json");

    let db = tokio::task::spawn_blocking(move || {
        XboxErrorDb::fetch_and_cache(&cache_path)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("Download fehlgeschlagen — Internetverbindung prüfen ({})", e))?;

    let count = db.len();
    *state.xbox_error_db.lock().unwrap() = Some(db);
    Ok(count)
}

#[tauri::command]
pub fn i2c_get_db_info(state: State<'_, AppState>) -> Result<Option<usize>, String> {
    Ok(state.xbox_error_db.lock().unwrap().as_ref().map(|db| db.len()))
}

#[tauri::command]
pub fn i2c_search_xbox_db(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<I2cErrorSearchResult>, String> {
    let db_lock = state.xbox_error_db.lock().unwrap();
    let Some(db) = db_lock.as_ref() else { return Ok(vec![]) };

    // Exact lookup first (by code), then a textual description search.
    let results = if db.lookup(&query).is_some() {
        let e = db.lookup(&query).unwrap();
        vec![I2cErrorSearchResult {
            code:        e.code.clone(),
            description: e.description.clone(),
            category:    e.category.clone(),
        }]
    } else if query.trim().is_empty() {
        vec![]
    } else {
        db.search(&query, 20)
            .into_iter()
            .map(|e| I2cErrorSearchResult {
                code:        e.code.clone(),
                description: e.description.clone(),
                category:    e.category.clone(),
            })
            .collect()
    };

    Ok(results)
}

/// Called from `lib.rs` setup to wire the bundled resource path for the Xbox
/// error-code DB. Kept here next to the DB commands for discoverability.
pub(crate) fn xbox_db_resource_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    // Tauri preserves the `resources/` subdir from tauri.conf.json
    // `bundle.resources`, so the bundled Xbox DB lives at
    // `<resource_dir>/resources/xbox_error_codes.json`.
    app.path().resource_dir().ok()
        .map(|r| r.join("resources").join("xbox_error_codes.json"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn poll_result_serializes_empty() {
        let r = I2cPollResult { connected: false, db_count: None };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("\"connected\":false"));
        assert!(json.contains("\"db_count\":null"));
    }

    #[test]
    fn poll_result_serializes_connected() {
        let r = I2cPollResult { connected: true, db_count: Some(42) };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("\"connected\":true"));
        assert!(json.contains("\"db_count\":42"));
    }

    #[test]
    fn db_status_payload_serializes_loaded() {
        let p = I2cDbStatusPayload { loaded: true, count: Some(7), source: "cache".into() };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"loaded\":true"));
        assert!(json.contains("\"count\":7"));
        assert!(json.contains("\"source\":\"cache\""));
    }

    #[test]
    fn db_status_payload_serializes_failed() {
        let p = I2cDbStatusPayload { loaded: false, count: None, source: "failed".into() };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"loaded\":false"));
        assert!(json.contains("\"count\":null"));
    }

    #[test]
    fn errlog_payload_serializes_without_description() {
        let p = I2cErrlogEntryPayload {
            code: "E74".into(), timestamp: Some(123), source: Some("SMC".into()),
            description: None,
        };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"code\":\"E74\""));
        assert!(json.contains("\"timestamp\":123"));
        assert!(json.contains("\"source\":\"SMC\""));
        assert!(json.contains("\"description\":null"));
    }

    #[test]
    fn search_result_serializes() {
        let r = I2cErrorSearchResult {
            code: "0102".into(), description: "General failure".into(), category: "General".into(),
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("\"code\":\"0102\""));
        assert!(json.contains("\"description\":\"General failure\""));
    }

    #[test]
    fn port_info_serializes() {
        let p = I2cPortInfo {
            name: "/dev/ttyACM0".into(), is_pico: true, is_bridge: true,
            description: "Raspberry Pi Pico".into(),
        };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"is_pico\":true"));
        assert!(json.contains("\"is_bridge\":true"));
    }
}