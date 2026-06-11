use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("CH341 error: {0}")]
    Ch341(#[from] Ch341Error),
    #[error("UART error: {0}")]
    Uart(#[from] UartError),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Error)]
pub enum Ch341Error {
    #[error("device not found")]
    DeviceNotFound,
    #[error("USB error: {0}")]
    Usb(String),
    #[error("transfer failed: {0}")]
    Transfer(String),
}

#[derive(Debug, Error)]
pub enum UartError {
    #[error("port not found: {0}")]
    PortNotFound(String),
    #[error("serial error: {0}")]
    Serial(String),
    #[error("not connected")]
    NotConnected,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ch341_device_not_found_message() {
        let err = Ch341Error::DeviceNotFound;
        assert_eq!(err.to_string(), "device not found");
    }

    #[test]
    fn uart_not_connected_message() {
        let err = UartError::NotConnected;
        assert_eq!(err.to_string(), "not connected");
    }

    #[test]
    fn app_error_from_ch341() {
        let ch_err = Ch341Error::DeviceNotFound;
        let app_err: AppError = ch_err.into();
        assert!(app_err.to_string().contains("CH341"));
    }

    #[test]
    fn app_error_from_uart() {
        let u_err = UartError::NotConnected;
        let app_err: AppError = u_err.into();
        assert!(app_err.to_string().contains("UART"));
    }
}
