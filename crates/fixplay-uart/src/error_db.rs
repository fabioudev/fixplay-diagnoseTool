use fixplay_core::error::UartError;
use fixplay_core::error_db;
use std::collections::HashMap;
use std::path::Path;

/// One PS5 error code with its human-readable description and category.
#[derive(Debug)]
pub struct ErrorEntry {
    /// The numeric error code.
    pub code:        u32,
    /// The full error message text.
    pub description: String,
    /// Category extracted from the message (the part before the first dash).
    pub category:    String,
}

/// In-memory PS5 error-code database, keyed by code.
pub struct ErrorDb {
    entries: HashMap<u32, ErrorEntry>,
}

#[derive(serde::Deserialize)]
struct RawEntry {
    #[serde(rename = "ID")]
    id: String,
    #[serde(rename = "Message")]
    message: String,
}

#[derive(serde::Deserialize)]
struct Platform {
    #[serde(rename = "ErrorCodes")]
    error_codes: Vec<RawEntry>,
}

#[derive(serde::Deserialize)]
struct RawDb {
    #[serde(rename = "PlayStation5")]
    ps5: Platform,
}

const DB_URL: &str = "https://raw.githubusercontent.com/amoamare/Console-Service-Tool/master/Resources/ErrorCodes.json";

fn extract_category(message: &str) -> String {
    let part = message.split('-').next().unwrap_or("").trim();
    if part.is_empty() || part.len() > 32 { String::new() } else { part.to_string() }
}

impl ErrorDb {
    /// Build the database from a raw JSON string (the Console-Service-Tool format).
    pub fn from_json(json: &str) -> Result<Self, UartError> {
        let raw: RawDb = serde_json::from_str(json)
            .map_err(|e| UartError::DbFetch(e.to_string()))?;
        let entries = raw.ps5.error_codes
            .into_iter()
            .filter_map(|r| {
                let hex = r.id.trim_start_matches("0x").trim_start_matches("0X");
                u32::from_str_radix(hex, 16).ok().map(|code| {
                    let category = extract_category(&r.message);
                    (code, ErrorEntry { code, description: r.message, category })
                })
            })
            .collect();
        Ok(Self { entries })
    }

    /// Load the database from a cached JSON file. A poisoned (non-JSON) cache
    /// surfaces as a clean error so the caller can fall back to a fresh fetch.
    pub fn from_cache(path: &Path) -> Result<Self, UartError> {
        // Cache I/O + the poisoned-cache guard live once in
        // `fixplay_core::error_db` (shared with the Xbox DB); only the error
        // enum is subsystem-specific.
        let json = error_db::read_cache_json(path).map_err(UartError::DbFetch)?;
        Self::from_json(&json)
    }

    /// Fetch the database from the upstream URL and write it to `path` for
    /// future cache hits, with a size guard against a compromised upstream.
    pub fn fetch_and_cache(path: &Path) -> Result<Self, UartError> {
        let text = error_db::fetch_and_cache_json(DB_URL, path).map_err(UartError::DbFetch)?;
        Self::from_json(&text)
    }

    /// Look up an entry by error code.
    pub fn lookup(&self, code: u32) -> Option<&ErrorEntry> {
        self.entries.get(&code)
    }

    /// Number of entries in the database.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Whether the database holds no entries.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Case-insensitive substring search over description + category, sorted
    /// by code, truncated to `limit` results.
    pub fn search(&self, query: &str, limit: usize) -> Vec<&ErrorEntry> {
        let q = query.to_lowercase();
        let mut results: Vec<&ErrorEntry> = self.entries.values()
            .filter(|e| {
                e.description.to_lowercase().contains(&q)
                || e.category.to_lowercase().contains(&q)
            })
            .collect();
        results.sort_by_key(|e| e.code);
        results.truncate(limit);
        results
    }

    /// Load from cache, falling back to a fresh fetch + cache write on any
    /// cache error (missing file, poisoned JSON).
    pub fn load(path: &Path) -> Result<Self, UartError> {
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
        "PlayStation5": {
            "ErrorCodes": [
                {"ID": "80000001", "Message": "Hardware - Thermal sensor failure", "Status": 0, "Priority": 0},
                {"ID": "80000002", "Message": "Storage - NVS read error", "Status": 0, "Priority": 0}
            ]
        }
    }"#;

