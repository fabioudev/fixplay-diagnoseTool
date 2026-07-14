//! I2C-over-USB-CDC bridge support for the fixplay diagnoseTool.
//!
//! Targets a Raspberry Pi Pico running the `fixplay-pico-i2c` firmware, which
//! enumerates as a USB CDC serial device and exposes a small NDJSON
//! request/response protocol for I2C bus operations (scan, read, write, paged
//! EEPROM read, Xbox errlog read, info). Used to read Xbox console diagnostics
//! over I2C/SMBus — analogous to how `fixplay-uart` reads PS5 diagnostics.
//!
//! Layout mirrors `fixplay-uart`:
//!   - [`protocol`] — wire types (`I2cRequest` / `I2cResponse`)
//!   - [`port`]     — [`I2cBridge`] serial transport (sync request/response)
//!   - [`error_db`] — [`XboxErrorDb`] error-code lookup with cache/fetch

pub mod error_db;
pub mod port;
pub mod protocol;

pub use error_db::XboxErrorDb;
pub use port::I2cBridge;
pub use protocol::{ErrlogItem, I2cRequest, I2cResponse, InfoPayload};