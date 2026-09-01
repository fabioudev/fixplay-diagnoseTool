# Pre-Write NOR Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-step write flow — validate the `.bin` locally first, show a preview card with validation results and NVS info, then require explicit confirmation before writing to chip.

**Architecture:** New `flash_validate_file` Tauri command reads the file and runs `nor::validate` + `parse_nvs` (both already exist in `fixplay-core`) without any chip access. Frontend stores the result in a new `flashWritePreview` store. `FlashPanel` shows a preview card with a confirm/cancel button pair; `handleWrite` triggers validation only, `confirmWrite` triggers the actual write.

**Tech Stack:** Rust (`fixplay-core::nor`), Tauri v2, Svelte 5 (`$state`, `$derived`), Tailwind CSS v4.

---

## File Map

| Action | Path                                   |
| ------ | -------------------------------------- |
| Modify | `src-tauri/src/commands/flash.rs`      |
| Modify | `src-tauri/src/lib.rs`                 |
| Modify | `src/lib/api/types.ts`                 |
| Modify | `src/lib/stores/flash.ts`              |
| Modify | `src/lib/stores/flash.test.ts`         |
| Modify | `src/lib/api/tauri.ts`                 |
| Modify | `src/lib/components/FlashPanel.svelte` |

---

## Task 1: Rust — `flash_validate_file` command

**Files:**

- Modify: `src-tauri/src/commands/flash.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing tests**

Read `src-tauri/src/commands/flash.rs` first. Append this `#[cfg(test)]` block at the end of the file (after all existing code, including any existing test block):

```rust
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
/usr/bin/cargo test -p fixplay-tauri validate_tests 2>&1 | tail -10
```

Expected: FAIL — `flash_validate_file` not defined, `FlashPreviewResult` not defined.

- [ ] **Step 3: Add `FlashPreviewResult` struct and `flash_validate_file` command**

Read the current `src-tauri/src/commands/flash.rs`. Add these items after the existing `archive_delete_dump` command (before any `#[cfg(test)]` block):

```rust
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
/usr/bin/cargo test -p fixplay-tauri validate_tests
```

Expected: 3 tests pass.

- [ ] **Step 5: Register command in `src-tauri/src/lib.rs`**

Read the file. In the `invoke_handler!` macro, add after `commands::flash::archive_delete_dump,`:

```rust
            commands::flash::flash_validate_file,
```

- [ ] **Step 6: Build to verify compilation**

```bash
/usr/bin/cargo build --workspace 2>&1 | tail -10
```

Expected: compiles without errors.

- [ ] **Step 7: Run full tests + clippy**

```bash
/usr/bin/cargo test --workspace && /usr/bin/cargo clippy --workspace -- -D warnings
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/commands/flash.rs src-tauri/src/lib.rs
git commit -m "feat(tauri): add flash_validate_file command for pre-write NOR validation"
```

---

## Task 2: Frontend — types, store, API wrapper

**Files:**

- Modify: `src/lib/api/types.ts`
- Modify: `src/lib/stores/flash.ts`
- Modify: `src/lib/stores/flash.test.ts`
- Modify: `src/lib/api/tauri.ts`

- [ ] **Step 1: Write a failing test**

Read `src/lib/stores/flash.test.ts`. Make two changes:

**1a** — Update the import to add `flashWritePreview`:

```ts
import { flashBusy, flashProgress, flashResult, flashLog, flashWritePreview } from './flash';
```

**1b** — Add `flashWritePreview.set(null)` to `beforeEach`:

```ts
beforeEach(() => {
  flashBusy.set(false);
  flashProgress.set(null);
  flashResult.set(null);
  flashLog.set([]);
  flashWritePreview.set(null);
});
```

**1c** — Add one test inside the `describe` block after the last existing test:

