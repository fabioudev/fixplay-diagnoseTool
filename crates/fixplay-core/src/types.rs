use serde::{Deserialize, Serialize};

/// A discovered hardware device the tool can talk to (programmer or UART).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    /// Stable identifier (e.g. a USB bus/port path).
    pub id:          String,
    /// Human-readable product name.
    pub name:        String,
    /// What kind of device this is.
    pub device_type: DeviceType,
}

/// The kind of [`DeviceInfo`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DeviceType {
    /// A flash programmer (CH341A, RT809H, …).
    Ch341,
    /// A UART serial device.
    Uart,
}

/// Identity reported by a NOR flash chip via flashrom.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChipId {
    /// JEDEC manufacturer byte (0 when the programmer/chip exposes none).
    pub manufacturer: u8,
    /// JEDEC device id, little-endian packed from the trailing two bytes.
    pub device:       u16,
    /// Textual chip name from `flashrom --flash-name` (always populated).
    pub description:  String,
}

/// High-level flash chip descriptor (identity + detected size).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashInfo {
    /// The chip identity.
    pub chip_id:    ChipId,
    /// Detected chip capacity in bytes.
    pub size_bytes: usize,
}

/// A progress tick emitted during a long-running flash operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashProgress {
    /// Progress percentage (0–100). Named `percent_done` for clarity — flashrom
    /// reports percentages, not byte counts.
    pub percent_done:  usize,
    /// Always 100 (the total percentage). Kept for API compatibility.
    pub percent_total: usize,
}

impl FlashProgress {
    /// Normalized 0–100 percentage, guarding against a zero total.
    pub fn percent(&self) -> usize {
        if self.percent_total == 0 {
            return 0;
        }
        self.percent_done * 100 / self.percent_total
    }
}

/// A raw line received over UART, tagged with its receive timestamp.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UartMessage {
    /// Unix-millisecond timestamp of receipt.
    pub timestamp: u64,
    /// The raw line text.
    pub raw:       String,
}

/// One parsed PS5 error-log (errlog) entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrlogEntry {
    /// The error code field.
    pub error_code:   u32,
    /// Console uptime / timestamp field.
    pub timestamp:    u32,
    /// Power-state bitmap at the time of the error.
    pub power_states: u32,
    /// What woke / caused the system (up cause).
    pub up_cause:     u32,
    /// SoC temperature reading.
    pub temp_soc:     f32,
    /// The four raw hex fields, verbatim, for forensic display.
    pub raw_fields:   [String; 4],
}

/// Per-section validation result for a NOR dump. Each flag is `true` when that
/// section's signature/magic matches the expected value.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NorValidation {
    /// Overall size matches the expected NOR capacity.
    pub size_ok:       bool,
    /// Header section magic is present.
    pub header_ok:     bool,
    /// Primary MBR is valid.
    pub mbr1_ok:       bool,
    /// Backup MBR is valid.
    pub mbr2_ok:       bool,
    /// EMC/IPL A partition is valid.
    pub emc_ipl_a_ok:  bool,
    /// EMC/IPL B partition is valid.
    pub emc_ipl_b_ok:  bool,
    /// USB-PDC A partition is valid.
    pub usb_pdc_a_ok:  bool,
    /// USB-PDC B partition is valid.
    pub usb_pdc_b_ok:  bool,
}

impl NorValidation {
    /// `true` only when every section passed validation.
    pub fn is_valid(&self) -> bool {
        self.size_ok && self.header_ok && self.mbr1_ok && self.mbr2_ok
            && self.emc_ipl_a_ok && self.emc_ipl_b_ok
            && self.usb_pdc_a_ok && self.usb_pdc_b_ok
    }
}

/// Non-volatile storage parsed out of the NOR dump (console identity).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NvsData {
    /// Console serial number.
    pub serial:       String,
    /// MAC address.
    pub mac_address:  String,
    /// SKU / model code.
    pub sku:          String,
    /// Board identifier.
    pub board_id:     String,
    /// Numeric console-type code.
    pub console_type: u32,
    /// Firmware version string.
    pub fw_version:   String,
}

/// Result of a flash read: both passes, validation, parsed NVS, archive path.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashReadResult {
    /// `true` when the two read passes produced byte-identical dumps.
    pub dumps_match:  bool,
    /// Section-by-section NOR validation.
    pub validation:   NorValidation,
    /// Parsed NVS, if present and well-formed.
    pub nvs:          Option<NvsData>,
    /// Path the dump was archived to.
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
        let p = FlashProgress { percent_done: 512, percent_total: 1024 };
        assert_eq!(p.percent(), 50);
    }

    #[test]
    fn flash_progress_zero_total() {
        let p = FlashProgress { percent_done: 0, percent_total: 0 };
        assert_eq!(p.percent(), 0);
    }
}