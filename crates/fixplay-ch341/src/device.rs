use fixplay_core::{
    error::{AppError, Ch341Error},
    traits::FlashDevice,
    types::{ChipId, FlashProgress},
};
use tracing::info;

pub struct Ch341Device;

pub struct Ch341DeviceInfo {
    pub bus:     u8,
    pub address: u8,
    pub name:    String,
}

impl Ch341Device {
    pub fn scan() -> Result<Vec<Ch341DeviceInfo>, Ch341Error> {
        info!("scanning USB bus for CH341 devices");
        Ok(vec![])
    }
}

impl FlashDevice for Ch341Device {
    fn read_id(&self) -> Result<ChipId, AppError> {
        Err(Ch341Error::Usb("not yet implemented".into()).into())
    }

    fn read_flash(&self, _on_progress: &dyn Fn(FlashProgress)) -> Result<Vec<u8>, AppError> {
        Err(Ch341Error::Usb("not yet implemented".into()).into())
    }

    fn write_flash(
        &self,
        _data: &[u8],
        _on_progress: &dyn Fn(FlashProgress),
    ) -> Result<(), AppError> {
        Err(Ch341Error::Usb("not yet implemented".into()).into())
    }

    fn erase_flash(&self) -> Result<(), AppError> {
        Err(Ch341Error::Usb("not yet implemented".into()).into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_returns_ok() {
        let result = Ch341Device::scan();
        assert!(result.is_ok());
    }

    #[test]
    fn read_id_returns_err_when_stub() {
        let dev = Ch341Device;
        assert!(dev.read_id().is_err());
    }
}
