# Settings Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gear-icon-triggered slide-in settings panel that lets users configure the flashrom binary path, archive directory, and UART baud rate — all currently hardcoded.

**Architecture:** A new `settings.rs` module owns `AppSettings` (serde struct) and two pure helpers (`resolve_flashrom_path`, `resolve_archive_base`) that the existing flash/uart commands call. Two Tauri commands (`settings_get`, `settings_save`) handle persistence to `app_data_dir/settings.json`. On the frontend, a writable store holds the current settings; `SettingsPanel.svelte` loads on mount and auto-saves on field blur/change.

**Tech Stack:** Rust (serde_json), Tauri v2 (AppHandle, path API), SvelteKit + Svelte 5 (`$state`, `$props`), Tailwind CSS v4, `@tauri-apps/plugin-dialog`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src-tauri/src/settings.rs` | `AppSettings` struct, file I/O helpers, path resolvers |
| Create | `src-tauri/src/commands/settings.rs` | `settings_get` / `settings_save` Tauri commands |
| Modify | `src-tauri/src/commands/mod.rs` | expose `pub mod settings` |
| Modify | `src-tauri/src/commands/flash.rs` | use `resolve_flashrom_path` + `resolve_archive_base` |
| Modify | `src-tauri/src/commands/uart.rs` | use `settings.baud_rate` in `uart_connect` |
| Modify | `src-tauri/src/lib.rs` | register `settings_get`, `settings_save` in invoke_handler |
| Modify | `src/lib/api/types.ts` | add `AppSettings` interface |
| Modify | `src/lib/api/tauri.ts` | add `settingsGet` / `settingsSave` wrappers |
| Create | `src/lib/stores/settings.ts` | `appSettings` writable store |
| Create | `src/lib/stores/settings.test.ts` | store unit tests |
| Create | `src/lib/components/SettingsPanel.svelte` | slide-in panel UI |
| Modify | `src/routes/+page.svelte` | gear button + `<SettingsPanel>` |

---

## Task 1: Rust settings module + commands

**Files:**
- Create: `src-tauri/src/settings.rs`
- Create: `src-tauri/src/commands/settings.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing tests in `src-tauri/src/settings.rs`**

Create the file with tests only (struct and functions not yet implemented):

```rust
use fixplay_flashrom::flashrom_path;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct AppSettings {
    pub flashrom_path: Option<String>,
    pub archive_dir:   Option<String>,
    pub baud_rate:     u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self { flashrom_path: None, archive_dir: None, baud_rate: 115200 }
    }
}

pub fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    todo!()
}

pub fn load_settings(app: &tauri::AppHandle) -> AppSettings {
    todo!()
}

pub fn save_settings(app: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    todo!()
}

pub fn resolve_flashrom_path(settings: &AppSettings, resource_dir: &std::path::Path) -> std::path::PathBuf {
    todo!()
}

pub fn resolve_archive_base(settings: &AppSettings, default_data_dir: &std::path::Path) -> std::path::PathBuf {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_has_expected_values() {
        let s = AppSettings::default();
        assert_eq!(s.baud_rate, 115200);
        assert!(s.flashrom_path.is_none());
        assert!(s.archive_dir.is_none());
    }

    #[test]
    fn save_and_load_round_trips_via_json() {
        let settings = AppSettings {
            flashrom_path: Some("/usr/bin/flashrom".to_string()),
            archive_dir:   Some("/tmp/dumps".to_string()),
            baud_rate:     9600,
        };
        let json   = serde_json::to_string_pretty(&settings).unwrap();
        let loaded: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(loaded.baud_rate, 9600);
        assert_eq!(loaded.flashrom_path, Some("/usr/bin/flashrom".to_string()));
        assert_eq!(loaded.archive_dir,   Some("/tmp/dumps".to_string()));
    }

    #[test]
    fn deserialize_invalid_json_returns_none() {
        let result: Option<AppSettings> = serde_json::from_str("NOT_VALID").ok();
        assert!(result.is_none());
        let fallback = result.unwrap_or_default();
        assert_eq!(fallback.baud_rate, 115200);
    }

    #[test]
    fn resolve_flashrom_path_uses_custom_when_some() {
        let s = AppSettings {
            flashrom_path: Some("/custom/flashrom".to_string()),
            ..Default::default()
        };
        let path = resolve_flashrom_path(&s, std::path::Path::new("/res"));
        assert_eq!(path, std::path::PathBuf::from("/custom/flashrom"));
    }

    #[test]
    fn resolve_flashrom_path_uses_bundled_when_none() {
        let s    = AppSettings::default();
        let path = resolve_flashrom_path(&s, std::path::Path::new("/res"));
        assert!(path.starts_with("/res"));
    }

    #[test]
    fn resolve_archive_base_uses_custom_when_some() {
        let s = AppSettings {
            archive_dir: Some("/custom/archive".to_string()),
            ..Default::default()
        };
        let base = resolve_archive_base(&s, std::path::Path::new("/default"));
        assert_eq!(base, std::path::PathBuf::from("/custom/archive"));
    }

    #[test]
    fn resolve_archive_base_uses_default_when_none() {
        let s    = AppSettings::default();
        let base = resolve_archive_base(&s, std::path::Path::new("/default"));
        assert_eq!(base, std::path::PathBuf::from("/default"));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src-tauri && cargo test settings -- --nocapture 2>&1 | tail -20
```

