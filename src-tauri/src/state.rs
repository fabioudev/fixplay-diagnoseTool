use fixplay_ch341::Ch341Device;
use fixplay_uart::UartPort;
use std::sync::Mutex;

#[derive(Default)]
#[allow(dead_code)]
pub struct AppState {
    pub ch341: Mutex<Option<Ch341Device>>,
    pub uart:  Mutex<Option<UartPort>>,
}
