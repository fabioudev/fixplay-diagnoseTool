use crate::state::AppState;
use hidapi::HidApi;
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
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
    pub connected:        bool,
    pub reports:          Vec<HidReport>,
    pub dropped_reports:  u64,
}

pub enum HidCmd {
    SendFeatureReport(u8, Vec<u8>, mpsc::SyncSender<Result<(), String>>),
    GetFeatureReport(u8, usize, mpsc::SyncSender<Result<Vec<u8>, String>>),
    WriteOutput(Vec<u8>, mpsc::SyncSender<Result<(), String>>),
    Stop,
}

/// Maximum input reports buffered for `hid_poll` before the oldest are dropped
/// (counted in `dropped_reports`). Bounded so a flood can't grow the queue
/// without limit.
const MAX_REPORT_QUEUE: usize = 512;

/// Build a feature-report *send* packet: the report-id byte prepended to the
/// payload (hidapi expects the id in byte 0). Extracted from `run_hid_thread`
/// so the framing is unit-testable without a real device.
fn feature_report_packet(report_id: u8, data: &[u8]) -> Vec<u8> {
    let mut packet = Vec::with_capacity(data.len() + 1);
    packet.push(report_id);
    packet.extend_from_slice(data);
    packet
}

/// Allocate a feature-report *read* buffer of `(len + 1).max(128)` bytes with
/// the report-id byte set at offset 0 (hidapi writes the id there and returns
/// the full buffer). Extracted for unit testing.
fn make_get_feature_buf(report_id: u8, len: usize) -> Vec<u8> {
    let cap = (len + 1).max(128);
    let mut buf = vec![0u8; cap];
    buf[0] = report_id;
    buf
}

/// Parse a `read_timeout` result into an input report, stripping the leading
/// report-id byte (mirrors WebHID, where the id is reported separately). Returns
/// `None` for empty / single-byte reads (no payload).
fn parse_input_report(buf: &[u8], n: usize) -> Option<HidReport> {
    if n <= 1 {
        return None;
    }
    Some(HidReport {
        report_id: buf[0],
        data:      buf[1..n].to_vec(),
    })
}

/// Push a report onto the bounded queue, or bump the drop counter when the
/// queue is full. Extracted so the bound + drop invariant is unit-testable.
fn push_report(q: &mut VecDeque<HidReport>, dropped: &AtomicU64, report: HidReport) {
    if q.len() < MAX_REPORT_QUEUE {
        q.push_back(report);
    } else {
        dropped.fetch_add(1, Ordering::Relaxed);
    }
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
    dropped: Arc<AtomicU64>,
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
                    let packet = feature_report_packet(report_id, &data);
                    let r = device
                        .send_feature_report(&packet)
                        .map(|_| ())
                        .map_err(|e| e.to_string());
                    reply.send(r).ok();
                }
                Ok(HidCmd::GetFeatureReport(report_id, len, reply)) => {
                    let mut rbuf = make_get_feature_buf(report_id, len);
                    let r = device
                        .get_feature_report(&mut rbuf)
                        .map(|n| rbuf[..n].to_vec())
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
            if let Some(report) = parse_input_report(&buf, n) {
                let mut q = reports.lock().unwrap();
                push_report(&mut q, &dropped, report);
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
    state.hid_dropped_reports.store(0, Ordering::Relaxed);

    let dropped = Arc::clone(&state.hid_dropped_reports);
    std::thread::spawn(move || run_hid_thread(device, cmd_rx, reports, dropped, stop_clone, alive_clone));

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
    if length > 512 {
        return Err(format!("Feature-Report-Länge {} überschreitet Maximum 512", length));
    }
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
    let dropped_reports = state.hid_dropped_reports.swap(0, Ordering::Relaxed);
    HidPollResult { connected, reports, dropped_reports }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feature_report_packet_prepends_report_id() {
        let pkt = feature_report_packet(0x05, &[0xaa, 0xbb, 0xcc]);
        assert_eq!(pkt, vec![0x05, 0xaa, 0xbb, 0xcc]);
    }

    #[test]
    fn feature_report_packet_empty_payload_is_just_the_id() {
        assert_eq!(feature_report_packet(0x80, &[]), vec![0x80]);
    }

    #[test]
    fn make_get_feature_buf_floors_to_128_and_sets_id_byte() {
        let buf = make_get_feature_buf(0x20, 10);
        assert_eq!(buf.len(), 128); // (10 + 1).max(128) = 128
        assert_eq!(buf[0], 0x20);
        // zeros after the id byte
        assert!(buf[1..].iter().all(|&b| b == 0));
    }

    #[test]
    fn make_get_feature_buf_grows_past_128_for_large_len() {
        let buf = make_get_feature_buf(0x83, 200);
        assert_eq!(buf.len(), 201); // 200 + 1
        assert_eq!(buf[0], 0x83);
    }

    #[test]
    fn parse_input_report_strips_leading_report_id_byte() {
        let buf = [0x01u8, 0xde, 0xad, 0xbe, 0xef];
        let r = parse_input_report(&buf, 5).unwrap();
        assert_eq!(r.report_id, 0x01);
        assert_eq!(r.data, vec![0xde, 0xad, 0xbe, 0xef]);
    }

    #[test]
    fn parse_input_report_returns_none_for_empty_or_id_only_read() {
        let buf = [0x01u8, 0x02, 0x03];
        assert!(parse_input_report(&buf, 0).is_none());
        assert!(parse_input_report(&buf, 1).is_none()); // only the report-id byte
    }

    #[test]
    fn push_report_appends_under_cap() {
        let mut q = VecDeque::new();
        let dropped = AtomicU64::new(0);
        push_report(&mut q, &dropped, HidReport { report_id: 1, data: vec![1] });
        push_report(&mut q, &dropped, HidReport { report_id: 2, data: vec![2] });
        assert_eq!(q.len(), 2);
        assert_eq!(dropped.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn push_report_drops_and_counts_when_queue_is_full() {
        let mut q = VecDeque::new();
        for _ in 0..MAX_REPORT_QUEUE {
            q.push_back(HidReport { report_id: 0, data: vec![] });
        }
        let dropped = AtomicU64::new(0);
        // Queue is full: each further report is dropped + counted.
        push_report(&mut q, &dropped, HidReport { report_id: 9, data: vec![9] });
        push_report(&mut q, &dropped, HidReport { report_id: 9, data: vec![9] });
        assert_eq!(q.len(), MAX_REPORT_QUEUE); // cap held
        assert_eq!(dropped.load(Ordering::Relaxed), 2);
    }

    #[test]
    fn alive_guard_flips_alive_false_on_drop() {
        let alive = Arc::new(AtomicBool::new(true));
        {
            let _guard = AliveGuard { alive: Arc::clone(&alive) };
            assert!(alive.load(Ordering::Relaxed)); // still alive while held
        }
        assert!(!alive.load(Ordering::Relaxed)); // false after drop
    }
}