Expected: compilation error because `todo!()` panics / functions are stubs. That's fine — the structs + `Default` compile, but tests calling `resolve_*` will panic at runtime. Tests for `default_settings_has_expected_values`, `save_and_load_round_trips_via_json`, and `deserialize_invalid_json_returns_none` should pass (they don't call `todo!()` stubs). The `resolve_*` tests will panic.

- [ ] **Step 3: Implement all functions in `src-tauri/src/settings.rs`**

Replace the `todo!()` stubs with:

```rust
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

pub fn resolve_flashrom_path(settings: &AppSettings, resource_dir: &std::path::Path) -> std::path::PathBuf {
    settings.flashrom_path.as_ref()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| flashrom_path(resource_dir))
}

pub fn resolve_archive_base(settings: &AppSettings, default_data_dir: &std::path::Path) -> std::path::PathBuf {
    settings.archive_dir.as_ref()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| default_data_dir.to_path_buf())
}
```

- [ ] **Step 4: Create `src-tauri/src/commands/settings.rs`**

```rust
use crate::settings::{load_settings, save_settings, AppSettings};
use tauri::AppHandle;

#[tauri::command]
pub fn settings_get(app: AppHandle) -> AppSettings {
    load_settings(&app)
}

#[tauri::command]
pub fn settings_save(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    save_settings(&app, &settings)
}
```

- [ ] **Step 5: Register in `src-tauri/src/commands/mod.rs`**

Add `pub mod settings;` to the existing list:

```rust
pub mod flash;
pub mod settings;
pub mod uart;
```

- [ ] **Step 6: Register module and commands in `src-tauri/src/lib.rs`**

Add `mod settings;` near the top (after `mod state;`):

```rust
mod commands;
mod settings;
mod state;
```

Add the two commands to the invoke_handler (after `commands::uart::uart_search_error_db`):

```rust
commands::settings::settings_get,
commands::settings::settings_save,
```

- [ ] **Step 7: Run all tests to verify they pass**

```bash
cd src-tauri && cargo test settings -- --nocapture 2>&1 | tail -20
```

Expected: all 7 settings tests PASS.

```bash
cd src-tauri && cargo test 2>&1 | tail -10
```

Expected: full test suite passes, no regressions.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/settings.rs src-tauri/src/commands/settings.rs \
        src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(tauri): add settings module with get/save commands and path resolvers"
```

---

## Task 2: Integrate settings into flash and uart commands

**Files:**
- Modify: `src-tauri/src/commands/flash.rs`
- Modify: `src-tauri/src/commands/uart.rs`

The tests for this task verify that the resolver functions (already tested in Task 1) are wired correctly. Since `flash_read` / `flash_write` / `uart_connect` require `AppHandle` (not mockable in unit tests), we verify integration by checking the code compiles and existing archive tests still pass.

- [ ] **Step 1: Update `flash_read` in `src-tauri/src/commands/flash.rs`**

Replace the hardcoded flashrom path lines. Find (lines ~44–48):

```rust
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let device = FlashromDevice {
        programmer: programmer.clone(),
        binary_path: flashrom_path(&resource_dir),
    };
