use fixplay_core::{
    error::{AppError, FlashError},
    traits::FlashDevice,
    types::{ChipId, FlashProgress},
};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tracing::info;

#[derive(Clone)]
pub struct FlashromDevice {
    pub programmer:  String,
    pub binary_path: PathBuf,
}

pub fn flashrom_path(resource_dir: &std::path::Path) -> PathBuf {
    // Tauri's resource bundler PRESERVES the `binaries/` subdir declared in
    // tauri.conf.json `bundle.resources`, so the binary lands at
    // `<resource_dir>/binaries/flashrom` — not `<resource_dir>/flashrom`.
    // Joining without `binaries/` made every launch fail the self-check and
    // silently fall back to a PATH/system flashrom (or none).
    #[cfg(target_os = "windows")]
    return resource_dir.join("binaries").join("flashrom.exe");
    #[cfg(not(target_os = "windows"))]
    resource_dir.join("binaries").join("flashrom")
}

fn parse_progress(line: &str) -> Option<u8> {
    let start = line.rfind('(')?;
    let end = line[start..].find('%').map(|i| start + i)?;
    line[start + 1..end].trim().parse::<u8>().ok()
}

/// Classify an error from launching the flashrom subprocess. A missing binary
/// (the bundled `flashrom.exe` is 0-byte, or a user-configured path points
/// nowhere) becomes a clear [`FlashError::NotFound`] so the UI can tell the user
/// to install flashrom or set the path — instead of an opaque "subprocess
/// error". Everything else stays a `Subprocess` error.
fn classify_launch_err(e: std::io::Error) -> FlashError {
    if e.kind() == std::io::ErrorKind::NotFound {
        FlashError::NotFound
    } else {
        FlashError::Subprocess(e.to_string())
    }
}

impl FlashDevice for FlashromDevice {
    fn read_flash(&self, on_progress: &dyn Fn(FlashProgress)) -> Result<Vec<u8>, AppError> {
        info!("reading flash with programmer {}", self.programmer);
        let tmp = std::env::temp_dir()
            .join(format!("fixplay_read_{}.bin", std::process::id()));

        let tmp_str = tmp.to_str().ok_or_else(|| AppError::from(FlashError::Io("temp path is not valid UTF-8".into())))?;
        let mut child = Command::new(&self.binary_path)
            .args(["-p", &self.programmer, "--read", tmp_str])
            .stderr(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .map_err(classify_launch_err)?;

        if let Some(stderr) = child.stderr.take() {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if let Some(pct) = parse_progress(&line) {
                    on_progress(FlashProgress { bytes_done: pct as usize, bytes_total: 100 });
                }
            }
        }

        let status = child.wait().map_err(|e| FlashError::Subprocess(e.to_string()))?;
        if !status.success() {
            let _ = std::fs::remove_file(&tmp);
            return Err(FlashError::Subprocess(
                format!("flashrom exited with status {}", status)
            ).into());
        }

        let bytes = std::fs::read(&tmp).map_err(|e| FlashError::Io(e.to_string()))?;
        let _ = std::fs::remove_file(&tmp);
        Ok(bytes)
    }

    fn write_flash(&self, data: &[u8], on_progress: &dyn Fn(FlashProgress)) -> Result<(), AppError> {
        info!("writing flash with programmer {}", self.programmer);
        let tmp = std::env::temp_dir()
            .join(format!("fixplay_write_{}.bin", std::process::id()));
        std::fs::write(&tmp, data).map_err(|e| FlashError::Io(e.to_string()))?;

        let tmp_str = tmp.to_str().ok_or_else(|| AppError::from(FlashError::Io("temp path is not valid UTF-8".into())))?;
        let mut child = Command::new(&self.binary_path)
            .args(["-p", &self.programmer, "--write", tmp_str])
            .stderr(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .map_err(classify_launch_err)?;

        if let Some(stderr) = child.stderr.take() {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if let Some(pct) = parse_progress(&line) {
                    on_progress(FlashProgress { bytes_done: pct as usize, bytes_total: 100 });
                }
            }
        }

        let status = child.wait().map_err(|e| FlashError::Subprocess(e.to_string()))?;
        let _ = std::fs::remove_file(&tmp);
        if !status.success() {
            return Err(FlashError::Subprocess(
                format!("flashrom exited with status {}", status)
            ).into());
        }
        Ok(())
    }

    fn erase_flash(&self) -> Result<(), AppError> {
        info!("erasing flash with programmer {}", self.programmer);
        let status = Command::new(&self.binary_path)
            .args(["-p", &self.programmer, "--erase"])
            .status()
            .map_err(classify_launch_err)?;
        if !status.success() {
            return Err(FlashError::Subprocess(
                format!("flashrom erase exited with status {}", status)
            ).into());
        }
        Ok(())
    }

