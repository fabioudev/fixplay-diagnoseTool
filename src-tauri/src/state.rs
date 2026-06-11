use fixplay_uart::{ErrorDb, UartPort};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

#[allow(dead_code)]
pub struct AppState {
    pub uart:             Mutex<Option<UartPort>>,
    pub uart_stop:        Mutex<Option<Arc<AtomicBool>>>,
    pub uart_thread:      Mutex<Option<JoinHandle<()>>>,
    pub uart_poll_stop:   Mutex<Option<Arc<AtomicBool>>>,
    pub uart_poll_thread: Mutex<Option<JoinHandle<()>>>,
    pub error_db:         Arc<Mutex<Option<ErrorDb>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            uart:             Mutex::new(None),
            uart_stop:        Mutex::new(None),
            uart_thread:      Mutex::new(None),
            uart_poll_stop:   Mutex::new(None),
            uart_poll_thread: Mutex::new(None),
            error_db:         Arc::new(Mutex::new(None)),
        }
    }
}