```

Replace with:

```rust
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let settings     = crate::settings::load_settings(&app);
    let device = FlashromDevice {
        programmer:  programmer.clone(),
        binary_path: crate::settings::resolve_flashrom_path(&settings, &resource_dir),
    };
```

- [ ] **Step 2: Update `archive_dump` in `src-tauri/src/commands/flash.rs` to use configurable archive dir**

`archive_dump` currently does:
```rust
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("dumps")
        .join(&serial_dir);
```

Replace with:

```rust
    let data_dir  = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let settings  = crate::settings::load_settings(app);
    let base = crate::settings::resolve_archive_base(&settings, &data_dir)
        .join("dumps")
        .join(&serial_dir);
```

- [ ] **Step 3: Update `flash_write` in `src-tauri/src/commands/flash.rs`**

Find (lines ~118–122):

```rust
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let device = FlashromDevice {
        programmer: programmer.clone(),
        binary_path: flashrom_path(&resource_dir),
    };
```

Replace with:

```rust
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let settings     = crate::settings::load_settings(&app);
    let device = FlashromDevice {
        programmer:  programmer.clone(),
        binary_path: crate::settings::resolve_flashrom_path(&settings, &resource_dir),
    };
```

- [ ] **Step 4: Update `archive_list_dumps` in `src-tauri/src/commands/flash.rs`**

Replace:

```rust
#[tauri::command]
pub fn archive_list_dumps(app: AppHandle) -> Result<Vec<SerialArchive>, String> {
    let dumps_dir = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("dumps");
    Ok(list_dumps_from_dir(&dumps_dir))
}
```

With:

```rust
#[tauri::command]
pub fn archive_list_dumps(app: AppHandle) -> Result<Vec<SerialArchive>, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let settings = crate::settings::load_settings(&app);
    let dumps_dir = crate::settings::resolve_archive_base(&settings, &data_dir).join("dumps");
    Ok(list_dumps_from_dir(&dumps_dir))
}
```

- [ ] **Step 5: Update `uart_connect` in `src-tauri/src/commands/uart.rs`**

Find (line ~52):

```rust
    let open_port = serialport::new(&port, 115200)
```

Replace with:

```rust
    let baud_rate = crate::settings::load_settings(&app).baud_rate;
    let open_port = serialport::new(&port, baud_rate)
```

`uart_connect` already has `app: AppHandle` as a parameter, so no signature change is needed.

- [ ] **Step 6: Remove unused import in `flash.rs` if `flashrom_path` is no longer directly used**

Check if `flashrom_path` is still imported at the top of `flash.rs`:

```rust
use fixplay_flashrom::{flashrom_path, FlashromDevice};
```

Since `resolve_flashrom_path` in `settings.rs` calls `flashrom_path` internally, `flash.rs` no longer needs to import it directly. Change to:

```rust
use fixplay_flashrom::FlashromDevice;
```

Run `cargo clippy` to confirm no unused import warnings.

- [ ] **Step 7: Build and run tests**

```bash
cd src-tauri && cargo build 2>&1 | tail -20
```

Expected: compiles without errors.

```bash
cd src-tauri && cargo test 2>&1 | tail -10
```

Expected: all existing tests pass (archive tests, validate tests, settings tests).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/commands/flash.rs src-tauri/src/commands/uart.rs
git commit -m "feat(tauri): wire settings into flash and uart commands"
```

---

## Task 3: Frontend — types, API wrappers, store, tests

**Files:**
- Modify: `src/lib/api/types.ts`
- Modify: `src/lib/api/tauri.ts`
- Create: `src/lib/stores/settings.ts`
- Create: `src/lib/stores/settings.test.ts`

- [ ] **Step 1: Write failing test in `src/lib/stores/settings.test.ts`**

```ts
import { get } from 'svelte/store';
import { describe, it, expect, beforeEach } from 'vitest';
import { appSettings } from './settings';

describe('appSettings store', () => {
  beforeEach(() => {
    appSettings.set({ flashrom_path: null, archive_dir: null, baud_rate: 115200 });
  });

  it('starts with null paths and 115200 baud', () => {
    const s = get(appSettings);
    expect(s.flashrom_path).toBeNull();
    expect(s.archive_dir).toBeNull();
    expect(s.baud_rate).toBe(115200);
  });

  it('can update baud_rate', () => {
    appSettings.update(s => ({ ...s, baud_rate: 9600 }));
    expect(get(appSettings).baud_rate).toBe(9600);
  });

  it('can update flashrom_path', () => {
    appSettings.update(s => ({ ...s, flashrom_path: '/usr/bin/flashrom' }));
    expect(get(appSettings).flashrom_path).toBe('/usr/bin/flashrom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- settings 2>&1 | tail -15
```

