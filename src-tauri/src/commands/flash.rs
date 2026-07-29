use fixplay_core::{
    error::FlashError,
    nor,
    types::{ChipId, FlashProgress, FlashReadResult, NorValidation, NvsData},
};
use fixplay_flashrom::FlashromDevice;
use fixplay_core::traits::FlashDevice;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tracing::info;

/// Validate a programmer name against the known flashrom programmer list.
/// The frontend dropdown constrains this, but a user with devtools could pass
/// arbitrary values — this is defense-in-depth against flag injection.
fn validate_programmer(p: &str) -> Result<(), String> {
    let allowed = [
        "ch341a_spi", "ft2232_spi", "serprog", "dummy",
        "dediprog", "buspirate_spi", "pony_spi", "rt809h_spi",
    ];
    if allowed.contains(&p) {
        Ok(())
    } else {
        Err(format!("Unbekannter Programmer: '{}'. Erlaubt: {}", p, allowed.join(", ")))
    }
}

#[derive(Serialize, Clone)]
struct FlashProgressEvent {
    phase:   String,
    percent: u8,
}

#[derive(Serialize, Clone)]
struct FlashStatusEvent {
    message: String,
    level:   String,
}

#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    open::that(path).map_err(|e| e.to_string())
}

/// Write arbitrary text (e.g. an exported log) to a user-chosen file. The
/// frontend opens a save dialog and passes the resulting path here — we never
/// pick the path ourselves, so this can't be used to clobber arbitrary files
/// without the user explicitly confirming in the OS dialog.
#[tauri::command]
pub fn save_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Result of the flashrom binary self-check, queried by the frontend on mount
/// (the startup `flash://binary-status` event fires before listeners attach).
#[derive(Serialize, Clone)]
pub struct FlashBinaryStatus {
    pub ok:     bool,
    pub reason: Option<String>,
    pub path:   String,
}

#[tauri::command]
pub fn flash_get_binary_status(app: AppHandle) -> FlashBinaryStatus {
    let resource_dir = app.path().resource_dir().ok();
    let settings     = crate::settings::load_settings_or_default(&app);
    let binary_path  = resource_dir
        .as_ref()
        .map(|r| crate::settings::resolve_flashrom_path(&settings, r))
        .unwrap_or_default();
    let (ok, reason) = crate::check_flashrom_binary(&binary_path);
    FlashBinaryStatus {
        ok,
        reason,
        path: binary_path.to_string_lossy().to_string(),
    }
}

