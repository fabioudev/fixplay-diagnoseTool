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
    #[cfg(target_os = "windows")]
    return resource_dir.join("flashrom.exe");
    #[cfg(not(target_os = "windows"))]
    resource_dir.join("flashrom")
}

fn parse_progress(line: &str) -> Option<u8> {
    let start = line.rfind('(')?;
    let end = line[start..].find('%').map(|i| start + i)?;
    line[start + 1..end].trim().parse::<u8>().ok()
}

impl FlashDevice for FlashromDevice {
    fn read_flash(&self, on_progress: &dyn Fn(FlashProgress)) -> Result<Vec<u8>, AppError> {
        info!("reading flash with programmer {}", self.programmer);
        let tmp = std::env::temp_dir()
            .join(format!("fixplay_read_{}.bin", std::process::id()));

        let mut child = Command::new(&self.binary_path)
            .args(["-p", &self.programmer, "--read", tmp.to_str().unwrap()])
            .stderr(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .map_err(|e| FlashError::Subprocess(e.to_string()))?;

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

        let mut child = Command::new(&self.binary_path)
            .args(["-p", &self.programmer, "--write", tmp.to_str().unwrap()])
            .stderr(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .map_err(|e| FlashError::Subprocess(e.to_string()))?;

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
            .map_err(|e| FlashError::Subprocess(e.to_string()))?;
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
            .map_err(|e| FlashError::Subprocess(e.to_string()))?;
        let text = String::from_utf8_lossy(&output.stdout).to_string();
        let name = text
            .lines()
            .find(|l| l.contains("name="))
            .and_then(|l| l.split("name=").nth(1))
            .unwrap_or("Unknown")
            .trim()
            .to_string();
        Ok(ChipId { manufacturer: 0, device: 0, description: name })
    }
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
}
