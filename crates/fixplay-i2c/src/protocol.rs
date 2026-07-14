//! Wire protocol between the host and the `fixplay-pico-i2c` firmware.
//!
//! The Pico enumerates as a USB CDC serial device. Communication is
//! line-oriented newline-delimited JSON (NDJSON): the host writes one JSON
//! request object terminated by `\n`, the Pico answers with one JSON response
//! object terminated by `\n`. Responses are matched to requests implicitly
//! (one-in/one-out), and echo the command name in the `type` field for
//! diagnostics.
//!
//! Request shapes (tagged on `cmd`):
//!   {"cmd":"scan"}
//!   {"cmd":"read","addr":72,"reg":0,"len":16}        // reg optional (omit for "current-pointer" read)
//!   {"cmd":"write","addr":72,"reg":0,"data":[1,2]}  // reg optional
//!   {"cmd":"read_eeprom","addr":80,"offset":0,"len":256}
//!   {"cmd":"errlog"}
//!   {"cmd":"info"}
//!
//! Response shape (single struct, optional fields):
//!   {"ok":true,"type":"scan","addresses":[72,80]}
//!   {"ok":true,"type":"read","addr":72,"data":[...]}
//!   {"ok":true,"type":"errlog","entries":[{"code":"E74","timestamp":123,...}]}
//!   {"ok":true,"type":"info","info":{"firmware":"...","bus":"i2c0","scl":5,"sda":4}}
//!   {"ok":false,"type":"read","error":"NACK at 0x48"}

use serde::{Deserialize, Serialize};

/// One host→Pico command. `addr` is the 7-bit I2C address (no R/W bit).
/// `reg` is optional: when `None` the firmware reads from the device's
/// current pointer (useful for devices without registers, e.g. some EEPROMs
/// after a pointer-set, or simple sensors).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum I2cRequest {
    Scan,
    Read {
        addr: u8,
        #[serde(skip_serializing_if = "Option::is_none")]
        reg: Option<u8>,
        len: u16,
    },
    Write {
        addr: u8,
        #[serde(skip_serializing_if = "Option::is_none")]
        reg: Option<u8>,
        data: Vec<u8>,
    },
    ReadEeprom {
        addr: u8,
        offset: u16,
        len: u16,
    },
    Errlog,
    Info,
}

impl I2cRequest {
    /// Serialize the request as a single NDJSON line (no trailing newline).
    pub fn to_line(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InfoPayload {
    pub firmware: String,
    pub bus:       String,
    pub scl:       u8,
    pub sda:       u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub voltage:   Option<String>,
}

/// One Xbox error-log entry read off the I2C bus. The Pico decodes the raw
/// bytes into a human-readable code string (e.g. "E74" or "0102"); the host
/// resolves it against [`crate::XboxErrorDb`].
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ErrlogItem {
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source:    Option<String>,
    /// Raw bytes the code was decoded from, for auditing. Serialized as a JSON
    /// array of decimal `u8` values (e.g. `[15, 14]`), **not** a hex string —
    /// `serde_json` deserializes `Vec<u8>` from a JSON number array.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw:        Option<Vec<u8>>,
}

/// The single response envelope the Pico emits. Every field except `ok` and
/// `type` is optional; callers extract the relevant one based on `type`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct I2cResponse {
    pub ok: bool,
    #[serde(rename = "type")]
    pub resp_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub addresses: Option<Vec<u8>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub addr:      Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data:      Option<Vec<u8>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entries:   Option<Vec<ErrlogItem>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub info:      Option<InfoPayload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error:     Option<String>,
}

impl I2cResponse {
    pub fn parse(line: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(line.trim())
    }

    /// Turn a non-ok response into a protocol error message.
    pub fn err_message(&self) -> String {
        self.error.clone().unwrap_or_else(|| format!("{} failed", self.resp_type))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_request_serializes() {
        let line = I2cRequest::Scan.to_line().unwrap();
        assert_eq!(line, r#"{"cmd":"scan"}"#);
    }

    #[test]
    fn read_request_omits_null_reg() {
        let line = I2cRequest::Read { addr: 0x48, reg: None, len: 16 }.to_line().unwrap();
        // reg is skipped when None
        assert!(!line.contains("\"reg\""));
        assert!(line.contains("\"addr\":72"));
        assert!(line.contains("\"len\":16"));
    }

    #[test]
    fn read_request_with_reg() {
        let req = I2cRequest::Read { addr: 0x48, reg: Some(0x10), len: 4 };
        let line = req.to_line().unwrap();
        assert!(line.contains("\"reg\":16"));
    }

    #[test]
    fn write_request_serializes_data() {
        let req = I2cRequest::Write { addr: 0x50, reg: Some(0x00), data: vec![1, 2, 3] };
        let line = req.to_line().unwrap();
        assert!(line.contains("\"data\":[1,2,3]"));
        assert!(line.contains("\"addr\":80"));
    }

    #[test]
    fn read_eeprom_request() {
        let req = I2cRequest::ReadEeprom { addr: 0x50, offset: 0x100, len: 256 };
        let line = req.to_line().unwrap();
        assert!(line.contains("\"offset\":256"));
        assert!(line.contains("\"len\":256"));
    }

    #[test]
    fn parse_scan_response() {
        let line = r#"{"ok":true,"type":"scan","addresses":[72,80]}"#;
        let r = I2cResponse::parse(line).unwrap();
        assert!(r.ok);
        assert_eq!(r.resp_type, "scan");
        assert_eq!(r.addresses.as_deref(), Some(&[72u8, 80u8][..]));
    }

    #[test]
    fn parse_read_response() {
        let line = r#"{"ok":true,"type":"read","addr":72,"data":[1,2,3,4]}"#;
        let r = I2cResponse::parse(line).unwrap();
        assert_eq!(r.addr, Some(72));
        assert_eq!(r.data.as_deref(), Some(&[1u8, 2, 3, 4][..]));
    }

    #[test]
    fn parse_error_response() {
        let line = r#"{"ok":false,"type":"read","error":"NACK at 0x48"}"#;
        let r = I2cResponse::parse(line).unwrap();
        assert!(!r.ok);
        assert_eq!(r.err_message(), "NACK at 0x48");
    }

    #[test]
    fn parse_errlog_response() {
        let line = r#"{"ok":true,"type":"errlog","entries":[{"code":"E74","timestamp":123}]}"#;
        let r = I2cResponse::parse(line).unwrap();
        let entries = r.entries.as_ref().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].code, "E74");
        assert_eq!(entries[0].timestamp, Some(123));
    }

    #[test]
    fn parse_info_response() {
        let line = r#"{"ok":true,"type":"info","info":{"firmware":"fixplay-pico-i2c 1.0","bus":"i2c0","scl":5,"sda":4}}"#;
        let r = I2cResponse::parse(line).unwrap();
        let info = r.info.as_ref().unwrap();
        assert_eq!(info.firmware, "fixplay-pico-i2c 1.0");
        assert_eq!(info.scl, 5);
        assert_eq!(info.sda, 4);
        assert_eq!(info.voltage, None);
    }

    #[test]
    fn parse_malformed_returns_err() {
        assert!(I2cResponse::parse("not json").is_err());
    }

    #[test]
    fn err_message_falls_back_to_type() {
        let r = I2cResponse { ok: false, resp_type: "scan".into(), error: None,
            addresses: None, addr: None, data: None, entries: None, info: None };
        assert_eq!(r.err_message(), "scan failed");
    }
}