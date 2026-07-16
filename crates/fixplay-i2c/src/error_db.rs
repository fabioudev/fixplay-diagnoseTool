//! Xbox error-code database.
//!
//! Mirrors the PS5 [`fixplay_uart::ErrorDb`] pattern but keyed on the *string*
//! codes the Xbox uses: primary "E" codes (E1–E99, shown on screen) and the
//! 4-digit secondary codes (0001–0110+, read via the ring-of-light button
//! combo). The Pico reads these codes off the I2C/SMBus bus; the host resolves
//! them here for human-readable descriptions.
//!
//! Lifecycle is identical to the PS5 DB: user cache → bundled resource
//! (`resources/xbox_error_codes.json`) → optional background fetch. Offline
//! operation is guaranteed by the bundled resource.

use fixplay_core::error::I2cError;
use std::collections::HashMap;
use std::path::Path;

/// Remote source for the Xbox error-code JSON. There is no widely-canonical
/// Xbox equivalent of the PS5 amoamare DB, so this is a *best-effort* override
/// channel: the bundled resource ships a curated baseline that is always
/// available offline; "DB aktualisieren" pulls a fresher copy from here when
/// the user wants a refresh. A failed fetch is non-fatal.
///
/// This points at the same `xbox_error_codes.json` shipped as a bundled
/// resource in this repo (`src-tauri/resources/xbox_error_codes.json`) — the
/// previous URL (`fixplay-xbox/error-codes`) was a dead repo that only ever
/// returned 404, so every "DB aktualisieren" failed. Self-hosting the bundled
/// baseline on the project's default branch means the refresh channel actually
/// resolves and tracks the file the app already ships.
const DB_URL: &str = "https://raw.githubusercontent.com/fabioudev/fixplay-diagnoseTool/main/src-tauri/resources/xbox_error_codes.json";

#[derive(Debug)]
pub struct XboxErrorEntry {
    pub code:        String,
    pub description: String,
    pub category:    String,
}

pub struct XboxErrorDb {
    entries: HashMap<String, XboxErrorEntry>,
}

#[derive(serde::Deserialize)]
struct RawEntry {
    #[serde(rename = "Code")]
    code: String,
    #[serde(rename = "Message")]
    message: String,
    #[serde(rename = "Category", default)]
    category: String,
}

#[derive(serde::Deserialize)]
struct Platform {
    #[serde(rename = "ErrorCodes")]
    error_codes: Vec<RawEntry>,
}

#[derive(serde::Deserialize)]
struct RawDb {
    #[serde(rename = "Xbox")]
    xbox: Platform,
}

/// Normalize a code for lookup: uppercase, strip a leading 0x, trim spaces.
/// Matches "E74" / "e74" / "0102" / "0x0102" all to a canonical form.
fn normalize(code: &str) -> String {
    let trimmed = code.trim().trim_start_matches("0x").trim_start_matches("0X");
    trimmed.to_uppercase()
}

fn extract_category(message: &str, fallback: &str) -> String {
    let part = message.split('-').next().unwrap_or("").trim();
    if !part.is_empty() && part.len() <= 32 {
        part.to_string()
    } else if !fallback.is_empty() {
        fallback.to_string()
    } else {
        String::new()
    }
}

impl XboxErrorDb {
    pub fn from_json(json: &str) -> Result<Self, I2cError> {
        let raw: RawDb = serde_json::from_str(json)
            .map_err(|e| I2cError::DbFetch(e.to_string()))?;
        let entries = raw.xbox.error_codes
            .into_iter()
            .filter_map(|r| {
                let key = normalize(&r.code);
                if key.is_empty() { return None; }
                let category = if r.category.is_empty() {
                    extract_category(&r.message, &r.category)
                } else {
                    r.category
                };
                Some((key, XboxErrorEntry {
                    code:        r.code,
                    description: r.message,
                    category,
                }))
            })
            .collect();
        Ok(Self { entries })
    }

