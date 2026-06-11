use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("flash error: {0}")]
    Flash(#[from] FlashError),
    #[error("UART error: {0}")]
    Uart(#[from] UartError),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Error)]
pub enum FlashError {
    #[error("flashrom not found")]
    NotFound,
    #[error("subprocess error: {0}")]
    Subprocess(String),
    #[error("I/O error: {0}")]
    Io(String),
}

#[derive(Debug, Error)]
pub enum UartError {
    #[error("port not found: {0}")]
    PortNotFound(String),
    #[error("serial error: {0}")]
    Serial(String),
    #[error("not connected")]
    NotConnected,
    #[error("database fetch error: {0}")]
    DbFetch(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flash_not_found_message() {
        let err = FlashError::NotFound;
        assert_eq!(err.to_string(), "flashrom not found");
    }

    #[test]
    fn uart_not_connected_message() {
        let err = UartError::NotConnected;
        assert_eq!(err.to_string(), "not connected");
    }

    #[test]
    fn app_error_from_flash() {
        let err = FlashError::NotFound;
        let app_err: AppError = err.into();
        assert!(app_err.to_string().contains("flash"));
    }

    #[test]
    fn app_error_from_uart() {
        let u_err = UartError::NotConnected;
        let app_err: AppError = u_err.into();
        assert!(app_err.to_string().contains("UART"));
    }
}
