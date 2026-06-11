use fixplay_core::{
    error::{AppError, UartError},
    traits::UartDevice,
};
use tracing::info;

pub struct UartPort {
    connected: bool,
}

impl Default for UartPort {
    fn default() -> Self {
        Self { connected: false }
    }
}

impl UartPort {
    pub fn list_ports() -> Result<Vec<String>, UartError> {
        info!("listing available serial ports");
        let ports = serialport::available_ports()
            .map_err(|e| UartError::Serial(e.to_string()))?;
        Ok(ports.into_iter().map(|p| p.port_name).collect())
    }
}

impl UartDevice for UartPort {
    fn connect(&mut self, _port: &str, _baud_rate: u32) -> Result<(), AppError> {
        Err(UartError::Serial("not yet implemented".into()).into())
    }

    fn disconnect(&mut self) -> Result<(), AppError> {
        self.connected = false;
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
}