/// Read the chip ID (JEDEC vendor/device + textual name) via flashrom
/// `--flash-name`. Runs on a blocking task because flashrom probes the chip.
#[tauri::command]
pub async fn flash_read_id(
    programmer: String,
    app:        AppHandle,
) -> Result<ChipId, String> {
    validate_programmer(&programmer)?;
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let settings     = crate::settings::load_settings_or_default(&app);
    let device = FlashromDevice {
        programmer:  programmer.clone(),
        binary_path: crate::settings::resolve_flashrom_path(&settings, &resource_dir),
    };
    info!("flash_read_id: programmer={}", programmer);
    tokio::task::spawn_blocking(move || device.read_id())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn flash_list_programmers() -> Vec<String> {
    vec![
        "ch341a_spi".into(),
        "rt809h_spi".into(),
        "serprog".into(),
        "buspirate_spi".into(),
        "ft2232_spi".into(),
    ]
}

#[tauri::command]
pub async fn flash_read(
    programmer: String,
    app: AppHandle,
) -> Result<FlashReadResult, String> {
    validate_programmer(&programmer)?;
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let settings     = crate::settings::load_settings_or_default(&app);
    let device = Arc::new(FlashromDevice {
        programmer:  programmer.clone(),
        binary_path: crate::settings::resolve_flashrom_path(&settings, &resource_dir),
    });

    emit_status(&app, "Erster Lesevorgang...", "info");
    info!("flash_read: first pass, programmer={}", programmer);

    let bytes1 = {
        let app_c  = app.clone();
        let dev    = Arc::clone(&device);
        tokio::task::spawn_blocking(move || {
            dev.read_flash(&|p: FlashProgress| {
                let _ = app_c.emit("flash://progress", FlashProgressEvent {
                    phase:   "read1".into(),
                    percent: p.percent() as u8,
                });
            })
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?
    };

    emit_status(&app, "Zweiter Lesevorgang...", "info");
    info!("flash_read: second pass");

    let bytes2 = {
        let app_c = app.clone();
        let dev   = Arc::clone(&device);
        tokio::task::spawn_blocking(move || {
            dev.read_flash(&|p: FlashProgress| {
                let _ = app_c.emit("flash://progress", FlashProgressEvent {
                    phase:   "read2".into(),
                    percent: p.percent() as u8,
                });
            })
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?
    };

    let dumps_match = bytes1 == bytes2;
    if dumps_match {
        emit_status(&app, "Beide Dumps identisch ✓", "info");
    } else {
        emit_status(&app, "Warnung: Dumps weichen voneinander ab!", "warn");
    }

    let validation = nor::validate(&bytes1);
    let nvs        = nor::parse_nvs(&bytes1);

    if validation.is_valid() {
        emit_status(&app, "NOR-Validierung bestanden ✓", "info");
    } else {
        emit_status(&app, "Warnung: NOR-Validierung fehlgeschlagen!", "warn");
    }

    let archive_path = archive_dump(&app, &bytes1, &nvs, &validation)?;
    emit_status(&app, &format!("Archiviert: {}", archive_path), "info");

    let result = FlashReadResult { dumps_match, validation, nvs, archive_path };
    app.emit("flash://result", result.clone()).map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn flash_write(
    path:       String,
    programmer: String,
    verify:     bool,
    app:        AppHandle,
) -> Result<(), String> {
    validate_programmer(&programmer)?;
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let settings     = crate::settings::load_settings_or_default(&app);
    let device = Arc::new(FlashromDevice {
        programmer:  programmer.clone(),
        binary_path: crate::settings::resolve_flashrom_path(&settings, &resource_dir),
    });

    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    emit_status(&app, "Schreibe NOR (Löschen + Schreiben)...", "info");
    info!("flash_write: path={}, programmer={}, verify={}", path, programmer, verify);

    {
        let app_c     = app.clone();
        let dev       = Arc::clone(&device);
        let data_copy = data.clone();
        tokio::task::spawn_blocking(move || {
            dev.write_flash(&data_copy, &|p: FlashProgress| {
                let _ = app_c.emit("flash://progress", FlashProgressEvent {
                    phase:   "write".into(),
                    percent: p.percent() as u8,
                });
            })
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    }

    if verify {
        emit_status(&app, "Verifiziere...", "info");
        let read_back = {
            let app_c = app.clone();
            let dev   = Arc::clone(&device);
            tokio::task::spawn_blocking(move || {
                dev.read_flash(&|p: FlashProgress| {
                    let _ = app_c.emit("flash://progress", FlashProgressEvent {
                        phase:   "verify".into(),
                        percent: p.percent() as u8,
                    });
                })
            })
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?
        };

        if read_back != data {
            let diff = count_diff_bytes(&data, &read_back);
            return Err(FlashError::VerifyFailed { diff_bytes: diff }.to_string());
        }
        emit_status(&app, "Verify OK ✓", "info");
    } else {
        emit_status(&app, "NOR erfolgreich geschrieben ✓", "info");
    }

    Ok(())
}

/// Count bytes that differ between the image we wrote and the one we read back.
/// Mismatched length counts each surplus/missing byte as a difference, so a
/// truncated read-back is reported rather than silently passing when the
/// common prefix happens to match.
fn count_diff_bytes(written: &[u8], read_back: &[u8]) -> usize {
    read_back.iter().zip(written.iter()).filter(|(a, b)| a != b).count()
        + read_back.len().abs_diff(written.len())
}

fn emit_status(app: &AppHandle, message: &str, level: &str) {
    let _ = app.emit("flash://status", FlashStatusEvent {
        message: message.to_string(),
        level:   level.to_string(),
    });
}

fn archive_dump(
    app:        &AppHandle,
    bytes:      &[u8],
    nvs:        &Option<NvsData>,
    validation: &NorValidation,
) -> Result<String, String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let serial_dir = nvs
        .as_ref()
        .map(|n| n.serial.clone())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("unknown_{}", timestamp));

    // Prevent path traversal: a crafted NOR dump could contain "../" in its
    // serial number field, which would escape the archive directory via join().
    if serial_dir.contains('/') || serial_dir.contains('\\') || serial_dir.contains("..") {
        return Err(format!("Ungültige Seriennummer im Dump: '{}' enthält Pfad-Separatoren", serial_dir));
    }

    let data_dir  = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let settings  = crate::settings::load_settings_or_default(app);
    let base = crate::settings::resolve_archive_base(&settings, &data_dir)
        .join("dumps")
        .join(&serial_dir);

    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;

    let stem     = format!("nor_{}", timestamp);
    let bin_path = base.join(format!("{}.bin", stem));
    let json_path = base.join(format!("{}.json", stem));

    std::fs::write(&bin_path, bytes).map_err(|e| e.to_string())?;

    #[derive(serde::Serialize)]
    struct Meta<'a> {
        timestamp:  u64,
        nvs:        &'a Option<NvsData>,
        validation: &'a NorValidation,
        size_bytes: usize,
    }
    let meta = Meta { timestamp, nvs, validation, size_bytes: bytes.len() };
    std::fs::write(
        &json_path,
        serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    Ok(base.to_string_lossy().to_string())
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct DumpEntry {
    pub bin_path:      String,
    pub timestamp:     u64,
    pub size_bytes:    usize,
    pub validation_ok: bool,
    pub fw_version:    Option<String>,
    pub serial:        String,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct SerialArchive {
    pub serial: String,
    pub dumps:  Vec<DumpEntry>,
}

#[derive(serde::Deserialize)]
struct MetaFile {
    timestamp:  u64,
    nvs:        Option<fixplay_core::types::NvsData>,
    validation: fixplay_core::types::NorValidation,
    size_bytes: usize,
}

fn list_dumps_from_dir(dumps_dir: &std::path::Path) -> Vec<SerialArchive> {
    if !dumps_dir.exists() {
        return vec![];
    }
    let mut result: Vec<SerialArchive> = vec![];
    let Ok(serial_dirs) = std::fs::read_dir(dumps_dir) else { return vec![] };

    for entry in serial_dirs.flatten() {
        let path = entry.path();
        if !path.is_dir() { continue; }
        let serial = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let mut dumps: Vec<DumpEntry> = vec![];
        let Ok(json_files) = std::fs::read_dir(&path) else { continue };

        for jentry in json_files.flatten() {
            let jpath = jentry.path();
            if jpath.extension().and_then(|e| e.to_str()) != Some("json") { continue; }
            let bin_path = jpath.with_extension("bin");
            if !bin_path.exists() { continue; }
            let Ok(json_str) = std::fs::read_to_string(&jpath) else { continue };
            let Ok(meta) = serde_json::from_str::<MetaFile>(&json_str) else { continue };

            dumps.push(DumpEntry {
                bin_path:      bin_path.to_string_lossy().to_string(),
                timestamp:     meta.timestamp,
                size_bytes:    meta.size_bytes,
                validation_ok: meta.validation.is_valid(),
                fw_version:    meta.nvs.as_ref().map(|n| n.fw_version.clone()),
                serial:        serial.clone(),
            });
        }

        dumps.sort_by_key(|d| std::cmp::Reverse(d.timestamp));
        if !dumps.is_empty() {
            result.push(SerialArchive { serial, dumps });
        }
    }

    result.sort_by(|a, b| a.serial.cmp(&b.serial));
    result
}

fn delete_dump_files(bin_path: &str) -> Result<(), String> {
    let bin = std::path::Path::new(bin_path);
    if !bin.exists() {
        return Err(format!("file not found: {}", bin_path));
    }
    std::fs::remove_file(bin).map_err(|e| e.to_string())?;
    let json = bin.with_extension("json");
    if json.exists() {
        std::fs::remove_file(json).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Resolve `path` to a canonical absolute path and verify it lives inside `dir`.
/// Prevents a compromised frontend from passing `../../etc/passwd`-style paths
/// to destructive commands — the candidate is canonicalized (following
/// symlinks) and required to start with the canonical archive root. If the
/// target itself doesn't exist yet, its parent is canonicalized and the file
/// name re-joined, so deletion of a just-listed file still works.
fn ensure_within_dir(path: &str, dir: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let candidate = std::path::Path::new(path);
    if !candidate.is_absolute() {
        return Err(format!(
            "Pfad '{}' muss absolut sein und innerhalb des Archivs liegen", path
        ));
    }
    let canonical = if candidate.exists() {
        candidate.canonicalize().map_err(|e| e.to_string())?
    } else {
        let parent = candidate.parent()
            .filter(|p| !p.as_os_str().is_empty())
            .ok_or_else(|| format!("Ungültiger Pfad: '{}'", path))?;
        let canon_parent = parent.canonicalize()
            .map_err(|e| format!("Verzeichnis '{}' nicht auflösbar: {}", parent.display(), e))?;
        let file_name = candidate.file_name()
            .ok_or_else(|| format!("Ungültiger Dateiname in '{}'", path))?;
        canon_parent.join(file_name)
    };
    let canon_dir = dir.canonicalize()
        .map_err(|e| format!("Archiv-Verzeichnis nicht auflösbar: {}", e))?;
    if canonical.starts_with(&canon_dir) {
        Ok(canonical)
    } else {
        Err(format!(
            "Pfad '{}' liegt außerhalb des Archivs '{}' — Löschen verweigert.",
            path, canon_dir.display()
        ))
    }
}

#[tauri::command]
pub fn archive_list_dumps(app: AppHandle) -> Result<Vec<SerialArchive>, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let settings = crate::settings::load_settings_or_default(&app);
    let dumps_dir = crate::settings::resolve_archive_base(&settings, &data_dir).join("dumps");
    Ok(list_dumps_from_dir(&dumps_dir))
}

#[tauri::command]
pub fn archive_delete_dump(bin_path: String, app: AppHandle) -> Result<(), String> {
    // Defense-in-depth: a compromised webview could invoke this with an
    // arbitrary path and delete files outside the archive. Resolve the archive
    // root from settings and refuse anything that doesn't canonicalize inside it.
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let settings = crate::settings::load_settings_or_default(&app);
    let dumps_dir = crate::settings::resolve_archive_base(&settings, &data_dir).join("dumps");
    let safe = ensure_within_dir(&bin_path, &dumps_dir)?;
    delete_dump_files(&safe.to_string_lossy())
}

#[derive(Serialize, Clone)]
pub struct FlashPreviewResult {
    pub path:       String,
    pub size_bytes: usize,
    pub validation: NorValidation,
    pub nvs:        Option<NvsData>,
}

#[tauri::command]
pub fn flash_validate_file(path: String) -> Result<FlashPreviewResult, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let validation = nor::validate(&bytes);
    let nvs        = nor::parse_nvs(&bytes);
    Ok(FlashPreviewResult {
        path,
        size_bytes: bytes.len(),
        validation,
        nvs,
    })
}

#[cfg(test)]
mod archive_tests {
    use super::*;

    #[test]
    fn delete_dump_missing_file_returns_err() {
        let result = delete_dump_files("/tmp/fixplay_nonexistent_12345.bin");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("file not found"));
    }

    #[test]
    fn delete_dump_removes_bin_and_json() {
        let dir = std::env::temp_dir();
        let bin  = dir.join("fixplay_test_del.bin");
        let json = dir.join("fixplay_test_del.json");
        std::fs::write(&bin,  b"data").unwrap();
        std::fs::write(&json, b"{}").unwrap();
        assert!(delete_dump_files(bin.to_str().unwrap()).is_ok());
        assert!(!bin.exists());
        assert!(!json.exists());
    }

    #[test]
    fn list_dumps_from_empty_dir_returns_empty() {
        let dir = std::env::temp_dir().join("fixplay_test_empty_archive");
        std::fs::create_dir_all(&dir).unwrap();
        let result = list_dumps_from_dir(&dir);
        assert!(result.is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn list_dumps_from_dir_parses_metadata() {
        let dir        = std::env::temp_dir().join("fixplay_test_archive");
        let serial_dir = dir.join("AE12345678");
        std::fs::create_dir_all(&serial_dir).unwrap();

        let meta_json = r#"{
            "timestamp": 1718100000,
            "nvs": {
                "serial":       "AE12345678",
                "mac_address":  "AA:BB:CC:DD:EE:FF",
                "sku":          "CFI-1115A",
                "board_id":     "DIA-001",
                "console_type": 0,
                "fw_version":   "02.50.00.01"
            },
            "validation": {
                "size_ok": true, "header_ok": true, "mbr1_ok": true, "mbr2_ok": true,
                "emc_ipl_a_ok": true, "emc_ipl_b_ok": true,
                "usb_pdc_a_ok": true, "usb_pdc_b_ok": true
            },
            "size_bytes": 2097152
        }"#;

        std::fs::write(serial_dir.join("nor_1718100000.bin"),  b"dummy").unwrap();
        std::fs::write(serial_dir.join("nor_1718100000.json"), meta_json).unwrap();

        let archives = list_dumps_from_dir(&dir);
        assert_eq!(archives.len(), 1);
        assert_eq!(archives[0].serial, "AE12345678");
        assert_eq!(archives[0].dumps.len(), 1);
        assert!(archives[0].dumps[0].validation_ok);
        assert_eq!(archives[0].dumps[0].fw_version, Some("02.50.00.01".to_string()));
        assert_eq!(archives[0].dumps[0].timestamp, 1718100000);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn ensure_within_dir_accepts_nested_file() {
        let root   = std::env::temp_dir().join("fixplay_within_ok");
        let serial = root.join("SN1");
        std::fs::create_dir_all(&serial).unwrap();
        let bin = serial.join("nor_1.bin");
        std::fs::write(&bin, b"x").unwrap();
        let canon = ensure_within_dir(bin.to_str().unwrap(), &root).unwrap();
        assert!(canon.starts_with(root.canonicalize().unwrap()));
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn ensure_within_dir_rejects_relative() {
        let root = std::env::temp_dir().join("fixplay_within_rel");
        std::fs::create_dir_all(&root).unwrap();
        let err = ensure_within_dir("nor_1.bin", &root).unwrap_err();
        assert!(err.contains("absolut"));
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn ensure_within_dir_rejects_escape() {
        // A path inside the temp dir must be rejected when the archive root
        // is a *sibling* directory — simulates ../../ traversal.
        let root   = std::env::temp_dir().join("fixplay_within_arch");
        let outside = std::env::temp_dir().join("fixplay_within_other");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        let bin = outside.join("secret.bin");
        std::fs::write(&bin, b"x").unwrap();
        let res = ensure_within_dir(bin.to_str().unwrap(), &root);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("außerhalb"));
        std::fs::remove_dir_all(&root).ok();
        std::fs::remove_dir_all(&outside).ok();
    }
}

#[cfg(test)]
mod validate_tests {
    use super::*;

    #[test]
    fn validate_nonexistent_file_returns_err() {
        let result = flash_validate_file("/tmp/fixplay_no_such_file_abc123.bin".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn validate_existing_file_returns_correct_size() {
        let path = std::env::temp_dir().join("fixplay_test_validate_size.bin");
        std::fs::write(&path, vec![0u8; 2097152]).unwrap();
        let result = flash_validate_file(path.to_str().unwrap().to_string()).unwrap();
        assert_eq!(result.size_bytes, 2097152);
        assert_eq!(result.path, path.to_str().unwrap());
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn validate_small_file_reports_size_not_ok() {
        let path = std::env::temp_dir().join("fixplay_test_validate_small.bin");
        std::fs::write(&path, vec![0u8; 1024]).unwrap();
        let result = flash_validate_file(path.to_str().unwrap().to_string()).unwrap();
        assert!(!result.validation.size_ok);
        assert_eq!(result.size_bytes, 1024);
        std::fs::remove_file(&path).ok();
    }
}

#[cfg(test)]
mod verify_tests {
    use super::count_diff_bytes;

    #[test]
    fn verify_counts_differing_bytes() {
        let written:   Vec<u8> = vec![0x00, 0x01, 0x02, 0x03];
        let read_back: Vec<u8> = vec![0x00, 0xFF, 0x02, 0xFF];
        assert_eq!(count_diff_bytes(&written, &read_back), 2);
    }

    #[test]
    fn verify_passes_when_identical() {
        let written:   Vec<u8> = vec![0xAA, 0xBB];
        let read_back: Vec<u8> = vec![0xAA, 0xBB];
        assert_eq!(count_diff_bytes(&written, &read_back), 0);
    }

    #[test]
    fn verify_counts_length_mismatch_as_diff() {
        // truncated read-back: prefix matches but 2 bytes are missing
        let written:   Vec<u8> = vec![0x00, 0x01, 0x02, 0x03];
        let read_back: Vec<u8> = vec![0x00, 0x01];
        assert_eq!(count_diff_bytes(&written, &read_back), 2);
    }
}
