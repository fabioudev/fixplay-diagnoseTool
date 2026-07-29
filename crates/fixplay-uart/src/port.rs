use fixplay_core::{
    error::{AppError, UartError},
    traits::UartDevice,
};
use serialport::SerialPort;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tracing::info;

/// A PS5 UART serial port. The write side lives behind a mutex here; a
/// separate cloned read handle drives the reader thread in the Tauri layer.
pub struct UartPort {
    connected:  bool,
    write_port:  Mutex<Option<Box<dyn SerialPort + Send>>>,
    stop_flag:   Arc<AtomicBool>,
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
    /// Enumerate available serial port names on the host.
    pub fn list_ports() -> Result<Vec<String>, UartError> {
        info!("listing available serial ports");
        let ports = serialport::available_ports()
            .map_err(|e| UartError::Serial(e.into()))?;
        Ok(ports.into_iter().map(|p| p.port_name).collect())
    }

    /// Install an already-open serial port handle and mark the device connected.
    pub fn set_port(&mut self, port: Box<dyn SerialPort + Send>) {
        *self.write_port.lock().unwrap() = Some(port);
        self.connected  = true;
        self.stop_flag.store(false, Ordering::Relaxed);
    }

    /// Handle to the reader-loop stop flag. The reader thread polls this; the
    /// `uart_stop` Tauri command sets it. Exposed as a cloned `Arc` rather than
    /// a `&pub` field so the struct's connection state stays encapsulated.
    pub fn stop_flag(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.stop_flag)
    }

    /// Write a raw line (no added terminator) to the port.
    pub fn write_line(&self, line: &str) -> Result<(), UartError> {
        use std::io::Write;
        let mut guard = self.write_port.lock().unwrap();
        match guard.as_mut() {
            Some(p) => p.write_all(line.as_bytes()).map_err(|e| UartError::Serial(e.into())),
            None    => Err(UartError::NotConnected),
        }
    }
}

impl UartDevice for UartPort {
    fn connect(&mut self, port: &str, baud_rate: u32) -> Result<(), AppError> {
        let p = serialport::new(port, baud_rate)
            .timeout(Duration::from_millis(100))
            .open()
            .map_err(|e| UartError::Serial(e.into()))?;
        let send_p = p.try_clone().map_err(|e| UartError::Serial(e.into()))?;
        self.set_port(send_p);
        Ok(())
    }

    fn disconnect(&mut self) -> Result<(), AppError> {
        self.stop_flag.store(true, Ordering::Relaxed);
        *self.write_port.lock().unwrap() = None;
        self.connected  = false;
        Ok(())
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
    fn write_line_when_disconnected_returns_err() {
        let port = UartPort::default();
        assert!(port.write_line("test\r\n").is_err());
    }

    #[test]
    fn stop_flag_default_is_false() {
        let port = UartPort::default();
        assert!(!port.stop_flag().load(Ordering::Relaxed));
    }

    #[test]
    fn disconnect_raises_stop_flag() {
        // `connected` is now private, so we can't construct a connected port
        // from a struct literal without a real SerialPort. Instead verify the
        // observable side effect of disconnect(): it arms the reader stop flag.
        let mut port = UartPort::default();
        assert!(!port.stop_flag().load(Ordering::Relaxed));
        port.disconnect().unwrap();
        assert!(port.stop_flag().load(Ordering::Relaxed));
        assert!(!port.is_connected());
    }
}