Expected: FAIL — `Cannot find module './settings'`

- [ ] **Step 3: Add `AppSettings` to `src/lib/api/types.ts`**

Append to the end of the file:

```ts
export interface AppSettings {
  flashrom_path: string | null;
  archive_dir:   string | null;
  baud_rate:     number;
}
```

- [ ] **Step 4: Add API wrappers to `src/lib/api/tauri.ts`**

Add the import of `AppSettings` in the existing import line at the top:

```ts
import type { DeviceInfo, FlashReadResult, SerialArchive, ErrorSearchResult, FlashPreviewResult, AppSettings } from './types';
```

Append to the end of the file:

```ts
export const settingsGet  = ()                       => invoke<AppSettings>('settings_get');
export const settingsSave = (settings: AppSettings)  => invoke<void>('settings_save', { settings });
```

- [ ] **Step 5: Create `src/lib/stores/settings.ts`**

```ts
import { writable } from 'svelte/store';
import type { AppSettings } from '$lib/api/types';

export const appSettings = writable<AppSettings>({
  flashrom_path: null,
  archive_dir:   null,
  baud_rate:     115200,
});
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm run test -- settings 2>&1 | tail -15
```

Expected: 3 tests PASS.

```bash
npm run test 2>&1 | tail -10
```

Expected: full suite passes, no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/lib/api/types.ts src/lib/api/tauri.ts \
        src/lib/stores/settings.ts src/lib/stores/settings.test.ts
git commit -m "feat(frontend): add AppSettings type, settingsGet/Save API, and appSettings store"
```

---

## Task 4: SettingsPanel component + page integration

**Files:**
- Create: `src/lib/components/SettingsPanel.svelte`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Create `src/lib/components/SettingsPanel.svelte`**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { open as openDialog } from '@tauri-apps/plugin-dialog';
  import { appSettings } from '$lib/stores/settings';
  import { settingsGet, settingsSave } from '$lib/api/tauri';

  let { open, onclose }: { open: boolean; onclose: () => void } = $props();

  const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400];

  onMount(async () => {
    const s = await settingsGet().catch(() => null);
    if (s) appSettings.set(s);
  });

  async function save() {
    await settingsSave($appSettings).catch(console.error);
  }

  async function browseFlashrom() {
    const result = await openDialog({ title: 'Flashrom Binary wählen' });
    if (result && typeof result === 'string') {
      appSettings.update(s => ({ ...s, flashrom_path: result }));
      await save();
    }
  }

  async function browseArchiveDir() {
    const result = await openDialog({ title: 'Archiv-Verzeichnis wählen', directory: true });
    if (result && typeof result === 'string') {
      appSettings.update(s => ({ ...s, archive_dir: result }));
      await save();
    }
  }
</script>

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/50 z-40"
    role="presentation"
    onclick={onclose}
  ></div>

  <!-- Panel -->
  <div class="fixed top-0 right-0 h-full w-80 bg-gray-900 border-l border-gray-700
              shadow-xl z-50 flex flex-col">
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
      <h2 class="text-sm font-semibold text-gray-100">Einstellungen</h2>
      <button
        onclick={onclose}
        class="text-gray-400 hover:text-gray-200 text-lg leading-none"
      >✕</button>
    </div>

    <div class="flex flex-col gap-6 p-4 overflow-y-auto flex-1">

      <!-- Flashrom Binary -->
      <div class="flex flex-col gap-1.5">
        <label class="text-xs font-medium text-gray-400">Flashrom Binary</label>
        <div class="flex gap-1">
          <input
            type="text"
            placeholder="(gebundelt)"
            value={$appSettings.flashrom_path ?? ''}
            oninput={(e) => appSettings.update(s => ({ ...s, flashrom_path: (e.target as HTMLInputElement).value || null }))}
            onblur={save}
            class="flex-1 bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5
                   border border-gray-700 placeholder:text-gray-600
                   focus:outline-none focus:border-gray-500"
          />
          <button
            onclick={browseFlashrom}
            class="px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 shrink-0"
          >…</button>
        </div>
        <p class="text-xs text-gray-600">Leer lassen für die mitgelieferte Binary.</p>
      </div>

      <!-- Archive Directory -->
      <div class="flex flex-col gap-1.5">
        <label class="text-xs font-medium text-gray-400">Archiv-Verzeichnis</label>
        <div class="flex gap-1">
          <input
            type="text"
            placeholder="(Standard-App-Datenordner)"
            value={$appSettings.archive_dir ?? ''}
            oninput={(e) => appSettings.update(s => ({ ...s, archive_dir: (e.target as HTMLInputElement).value || null }))}
            onblur={save}
            class="flex-1 bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5
                   border border-gray-700 placeholder:text-gray-600
                   focus:outline-none focus:border-gray-500"
          />
          <button
            onclick={browseArchiveDir}
            class="px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 shrink-0"
          >…</button>
        </div>
        <p class="text-xs text-gray-600">Leer lassen für den Standard-Speicherort des OS.</p>
      </div>

      <!-- UART Baud Rate -->
      <div class="flex flex-col gap-1.5">
        <label class="text-xs font-medium text-gray-400">UART Baudrate</label>
        <select
          value={$appSettings.baud_rate}
          onchange={async (e) => {
            appSettings.update(s => ({ ...s, baud_rate: Number((e.target as HTMLSelectElement).value) }));
            await save();
          }}
          class="bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5
                 border border-gray-700 focus:outline-none focus:border-gray-500"
        >
          {#each BAUD_RATES as rate (rate)}
            <option value={rate}>{rate}</option>
          {/each}
        </select>
        <p class="text-xs text-gray-600">Wirkt beim nächsten UART-Verbindungsaufbau.</p>
      </div>

    </div>
  </div>
{/if}
```

