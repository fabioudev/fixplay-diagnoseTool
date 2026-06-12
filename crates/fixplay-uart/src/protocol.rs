use fixplay_core::types::ErrlogEntry;

pub fn checksum(cmd: &str) -> u8 {
    (cmd.bytes().map(|b| b as u32).sum::<u32>() % 256) as u8
}

pub fn build_command(cmd: &str) -> String {
    format!("{}:{:02X}\r\n", cmd, checksum(cmd))
}

/// Parse a PS5 errlog response payload.
///
/// Real consoles answer space-separated with a leading all-zero status word:
/// `00000000 808D0001 001A0736 81BF0005 00000000 2179 003E 1E13 14CD`
/// (status, error code, RTC counter, power state, up cause, SoC temp as 8.8
/// fixed point, three unknown words). The legacy comma format without the
/// status word is still accepted.
pub fn parse_errlog_line(line: &str) -> Option<ErrlogEntry> {
    let fields: Vec<&str> = line
        .trim()
        .split(|c: char| c == ',' || c.is_whitespace())
        .filter(|s| !s.is_empty())
        .collect();
    if fields.len() != 9 {
        return None;
    }
    // A leading all-zero word is the status field of the real format.
    let off = usize::from(fields[0].bytes().all(|b| b == b'0'));

    let error_code   = u32::from_str_radix(fields[off], 16).ok()?;
    let timestamp    = u32::from_str_radix(fields[off + 1], 16).ok()?;
    let power_states = u32::from_str_radix(fields[off + 2], 16).ok()?;
    let up_cause     = u32::from_str_radix(fields[off + 3], 16).ok()?;
    let temp_raw     = u16::from_str_radix(fields[off + 4], 16).ok()?;
    let temp_soc     = (temp_raw >> 8) as f32 + ((temp_raw & 0xFF) as f32 / 256.0);

    // Empty history slots: all-zero, or all-FF after "errlog clear"
    // (erased memory reads back as 0xFF)
    if error_code == 0 || error_code == 0xFFFF_FFFF {
        return None;
    }

    let first_raw  = if off == 1 { fields[0] } else { fields[5] };
    let raw_fields = [
        first_raw.to_string(),
        fields[6].to_string(),
        fields[7].to_string(),
        fields[8].to_string(),
    ];
    Some(ErrlogEntry { error_code, timestamp, power_states, up_cause, temp_soc, raw_fields })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checksum_errlog() {
        assert_eq!(checksum("errlog"), 0x8B);
    }

    #[test]
    fn checksum_version() {
        assert_eq!(checksum("version"), 0x06);
    }

    #[test]
    fn build_command_errlog() {
        assert_eq!(build_command("errlog"), "errlog:8B\r\n");
    }

    #[test]
    fn build_command_version() {
        assert_eq!(build_command("version"), "version:06\r\n");
    }

    #[test]
    fn parse_valid_errlog_line() {
        let line = "80000001,00001234,00000003,00000001,3480,00000000,00000000,00000000,00000000";
        let entry = parse_errlog_line(line).expect("should parse");
        assert_eq!(entry.error_code, 0x80000001);
        assert_eq!(entry.timestamp, 0x00001234);
        assert_eq!(entry.power_states, 0x00000003);
        assert_eq!(entry.up_cause, 0x00000001);
        assert!((entry.temp_soc - 52.5).abs() < 0.01);
        assert_eq!(entry.raw_fields[0], "00000000");
    }

    #[test]
    fn parse_errlog_line_wrong_field_count() {
        let line = "80000001,00001234";
        assert!(parse_errlog_line(line).is_none());
    }

    #[test]
    fn parse_errlog_line_invalid_hex() {
        let line = "ZZZZZZZZ,00001234,00000003,00000001,3480,0,0,0,0";
        assert!(parse_errlog_line(line).is_none());
    }

    #[test]
    fn temp_decode_integer() {
        let line = "80000001,00001234,00000003,00000001,3400,0,0,0,0";
        let entry = parse_errlog_line(line).expect("should parse");
        assert!((entry.temp_soc - 52.0).abs() < 0.01);
    }

    #[test]
    fn parse_real_console_response() {
        // Captured from a real PS5 (after "OK " prefix and ":XX" checksum are stripped)
        let line = "00000000 808D0001 001A0736 81BF0005 00000000 2179 003E 1E13 14CD";
        let entry = parse_errlog_line(line).expect("should parse");
        assert_eq!(entry.error_code, 0x808D0001);
        assert_eq!(entry.timestamp, 0x001A0736);
        assert_eq!(entry.power_states, 0x81BF0005);
        assert_eq!(entry.up_cause, 0x00000000);
        assert!((entry.temp_soc - 33.47).abs() < 0.01);
        assert_eq!(entry.raw_fields[0], "00000000");
        assert_eq!(entry.raw_fields[1], "003E");
        assert_eq!(entry.raw_fields[2], "1E13");
        assert_eq!(entry.raw_fields[3], "14CD");
    }

    #[test]
    fn parse_real_format_empty_slot_returns_none() {
        // Status word present but error code is zero → empty history slot
        let line = "00000000 00000000 00000000 00000000 00000000 0000 0000 0000 0000";
        assert!(parse_errlog_line(line).is_none());
    }

    #[test]
    fn parse_cleared_slot_returns_none() {
        // After "errlog clear", slots read back as erased memory (all FF)
        let line = "00000000 FFFFFFFF FFFFFFFF FFFFFFFF FFFFFFFF FFFF FFFF FFFF FFFF";
        assert!(parse_errlog_line(line).is_none());
    }

    #[test]
    fn parse_real_format_multiple_spaces() {
        let line = "00000000  808D0001  001A0736 81BF0005 00000000 2179 003E 1E13 14CD";
        // extra whitespace collapses — still 9 fields
        let entry = parse_errlog_line(line).expect("should parse");
        assert_eq!(entry.error_code, 0x808D0001);
    }
}
