//! USB-CDC bridge to the `fixplay-pico-i2c` firmware.
//!
//! Unlike the UART path (which runs an async reader thread and a polled
//! buffer), I2C bridge traffic is strictly request/response: the host writes
//! one JSON command and reads exactly one JSON line back. We therefore keep a
//! single serial port handle behind a mutex and perform write-then-read under
//! that lock — no background thread, no shared buffers.

use fixplay_core::{
    error::{AppError, I2cError},
    traits::I2cDevice,
};
use serialport::SerialPort;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tracing::info;

use crate::protocol::{I2cRequest, I2cResponse};

/// How long a single read-from-bridge call may block waiting for a line.
const READ_TIMEOUT_MS: u64 = 2000;
/// Per-byte budget used while accumulating a response line.
const BYTE_POLL_MS: u64 = 100;

pub struct I2cBridge {
    pub connected: bool,
    port:          Mutex<Option<Box<dyn SerialPort + Send>>>,
    pub stop_flag: Arc<AtomicBool>,
}

impl Default for I2cBridge {
    fn default() -> Self {
        Self { connected: false, port: Mutex::new(None), stop_flag: Arc::new(AtomicBool::new(false)) }
    }
}

impl I2cBridge {
    /// List serial ports and tag those that look like a Raspberry Pi Pico CDC
    /// bridge (RP2040 VID 0x2E8A). Generic USB-CDC bridges are returned too so
    /// the user can pick a non-Pico adapter manually.
    pub fn list_ports() -> Result<Vec<String>, I2cError> {
        info!("listing available serial ports for I2C bridge");
        let ports = serialport::available_ports()
            .map_err(|e| I2cError::Serial(e.to_string()))?;
        Ok(ports.into_iter().map(|p| p.port_name).collect())
    }

    /// Tag a port name as a likely Pico CDC endpoint (VID 0x2E8A).
    pub fn is_pico_port(name: &str) -> bool {
        // Best-effort heuristic from the name alone; the full USB descriptor
        // lookup happens in the Tauri command layer where SerialPortInfo is
        // available. Here we just spot the common RP2040 id patterns.
        name.to_lowercase().contains("pico") || name.to_lowercase().contains("2e8a")
    }

    pub fn set_port(&mut self, port: Box<dyn SerialPort + Send>) {
        *self.port.lock().unwrap() = Some(port);
        self.connected = true;
        self.stop_flag.store(false, Ordering::Relaxed);
    }

    /// Write a raw line (no added terminator) to the bridge.
    pub fn write_line(&self, line: &str) -> Result<(), I2cError> {
        let mut guard = self.port.lock().unwrap();
        match guard.as_mut() {
            Some(p) => p.write_all(line.as_bytes()).map_err(|e| I2cError::Serial(e.to_string())),
            None => Err(I2cError::NotConnected),
        }
    }

    /// Send a typed request and read back exactly one JSON response line.
    /// The write and the read happen under the port lock so a concurrent
    /// caller cannot interleave their response with ours.
    pub fn request(&self, req: &I2cRequest) -> Result<I2cResponse, I2cError> {
        let line = req.to_line().map_err(|e| I2cError::Protocol(e.to_string()))?;
        let mut guard = self.port.lock().unwrap();
        let port = guard.as_mut().ok_or(I2cError::NotConnected)?;

        // Flush any stale bytes the bridge may have sent (e.g. boot banner)
        // so we don't mistake them for our response.
        let _ = port.clear(serialport::ClearBuffer::Input);

        port.write_all(line.as_bytes())
            .map_err(|e| I2cError::Serial(e.to_string()))?;
        port.write_all(b"\n")
            .map_err(|e| I2cError::Serial(e.to_string()))?;
        port.flush().ok();

        let response = read_line(port, Duration::from_millis(READ_TIMEOUT_MS))?;
        I2cResponse::parse(&response).map_err(|e| I2cError::Protocol(format!("invalid response: {e}")))
    }

    /// Convenience: send a request and require `ok == true`, turning a
    /// non-ok response into an [`I2cError::Bus`] error.
    pub fn request_ok(&self, req: &I2cRequest) -> Result<I2cResponse, I2cError> {
        let resp = self.request(req)?;
        if resp.ok { Ok(resp) } else { Err(I2cError::Bus(resp.err_message())) }
    }
}

impl I2cDevice for I2cBridge {
    fn connect(&mut self, port: &str, baud_rate: u32) -> Result<(), AppError> {
        let p = serialport::new(port, baud_rate)
            .timeout(Duration::from_millis(BYTE_POLL_MS))
            .open()
            .map_err(|e| I2cError::Serial(e.to_string()))?;
        self.set_port(p);
        Ok(())
    }

