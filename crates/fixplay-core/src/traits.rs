use crate::{
    error::AppError,
    types::{ChipId, FlashProgress},
};

pub trait FlashDevice: Send + Sync {
    fn read_id(&self) -> Result<ChipId, AppError>;
    fn read_flash(&self, on_progress: &dyn Fn(FlashProgress)) -> Result<Vec<u8>, AppError>;
    fn write_flash(
        &self,
        data: &[u8],
        on_progress: &dyn Fn(FlashProgress),
    ) -> Result<(), AppError>;
    fn erase_flash(&self) -> Result<(), AppError>;
}

pub trait UartDevice: Send + Sync {
    fn connect(&mut self, port: &str, baud_rate: u32) -> Result<(), AppError>;
    fn disconnect(&mut self) -> Result<(), AppError>;
    fn read_line(&self) -> Result<Option<String>, AppError>;
    fn is_connected(&self) -> bool;
}