- [ ] **Step 2: Update `src/routes/+page.svelte`**

Replace the entire file with:

```svelte
<script lang="ts">
  import FlashPanel from '$lib/components/FlashPanel.svelte';
  import ArchiveSection from '$lib/components/ArchiveSection.svelte';
  import UartPanel from '$lib/components/UartPanel.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';

  let activeTab     = $state<'flash' | 'uart'>('flash');
  let settingsOpen  = $state(false);

  const tabs = [
    { id: 'flash' as const, label: 'NOR Flash' },
    { id: 'uart'  as const, label: 'UART' },
  ];
</script>

<svelte:head>
  <title>fixplay diagnoseTool</title>
</svelte:head>

<main class="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
  <nav class="flex items-center border-b border-gray-800 px-4 pt-2 gap-1 shrink-0 bg-gray-900">
    {#each tabs as tab (tab.id)}
      <button
        onclick={() => (activeTab = tab.id)}
        class="px-4 py-2 text-sm font-medium rounded-t transition-colors {
          activeTab === tab.id
            ? 'border-b-2 border-blue-500 text-white bg-gray-950'
            : 'text-gray-400 hover:text-gray-200'
        }"
      >
        {tab.label}
      </button>
    {/each}

    <button
      onclick={() => (settingsOpen = true)}
      class="ml-auto mb-1 px-2 py-1 text-gray-500 hover:text-gray-300 text-base leading-none"
      title="Einstellungen"
    >⚙</button>
  </nav>

  <div class="flex-1 min-h-0 overflow-hidden">
    {#if activeTab === 'flash'}
      <div class="flex flex-col gap-4 h-full overflow-y-auto p-4">
        <FlashPanel />
        <ArchiveSection />
      </div>
    {/if}
    <div class="{activeTab === 'uart' ? 'flex h-full p-4' : 'hidden'}">
      <UartPanel />
    </div>
  </div>
</main>

<SettingsPanel open={settingsOpen} onclose={() => (settingsOpen = false)} />
```

- [ ] **Step 3: Run the full test suite**

```bash
npm run test 2>&1 | tail -10
```

Expected: all tests pass (settings store tests included).

```bash
cd src-tauri && cargo test 2>&1 | tail -10
```

Expected: all Rust tests pass.

- [ ] **Step 4: Build to verify no type errors**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/SettingsPanel.svelte src/routes/+page.svelte
git commit -m "feat(ui): add SettingsPanel with flashrom path, archive dir, and baud rate config"
```