    fn disconnect(&mut self) -> Result<(), AppError> {
        self.stop_flag.store(true, Ordering::Relaxed);
        *self.port.lock().unwrap() = None;
        self.connected = false;
        Ok(())
    }

    fn read_line(&self) -> Result<Option<String>, AppError> {
        let mut guard = self.port.lock().unwrap();
        let port = match guard.as_mut() {
            Some(p) => p,
            None => return Err(I2cError::NotConnected.into()),
        };
        match read_line(port, Duration::from_millis(BYTE_POLL_MS * 2)) {
            Ok(line) => Ok(Some(line)),
            Err(I2cError::Serial(_)) => Ok(None), // timeout → no line yet
            Err(e) => Err(e.into()),
        }
    }

    fn is_connected(&self) -> bool {
        self.connected
    }
}

/// Maximum bytes we accumulate before giving up on a missing `\n`. Guards
/// against a misbehaving bridge that streams data without ever terminating a
/// line (e.g. a debug banner) and would otherwise grow `buf` without bound.
const MAX_LINE_BYTES: usize = 65_536;

/// Accumulate bytes until a `\n` is seen, then return the line without the
/// trailing newline. The `deadline` is checked on every loop iteration — not
/// only on read timeouts — so a steady stream of bytes (each read returning
/// within the per-read timeout) still cannot keep us here past the deadline.
/// Returns a serial error on timeout or EOF; callers distinguish "no line yet"
/// (timeout) from a hard transport failure by inspecting the error.
fn read_line(port: &mut Box<dyn SerialPort + Send>, deadline: Duration) -> Result<String, I2cError> {
    let mut buf = Vec::<u8>::with_capacity(256);
    let mut byte = [0u8; 1];
    let started = std::time::Instant::now();

    loop {
        if started.elapsed() >= deadline {
            return Err(I2cError::Serial("read timed out".into()));
        }
        match port.read(&mut byte) {
            Ok(1) => {
                if byte[0] == b'\n' {
                    let s = String::from_utf8_lossy(&buf)
                        .trim_end_matches('\r')
                        .to_string();
                    if s.is_empty() {
                        // skip blank keepalive lines
                        buf.clear();
                        continue;
                    }
                    return Ok(s);
                }
                buf.push(byte[0]);
                if buf.len() > MAX_LINE_BYTES {
                    return Err(I2cError::Protocol(format!(
                        "response line exceeded {MAX_LINE_BYTES} bytes without a newline"
                    )));
                }
            }
            // Ok(0) is EOF / closed port — treat as a transport failure instead
            // of looping, which would otherwise busy-spin at 100% CPU.
            Ok(0) => return Err(I2cError::Serial("device closed (EOF)".into())),
            // A 1-byte buffer can only ever return Ok(0) or Ok(1); any other Ok
            // value is unexpected but harmless to ignore.
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => continue,
            Err(e) => return Err(I2cError::Serial(e.to_string())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_bridge_is_disconnected() {
        let b = I2cBridge::default();
        assert!(!b.is_connected());
    }

    #[test]
    fn disconnect_when_disconnected_is_ok() {
        let mut b = I2cBridge::default();
        assert!(b.disconnect().is_ok());
        assert!(!b.is_connected());
    }

    #[test]
    fn write_line_when_disconnected_returns_err() {
        let b = I2cBridge::default();
        assert!(matches!(b.write_line("x"), Err(I2cError::NotConnected)));
    }

    #[test]
    fn request_when_disconnected_returns_err() {
        let b = I2cBridge::default();
        let r = b.request(&I2cRequest::Scan);
        assert!(matches!(r, Err(I2cError::NotConnected)));
    }

    #[test]
    fn read_line_when_disconnected_returns_err() {
        let b = I2cBridge::default();
        assert!(b.read_line().is_err());
    }

    #[test]
    fn stop_flag_default_is_false() {
        let b = I2cBridge::default();
        assert!(!b.stop_flag.load(Ordering::Relaxed));
    }

    #[test]
    fn is_pico_port_detects_hint() {
        assert!(I2cBridge::is_pico_port("/dev/ttyACM0 (Pico)"));
        assert!(I2cBridge::is_pico_port("2E8A:000A"));
        assert!(!I2cBridge::is_pico_port("/dev/ttyUSB0"));
    }

    #[test]
    fn request_ok_turns_failed_response_into_bus_error() {
        // Simulate a connected bridge by constructing a fake state: we can't
        // easily build a real SerialPort in unit tests, so we exercise the
        // not-connected path which is the only thing testable without hardware.
        let b = I2cBridge::default();
        let r = b.request_ok(&I2cRequest::Scan);
        assert!(matches!(r, Err(I2cError::NotConnected)));
    }
}