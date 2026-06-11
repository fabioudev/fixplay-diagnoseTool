use fixplay_core::{
    nor,
    types::{FlashProgress, FlashReadResult, NorValidation, NvsData},
};
use fixplay_flashrom::{flashrom_path, FlashromDevice};
use fixplay_core::traits::FlashDevice;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tracing::info;

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
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let device = FlashromDevice {
        programmer: programmer.clone(),
        binary_path: flashrom_path(&resource_dir),
    };

    emit_status(&app, "Erster Lesevorgang...", "info");
    info!("flash_read: first pass, programmer={}", programmer);

    let bytes1 = {
        let app_c  = app.clone();
        let dev    = device.clone();
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
        let dev   = device.clone();
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
    path: String,
    programmer: String,
    app: AppHandle,
) -> Result<(), String> {
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let device = FlashromDevice {
        programmer: programmer.clone(),
        binary_path: flashrom_path(&resource_dir),
    };

    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    emit_status(&app, "Schreibe NOR (Löschen + Schreiben + Verifizieren)...", "info");
    info!("flash_write: path={}, programmer={}", path, programmer);

    {
        let app_c = app.clone();
        let dev   = device.clone();
        tokio::task::spawn_blocking(move || {
            dev.write_flash(&data, &|p: FlashProgress| {
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

    emit_status(&app, "NOR erfolgreich geschrieben ✓", "info");
    Ok(())
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

    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
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

#[tauri::command]
pub fn archive_list_dumps(app: AppHandle) -> Result<Vec<SerialArchive>, String> {
    let dumps_dir = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("dumps");
    Ok(list_dumps_from_dir(&dumps_dir))
}

#[tauri::command]
pub fn archive_delete_dump(bin_path: String) -> Result<(), String> {
    delete_dump_files(&bin_path)
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