    #[test]
    fn parse_json_and_lookup_known_code() {
        let db = ErrorDb::from_json(SAMPLE_JSON).unwrap();
        let entry = db.lookup(0x80000001).unwrap();
        assert_eq!(entry.description, "Hardware - Thermal sensor failure");
        assert_eq!(entry.category, "Hardware");
    }

    #[test]
    fn lookup_unknown_code_returns_none() {
        let db = ErrorDb::from_json(SAMPLE_JSON).unwrap();
        assert!(db.lookup(0xDEADBEEF).is_none());
    }

    #[test]
    fn roundtrip_cache() {
        let dir = std::env::temp_dir().join("fixplay_test_cache");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("error_codes_test.json");

        std::fs::write(&path, SAMPLE_JSON).unwrap();

        let db = ErrorDb::from_cache(&path).unwrap();
        let entry = db.lookup(0x80000002).unwrap();
        assert_eq!(entry.description, "Storage - NVS read error");

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn from_cache_missing_file_returns_err() {
        let path = std::path::Path::new("/tmp/this_file_does_not_exist_fixplay.json");
        assert!(ErrorDb::from_cache(path).is_err());
    }

    #[test]
    fn from_cache_poisoned_404_body_returns_clean_err() {
        // A stale cache written by an older fetch_and_cache (no HTTP status
        // check) may hold a 404 error body — that must surface as a clean
        // error, not a serde "invalid type: integer `404`" message.
        let dir = std::env::temp_dir().join("fixplay_test_uart_poisoned");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("error_codes_poisoned.json");
        std::fs::write(&path, "404: Not Found").unwrap();
        let err = match ErrorDb::from_cache(&path) {
            Ok(_) => panic!("expected poisoned-cache error, got Ok"),
            Err(e) => e,
        };
        assert!(err.to_string().contains("poisoned"),
            "expected poisoned-cache error, got: {err}");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn invalid_json_returns_err() {
        assert!(ErrorDb::from_json("not json").is_err());
    }

    const SEARCH_SAMPLE_JSON: &str = r#"{
        "Revision": "1.0",
        "PlayStation5": {
            "ErrorCodes": [
                {"ID": "00000001", "Message": "Hardware - Alpha error first",  "Status": 0, "Priority": 0},
                {"ID": "00000002", "Message": "Hardware - Alpha error second", "Status": 0, "Priority": 0},
                {"ID": "00000003", "Message": "Storage - Beta problem",        "Status": 0, "Priority": 0}
            ]
        }
    }"#;

    #[test]
    fn len_returns_entry_count() {
        let db = ErrorDb::from_json(SAMPLE_JSON).unwrap();
        assert_eq!(db.len(), 2);
    }

    #[test]
    fn is_empty_false_when_populated() {
        let db = ErrorDb::from_json(SAMPLE_JSON).unwrap();
        assert!(!db.is_empty());
    }

    #[test]
    fn search_finds_by_description_substring() {
        let db = ErrorDb::from_json(SEARCH_SAMPLE_JSON).unwrap();
        let results = db.search("alpha", 10);
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn search_is_case_insensitive() {
        let db = ErrorDb::from_json(SEARCH_SAMPLE_JSON).unwrap();
        let results = db.search("BETA", 10);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].code, 3);
    }

    #[test]
    fn search_no_match_returns_empty() {
        let db = ErrorDb::from_json(SEARCH_SAMPLE_JSON).unwrap();
        assert!(db.search("zzznotfound", 10).is_empty());
    }

    #[test]
    fn search_respects_limit() {
        let db = ErrorDb::from_json(SEARCH_SAMPLE_JSON).unwrap();
        let results = db.search("alpha", 1);
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn extract_category_splits_on_first_dash() {
        assert_eq!(extract_category("Hardware - Some failure"), "Hardware");
        assert_eq!(extract_category("No dash here"), "No dash here");
        assert_eq!(extract_category(""), "");
    }
}