    pub fn from_cache(path: &Path) -> Result<Self, I2cError> {
        let json = std::fs::read_to_string(path)
            .map_err(|e| I2cError::Serial(e.to_string()))?;
        // Poisoned-cache guard: an older `fetch_and_cache` had no HTTP status
        // check, so a stale cache file may hold a 404 error body ("404: Not
        // Found") rather than JSON. serde would then surface a confusing
        // "invalid type: integer `404`, expected struct RawDb" instead of a
        // clean miss. Treat anything that isn't a JSON object as a cache miss
        // so the caller falls back to the bundled resource.
        if !json.trim_start().starts_with('{') {
            return Err(I2cError::DbFetch("cached DB is not valid JSON (poisoned)".into()));
        }
        Self::from_json(&json)
    }

    pub fn fetch_and_cache(path: &Path) -> Result<Self, I2cError> {
        let response = reqwest::blocking::get(DB_URL)
            .map_err(|e| I2cError::DbFetch(e.to_string()))?;
        // Check HTTP status BEFORE reading/parsing/caching. raw.githubusercontent
        // answers a missing file with HTTP 404 and a body of "404: Not Found"; if
        // we let that through, serde reads `404` as an integer ("invalid type:
        // integer `404`, expected struct RawDb") AND we'd overwrite a good cache
        // file with the error page. A non-2xx is a clean "no remote DB" → caller
        // falls back to the bundled resource.
        if !response.status().is_success() {
            return Err(I2cError::DbFetch(format!("HTTP {}", response.status())));
        }
        let text = response.text()
            .map_err(|e| I2cError::DbFetch(e.to_string()))?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| I2cError::DbFetch(e.to_string()))?;
        }
        std::fs::write(path, &text)
            .map_err(|e| I2cError::DbFetch(e.to_string()))?;
        Self::from_json(&text)
    }

    pub fn lookup(&self, code: &str) -> Option<&XboxErrorEntry> {
        self.entries.get(&normalize(code))
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn search(&self, query: &str, limit: usize) -> Vec<&XboxErrorEntry> {
        let q = query.to_lowercase();
        let mut results: Vec<&XboxErrorEntry> = self.entries.values()
            .filter(|e| {
                e.description.to_lowercase().contains(&q)
                || e.category.to_lowercase().contains(&q)
                || e.code.to_lowercase().contains(&q)
            })
            .collect();
        results.sort_by(|a, b| a.code.cmp(&b.code));
        results.truncate(limit);
        results
    }

    pub fn load(path: &Path) -> Result<Self, I2cError> {
        match Self::from_cache(path) {
            Ok(db) => Ok(db),
            Err(_) => Self::fetch_and_cache(path),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_JSON: &str = r#"{
        "Revision": "1.0",
        "Xbox": {
            "ErrorCodes": [
                {"Code": "E74", "Message": "AV cable / scaler (HANA/ANA) error", "Category": "Video"},
                {"Code": "0102", "Message": "Unknown - General hardware failure", "Category": "General"}
            ]
        }
    }"#;

    #[test]
    fn parse_json_and_lookup_known_code() {
        let db = XboxErrorDb::from_json(SAMPLE_JSON).unwrap();
        let entry = db.lookup("E74").unwrap();
        assert_eq!(entry.description, "AV cable / scaler (HANA/ANA) error");
        assert_eq!(entry.category, "Video");
    }

    #[test]
    fn lookup_is_case_insensitive() {
        let db = XboxErrorDb::from_json(SAMPLE_JSON).unwrap();
        assert!(db.lookup("e74").is_some());
        assert!(db.lookup("E74").is_some());
    }

    #[test]
    fn lookup_strips_0x_prefix() {
        let db = XboxErrorDb::from_json(r#"{
            "Xbox": {"ErrorCodes": [{"Code": "0x0102", "Message": "General failure", "Category": "General"}]}
        }"#).unwrap();
        assert!(db.lookup("0102").is_some());
        assert!(db.lookup("0x0102").is_some());
    }

    #[test]
    fn lookup_unknown_code_returns_none() {
        let db = XboxErrorDb::from_json(SAMPLE_JSON).unwrap();
        assert!(db.lookup("ZZZZ").is_none());
    }

    #[test]
    fn len_returns_entry_count() {
        let db = XboxErrorDb::from_json(SAMPLE_JSON).unwrap();
        assert_eq!(db.len(), 2);
    }

    #[test]
    fn is_empty_false_when_populated() {
        let db = XboxErrorDb::from_json(SAMPLE_JSON).unwrap();
        assert!(!db.is_empty());
    }

    #[test]
    fn roundtrip_cache() {
        let dir = std::env::temp_dir().join("fixplay_test_xbox_cache");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("xbox_error_codes_test.json");
        std::fs::write(&path, SAMPLE_JSON).unwrap();

        let db = XboxErrorDb::from_cache(&path).unwrap();
        assert_eq!(db.lookup("0102").unwrap().category, "General");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn from_cache_missing_file_returns_err() {
        let path = std::path::Path::new("/tmp/this_xbox_file_does_not_exist_fixplay.json");
        assert!(XboxErrorDb::from_cache(path).is_err());
    }

    #[test]
    fn from_cache_poisoned_404_body_returns_clean_err() {
        // An older fetch_and_cache (no HTTP status check) could write a 404
        // error body to the cache. That must surface as a clean error, not a
        // serde "invalid type: integer `404`" panic-ish message.
        let dir = std::env::temp_dir().join("fixplay_test_xbox_poisoned");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("xbox_poisoned.json");
        std::fs::write(&path, "404: Not Found").unwrap();
        let err = match XboxErrorDb::from_cache(&path) {
            Ok(_) => panic!("expected poisoned-cache error, got Ok"),
            Err(e) => e,
        };
        assert!(err.to_string().contains("poisoned"),
            "expected poisoned-cache error, got: {err}");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn invalid_json_returns_err() {
        assert!(XboxErrorDb::from_json("not json").is_err());
    }

    #[test]
    fn search_finds_by_description() {
        let db = XboxErrorDb::from_json(SAMPLE_JSON).unwrap();
        assert_eq!(db.search("scaler", 10).len(), 1);
    }

    #[test]
    fn search_finds_by_code() {
        let db = XboxErrorDb::from_json(SAMPLE_JSON).unwrap();
        assert_eq!(db.search("E74", 10).len(), 1);
    }

    #[test]
    fn search_is_case_insensitive() {
        let db = XboxErrorDb::from_json(SAMPLE_JSON).unwrap();
        assert_eq!(db.search("UNKNOWN", 10).len(), 1);
    }

    #[test]
    fn search_no_match_returns_empty() {
        let db = XboxErrorDb::from_json(SAMPLE_JSON).unwrap();
        assert!(db.search("zzznotfound", 10).is_empty());
    }

    #[test]
    fn search_respects_limit() {
        let big = r#"{
            "Xbox": {"ErrorCodes": [
                {"Code": "0001", "Message": "Hardware - A", "Category": "Hardware"},
                {"Code": "0002", "Message": "Hardware - B", "Category": "Hardware"},
                {"Code": "0003", "Message": "Hardware - C", "Category": "Hardware"}
            ]}
        }"#;
        let db = XboxErrorDb::from_json(big).unwrap();
        assert_eq!(db.search("hardware", 2).len(), 2);
    }

    #[test]
    fn extract_category_splits_on_first_dash() {
        assert_eq!(extract_category("Hardware - Some failure", ""), "Hardware");
        assert_eq!(extract_category("No dash here", "Video"), "No dash here");
        assert_eq!(extract_category("", "Video"), "Video");
        assert_eq!(extract_category("", ""), "");
    }

    #[test]
    fn category_derived_from_message_when_missing() {
        let db = XboxErrorDb::from_json(r#"{
            "Xbox": {"ErrorCodes": [{"Code": "0020", "Message": "GPU - Overheat / unknown", "Category": ""}]}
        }"#).unwrap();
        let entry = db.lookup("0020").unwrap();
        assert_eq!(entry.category, "GPU");
    }

    #[test]
    fn empty_code_is_dropped() {
        let db = XboxErrorDb::from_json(r#"{
            "Xbox": {"ErrorCodes": [{"Code": "", "Message": "x", "Category": "y"}]}
        }"#).unwrap();
        assert_eq!(db.len(), 0);
    }
}