```ts
it('flashWritePreview starts as null', () => {
  expect(get(flashWritePreview)).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify the new test fails**

```bash
cd /home/fabiom/IdeaProjects/fixplay-diagnoseTool && npm run test -- --run 2>&1 | tail -10
```

Expected: FAIL — `flashWritePreview` not exported from `./flash`.

- [ ] **Step 3: Append `FlashPreviewResult` to `src/lib/api/types.ts`**

Read the current file. Append after the last line:

```ts
export interface FlashPreviewResult {
  path: string;
  size_bytes: number;
  validation: NorValidation;
  nvs: NvsData | null;
}
```

- [ ] **Step 4: Add `flashWritePreview` store to `src/lib/stores/flash.ts`**

Read the current file. The import at the top currently reads:

```ts
import type { FlashReadResult, FlashLogEntry, FlashProgressEvent } from '$lib/api/types';
```

Change it to:

```ts
import type {
  FlashReadResult,
  FlashLogEntry,
  FlashProgressEvent,
  FlashPreviewResult,
} from '$lib/api/types';
```

Then append after the `flashWritePath` line:

```ts
export const flashWritePreview = writable<FlashPreviewResult | null>(null);
```

- [ ] **Step 5: Add `flashValidateFile` to `src/lib/api/tauri.ts`**

Read the current file. The import type line currently reads:

```ts
import type { DeviceInfo, FlashReadResult, SerialArchive, ErrorSearchResult } from './types';
```

Change it to:

```ts
import type {
  DeviceInfo,
  FlashReadResult,
  SerialArchive,
  ErrorSearchResult,
  FlashPreviewResult,
} from './types';
```

Then append after the `openPath` line and before the archive wrappers:

```ts
export const flashValidateFile = (path: string) =>
  invoke<FlashPreviewResult>('flash_validate_file', { path });
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm run test -- --run
```

Expected: all tests pass (7 flash store tests now).

- [ ] **Step 7: Run type check**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/api/types.ts src/lib/stores/flash.ts src/lib/stores/flash.test.ts \
        src/lib/api/tauri.ts
git commit -m "feat(frontend): add FlashPreviewResult type, flashWritePreview store, flashValidateFile API"
```

---

## Task 3: FlashPanel — two-step write flow

**Files:**

- Modify: `src/lib/components/FlashPanel.svelte`

- [ ] **Step 1: Read the current file**

```bash
cat -n /home/fabiom/IdeaProjects/fixplay-diagnoseTool/src/lib/components/FlashPanel.svelte
```

Identify:

- The imports line from `$lib/stores/flash` (currently imports `flashBusy`, `flashProgress`, `flashResult`, `flashLog`, `flashProgrammer`, `flashWritePath`, `nextFlashLogId`)
- The imports line from `$lib/api/tauri` (currently imports `flashListProgrammers`, `flashRead`, `flashWrite`, `openPath`)
- The `handleWrite` function (currently around lines 72–93)
- The "Schreiben" button (currently around line 123)

- [ ] **Step 2: Update the stores import**

Change the stores import from:

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

To:

```ts
import {
  flashBusy,
  flashProgress,
  flashResult,
  flashLog,
  flashProgrammer,
  flashWritePath,
  flashWritePreview,
  nextFlashLogId,
} from '$lib/stores/flash';
```

- [ ] **Step 3: Update the API import**

Change the API import from:

```ts
import { flashListProgrammers, flashRead, flashWrite, openPath } from '$lib/api/tauri';
```

To:

```ts
import {
  flashListProgrammers,
  flashRead,
  flashWrite,
  flashValidateFile,
  openPath,
} from '$lib/api/tauri';
```

- [ ] **Step 4: Replace `handleWrite` and add `confirmWrite` / `cancelWrite`**

Replace the entire `handleWrite` function with:

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
  try {
    const preview = await flashValidateFile(selected);
    flashWritePreview.set(preview);
  } catch (e: unknown) {
    flashLog.update((log) => [
      { id: nextFlashLogId(), timestamp_ms: Date.now(), message: String(e), level: 'error' },
      ...log,
    ]);
  } finally {
    flashBusy.set(false);
  }
}

