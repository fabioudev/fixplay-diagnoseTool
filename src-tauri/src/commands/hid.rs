use crate::state::AppState;
use hidapi::HidApi;
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use tauri::State;
use tracing::info;

#[derive(Serialize, Clone)]
pub struct HidDeviceInfo {
    pub vendor_id:     u16,
    pub product_id:    u16,
    pub manufacturer:  Option<String>,
    pub product:       Option<String>,
    pub serial_number: Option<String>,
    pub usage_page:    u16,
    pub usage:         u16,
}

#[derive(Serialize, Clone)]
pub struct HidReport {
    pub report_id: u8,
    pub data:      Vec<u8>,
}

#[derive(Serialize)]
pub struct HidPollResult {
    pub connected: bool,
    pub reports:   Vec<HidReport>,
}

pub enum HidCmd {
    SendFeatureReport(u8, Vec<u8>, mpsc::SyncSender<Result<(), String>>),
    GetFeatureReport(u8, usize, mpsc::SyncSender<Result<Vec<u8>, String>>),
    WriteOutput(Vec<u8>, mpsc::SyncSender<Result<(), String>>),
    Stop,
}

/// RAII guard that flips the `hid_alive` flag to false when the reader thread
/// exits — on *any* path (Stop command, channel disconnect, panic unwind, or
/// loop end). This is what lets `hid_poll` report a dead connection instead of
/// stalling silently on a `Some` cmd channel whose thread is gone.
struct AliveGuard {
    alive: Arc<AtomicBool>,
}

impl Drop for AliveGuard {
    fn drop(&mut self) {
        self.alive.store(false, Ordering::Relaxed);
        info!("HID reader thread alive=false (exit)");
    }
}

fn run_hid_thread(
    device:  hidapi::HidDevice,
    cmd_rx:  mpsc::Receiver<HidCmd>,
    reports: Arc<Mutex<VecDeque<HidReport>>>,
    stop:    Arc<AtomicBool>,
    alive:   Arc<AtomicBool>,
) {
    // Drops on return / unwind / channel close → marks the thread dead.
    let _guard = AliveGuard { alive: Arc::clone(&alive) };
    alive.store(true, Ordering::Relaxed);
    let mut buf = [0u8; 128];
    info!("HID reader thread started");

    while !stop.load(Ordering::Relaxed) {
        // Drain all pending commands before doing a read
        loop {
            match cmd_rx.try_recv() {
                Ok(HidCmd::Stop) => return,
                Ok(HidCmd::SendFeatureReport(report_id, data, reply)) => {
                    let mut packet = Vec::with_capacity(data.len() + 1);
                    packet.push(report_id);
                    packet.extend_from_slice(&data);
                    let r = device
                        .send_feature_report(&packet)
                        .map(|_| ())
                        .map_err(|e| e.to_string());
                    reply.send(r).ok();
                }
                Ok(HidCmd::GetFeatureReport(report_id, len, reply)) => {
                    let cap = (len + 1).max(128);
                    let mut rbuf = vec![0u8; cap];
                    rbuf[0] = report_id;
                    let r = device
                        .get_feature_report(&mut rbuf)
                        .map(|n| rbuf[1..n.max(1)].to_vec())
                        .map_err(|e| e.to_string());
                    reply.send(r).ok();
                }
                Ok(HidCmd::WriteOutput(data, reply)) => {
                    let r = device
                        .write(&data)
                        .map(|_| ())
                        .map_err(|e| e.to_string());
                    reply.send(r).ok();
                }
                Err(mpsc::TryRecvError::Empty) => break,
                Err(mpsc::TryRecvError::Disconnected) => return,
            }
        }

        // Read one input report — 5 ms timeout keeps the command loop responsive
        if let Ok(n) = device.read_timeout(&mut buf, 5) {
            if n > 1 {
                let mut q = reports.lock().unwrap();
                if q.len() < 512 {
                    q.push_back(HidReport {
                        report_id: buf[0],
                        data:      buf[1..n].to_vec(), // strip report-id byte (mirrors WebHID)
                    });
                }
            }
        }
    }

    info!("HID reader thread stopped");
}

// ── helper: send a command and wait for the reply ───────────────────────────

macro_rules! send_cmd {
    ($state:expr, $cmd:expr) => {{
        let (reply_tx, reply_rx) = mpsc::sync_channel(1);
        {
            let guard = $state.hid_cmd_tx.lock().unwrap();
            let tx = guard
                .as_ref()
                .ok_or_else(|| "No HID device connected".to_string())?;
            tx.send($cmd(reply_tx))
                .map_err(|_| "HID thread disconnected".to_string())?;
        }
        reply_rx
            .recv()
            .map_err(|_| "HID thread gone".to_string())?
    }};
}

// ── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn hid_list_devices() -> Result<Vec<HidDeviceInfo>, String> {
    let api  = HidApi::new().map_err(|e| e.to_string())?;
    let list = api
        .device_list()
        .map(|d| HidDeviceInfo {
            vendor_id:     d.vendor_id(),
            product_id:    d.product_id(),
            manufacturer:  d.manufacturer_string().map(str::to_string),
            product:       d.product_string().map(str::to_string),
            serial_number: d.serial_number().map(str::to_string),
            usage_page:    d.usage_page(),
            usage:         d.usage(),
        })
        .collect();
    Ok(list)
}

#[tauri::command]
pub fn hid_connect(vendor_id: u16, product_id: u16, state: State<'_, AppState>) -> Result<(), String> {
    // Stop any existing connection
    if let Some(tx) = state.hid_cmd_tx.lock().unwrap().take() {
        let _ = tx.send(HidCmd::Stop);
    }
    if let Some(s) = state.hid_stop.lock().unwrap().take() {
        s.store(true, Ordering::Relaxed);
    }

    let api    = HidApi::new().map_err(|e| e.to_string())?;
    let device = api.open(vendor_id, product_id).map_err(|e| e.to_string())?;

    let reports    = Arc::clone(&state.hid_reports);
    let stop       = Arc::new(AtomicBool::new(false));
    let stop_clone = Arc::clone(&stop);
    let alive      = Arc::new(AtomicBool::new(true));
    let alive_clone = Arc::clone(&alive);
    let (cmd_tx, cmd_rx) = mpsc::sync_channel::<HidCmd>(32);

    *state.hid_cmd_tx.lock().unwrap() = Some(cmd_tx);
    *state.hid_stop.lock().unwrap()   = Some(stop);
    *state.hid_alive.lock().unwrap()  = Some(alive);
    state.hid_reports.lock().unwrap().clear();

    std::thread::spawn(move || run_hid_thread(device, cmd_rx, reports, stop_clone, alive_clone));

    info!("HID connected: vendor={:#06x} product={:#06x}", vendor_id, product_id);
    Ok(())
}

#[tauri::command]
pub fn hid_disconnect(state: State<'_, AppState>) -> Result<(), String> {
    if let Some(tx) = state.hid_cmd_tx.lock().unwrap().take() {
        let _ = tx.send(HidCmd::Stop);
    }
    if let Some(s) = state.hid_stop.lock().unwrap().take() {
        s.store(true, Ordering::Relaxed);
    }
    state.hid_alive.lock().unwrap().take();
    state.hid_reports.lock().unwrap().clear();
    info!("HID disconnected");
    Ok(())
}

#[tauri::command]
pub fn hid_send_feature_report(report_id: u8, data: Vec<u8>, state: State<'_, AppState>) -> Result<(), String> {
    send_cmd!(state, |reply| HidCmd::SendFeatureReport(report_id, data, reply))
}

#[tauri::command]
pub fn hid_receive_feature_report(report_id: u8, length: usize, state: State<'_, AppState>) -> Result<Vec<u8>, String> {
    send_cmd!(state, |reply| HidCmd::GetFeatureReport(report_id, length, reply))
}

#[tauri::command]
pub fn hid_send_output_report(data: Vec<u8>, state: State<'_, AppState>) -> Result<(), String> {
    send_cmd!(state, |reply| HidCmd::WriteOutput(data, reply))
}

#[tauri::command]
pub fn hid_poll(state: State<'_, AppState>) -> HidPollResult {
    // A connection is only "connected" if the reader thread is still alive AND
    // the command channel is still installed. If the thread died (device
    // unplugged / panicked) the alive flag flips false via the AliveGuard —
    // tear down the stale cmd channel so the frontend's next poll sees
    // connected=false and disconnects instead of stalling on a dead handle.
    let alive = state
        .hid_alive
        .lock()
        .unwrap()
        .as_ref()
        .map(|a| a.load(Ordering::Relaxed))
        .unwrap_or(false);
    let mut cmd = state.hid_cmd_tx.lock().unwrap();
    if !alive && cmd.is_some() {
        let _ = cmd.take();
    }
    let connected = alive && cmd.is_some();
    drop(cmd);

    let reports: Vec<HidReport> = state.hid_reports.lock().unwrap().drain(..).collect();
    HidPollResult { connected, reports }
}
