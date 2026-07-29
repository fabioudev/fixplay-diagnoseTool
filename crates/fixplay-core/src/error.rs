use thiserror::Error;

/// Top-level error for any backend operation, dispatched to the relevant
/// subsystem error so the frontend gets a single `Result<_, AppError>` surface.
#[derive(Debug, Error)]
pub enum AppError {
    /// A flash-programmer / flashrom error.
    #[error("flash error: {0}")]
    Flash(#[from] FlashError),
    /// A UART / serial error.
    #[error("UART error: {0}")]
    Uart(#[from] UartError),
    /// An I2C-bridge error.
    #[error("I2C error: {0}")]
    I2c(#[from] I2cError),
    /// A generic I/O error.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

/// Errors from the flashrom (NOR read/write/erase) path.
#[derive(Debug, Error)]
pub enum FlashError {
    /// The flashrom binary could not be found or is empty.
    #[error("flashrom binary not found or empty — install flashrom or set the path in Settings")]
    NotFound,
    /// A flashrom subprocess failed (bad exit status, timeout, launch error).
    #[error("subprocess error: {0}")]
    Subprocess(String),
    /// Wraps the underlying I/O error so the original cause survives in the
    /// error chain (previously this held `e.to_string()`, dropping the source).
    /// A `Box<dyn Error>` keeps `fixplay-core` free of any hardware-crate
    /// dependency while still letting callers walk `Error::source()`.
    #[error("I/O error: {0}")]
    Io(#[source] Box<dyn std::error::Error + Send + Sync>),
    /// The post-write verify read back a different image.
    #[error("Verify fehlgeschlagen: {diff_bytes} Bytes weichen zwischen geschriebenem und zurückgelesenem Image ab")]
    VerifyFailed {
        /// Number of differing bytes between written and read-back images.
        diff_bytes: usize,
    },
}

/// Errors from the UART / serial path.
#[derive(Debug, Error)]
pub enum UartError {
    /// The requested serial port does not exist.
    #[error("port not found: {0}")]
    PortNotFound(String),
    /// Wraps the originating serial/IO error so its cause is preserved in the
    /// chain rather than collapsed to a `String` (which lost `Error::source()`).
    #[error("serial error: {0}")]
    Serial(#[source] Box<dyn std::error::Error + Send + Sync>),
    /// The device is not connected.
    #[error("not connected")]
    NotConnected,
    /// Fetching/caching the error-code database failed.
    #[error("database fetch error: {0}")]
    DbFetch(String),
}

/// Errors from the I2C-over-USB-CDC bridge (a Raspberry Pi Pico running the
/// `fixplay-pico-i2c` firmware that exposes I2C bus operations over a serial
/// CDC endpoint). Mirrors [`UartError`] so the two transports read consistently.
#[derive(Debug, Error)]
pub enum I2cError {
    /// The requested serial port does not exist.
    #[error("port not found: {0}")]
    PortNotFound(String),
    /// Wraps the originating serial/IO error so its cause is preserved in the
    /// chain rather than collapsed to a `String`.
    #[error("serial error: {0}")]
    Serial(#[source] Box<dyn std::error::Error + Send + Sync>),
    /// The bridge is not connected.
    #[error("not connected")]
    NotConnected,
    /// A malformed bridge protocol message (bad JSON, missing field).
    #[error("bridge protocol error: {0}")]
    Protocol(String),
    /// The bridge reported an I2C bus-level failure (NACK, no device).
    #[error("I2C bus error reported by bridge: {0}")]
    Bus(String),
    /// Fetching/caching the error-code database failed.
    #[error("database fetch error: {0}")]
    DbFetch(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flash_not_found_message() {
        let err = FlashError::NotFound;
        let msg = err.to_string();
        assert!(msg.contains("not found"), "{msg}");
        assert!(msg.contains("Settings"), "{msg}");
    }

    #[test]
    fn flash_verify_failed_message() {
        let err = FlashError::VerifyFailed { diff_bytes: 1337 };
        let msg = err.to_string();
        assert!(msg.contains("Verify fehlgeschlagen"), "{msg}");
        assert!(msg.contains("1337"), "{msg}");
        assert!(msg.contains("Bytes weichen"), "{msg}");
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

    #[test]
    fn i2c_not_connected_message() {
        let err = I2cError::NotConnected;
        assert_eq!(err.to_string(), "not connected");
    }

    #[test]
    fn i2c_protocol_message() {
        let err = I2cError::Protocol("bad json".into());
        assert!(err.to_string().contains("bridge protocol error"));
    }

    #[test]
    fn i2c_bus_message() {
        let err = I2cError::Bus("NACK at 0x48".into());
        assert!(err.to_string().contains("I2C bus error"));
    }

    #[test]
    fn app_error_from_i2c() {
        let i_err = I2cError::NotConnected;
        let app_err: AppError = i_err.into();
        assert!(app_err.to_string().contains("I2C"));
    }
}
