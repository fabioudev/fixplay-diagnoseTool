# Pre-Write NOR Validation — Design Spec

## Overview

Before writing a `.bin` file to the NOR chip, validate it locally and show the user a preview. If validation fails, show a warning but allow the user to proceed explicitly.

---

## Feature: Two-Step Write Flow

### Current behavior

`flash_write` reads the file and immediately writes to chip — no validation, no preview.

### New behavior

Clicking "Schreiben" triggers a two-step flow:

1. **Validate** — read the file locally, run `nor::validate()` + `parse_nvs()`, show preview card
2. **Confirm** — user inspects the preview and clicks "Jetzt schreiben" or "Abbrechen"

---

## Backend

### New Tauri command: `flash_validate_file`

**File:** `src-tauri/src/commands/flash.rs`

```rust
#[derive(serde::Serialize, Clone)]
pub struct FlashPreviewResult {
    pub path:       String,
    pub size_bytes: usize,
    pub validation: fixplay_core::types::NorValidation,
    pub nvs:        Option<fixplay_core::types::NvsData>,
}

#[tauri::command]
pub fn flash_validate_file(path: String) -> Result<FlashPreviewResult, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let validation = fixplay_core::nor::validate(&bytes);
    let nvs        = fixplay_core::nor::parse_nvs(&bytes);
    Ok(FlashPreviewResult {
        path,
        size_bytes: bytes.len(),
        validation,
        nvs,
    })
}
```

No side effects — no chip access, no file writes, no events emitted.

Registered in `src-tauri/src/lib.rs` invoke handler.

---

## Frontend types

**File:** `src/lib/api/types.ts`

```ts
export interface FlashPreviewResult {
  path:       string;
  size_bytes: number;
  validation: NorValidation;
  nvs:        NvsData | null;
}
```

---

## Store

**File:** `src/lib/stores/flash.ts`

```ts
export const flashWritePreview = writable<FlashPreviewResult | null>(null);
```

The `path` field in `FlashPreviewResult` is used in Stage 2 — no separate pending-path store needed.

---

## API wrapper

**File:** `src/lib/api/tauri.ts`

```ts
export const flashValidateFile = (path: string) =>
  invoke<FlashPreviewResult>('flash_validate_file', { path });
```

---

## FlashPanel changes

**File:** `src/lib/components/FlashPanel.svelte`

### Updated `handleWrite` (Stage 1)

```ts
async function handleWrite() {
  const storedPath = $flashWritePath;
  let selected: string;

  if (storedPath) {
    selected = storedPath;
    flashWritePath.set(null);
  } else {
    const result = await openDialog({
      title:   'NOR-Datei wählen',
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
```

### New `confirmWrite` (Stage 2)

```ts
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

### Preview card (rendered between progress bar and log when `$flashWritePreview !== null`)

- Validation checklist (same layout as read result card)
- NVS info block (same layout as read result card): Serial, MAC, SKU, Board ID, Firmware
- File path + size in bytes
- Yellow warning banner if `!$flashWritePreview.validation.is_valid()`: *"Validierungsfehler erkannt — Fortfahren auf eigene Gefahr"*
- Two action buttons:
  - **"Jetzt schreiben"** — orange (`bg-orange-700`), always enabled, calls `confirmWrite()`
  - **"Abbrechen"** — gray (`bg-gray-700`), calls `cancelWrite()`

The "Schreiben" button in the controls bar is disabled while `$flashWritePreview !== null` (write already pending).

---

## Files Summary

| Action | Path |
|--------|------|
| Modify | `src-tauri/src/commands/flash.rs` |
| Modify | `src-tauri/src/lib.rs` |
| Modify | `src/lib/api/types.ts` |
| Modify | `src/lib/stores/flash.ts` |
| Modify | `src/lib/api/tauri.ts` |
| Modify | `src/lib/components/FlashPanel.svelte` |
