use crate::commands::hid::{HidCmd, HidReport};
use fixplay_core::types::ErrlogEntry;
use fixplay_i2c::{I2cBridge, XboxErrorDb};
use fixplay_uart::{ErrorDb, UartPort};
use std::collections::VecDeque;
use std::sync::atomic::AtomicBool;
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;

/// A parsed errlog entry buffered for the frontend to drain via uart_poll.
#[derive(Clone)]
pub struct PendingEntry {
    pub entry:       ErrlogEntry,
    pub description: Option<String>,
}

#[allow(dead_code)]
pub struct AppState {
    pub uart:               Mutex<Option<UartPort>>,
    pub uart_stop:          Mutex<Option<Arc<AtomicBool>>>,
    pub uart_thread:        Mutex<Option<JoinHandle<()>>>,
    pub uart_poll_stop:     Mutex<Option<Arc<AtomicBool>>>,
    pub uart_poll_thread:   Mutex<Option<JoinHandle<()>>>,
    pub error_db:           Arc<Mutex<Option<ErrorDb>>>,
    pub auto_reconnect:     Arc<AtomicBool>,
    pub reconnect_port:     Mutex<Option<String>>,
    pub reconnect_stop:     Mutex<Option<Arc<AtomicBool>>>,
    pub reconnect_thread:   Mutex<Option<JoinHandle<()>>>,
    /// Raw lines received by the reader loop — drained by uart_poll.
    pub raw_lines:          Arc<Mutex<VecDeque<String>>>,
    /// Parsed errlog entries — drained by uart_poll.
    pub pending_entries:    Arc<Mutex<VecDeque<PendingEntry>>>,
    /// Set by reader_loop when LOOPBACK:PING is received; cleared by loopback command.
    pub loopback_triggered: Arc<AtomicBool>,
    /// Commands recently written to the port. The PS5 UART mirrors received
    /// characters back; the reader drops lines matching one of these echoes.
    pub recent_sent:        Arc<Mutex<VecDeque<String>>>,
    /// Command channel to the HID reader thread.
    pub hid_cmd_tx:         Mutex<Option<mpsc::SyncSender<HidCmd>>>,
    /// Stop flag for the HID reader thread.
    pub hid_stop:           Mutex<Option<Arc<AtomicBool>>>,
    /// Input reports buffered by the HID reader thread — drained by hid_poll.
    pub hid_reports:        Arc<Mutex<VecDeque<HidReport>>>,
    /// I2C-over-USB-CDC bridge (Raspberry Pi Pico running fixplay-pico-i2c).
    /// Sync request/response — no reader thread, no shared buffers.
    pub i2c:                Mutex<Option<I2cBridge>>,
    /// Xbox error-code database (cache → bundled resource → background fetch).
    pub xbox_error_db:      Arc<Mutex<Option<XboxErrorDb>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            uart:               Mutex::new(None),
            uart_stop:          Mutex::new(None),
            uart_thread:        Mutex::new(None),
            uart_poll_stop:     Mutex::new(None),
            uart_poll_thread:   Mutex::new(None),
            error_db:           Arc::new(Mutex::new(None)),
            auto_reconnect:     Arc::new(AtomicBool::new(false)),
            reconnect_port:     Mutex::new(None),
            reconnect_stop:     Mutex::new(None),
            reconnect_thread:   Mutex::new(None),
            raw_lines:          Arc::new(Mutex::new(VecDeque::with_capacity(500))),
            pending_entries:    Arc::new(Mutex::new(VecDeque::with_capacity(200))),
            loopback_triggered: Arc::new(AtomicBool::new(false)),
            recent_sent:        Arc::new(Mutex::new(VecDeque::with_capacity(20))),
            hid_cmd_tx:         Mutex::new(None),
            hid_stop:           Mutex::new(None),
            hid_reports:        Arc::new(Mutex::new(VecDeque::with_capacity(512))),
            i2c:                Mutex::new(None),
            xbox_error_db:      Arc::new(Mutex::new(None)),
        }
    }
}
