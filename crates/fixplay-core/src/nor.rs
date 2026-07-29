use crate::types::{NorValidation, NvsData};

/// Expected NOR dump size (2 MB).
pub const EXPECTED_SIZE: usize = 0x200000; // 2 MB

const HEADER_MAGIC:    &[u8; 32] = b"SONY COMPUTER ENTERTAINMENT INC.";
const MBR_MAGIC:       &[u8; 32] = b"Sony Computer Entertainment Inc.";
const SLB2_MAGIC:      &[u8; 4]  = b"SLB2";

const HEADER_OFFSET:    usize = 0x00000;
const MBR1_OFFSET:      usize = 0x02000;
const MBR2_OFFSET:      usize = 0x03000;
const EMC_IPL_A_OFFSET: usize = 0x04000;
const EMC_IPL_B_OFFSET: usize = 0x82000;
const USB_PDC_A_OFFSET: usize = 0x100000;
const USB_PDC_B_OFFSET: usize = 0x110000;

const MAC_OFFSET:        usize = 0x1C4020;
const SERIAL_OFFSET:     usize = 0x1C7210;
const SKU_OFFSET:        usize = 0x1C7230;
const BOARD_ID_OFFSET:   usize = 0x1C7250;
const FW_VERSION_OFFSET: usize = 0x1C8068;

/// Validate a NOR dump by checking the magic bytes of each known section
/// (header, MBRs, EMC/IPL, USB-PDC) and the overall size.
pub fn validate(data: &[u8]) -> NorValidation {
    let check = |offset: usize, magic: &[u8]| -> bool {
        data.len() >= offset + magic.len() && &data[offset..offset + magic.len()] == magic
    };
    NorValidation {
        size_ok:       data.len() == EXPECTED_SIZE,
        header_ok:     check(HEADER_OFFSET,    HEADER_MAGIC),
        mbr1_ok:       check(MBR1_OFFSET,      MBR_MAGIC),
        mbr2_ok:       check(MBR2_OFFSET,      MBR_MAGIC),
        emc_ipl_a_ok:  check(EMC_IPL_A_OFFSET, SLB2_MAGIC),
        emc_ipl_b_ok:  check(EMC_IPL_B_OFFSET, SLB2_MAGIC),
        usb_pdc_a_ok:  check(USB_PDC_A_OFFSET, SLB2_MAGIC),
        usb_pdc_b_ok:  check(USB_PDC_B_OFFSET, SLB2_MAGIC),
    }
}

/// Parse the non-volatile storage (serial, MAC, SKU, board id, firmware
/// version) out of a NOR dump. Returns `None` if the dump is too short.
pub fn parse_nvs(data: &[u8]) -> Option<NvsData> {
    if data.len() < EXPECTED_SIZE {
        return None;
    }
    let mac_bytes: [u8; 6] = data[MAC_OFFSET..MAC_OFFSET + 6].try_into().ok()?;
    let console_type = u32::from_be_bytes(
        data[0x1C7010..0x1C7010 + 4].try_into().ok()?
    );
    let fw_bytes: [u8; 4] = data[FW_VERSION_OFFSET..FW_VERSION_OFFSET + 4].try_into().ok()?;
    let fw_raw = u32::from_le_bytes(fw_bytes);
    Some(NvsData {
        serial:       read_ff_string(&data[SERIAL_OFFSET..SERIAL_OFFSET + 32]),
        mac_address:  bytes_to_mac(&mac_bytes),
        sku:          read_cstring(&data[SKU_OFFSET..SKU_OFFSET + 16]),
        board_id:     read_cstring(&data[BOARD_ID_OFFSET..BOARD_ID_OFFSET + 13]),
        console_type,
        fw_version:   fw_version_from_u32(fw_raw),
    })
}

fn read_cstring(bytes: &[u8]) -> String {
    let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
    bytes[..end].iter()
        .filter(|&&b| b.is_ascii_graphic() || b == b' ')
        .map(|&b| b as char)
        .collect()
}

fn read_ff_string(bytes: &[u8]) -> String {
    let end = bytes.iter().position(|&b| b == 0xFF).unwrap_or(bytes.len());
    bytes[..end].iter()
        .filter(|&&b| b.is_ascii_graphic() || b == b' ')
        .map(|&b| b as char)
        .collect()
}

fn bytes_to_mac(bytes: &[u8; 6]) -> String {
    format!(
        "{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]
    )
}

fn fw_version_from_u32(v: u32) -> String {
    let b = v.to_be_bytes();
    format!("{:02X}.{:02X}.{:02X}.{:02X}", b[0], b[1], b[2], b[3])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_valid_nor() -> Vec<u8> {
        let mut data = vec![0u8; EXPECTED_SIZE];
        data[HEADER_OFFSET..HEADER_OFFSET + 32].copy_from_slice(HEADER_MAGIC);
        data[MBR1_OFFSET..MBR1_OFFSET + 32].copy_from_slice(MBR_MAGIC);
        data[MBR2_OFFSET..MBR2_OFFSET + 32].copy_from_slice(MBR_MAGIC);
        data[EMC_IPL_A_OFFSET..EMC_IPL_A_OFFSET + 4].copy_from_slice(SLB2_MAGIC);
        data[EMC_IPL_B_OFFSET..EMC_IPL_B_OFFSET + 4].copy_from_slice(SLB2_MAGIC);
        data[USB_PDC_A_OFFSET..USB_PDC_A_OFFSET + 4].copy_from_slice(SLB2_MAGIC);
        data[USB_PDC_B_OFFSET..USB_PDC_B_OFFSET + 4].copy_from_slice(SLB2_MAGIC);
        data
    }

    #[test]
    fn validate_all_ok() {
        let v = validate(&make_valid_nor());
        assert!(v.size_ok && v.header_ok && v.mbr1_ok && v.mbr2_ok
            && v.emc_ipl_a_ok && v.emc_ipl_b_ok && v.usb_pdc_a_ok && v.usb_pdc_b_ok);
        assert!(v.is_valid());
    }

    #[test]
    fn validate_corrupted_header() {
        let mut data = make_valid_nor();
        data[0] = 0xFF;
        let v = validate(&data);
        assert!(!v.header_ok);
        assert!(!v.is_valid());
    }

    #[test]
    fn validate_wrong_size() {
        let v = validate(&vec![0u8; 1024]);
        assert!(!v.size_ok);
        assert!(!v.is_valid());
    }

    #[test]
    fn parse_nvs_serial() {
        let mut data = make_valid_nor();
        let serial = b"AE12345678";
        data[SERIAL_OFFSET..SERIAL_OFFSET + serial.len()].copy_from_slice(serial);
        data[SERIAL_OFFSET + serial.len()..SERIAL_OFFSET + 32].fill(0xFF);
        let nvs = parse_nvs(&data).unwrap();
        assert_eq!(nvs.serial, "AE12345678");
    }

    #[test]
    fn parse_nvs_fw_version() {
        let mut data = make_valid_nor();
        // 02.50.00.01 stored as u32 LE: [0x01, 0x00, 0x50, 0x02]
        data[FW_VERSION_OFFSET..FW_VERSION_OFFSET + 4].copy_from_slice(&[0x01, 0x00, 0x50, 0x02]);
        let nvs = parse_nvs(&data).unwrap();
        assert_eq!(nvs.fw_version, "02.50.00.01");
    }

    #[test]
    fn parse_nvs_too_short() {
        assert!(parse_nvs(&vec![0u8; 1024]).is_none());
    }
}
