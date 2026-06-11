use fixplay_core::error::UartError;
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug)]
pub struct ErrorEntry {
    pub code:        u32,
    pub description: String,
    pub category:    String,
}

pub struct ErrorDb {
    entries: HashMap<u32, ErrorEntry>,
}

#[derive(serde::Deserialize)]
struct RawEntry {
    #[serde(rename = "Code")]
    code:        u32,
    #[serde(rename = "Description")]
    description: String,
    #[serde(rename = "Category")]
    category:    String,
}

const DB_URL: &str = "https://raw.githubusercontent.com/amoamare/Console-Service-Tool/master/Resources/ErrorCodes.json";

impl ErrorDb {
    pub fn from_json(json: &str) -> Result<Self, UartError> {
        let raw: Vec<RawEntry> = serde_json::from_str(json)
            .map_err(|e| UartError::DbFetch(e.to_string()))?;
        let entries = raw
            .into_iter()
            .map(|r| (r.code, ErrorEntry { code: r.code, description: r.description, category: r.category }))
            .collect();
        Ok(Self { entries })
    }

    pub fn from_cache(path: &Path) -> Result<Self, UartError> {
        let json = std::fs::read_to_string(path)
            .map_err(|e| UartError::Serial(e.to_string()))?;
        Self::from_json(&json)
    }

    pub fn fetch_and_cache(path: &Path) -> Result<Self, UartError> {
        let response = reqwest::blocking::get(DB_URL)
            .map_err(|e| UartError::DbFetch(e.to_string()))?;
        let text = response.text()
            .map_err(|e| UartError::DbFetch(e.to_string()))?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| UartError::DbFetch(e.to_string()))?;
        }
        std::fs::write(path, &text)
            .map_err(|e| UartError::DbFetch(e.to_string()))?;
        Self::from_json(&text)
    }

    pub fn lookup(&self, code: u32) -> Option<&ErrorEntry> {
        self.entries.get(&code)
    }

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

    const SAMPLE_JSON: &str = r#"[
        {"Code": 2147484673, "Description": "Kernel panic", "Category": "System"},
        {"Code": 2147483651, "Description": "NVS read error", "Category": "Storage"}
    ]"#;

    #[test]
    fn parse_json_and_lookup_known_code() {
        let db = ErrorDb::from_json(SAMPLE_JSON).unwrap();
        let entry = db.lookup(2147484673).unwrap();
        assert_eq!(entry.description, "Kernel panic");
        assert_eq!(entry.category, "System");
    }

    #[test]
    fn lookup_unknown_code_returns_none() {
        let db = ErrorDb::from_json(SAMPLE_JSON).unwrap();
        assert!(db.lookup(99999).is_none());
    }

    #[test]
    fn roundtrip_cache() {
        let dir = std::env::temp_dir().join("fixplay_test_cache");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("error_codes_test.json");

        std::fs::write(&path, SAMPLE_JSON).unwrap();

        let db = ErrorDb::from_cache(&path).unwrap();
        let entry = db.lookup(2147483651).unwrap();
        assert_eq!(entry.description, "NVS read error");

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn from_cache_missing_file_returns_err() {
        let path = std::path::Path::new("/tmp/this_file_does_not_exist_fixplay.json");
        assert!(ErrorDb::from_cache(path).is_err());
    }

    #[test]
    fn invalid_json_returns_err() {
        assert!(ErrorDb::from_json("not json").is_err());
    }
}