async function confirmWrite() {
  const preview = $flashWritePreview;
  if (!preview) return;

  flashWritePreview.set(null);
  flashBusy.set(true);
  flashLog.set([]);
  flashProgress.set(null);
  try {
    await flashWrite(preview.path, $flashProgrammer);
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

function cancelWrite() {
  flashWritePreview.set(null);
}
```

- [ ] **Step 5: Update the "Schreiben" button to disable when preview is showing**

Find the "Schreiben" button. It currently has `disabled={$flashBusy || !$flashProgrammer}`. Change it to:

```svelte
<button
  onclick={handleWrite}
  disabled={$flashBusy || !$flashProgrammer || $flashWritePreview !== null}
  class="px-3 py-1 text-sm rounded bg-orange-700 hover:bg-orange-600 text-white
             disabled:opacity-40"
>
  Schreiben
</button>
```

- [ ] **Step 6: Add the preview card**

In the template, after the `{/if}` that closes the progress bar block and before the `{#if $flashResult}` result card block, add:

```svelte
<!-- Write preview card -->
{#if $flashWritePreview}
  {@const p = $flashWritePreview}
  <div class="rounded bg-gray-800 border border-gray-700 p-3 text-xs flex flex-col gap-3">
    {@const validationOk =
      p.validation.size_ok &&
      p.validation.header_ok &&
      p.validation.mbr1_ok &&
      p.validation.mbr2_ok &&
      p.validation.emc_ipl_a_ok &&
      p.validation.emc_ipl_b_ok &&
      p.validation.usb_pdc_a_ok &&
      p.validation.usb_pdc_b_ok}

    <!-- Warning banner (only when validation fails) -->
    {#if !validationOk}
      <div class="flex items-center gap-2 rounded bg-yellow-900 border border-yellow-700 px-3 py-2">
        <span class="text-yellow-400 font-semibold"
          >⚠ Validierungsfehler erkannt — Fortfahren auf eigene Gefahr</span
        >
      </div>
    {/if}

    <!-- Validation checklist -->
    <div>
      <p class="text-gray-400 font-semibold mb-1">Validierung:</p>
      <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
        {#each [{ label: 'NOR Header', ok: p.validation.header_ok }, { label: 'MBR 1', ok: p.validation.mbr1_ok }, { label: 'MBR 2', ok: p.validation.mbr2_ok }, { label: 'EmcIpl A', ok: p.validation.emc_ipl_a_ok }, { label: 'EmcIpl B', ok: p.validation.emc_ipl_b_ok }, { label: 'USB PDC A', ok: p.validation.usb_pdc_a_ok }, { label: 'USB PDC B', ok: p.validation.usb_pdc_b_ok }, { label: 'Größe (2 MB)', ok: p.validation.size_ok }] as item (item.label)}
          <div class="flex items-center gap-1">
            <span class={item.ok ? 'text-green-400' : 'text-red-400'}>{item.ok ? '✓' : '✗'}</span>
            <span class="text-gray-300">{item.label}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- NVS info -->
    {#if p.nvs}
      <div>
        <p class="text-gray-400 font-semibold mb-1">Konsoleninfo:</p>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt class="text-gray-500">Serial:</dt>
          <dd class="text-gray-200 font-mono">{p.nvs.serial || '—'}</dd>
          <dt class="text-gray-500">MAC:</dt>
          <dd class="text-gray-200 font-mono">{p.nvs.mac_address}</dd>
          <dt class="text-gray-500">SKU:</dt>
          <dd class="text-gray-200">{p.nvs.sku || '—'}</dd>
          <dt class="text-gray-500">Board ID:</dt>
          <dd class="text-gray-200 font-mono">{p.nvs.board_id || '—'}</dd>
          <dt class="text-gray-500">Firmware:</dt>
          <dd class="text-gray-200 font-mono">{p.nvs.fw_version}</dd>
        </dl>
      </div>
    {/if}

    <!-- File info -->
    <div class="flex items-center gap-2">
      <span class="text-gray-500 shrink-0">Datei:</span>
      <span class="text-gray-300 font-mono truncate flex-1">{p.path}</span>
      <span class="text-gray-500 shrink-0">{(p.size_bytes / 1024 / 1024).toFixed(2)} MB</span>
    </div>

    <!-- Action buttons -->
    <div class="flex items-center gap-2 pt-1">
      <button
        onclick={confirmWrite}
        class="px-3 py-1.5 text-sm rounded bg-orange-700 hover:bg-orange-600 text-white font-medium"
      >
        Jetzt schreiben
      </button>
      <button
        onclick={cancelWrite}
        class="px-3 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
      >
        Abbrechen
      </button>
    </div>
  </div>
{/if}
```

- [ ] **Step 7: Run type check**

```bash
cd /home/fabiom/IdeaProjects/fixplay-diagnoseTool && npm run check
```

Expected: 0 errors. If there are errors, fix them before proceeding.

- [ ] **Step 8: Run all tests**

```bash
npm run test -- --run
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/components/FlashPanel.svelte
git commit -m "feat(ui): add pre-write NOR validation preview card with confirm/cancel"
```
