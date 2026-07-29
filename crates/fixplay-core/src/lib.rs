#![warn(missing_docs)]
//! Shared core for the fixplay diagnoseTool: domain types, the
//! hardware-agnostic device traits, NOR dump parsing/validation, and the
//! error types used across every backend crate.
//!
//! The hardware crates (`fixplay-flashrom`, `fixplay-uart`, `fixplay-i2c`)
//! implement the traits defined here against concrete transports, and the
//! Tauri binary wires those implementations to the frontend.

/// Error enums for each subsystem plus the unified [`error::AppError`].
pub mod error;
/// NOR flash dump validation and non-volatile-storage parsing.
pub mod nor;
/// Hardware-agnostic device traits (`FlashDevice`, `UartDevice`).
pub mod traits;
/// Serializable domain types shared across the backend.
pub mod types;

/// Re-export of the unified error and the per-subsystem errors.
pub use error::{AppError, FlashError, I2cError, UartError};