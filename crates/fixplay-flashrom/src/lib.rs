#![warn(missing_docs)]
//! `flashrom` subprocess integration for the fixplay diagnoseTool.
//!
//! Reads, writes, and erases NOR flash chips by shelling out to a bundled
//! `flashrom` binary with a chosen programmer (`-p <programmer>`).

/// The flashrom subprocess wrapper and `FlashDevice` implementation.
pub mod flashrom;
/// Re-export of the device type and the resource-path resolver.
pub use flashrom::{flashrom_path, FlashromDevice};