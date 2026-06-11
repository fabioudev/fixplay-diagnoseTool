# Settings Panel — Design Spec

## Overview

A gear-icon-triggered slide-in panel that lets the user configure three currently-hardcoded values: the flashrom binary path, the NOR dump archive directory, and the UART baud rate. Settings are persisted to `app_data_dir/settings.json` and auto-saved on field blur.

---

## Backend

### New module: `src-tauri/src/settings.rs`

Owns the `AppSettings` struct and the two file I/O helpers used by both commands and existing flash/uart commands.

```rust
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct AppSettings {
    pub flashrom_path: Option<String>,  // None → use bundled binary
    pub archive_dir:   Option<String>,  // None → app_data_dir default
    pub baud_rate:     u32,             // default 115200
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            flashrom_path: None,
            archive_dir:   None,
            baud_rate:     115200,
        }
    }
}

pub fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("settings.json"))
}

pub fn load_settings(app: &tauri::AppHandle) -> AppSettings {
    settings_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_settings(app: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}
```

### New commands: `src-tauri/src/commands/settings.rs`

```rust
#[tauri::command]
pub fn settings_get(app: tauri::AppHandle) -> AppSettings {
    crate::settings::load_settings(&app)
}

#[tauri::command]
pub fn settings_save(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    crate::settings::save_settings(&app, &settings)
}
```

Both registered in `src-tauri/src/lib.rs` invoke handler.

### Integration into existing commands

`flash_read` and `flash_write` currently call `flashrom_path(&resource_dir)` and `app.path().app_data_dir()` directly. After this change:

- If `settings.flashrom_path` is `Some(p)`, use `PathBuf::from(p)` instead of the bundled path.
- If `settings.archive_dir` is `Some(d)`, use `PathBuf::from(d)` as the archive base instead of `app_data_dir`.

`uart_connect` currently hardcodes `115200`. After this change it calls `load_settings(&app)` and passes `settings.baud_rate` to `serialport::new`.

---

## Frontend types

**File:** `src/lib/api/types.ts`

```ts
export interface AppSettings {
  flashrom_path: string | null;
  archive_dir:   string | null;
  baud_rate:     number;
}
```

---

## API wrappers

**File:** `src/lib/api/tauri.ts`

```ts
export const settingsGet  = ()                      => invoke<AppSettings>('settings_get');
export const settingsSave = (settings: AppSettings) => invoke<void>('settings_save', { settings });
```

---

## Store

**File:** `src/lib/stores/settings.ts`

```ts
import { writable } from 'svelte/store';
import type { AppSettings } from '$lib/api/types';

export const appSettings = writable<AppSettings>({
  flashrom_path: null,
  archive_dir:   null,
  baud_rate:     115200,
});
```

Loaded once in `SettingsPanel.svelte` on mount via `settingsGet()`.

---

## SettingsPanel component

**File:** `src/lib/components/SettingsPanel.svelte`

### Behaviour

- Receives a boolean `open` prop and an `onclose` callback.
- When `open` is true: panel slides in from the right (`translate-x-0`), backdrop appears.
- Clicking the backdrop or the ✕ button calls `onclose`.
- On mount: calls `settingsGet()`, sets `appSettings` store.
- Each field saves on `blur`: calls `settingsSave($appSettings)`.

### Fields

| Label | Input | Notes |
|-------|-------|-------|
| Flashrom Binary | `<input type="text">` + "Durchsuchen" file-dialog button | Placeholder: `(gebundelt)` |
| Archiv-Verzeichnis | `<input type="text">` + "Durchsuchen" folder-dialog button | Placeholder: OS app_data_dir |
| UART Baudrate | `<select>` | Options: 9600, 19200, 38400, 57600, 115200, 230400 |

The "Durchsuchen" buttons use `@tauri-apps/plugin-dialog` (`open` for file, `open` with `directory: true` for folder). The selected path is written into the store and `settingsSave` is called immediately after selection (no blur needed).

Baud rate `<select>` calls `settingsSave` on `change` (not blur, since selects don't blur the same way).

---

## Page integration

**File:** `src/routes/+page.svelte`

- Add `let settingsOpen = $state(false)`.
- Gear button (⚙) in the top-right of the header area, `onclick={() => settingsOpen = true}`.
- `<SettingsPanel open={settingsOpen} onclose={() => settingsOpen = false} />` at the bottom of the page.

---

## Files Summary

| Action | Path |
|--------|------|
| Create | `src-tauri/src/settings.rs` |
| Create | `src-tauri/src/commands/settings.rs` |
| Modify | `src-tauri/src/commands/mod.rs` |
| Modify | `src-tauri/src/commands/flash.rs` |
| Modify | `src-tauri/src/commands/uart.rs` |
| Modify | `src-tauri/src/lib.rs` |
| Modify | `src/lib/api/types.ts` |
| Modify | `src/lib/api/tauri.ts` |
| Create | `src/lib/stores/settings.ts` |
| Create | `src/lib/components/SettingsPanel.svelte` |
| Modify | `src/routes/+page.svelte` |