    fn read_id(&self) -> Result<ChipId, AppError> {
        info!("reading chip ID with programmer {}", self.programmer);
        let output = Command::new(&self.binary_path)
            .args(["-p", &self.programmer, "--flash-name"])
            .output()
            .map_err(classify_launch_err)?;
        // flashrom prints both stdout and stderr; --flash-name emits the chip
        // name on stdout, but detection/JEDEC info may land on stderr.
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let text = format!("{stdout}\n{stderr}");

        let name = text
            .lines()
            .find(|l| l.contains("name="))
            .and_then(|l| l.split("name=").nth(1))
            .map(|s| s.trim_matches('"').trim().to_string())
            .ok_or_else(|| FlashError::Subprocess("flashrom --flash-name: missing 'name=' in output".into()))?;

        // JEDEC ID bytes (e.g. "JEDEC ID: 0xc2 0x20 0x18") — when flashrom
        // emits them, byte[0] is the manufacturer and the following bytes are
        // the device id (little-endian). Not all programmer/chip combos expose
        // a numeric ID; in that case we keep 0 and rely on the description.
        let (manufacturer, device) = parse_jedec_id(&text);

        Ok(ChipId { manufacturer, device, description: name })
    }
}

/// Extract `(manufacturer, device)` from a flashrom output blob if it contains
/// a `JEDEC ID: 0x.. 0x.. 0x..` line. Returns `(0, 0)` when no numeric ID is
/// present (the textual `name=` is still reported via the description).
fn parse_jedec_id(text: &str) -> (u8, u16) {
    let Some(line) = text.lines().find(|l| l.contains("JEDEC ID")) else {
        return (0, 0);
    };
    let bytes: Vec<u8> = line
        .split_whitespace()
        .filter_map(|tok| {
            let h = tok.strip_prefix("0x").or_else(|| tok.strip_prefix("0X"))?;
            // flashrom usually separates the ID bytes with spaces, but some
            // builds emit "JEDEC ID: 0xc2, 0x20, 0x18" with trailing commas —
            // strip any trailing non-hexdigit so the token still parses.
            let h = h.trim_end_matches(|c: char| !c.is_ascii_hexdigit());
            u8::from_str_radix(h, 16).ok()
        })
        .collect();
    if bytes.is_empty() {
        return (0, 0);
    }
    let manufacturer = bytes[0];
    let device = if bytes.len() >= 3 {
        (bytes[1] as u16) | ((bytes[2] as u16) << 8)
    } else if bytes.len() == 2 {
        bytes[1] as u16
    } else {
        0
    };
    (manufacturer, device)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flashrom_path_has_correct_extension() {
        let dir = std::path::PathBuf::from("/tmp");
        let p = flashrom_path(&dir);
        #[cfg(target_os = "windows")]
        assert_eq!(p.file_name().unwrap(), "flashrom.exe");
        #[cfg(not(target_os = "windows"))]
        assert_eq!(p.file_name().unwrap(), "flashrom");
    }

    #[test]
    fn parse_progress_5_percent() {
        assert_eq!(parse_progress("Writing at 0x001000...  (  5%)"), Some(5));
    }

    #[test]
    fn parse_progress_100_percent() {
        assert_eq!(parse_progress("Reading at 0x1fe000... (100%)"), Some(100));
    }

    #[test]
    fn parse_progress_no_match() {
        assert_eq!(parse_progress("Reading flash... done."), None);
    }

    #[test]
    fn parse_progress_empty_line() {
        assert_eq!(parse_progress(""), None);
    }

    #[test]
    fn parse_jedec_id_three_bytes() {
        // manufacturer 0xc2, device = 0x20 | (0x18 << 8) = 0x1820
        let text = "Found Macronix flash chip \"MX25L12873G\"\nJEDEC ID: 0xc2 0x20 0x18";
        assert_eq!(parse_jedec_id(text), (0xc2, 0x1820));
    }

    #[test]
    fn parse_jedec_id_two_bytes() {
        let text = "JEDEC ID: 0xef 0x40";
        assert_eq!(parse_jedec_id(text), (0xef, 0x40));
    }

    #[test]
    fn parse_jedec_id_with_trailing_commas() {
        // Some flashrom builds separate the bytes with commas — the parser
        // must still extract them ("0xc2," → 0xc2).
        let text = "JEDEC ID: 0xc2, 0x20, 0x18";
        assert_eq!(parse_jedec_id(text), (0xc2, 0x1820));
    }

    #[test]
    fn parse_jedec_id_missing_returns_zeros() {
        assert_eq!(parse_jedec_id("no jedec here"), (0, 0));
        assert_eq!(parse_jedec_id("JEDEC ID: garbage"), (0, 0));
    }

    #[test]
    fn classify_not_found_io_error_becomes_notfound() {
        let err = std::io::Error::from(std::io::ErrorKind::NotFound);
        assert!(matches!(classify_launch_err(err), FlashError::NotFound));
    }

    #[test]
    fn classify_other_io_error_becomes_subprocess() {
        let err = std::io::Error::from(std::io::ErrorKind::PermissionDenied);
        assert!(matches!(classify_launch_err(err), FlashError::Subprocess(_)));
    }
}
