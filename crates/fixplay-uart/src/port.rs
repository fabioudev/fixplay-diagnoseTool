use fixplay_core::{
    error::{AppError, UartError},
    traits::UartDevice,
};
use serialport::SerialPort;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tracing::info;

pub struct UartPort {
    pub connected:  bool,
    write_port:     Mutex<Option<Box<dyn SerialPort + Send>>>,
    pub stop_flag:  Arc<AtomicBool>,
}

impl Default for UartPort {
    fn default() -> Self {
        Self {
            connected:  false,
            write_port: Mutex::new(None),
            stop_flag:  Arc::new(AtomicBool::new(false)),
        }
    }
}

impl UartPort {
    pub fn list_ports() -> Result<Vec<String>, UartError> {
        info!("listing available serial ports");
        let ports = serialport::available_ports()
            .map_err(|e| UartError::Serial(e.to_string()))?;
        Ok(ports.into_iter().map(|p| p.port_name).collect())
    }

    pub fn set_port(&mut self, port: Box<dyn SerialPort + Send>) {
        *self.write_port.lock().unwrap() = Some(port);
        self.connected  = true;
        self.stop_flag.store(false, Ordering::Relaxed);
    }

    pub fn write_line(&mut self, line: &str) -> Result<(), UartError> {
        use std::io::Write;
        let mut guard = self.write_port.lock().unwrap();
        match guard.as_mut() {
            Some(p) => p.write_all(line.as_bytes()).map_err(|e| UartError::Serial(e.to_string())),
            None    => Err(UartError::NotConnected),
        }
    }
}

impl UartDevice for UartPort {
    fn connect(&mut self, port: &str, baud_rate: u32) -> Result<(), AppError> {
        let p = serialport::new(port, baud_rate)
            .timeout(Duration::from_millis(100))
            .open()
            .map_err(|e| UartError::Serial(e.to_string()))?;
        let send_p = p.try_clone().map_err(|e| UartError::Serial(e.to_string()))?;
        self.set_port(send_p);
        Ok(())
    }

    fn disconnect(&mut self) -> Result<(), AppError> {
        self.stop_flag.store(true, Ordering::Relaxed);
        *self.write_port.lock().unwrap() = None;
        self.connected  = false;
        Ok(())
    }

    fn read_line(&self) -> Result<Option<String>, AppError> {
        Err(UartError::NotConnected.into())
    }

    fn is_connected(&self) -> bool {
        self.connected
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_port_is_disconnected() {
        let port = UartPort::default();
        assert!(!port.is_connected());
    }

    #[test]
    fn disconnect_on_already_disconnected_is_ok() {
        let mut port = UartPort::default();
        assert!(port.disconnect().is_ok());
    }

    #[test]
    fn read_line_when_disconnected_returns_err() {
        let port = UartPort::default();
        assert!(port.read_line().is_err());
    }

    #[test]
    fn write_line_when_disconnected_returns_err() {
        let mut port = UartPort::default();
        assert!(port.write_line("test\r\n").is_err());
    }

    #[test]
    fn stop_flag_default_is_false() {
        let port = UartPort::default();
        assert!(!port.stop_flag.load(Ordering::Relaxed));
    }

    #[test]
    fn disconnect_sets_connected_false() {
        let mut port = UartPort {
            connected:  true,
            write_port: Mutex::new(None),
            stop_flag:  Arc::new(AtomicBool::new(false)),
        };
        port.disconnect().unwrap();
        assert!(!port.is_connected());
    }
}
