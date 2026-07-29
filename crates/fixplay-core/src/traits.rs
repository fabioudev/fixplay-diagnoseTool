use crate::{
    error::AppError,
    types::{ChipId, FlashProgress},
};

/// A flash programmer (CH341A, RT809H, …) the host can read, write, and erase
/// NOR chips through. Implementations shell out to `flashrom`.
pub trait FlashDevice: Send + Sync {
    /// Read the chip identity (JEDEC id + textual name).
    fn read_id(&self) -> Result<ChipId, AppError>;
    /// Read the entire NOR contents, reporting progress via `on_progress`.
    fn read_flash(&self, on_progress: &dyn Fn(FlashProgress)) -> Result<Vec<u8>, AppError>;
    /// Write `data` to the NOR (erase + program), reporting progress.
    fn write_flash(
        &self,
        data: &[u8],
        on_progress: &dyn Fn(FlashProgress),
    ) -> Result<(), AppError>;
    /// Erase the whole NOR chip.
    fn erase_flash(&self) -> Result<(), AppError>;
}

/// A serial-line device the host can connect to, disconnect from, and poll for
/// liveness. This abstracts the common surface shared by every USB-CDC
/// transport the tool talks to — the PS5's UART port and the I2C-over-USB-CDC
/// bridge alike. The higher-level framing (an async reader thread + polled
/// buffer for UART, sync request/response for the I2C bridge) lives in the
/// respective crates (`fixplay-uart`, `fixplay-i2c`), not in this trait.
pub trait UartDevice: Send + Sync {
    /// Open `port` at `baud_rate` and mark the device connected.
    fn connect(&mut self, port: &str, baud_rate: u32) -> Result<(), AppError>;
    /// Close the port and mark the device disconnected.
    fn disconnect(&mut self) -> Result<(), AppError>;
    /// Whether a port is currently open.
    fn is_connected(&self) -> bool;
}

/// The I2C-over-USB-CDC bridge (a Raspberry Pi Pico running `fixplay-pico-i2c`)
/// is transported over the same kind of serial line as a plain UART device, and
/// historically had a separate `I2cDevice` trait with an *identical* method
/// set. To avoid that duplication, `I2cDevice` is now just an alias of
/// [`UartDevice`] — the concrete behavior is defined once and existing call
/// sites (`impl I2cDevice for I2cBridge`, `dyn I2cDevice` bounds) read naturally.
pub use UartDevice as I2cDevice;
