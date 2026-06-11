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
