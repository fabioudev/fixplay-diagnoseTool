use fixplay_core::{
    error::{AppError, FlashError},
    traits::FlashDevice,
    types::{ChipId, FlashProgress},
};
use std::path::PathBuf;
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

impl FlashDevice for FlashromDevice {
    fn read_flash(&self, _on_progress: &dyn Fn(FlashProgress)) -> Result<Vec<u8>, AppError> {
        info!("read_flash stub");
        Err(FlashError::Subprocess("not yet implemented".into()).into())
    }

    fn write_flash(&self, _data: &[u8], _on_progress: &dyn Fn(FlashProgress)) -> Result<(), AppError> {
        Err(FlashError::Subprocess("not yet implemented".into()).into())
    }

    fn erase_flash(&self) -> Result<(), AppError> {
        Err(FlashError::Subprocess("not yet implemented".into()).into())
    }

    fn read_id(&self) -> Result<ChipId, AppError> {
        Err(FlashError::Subprocess("not yet implemented".into()).into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flashrom_path_has_correct_name() {
        let dir = std::path::PathBuf::from("/tmp");
        let p = flashrom_path(&dir);
        #[cfg(target_os = "windows")]
        assert_eq!(p.file_name().unwrap(), "flashrom.exe");
        #[cfg(not(target_os = "windows"))]
        assert_eq!(p.file_name().unwrap(), "flashrom");
    }
}
