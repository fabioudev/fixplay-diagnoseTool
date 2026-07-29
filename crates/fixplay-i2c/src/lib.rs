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

#![warn(missing_docs)]

/// Xbox error-code database (cache → bundled resource → background fetch).
pub mod error_db;
/// The I2C bridge serial transport implementing [`fixplay_core::I2cDevice`].
pub mod port;
/// The NDJSON wire types (`I2cRequest` / `I2cResponse`).
pub mod protocol;

/// Re-export of the Xbox error-code database.
pub use error_db::XboxErrorDb;
/// Re-export of the bridge type.
pub use port::I2cBridge;
/// Re-export of the protocol wire types.
pub use protocol::{ErrlogItem, I2cRequest, I2cResponse, InfoPayload};