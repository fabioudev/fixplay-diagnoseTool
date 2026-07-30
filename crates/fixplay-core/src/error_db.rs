//! Shared cache + fetch plumbing for the subsystem error-code databases.
//!
//! Both the PS5 ([`crate::error::UartError`]) and Xbox ([`crate::error::I2cError`])
//! error-code databases follow the same lifecycle: read a cached JSON file
//! (rejecting poisoned non-JSON bodies), and on a cache miss fetch a fresh copy
//! from a remote URL with HTTP-status + size guards, writing it back to the
//! cache. The only things that differ between the two are the remote URL and
//! the error enum — so the I/O lives here once, and each per-subsystem crate
//! maps the `String` reason into its own `DbFetch` error variant.
//!
//! The per-subsystem crates keep their own `from_json` / `lookup` / `search`,
//! which genuinely differ (the PS5 DB is keyed on a parsed `u32` hex code, the
//! Xbox DB on a normalized code string).

use std::path::Path;

/// Upper bound on an accepted remote response size. The error databases are
/// ~200 KB; 5 MB is generous headroom against a compromised or misconfigured
/// upstream.
pub const MAX_FETCH_BYTES: u64 = 5_000_000;

/// Read a cached error-code database JSON file. Returns the raw text so the
/// caller can deserialize it with its own schema.
///
/// A *poisoned* cache — e.g. a stale file written by an older `fetch` that
/// lacked an HTTP-status check, holding a `404: Not Found` body — is rejected
/// with a clean `"cached DB is not valid JSON (poisoned)"` error. This lets the
/// caller fall back to a fresh fetch or the bundled resource instead of
/// surfacing a confusing serde `"invalid type: integer \`404\`"` message.
pub fn read_cache_json(path: &Path) -> Result<String, String> {
    let json = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    if !json.trim_start().starts_with('{') {
        return Err("cached DB is not valid JSON (poisoned)".to_string());
    }
    Ok(json)
}

/// Fetch a remote error-code database, enforcing HTTP-success + size guards,
/// and write it to `path` for future cache hits. Returns the fetched text on
/// success so the caller can deserialize it.
///
/// A non-2xx status is a clean error (the caller falls back to the bundled
/// resource) — `raw.githubusercontent.com` answers a missing file with HTTP 404
/// and a `"404: Not Found"` body, and accepting that would both fail to parse
/// *and* overwrite a good cache file with the error page.
pub fn fetch_and_cache_json(url: &str, path: &Path) -> Result<String, String> {
    let response = reqwest::blocking::get(url).map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    if let Some(len) = response.content_length() {
        if len > MAX_FETCH_BYTES {
            return Err(format!(
                "Response too large: Content-Length {} exceeds 5 MB limit",
                len
            ));
        }
    }
    let text = response.text().map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, &text).map_err(|e| e.to_string())?;
    Ok(text)
}