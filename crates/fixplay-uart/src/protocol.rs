use fixplay_core::types::ErrlogEntry;

pub fn checksum(cmd: &str) -> u8 {
    (cmd.bytes().map(|b| b as u32).sum::<u32>() % 256) as u8
}

pub fn build_command(cmd: &str) -> String {
    format!("{}:{:02X}\r\n", cmd, checksum(cmd))
}

pub fn parse_errlog_line(line: &str) -> Option<ErrlogEntry> {
    let fields: Vec<&str> = line.trim().split(',').collect();
    if fields.len() != 9 {
        return None;
    }
    let error_code   = u32::from_str_radix(fields[0], 16).ok()?;
    let timestamp    = u32::from_str_radix(fields[1], 16).ok()?;
    let power_states = u32::from_str_radix(fields[2], 16).ok()?;
    let up_cause     = u32::from_str_radix(fields[3], 16).ok()?;
    let temp_raw     = u16::from_str_radix(fields[4], 16).ok()?;
    let temp_soc     = (temp_raw >> 8) as f32 + ((temp_raw & 0xFF) as f32 / 256.0);
    let raw_fields   = [
        fields[5].to_string(),
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
}
