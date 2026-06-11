use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub id:          String,
    pub name:        String,
    pub device_type: DeviceType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DeviceType {
    Ch341,
    Uart,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChipId {
    pub manufacturer: u8,
    pub device:       u16,
    pub description:  String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashInfo {
    pub chip_id:    ChipId,
    pub size_bytes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashProgress {
    pub bytes_done:  usize,
    pub bytes_total: usize,
}

impl FlashProgress {
    pub fn percent(&self) -> usize {
        if self.bytes_total == 0 {
            return 0;
        }
        self.bytes_done * 100 / self.bytes_total
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UartMessage {
    pub timestamp: u64,
    pub raw:       String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrlogEntry {
    pub error_code:   u32,
    pub timestamp:    u32,
    pub power_states: u32,
    pub up_cause:     u32,
    pub temp_soc:     f32,
    pub raw_fields:   [String; 4],
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_info_roundtrips_json() {
        let info = DeviceInfo {
            id:          "usb:001".into(),
            name:        "CH341B".into(),
            device_type: DeviceType::Ch341,
        };
        let json = serde_json::to_string(&info).unwrap();
        let back: DeviceInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, "usb:001");
        assert_eq!(back.name, "CH341B");
    }

    #[test]
    fn flash_progress_percentage() {
        let p = FlashProgress { bytes_done: 512, bytes_total: 1024 };
        assert_eq!(p.percent(), 50);
    }

    #[test]
    fn flash_progress_zero_total() {
        let p = FlashProgress { bytes_done: 0, bytes_total: 0 };
        assert_eq!(p.percent(), 0);
    }
}
