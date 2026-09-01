# Tab System, Archive Browser & Error-DB UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tab-based navigation (NOR Flash / UART), a collapsible dump archive browser inside the Flash tab, and an error-code count badge + search field in the UART tab.

**Architecture:** Tab system is a pure `+page.svelte` rewrite. Archive browser adds two Rust commands (`archive_list_dumps`, `archive_delete_dump`) and a new `ArchiveSection.svelte` component that reacts to `$flashResult`. Error-DB UI adds `len`/`search` to `ErrorDb`, three new Tauri commands, and enhances `UartPanel.svelte` with a count badge and debounced search field.

**Tech Stack:** Svelte 5 (`$state`, `$derived`, `$effect`), Tailwind CSS v4, Tauri v2, `serde_json` for metadata parsing.

---

## File Map

| Action  | Path                                                              |
| ------- | ----------------------------------------------------------------- |
| Rewrite | `src/routes/+page.svelte`                                         |
| Modify  | `src/routes/+page.svelte` (again in Task 3 to add ArchiveSection) |
| Modify  | `src-tauri/src/commands/flash.rs`                                 |
| Modify  | `src-tauri/src/lib.rs`                                            |
| Modify  | `src/lib/api/types.ts`                                            |
| Modify  | `src/lib/stores/flash.ts`                                         |
| Modify  | `src/lib/api/tauri.ts`                                            |
| Create  | `src/lib/components/ArchiveSection.svelte`                        |
| Modify  | `src/lib/components/FlashPanel.svelte`                            |
| Modify  | `crates/fixplay-uart/src/error_db.rs`                             |
| Modify  | `src-tauri/src/commands/uart.rs`                                  |
| Modify  | `src/lib/stores/uart.ts`                                          |
| Modify  | `src/lib/components/UartPanel.svelte`                             |

---

## Task 1: Tab system

**Files:**

- Rewrite: `src/routes/+page.svelte`

- [ ] **Step 1: Rewrite `src/routes/+page.svelte`**

Replace the entire file:

```svelte
<script lang="ts">
  import FlashPanel from '$lib/components/FlashPanel.svelte';
  import UartPanel from '$lib/components/UartPanel.svelte';

  let activeTab = $state<'flash' | 'uart'>('flash');

  const tabs = [
    { id: 'flash' as const, label: 'NOR Flash' },
    { id: 'uart' as const, label: 'UART' },
  ];
</script>

<svelte:head>
  <title>fixplay diagnoseTool</title>
</svelte:head>

<main class="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
  <nav class="flex border-b border-gray-800 px-4 pt-2 gap-1 shrink-0 bg-gray-900">
    {#each tabs as tab}
      <button
        onclick={() => (activeTab = tab.id)}
        class="px-4 py-2 text-sm font-medium rounded-t transition-colors {activeTab === tab.id
          ? 'border-b-2 border-blue-500 text-white bg-gray-950'
          : 'text-gray-400 hover:text-gray-200'}"
      >
        {tab.label}
      </button>
    {/each}
  </nav>

  <div class="flex-1 min-h-0 overflow-hidden">
    {#if activeTab === 'flash'}
      <div class="flex flex-col gap-4 h-full overflow-y-auto p-4">
        <FlashPanel />
      </div>
    {/if}
    <div class={activeTab === 'uart' ? 'flex h-full p-4' : 'hidden'}>
      <UartPanel />
    </div>
  </div>
</main>
```

- [ ] **Step 2: Run type check**

```bash
npm run check
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Run tests**

```bash
npm run test -- --run
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat(ui): replace side-by-side layout with NOR Flash / UART tab system"
```

---

## Task 2: Archive Rust backend

**Files:**

- Modify: `src-tauri/src/commands/flash.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing tests at the bottom of `src-tauri/src/commands/flash.rs`**

Append this `#[cfg(test)]` block to the file (after all existing code):

