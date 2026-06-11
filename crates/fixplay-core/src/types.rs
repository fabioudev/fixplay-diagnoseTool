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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NorValidation {
    pub size_ok:       bool,
    pub header_ok:     bool,
    pub mbr1_ok:       bool,
    pub mbr2_ok:       bool,
    pub emc_ipl_a_ok:  bool,
    pub emc_ipl_b_ok:  bool,
    pub usb_pdc_a_ok:  bool,
    pub usb_pdc_b_ok:  bool,
}

impl NorValidation {
    pub fn is_valid(&self) -> bool {
        self.size_ok && self.header_ok && self.mbr1_ok && self.mbr2_ok
            && self.emc_ipl_a_ok && self.emc_ipl_b_ok
            && self.usb_pdc_a_ok && self.usb_pdc_b_ok
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NvsData {
    pub serial:       String,
    pub mac_address:  String,
    pub sku:          String,
    pub board_id:     String,
    pub console_type: u32,
    pub fw_version:   String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashReadResult {
    pub dumps_match:  bool,
    pub validation:   NorValidation,
    pub nvs:          Option<NvsData>,
    pub archive_path: String,
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
