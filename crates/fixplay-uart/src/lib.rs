#![warn(missing_docs)]
//! PS5 UART diagnostics support for the fixplay diagnoseTool.
//!
//! Connects to the console's UART port, sends the fixplay command protocol
//! (with checksums), parses error-log lines, and looks up error codes against
//! a fetched/cached database.

/// The error-code database (cache → bundled resource → background fetch).
pub mod error_db;
/// The serial port transport implementing [`fixplay_core::UartDevice`].
pub mod port;
/// The PS5 UART wire protocol: command framing + errlog parsing.
pub mod protocol;

/// Re-export of the error-code database.
pub use error_db::ErrorDb;
/// Re-export of the serial port type.
pub use port::UartPort;
/// Re-export of the protocol helpers.
pub use protocol::{build_command, checksum, parse_errlog_line};