```rust
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
/usr/bin/cargo test -p fixplay-tauri archive_tests 2>&1 | tail -10
```

Expected: FAIL — `delete_dump_files` and `list_dumps_from_dir` not defined.

- [ ] **Step 3: Add structs and helpers to `src-tauri/src/commands/flash.rs`**

Read the current file first. Add these new items after the existing `archive_dump` function (before the closing of the file, before any existing `#[cfg(test)]` block):

```rust
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

        dumps.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
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
```

- [ ] **Step 4: Register new commands in `src-tauri/src/lib.rs`**

In the `invoke_handler!` macro, add after `commands::flash::flash_write,`:

```rust
commands::flash::archive_list_dumps,
commands::flash::archive_delete_dump,
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
/usr/bin/cargo test -p fixplay-tauri archive_tests
```

Expected: 4 tests pass.

- [ ] **Step 6: Run full workspace tests + clippy**

```bash
/usr/bin/cargo test --workspace && /usr/bin/cargo clippy --workspace -- -D warnings
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/flash.rs src-tauri/src/lib.rs
git commit -m "feat(tauri): add archive_list_dumps and archive_delete_dump commands"
```

---

## Task 3: Archive frontend

**Files:**

- Modify: `src/lib/api/types.ts`
- Modify: `src/lib/stores/flash.ts`
- Modify: `src/lib/api/tauri.ts`
- Create: `src/lib/components/ArchiveSection.svelte`
- Modify: `src/lib/components/FlashPanel.svelte`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Append archive types to `src/lib/api/types.ts`**

Read the current file. Append after the last line:

```ts
export interface DumpEntry {
  bin_path: string;
  timestamp: number;
  size_bytes: number;
  validation_ok: boolean;
  fw_version: string | null;
  serial: string;
}

export interface SerialArchive {
  serial: string;
  dumps: DumpEntry[];
}
```

- [ ] **Step 2: Add `flashWritePath` store to `src/lib/stores/flash.ts`**

Read the current file. Append after the `flashProgrammer` line:

```ts
export const flashWritePath = writable<string | null>(null);
```

- [ ] **Step 3: Add archive API wrappers to `src/lib/api/tauri.ts`**

Read the current file. Add `SerialArchive` to the existing import type line (it currently imports `DeviceInfo` and `FlashReadResult`). Then append at the bottom:

```ts
export const archiveListDumps = () => invoke<SerialArchive[]>('archive_list_dumps');
export const archiveDeleteDump = (binPath: string) =>
  invoke<void>('archive_delete_dump', { binPath });
```

The import type line should become:

```ts
import type { DeviceInfo, FlashReadResult, SerialArchive } from './types';
```

- [ ] **Step 4: Create `src/lib/components/ArchiveSection.svelte`**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { flashResult, flashWritePath } from '$lib/stores/flash';
  import { archiveListDumps, archiveDeleteDump, openPath } from '$lib/api/tauri';
  import type { SerialArchive, DumpEntry } from '$lib/api/types';

  let open = $state(false);
  let archives = $state<SerialArchive[]>([]);
  let loading = $state(false);
  let confirmDelete = $state<string | null>(null);
  let loadedPath = $state<string | null>(null);

  const totalDumps = $derived(archives.reduce((n, a) => n + a.dumps.length, 0));

  async function load() {
    loading = true;
    try {
      archives = await archiveListDumps();
    } catch {
      archives = [];
    } finally {
      loading = false;
    }
  }

  async function handleDelete(binPath: string) {
    if (confirmDelete !== binPath) {
      confirmDelete = binPath;
      return;
    }
    confirmDelete = null;
    await archiveDeleteDump(binPath).catch(console.error);
    await load();
  }

  function handleLoad(entry: DumpEntry) {
    flashWritePath.set(entry.bin_path);
    loadedPath = entry.bin_path;
    setTimeout(() => {
      if (loadedPath === entry.bin_path) loadedPath = null;
    }, 2000);
  }

  function folderPath(binPath: string): string {
    return binPath.replace(/[/\\][^/\\]+$/, '');
  }

  onMount(load);

  $effect(() => {
    if ($flashResult !== null) load();
  });
</script>

<div class="bg-gray-900 rounded-lg border border-gray-800">
  <button
    onclick={() => (open = !open)}
    class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium
           text-gray-300 hover:text-gray-100 transition-colors"
  >
    <span>Archiv {loading ? '…' : `(${totalDumps} Dump${totalDumps !== 1 ? 's' : ''})`}</span>
    <span class="text-gray-500 text-xs">{open ? '▲' : '▼'}</span>
  </button>

  {#if open}
    <div class="border-t border-gray-800">
      {#each archives as archive}
        <div class="p-3 border-b border-gray-800 last:border-0">
          <p class="text-xs font-semibold text-gray-400 mb-2 font-mono">{archive.serial}</p>
          <div class="flex flex-col gap-1.5">
            {#each archive.dumps as dump (dump.bin_path)}
              <div
                class="flex items-center gap-2 text-xs bg-gray-800 rounded px-2 py-1.5 flex-wrap"
              >
                <span class="font-mono text-gray-500 shrink-0">
                  {new Date(dump.timestamp * 1000).toLocaleString()}
                </span>
                <span class="font-mono text-gray-300 shrink-0">{dump.fw_version ?? '—'}</span>
                <span class="{dump.validation_ok ? 'text-green-400' : 'text-red-400'} shrink-0">
                  {dump.validation_ok ? '✓ OK' : '✗ Korrupt'}
                </span>
                <div class="flex items-center gap-1 ml-auto shrink-0">
                  <button
                    onclick={() => handleLoad(dump)}
                    class="px-2 py-0.5 rounded text-blue-100 {loadedPath === dump.bin_path
                      ? 'bg-green-700'
                      : 'bg-blue-800 hover:bg-blue-700'}"
                  >
                    {loadedPath === dump.bin_path ? 'Geladen ✓' : 'Laden'}
                  </button>
                  <button
                    onclick={() => openPath(folderPath(dump.bin_path))}
                    class="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                  >
                    Ordner
                  </button>
                  {#if confirmDelete === dump.bin_path}
                    <button
                      onclick={() => handleDelete(dump.bin_path)}
                      class="px-2 py-0.5 rounded bg-red-700 hover:bg-red-600 text-white"
                    >
                      Bestätigen
                    </button>
                    <button
                      onclick={() => (confirmDelete = null)}
                      class="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
                    >
                      ✕
                    </button>
                  {:else}
                    <button
                      onclick={() => handleDelete(dump.bin_path)}
                      class="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-red-300"
                    >
                      Löschen
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <p class="text-gray-600 text-xs p-4">Keine Dumps archiviert.</p>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 5: Update `handleWrite` in `src/lib/components/FlashPanel.svelte`**

Read the current file. The `handleWrite` function currently starts at line 72. Replace it:

```ts
async function handleWrite() {
  const storedPath = $flashWritePath;
  let selected: string;

  if (storedPath) {
    selected = storedPath;
    flashWritePath.set(null);
  } else {
    const result = await openDialog({
      title: 'NOR-Datei wählen',
      filters: [{ name: 'NOR Binary', extensions: ['bin'] }],
    });
    if (!result || typeof result !== 'string') return;
    selected = result;
  }

  flashBusy.set(true);
  flashLog.set([]);
  flashProgress.set(null);
  try {
    await flashWrite(selected, $flashProgrammer);
  } catch (e: unknown) {
    flashLog.update((log) => [
      { id: nextFlashLogId(), timestamp_ms: Date.now(), message: String(e), level: 'error' },
      ...log,
    ]);
  } finally {
    flashBusy.set(false);
    flashProgress.set(null);
  }
}
```

Also update the imports line in the `<script>` tag. Change:

```ts
import {
  flashBusy,
  flashProgress,
  flashResult,
  flashLog,
  flashProgrammer,
  nextFlashLogId,
} from '$lib/stores/flash';
```

to:

```ts
import {
  flashBusy,
  flashProgress,
  flashResult,
  flashLog,
  flashProgrammer,
  flashWritePath,
  nextFlashLogId,
} from '$lib/stores/flash';
```

- [ ] **Step 6: Update `src/routes/+page.svelte` to add ArchiveSection**

Read the current file. Replace the entire file:

```svelte
<script lang="ts">
  import FlashPanel from '$lib/components/FlashPanel.svelte';
  import ArchiveSection from '$lib/components/ArchiveSection.svelte';
  import UartPanel from '$lib/components/UartPanel.svelte';

  let activeTab = $state<'flash' | 'uart'>('flash');

  const tabs = [
    { id: 'flash' as const, label: 'NOR Flash' },
    { id: 'uart' as const, label: 'UART' },
  ];
</script>

<svelte:head>
  <title>fixplay diagnoseTool</title>
</svelte:head>

<main class="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
  <nav class="flex border-b border-gray-800 px-4 pt-2 gap-1 shrink-0 bg-gray-900">
    {#each tabs as tab}
      <button
        onclick={() => (activeTab = tab.id)}
        class="px-4 py-2 text-sm font-medium rounded-t transition-colors {activeTab === tab.id
          ? 'border-b-2 border-blue-500 text-white bg-gray-950'
          : 'text-gray-400 hover:text-gray-200'}"
      >
        {tab.label}
      </button>
    {/each}
  </nav>

  <div class="flex-1 min-h-0 overflow-hidden">
    {#if activeTab === 'flash'}
      <div class="flex flex-col gap-4 h-full overflow-y-auto p-4">
        <FlashPanel />
        <ArchiveSection />
      </div>
    {/if}
    <div class={activeTab === 'uart' ? 'flex h-full p-4' : 'hidden'}>
      <UartPanel />
    </div>
  </div>
</main>
```

- [ ] **Step 7: Run type check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 8: Run tests**

```bash
npm run test -- --run
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/api/types.ts src/lib/stores/flash.ts src/lib/api/tauri.ts \
        src/lib/components/ArchiveSection.svelte src/lib/components/FlashPanel.svelte \
        src/routes/+page.svelte
git commit -m "feat(frontend): add ArchiveSection with load/open/delete, flashWritePath store"
```

---

## Task 4: Error DB Rust

**Files:**

- Modify: `crates/fixplay-uart/src/error_db.rs`
- Modify: `src-tauri/src/commands/uart.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing tests in `crates/fixplay-uart/src/error_db.rs`**

The existing `#[cfg(test)]` block already has `SAMPLE_JSON`. Read the file. Add these tests inside the existing `mod tests { ... }` block, after the existing tests:

```rust
const SEARCH_SAMPLE_JSON: &str = r#"[
    {"Code": 1, "Description": "Alpha error first",  "Category": "System"},
    {"Code": 2, "Description": "Alpha error second", "Category": "System"},
    {"Code": 3, "Description": "Beta problem",       "Category": "Storage"}
]"#;

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
```

- [ ] **Step 2: Run tests to verify `len`, `is_empty`, `search` fail**

```bash
/usr/bin/cargo test -p fixplay-uart 2>&1 | tail -10
```

Expected: FAIL — methods not defined.

- [ ] **Step 3: Implement `len`, `is_empty`, `search` in `crates/fixplay-uart/src/error_db.rs`**

Read the current file. Add these methods inside the `impl ErrorDb { ... }` block, after the existing `load` method:

```rust
pub fn len(&self) -> usize {
    self.entries.len()
}

pub fn is_empty(&self) -> bool {
    self.entries.is_empty()
}

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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
/usr/bin/cargo test -p fixplay-uart
```

Expected: all tests pass (existing + 6 new).

- [ ] **Step 5: Add `ErrorSearchResult` struct and three new commands to `src-tauri/src/commands/uart.rs`**

Read the current file. After the existing `UartEntryPayload` struct (around line 21), add:

```rust
#[derive(Clone, Serialize)]
pub struct ErrorSearchResult {
    pub code:        u32,
    pub description: String,
    pub category:    String,
}
```

Then find `uart_update_error_db` and change its return type from `Result<(), String>` to `Result<usize, String>`. Replace the function:

```rust
#[tauri::command]
pub async fn uart_update_error_db(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<usize, String> {
    info!("uart_update_error_db invoked");
    let cache_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("error_codes.json");

    let db = tokio::task::spawn_blocking(move || {
        fixplay_uart::ErrorDb::fetch_and_cache(&cache_path)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    let count = db.len();
    *state.error_db.lock().unwrap() = Some(db);
    app.emit("uart://db_updated", ()).map_err(|e| e.to_string())?;
    Ok(count)
}
```

After `uart_update_error_db`, add the two new commands:

```rust
#[tauri::command]
pub fn uart_get_db_info(state: State<'_, AppState>) -> Result<Option<usize>, String> {
    Ok(state.error_db.lock().unwrap().as_ref().map(|db| db.len()))
}

#[tauri::command]
pub fn uart_search_error_db(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<ErrorSearchResult>, String> {
    let db_lock = state.error_db.lock().unwrap();
    let Some(db) = db_lock.as_ref() else { return Ok(vec![]) };

    let results = if let Ok(code) = query.trim().parse::<u32>() {
        db.lookup(code)
            .map(|e| vec![ErrorSearchResult {
                code:        e.code,
                description: e.description.clone(),
                category:    e.category.clone(),
            }])
            .unwrap_or_default()
    } else if query.trim().is_empty() {
        vec![]
    } else {
        db.search(&query, 20)
            .into_iter()
            .map(|e| ErrorSearchResult {
                code:        e.code,
                description: e.description.clone(),
                category:    e.category.clone(),
            })
            .collect()
    };

    Ok(results)
}
```

- [ ] **Step 6: Register new commands in `src-tauri/src/lib.rs`**

In the `invoke_handler!` macro, add after `commands::uart::uart_update_error_db,`:

```rust
commands::uart::uart_get_db_info,
commands::uart::uart_search_error_db,
```

- [ ] **Step 7: Build to verify compilation**

```bash
/usr/bin/cargo build --workspace
```

Expected: compiles without errors.

- [ ] **Step 8: Run full tests + clippy**

```bash
/usr/bin/cargo test --workspace && /usr/bin/cargo clippy --workspace -- -D warnings
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add crates/fixplay-uart/src/error_db.rs \
        src-tauri/src/commands/uart.rs \
        src-tauri/src/lib.rs
git commit -m "feat(uart): add ErrorDb::len/search, uart_get_db_info, uart_search_error_db commands"
```

---

## Task 5: Error DB frontend

**Files:**

- Modify: `src/lib/api/types.ts`
- Modify: `src/lib/stores/uart.ts`
- Modify: `src/lib/api/tauri.ts`
- Modify: `src/lib/components/UartPanel.svelte`

- [ ] **Step 1: Write failing tests in `src/lib/stores/uart.test.ts`**

Read the current `src/lib/stores/uart.test.ts`. Add `dbCodeCount` to the import and add one test at the bottom of the `describe` block:

```ts
import { uartConnected, uartPorts, uartLog, autoPollEnabled, nextLogId, dbCodeCount } from './uart';
```

Add inside the `describe` block:

```ts
it('dbCodeCount starts as null', () => {
  expect(get(dbCodeCount)).toBeNull();
});
```

Also add `dbCodeCount.set(null)` to the `beforeEach` reset:

```ts
beforeEach(() => {
  uartConnected.set(false);
  uartPorts.set([]);
  uartLog.set([]);
  autoPollEnabled.set(false);
  dbCodeCount.set(null);
});
```

- [ ] **Step 2: Run tests to verify new test fails**

```bash
npm run test -- --run 2>&1 | tail -10
```

Expected: FAIL — `dbCodeCount` not exported.

- [ ] **Step 3: Append `ErrorSearchResult` to `src/lib/api/types.ts`**

Append after the last line:

```ts
export interface ErrorSearchResult {
  code: number;
  description: string;
  category: string;
}
```

- [ ] **Step 4: Add `dbCodeCount` to `src/lib/stores/uart.ts`**

Read the current file. Append after the `autoPollEnabled` line:

```ts
export const dbCodeCount = writable<number | null>(null);
```

- [ ] **Step 5: Update `src/lib/api/tauri.ts`**

Read the current file. Update the import type line to add `ErrorSearchResult`:

```ts
import type { DeviceInfo, FlashReadResult, SerialArchive, ErrorSearchResult } from './types';
```

Change `uartUpdateDb` return type from `invoke<void>` to `invoke<number>`:

```ts
export const uartUpdateDb = (): Promise<number> => invoke<number>('uart_update_error_db');
```

Append at the bottom:

```ts
export const uartGetDbInfo = () => invoke<number | null>('uart_get_db_info');
export const uartSearchErrorDb = (query: string) =>
  invoke<ErrorSearchResult[]>('uart_search_error_db', { query });
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm run test -- --run
```

Expected: all tests pass (including new `dbCodeCount` test).

- [ ] **Step 7: Rewrite `src/lib/components/UartPanel.svelte`**

Replace the entire file:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
  import {
    uartConnected,
    uartPorts,
    uartLog,
    autoPollEnabled,
    nextLogId,
    dbCodeCount,
  } from '$lib/stores/uart';
  import {
    uartListPorts,
    uartConnect,
    uartDisconnect,
    uartSendErrlog,
    uartSetAutoPoll,
    uartUpdateDb,
    uartGetDbInfo,
    uartSearchErrorDb,
  } from '$lib/api/tauri';
  import type { UartEntryEvent, UartStatusEvent, ErrorSearchResult } from '$lib/api/types';

  let selectedPort = $state('');
  let loading = $state(false);
  let dbUpdating = $state(false);
  let dbQuery = $state('');
  let searchResults = $state<ErrorSearchResult[]>([]);

  const filteredLog = $derived(
    dbQuery.trim()
      ? $uartLog.filter((e) => e.raw.toLowerCase().includes(dbQuery.toLowerCase()))
      : $uartLog
  );

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  function onSearchInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    dbQuery = val;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (val.trim()) {
        searchResults = await uartSearchErrorDb(val.trim()).catch(() => []);
      } else {
        searchResults = [];
      }
    }, 300);
  }

  async function refreshPorts() {
    const ports = await uartListPorts().catch(() => [] as string[]);
    uartPorts.set(ports);
    if (ports.length > 0 && !selectedPort) {
      selectedPort = ports[0];
    } else if (!ports.includes(selectedPort)) {
      selectedPort = ports[0] ?? '';
    }
  }

  async function toggleConnect() {
    loading = true;
    try {
      if ($uartConnected) {
        await uartDisconnect();
      } else if (selectedPort) {
        await uartConnect(selectedPort);
      }
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  async function fetchErrlog() {
    await uartSendErrlog().catch(console.error);
  }

  async function toggleAutoPoll(enabled: boolean) {
    try {
      await uartSetAutoPoll(enabled);
      autoPollEnabled.set(enabled);
    } catch (e) {
      console.error(e);
    }
  }

  async function updateDb() {
    dbUpdating = true;
    try {
      const count = await uartUpdateDb();
      dbCodeCount.set(count);
    } catch (e) {
      console.error(e);
    } finally {
      dbUpdating = false;
    }
  }

  const unlisten: Array<() => void> = [];

  onMount(async () => {
    await refreshPorts();

    const count = await uartGetDbInfo().catch(() => null);
    dbCodeCount.set(count ?? null);

    const [u1, u2, u3] = await Promise.all([
      listen<string>('uart://line', (e) => {
        uartLog.update((log) => [
          { id: nextLogId(), timestamp_ms: Date.now(), raw: e.payload },
          ...log.slice(0, 499),
        ]);
      }),
      listen<UartEntryEvent>('uart://entry', (e) => {
        uartLog.update((log) => [
          {
            id: nextLogId(),
            timestamp_ms: Date.now(),
            raw: [
              e.payload.entry.error_code.toString(16).toUpperCase().padStart(8, '0'),
              e.payload.entry.timestamp.toString(16).toUpperCase().padStart(8, '0'),
              e.payload.entry.power_states.toString(16).toUpperCase().padStart(8, '0'),
              e.payload.entry.up_cause.toString(16).toUpperCase().padStart(8, '0'),
              e.payload.entry.temp_soc.toFixed(1) + '°C',
            ].join(', '),
            parsed: e.payload,
          },
          ...log.slice(0, 499),
        ]);
      }),
      listen<UartStatusEvent>('uart://status', (e) => {
        uartConnected.set(e.payload.connected);
      }),
    ]);
    unlisten.push(u1, u2, u3);
  });

  onDestroy(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    unlisten.forEach((fn) => fn());
  });
</script>

<section class="flex flex-col gap-4 flex-1 bg-gray-900 rounded-lg p-4 min-h-0">
  <h2 class="text-lg font-semibold text-gray-100">UART Diagnostics</h2>

  <!-- Controls -->
  <div class="flex flex-wrap items-center gap-2">
    <select
      bind:value={selectedPort}
      disabled={$uartConnected}
      class="bg-gray-800 text-gray-100 text-sm rounded px-2 py-1 border border-gray-700
             disabled:opacity-50"
    >
      {#each $uartPorts as p}
        <option value={p}>{p}</option>
      {:else}
        <option value="">Keine Ports gefunden</option>
      {/each}
    </select>

    <button
      onclick={refreshPorts}
      disabled={$uartConnected}
      class="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40"
    >
      ↻
    </button>

    <button
      onclick={toggleConnect}
      disabled={loading || (!$uartConnected && !selectedPort)}
      class="px-3 py-1 text-sm rounded font-medium
             {$uartConnected
        ? 'bg-red-700 hover:bg-red-600 text-white'
        : 'bg-green-700 hover:bg-green-600 text-white'}
             disabled:opacity-40"
    >
      {$uartConnected ? 'Trennen' : 'Verbinden'}
    </button>

    <button
      onclick={fetchErrlog}
      disabled={!$uartConnected}
      class="px-3 py-1 text-sm rounded bg-blue-700 hover:bg-blue-600 text-white
             disabled:opacity-40"
    >
      Errlog
    </button>

    <label class="flex items-center gap-1 text-sm text-gray-300 select-none cursor-pointer">
      <input
        type="checkbox"
        checked={$autoPollEnabled}
        disabled={!$uartConnected}
        onchange={(e) => toggleAutoPoll((e.target as HTMLInputElement).checked)}
        class="accent-blue-500 disabled:opacity-40"
      />
      Auto-Poll
    </label>

    <div class="flex items-center gap-2 ml-auto">
      <span class="text-xs {$dbCodeCount !== null ? 'text-green-400' : 'text-gray-600'}">
        {$dbCodeCount !== null ? `${$dbCodeCount.toLocaleString()} Codes` : 'Nicht geladen'}
      </span>
      <button
        onclick={updateDb}
        disabled={dbUpdating}
        class="px-3 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200
               disabled:opacity-40"
      >
        {dbUpdating ? 'Updating…' : 'DB aktualisieren'}
      </button>
    </div>
  </div>

  <!-- Status indicator -->
  <div class="flex items-center gap-2">
    <span class="w-2 h-2 rounded-full {$uartConnected ? 'bg-green-400' : 'bg-gray-600'}"></span>
    <span class="text-xs text-gray-400">
      {$uartConnected ? `Verbunden — ${selectedPort}` : 'Getrennt'}
    </span>
  </div>

  <!-- DB Search -->
  <div class="flex flex-col gap-1">
    <div class="relative">
      <input
        type="text"
        placeholder="Code oder Beschreibung suchen…"
        oninput={onSearchInput}
        value={dbQuery}
        class="w-full bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5 border border-gray-700
               placeholder:text-gray-600 focus:outline-none focus:border-gray-500"
      />
      {#if dbQuery}
        <button
          onclick={() => {
            dbQuery = '';
            searchResults = [];
          }}
          class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
        >
          ✕
        </button>
      {/if}
    </div>

    {#if searchResults.length > 0}
      <div class="bg-gray-800 rounded border border-gray-700 text-xs max-h-40 overflow-y-auto">
        {#each searchResults as r (r.code)}
          <button
            onclick={() => {
              dbQuery = r.code.toString();
              searchResults = [];
            }}
            class="w-full text-left px-2 py-1.5 hover:bg-gray-700 flex items-center gap-2 border-b
                   border-gray-700 last:border-0"
          >
            <span class="font-mono text-orange-400 shrink-0 w-24">
              0x{r.code.toString(16).toUpperCase().padStart(8, '0')}
            </span>
            <span class="text-gray-200 truncate flex-1">{r.description}</span>
            <span class="text-gray-500 shrink-0 text-xs">{r.category}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Log area -->
  <div class="flex-1 min-h-48 overflow-y-auto bg-gray-950 rounded p-3 flex flex-col gap-2">
    {#each filteredLog as entry (entry.id)}
      {#if entry.parsed}
        <div class="rounded bg-gray-800 border border-gray-700 p-2 text-xs">
          <div class="flex items-start justify-between gap-2">
            <span class="font-mono font-bold text-orange-400">
              0x{entry.parsed.entry.error_code.toString(16).toUpperCase().padStart(8, '0')}
            </span>
            <span class="text-gray-500 shrink-0">
              {new Date(entry.timestamp_ms).toLocaleTimeString()}
            </span>
          </div>
          {#if entry.parsed.description}
            <p class="text-gray-200 mt-1">{entry.parsed.description}</p>
          {/if}
          <div class="mt-1 flex flex-wrap gap-3 text-gray-400 font-mono">
            <span
              >Temp: <span class="text-cyan-400">{entry.parsed.entry.temp_soc.toFixed(1)} °C</span
              ></span
            >
            <span
              >PowerStates: {entry.parsed.entry.power_states
                .toString(16)
                .toUpperCase()
                .padStart(8, '0')}</span
            >
            <span
              >UpCause: {entry.parsed.entry.up_cause
                .toString(16)
                .toUpperCase()
                .padStart(8, '0')}</span
            >
          </div>
        </div>
      {:else}
        <div class="font-mono text-xs text-green-400 leading-relaxed">{entry.raw}</div>
      {/if}
    {:else}
      <span class="text-gray-600 text-xs">
        {dbQuery.trim() ? 'Keine Treffer für diesen Filter.' : 'Kein Output…'}
      </span>
    {/each}
  </div>
</section>
```

- [ ] **Step 8: Run type check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 9: Run all tests**

```bash
npm run test -- --run
```

Expected: all tests pass.

- [ ] **Step 10: Run Rust tests + clippy**

```bash
/usr/bin/cargo test --workspace && /usr/bin/cargo clippy --workspace -- -D warnings
```

Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add src/lib/api/types.ts src/lib/stores/uart.ts src/lib/api/tauri.ts \
        src/lib/components/UartPanel.svelte
git commit -m "feat(uart): add error-DB count badge and search field with live log filter"
```
