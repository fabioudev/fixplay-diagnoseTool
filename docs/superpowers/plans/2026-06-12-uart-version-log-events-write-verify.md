# UART Version Button, Log Status Events & Flash Write Verification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Version button to UartPanel, log connect/disconnect events in the UART log stream, and add an optional read-back verify step after flash_write.

**Architecture:** Three independent frontend/backend changes. Task 1 extends a shared type and adds a test. Task 2 modifies UartPanel.svelte only. Task 3 extends the Rust flash_write command with a verify parameter. Task 4 wires the verify checkbox into the frontend write dialog.

**Tech Stack:** Rust (Tauri v2 commands, serialport), Svelte 5 (TypeScript), Vitest, cargo test

---

## File Map

| File | Change |
|------|--------|
| `src/lib/api/types.ts` | Add `kind?: 'status'` to `UartLogEntry` |
| `src/lib/stores/uart.test.ts` | Add test for `kind: 'status'` entry |
| `src/lib/components/UartPanel.svelte` | Version button + status log entries in `uart://status` listener + template |
| `src-tauri/src/commands/flash.rs` | `flash_write` gets `verify: bool`, read-back logic + Rust test |
| `src/lib/api/tauri.ts` | `flashWrite` signature: add `verify: boolean` |
| `src/lib/components/FlashPanel.svelte` | `let writeVerify = $state(true)`, checkbox in write dialog, pass to `confirmWrite` |

---

## Task 1: UartLogEntry `kind` field

**Files:**
- Modify: `src/lib/api/types.ts`
- Modify: `src/lib/stores/uart.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/lib/stores/uart.test.ts`, add this test inside the `describe('uart store', ...)` block — it will fail to compile until `kind` is on the type:

```ts
it('UartLogEntry accepts kind status', () => {
  const entry: UartLogEntry = {
    id:           0,
    timestamp_ms: Date.now(),
    raw:          '[Verbunden — /dev/ttyUSB0]',
    kind:         'status',
  };
  expect(entry.kind).toBe('status');
});
```

Also add the import for `UartLogEntry` to the import line at the top (it's already imported — check the existing import):
```ts
import { uartLog, uartConnected, uartPorts, autoPollEnabled, nextLogId, dbCodeCount, dbLoading, uartReconnecting } from './uart';
import type { UartLogEntry } from '$lib/api/types';
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test
```

Expected: TypeScript compile error — `Object literal may only specify known properties, and 'kind' does not exist in type 'UartLogEntry'`.

- [ ] **Step 3: Add `kind` to the type**

In `src/lib/api/types.ts`, find `UartLogEntry` (line 42) and add the optional field:

```ts
export interface UartLogEntry {
  id:           number;
  timestamp_ms: number;
  raw:          string;
  parsed?:      UartEntryEvent;
  kind?:        'status';
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test
```

Expected: All tests pass including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/types.ts src/lib/stores/uart.test.ts
git commit -m "feat(types): add optional kind status field to UartLogEntry"
```

---

## Task 2: UartPanel — Version button + status log entries

**Files:**
- Modify: `src/lib/components/UartPanel.svelte`

No unit tests are possible for Svelte component interactions with Tauri. Verification is by TypeScript compile check (`npm run test`) and visual inspection.

- [ ] **Step 1: Add the Version button**

In `src/lib/components/UartPanel.svelte`, find the "Errlog" button (around line 227):

```svelte
<button
  onclick={fetchErrlog}
  disabled={!$uartConnected}
  class="px-3 py-1 text-sm rounded bg-blue-700 hover:bg-blue-600 text-white
         disabled:opacity-40"
>
  Errlog
</button>
```

Add a Version button immediately after it:

```svelte
<button
  onclick={() => uartSendVersion().catch(console.error)}
  disabled={!$uartConnected}
  class="px-3 py-1 text-sm rounded bg-blue-700 hover:bg-blue-600 text-white
         disabled:opacity-40"
>
  Version
</button>
```

`uartSendVersion` is already imported from `$lib/api/tauri` (line 11 of tauri.ts) — verify it's in the import list in the `<script>` block. The current import block is:

```ts
import {
  uartListPorts,
  uartConnect,
  uartDisconnect,
  uartSendErrlog,
  uartSetAutoPoll,
  uartSetAutoReconnect,
  uartUpdateDb,
  uartGetDbInfo,
  uartSearchErrorDb,
} from '$lib/api/tauri';
```

Add `uartSendVersion` to this list:

```ts
import {
  uartListPorts,
  uartConnect,
  uartDisconnect,
  uartSendErrlog,
  uartSendVersion,
  uartSetAutoPoll,
  uartSetAutoReconnect,
  uartUpdateDb,
  uartGetDbInfo,
  uartSearchErrorDb,
} from '$lib/api/tauri';
```

- [ ] **Step 2: Update the `uart://status` listener to log connect/disconnect events**

Find the `uart://status` listener in `onMount` (inside the `Promise.all` block):

```ts
listen<UartStatusEvent>('uart://status', (e) => {
  uartConnected.set(e.payload.connected);
  if (e.payload.connected) uartReconnecting.set(false);
}),
```

Replace with:

```ts
listen<UartStatusEvent>('uart://status', (e) => {
  uartConnected.set(e.payload.connected);
  if (e.payload.connected) uartReconnecting.set(false);
  uartLog.update((log) => [
    {
      id:           nextLogId(),
      timestamp_ms: Date.now(),
      raw:          e.payload.connected
                      ? `[Verbunden — ${selectedPort}]`
                      : '[Getrennt]',
      kind:         'status' as const,
    },
    ...log.slice(0, 499),
  ]);
}),
```

- [ ] **Step 3: Update the log template to render status entries differently**

Find the `{:else}` branch in the log area template (the `{#if entry.parsed}` block around line 327):

```svelte
{:else}
  <div class="font-mono text-xs text-green-400 leading-relaxed">{entry.raw}</div>
{/if}
```

Replace with:

```svelte
{:else}
  <div class="{entry.kind === 'status'
    ? 'font-mono text-xs text-gray-500 italic leading-relaxed'
    : 'font-mono text-xs text-green-400 leading-relaxed'}">
    {entry.raw}
  </div>
{/if}
```

- [ ] **Step 4: Run tests**

```bash
npm run test
```

Expected: All 24 tests pass, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/UartPanel.svelte
git commit -m "feat(uart): add Version button and connect/disconnect log entries"
```

---

## Task 3: Backend flash_write verify parameter

**Files:**
- Modify: `src-tauri/src/commands/flash.rs`

- [ ] **Step 1: Write the failing Rust test**

In `src-tauri/src/commands/flash.rs`, find the end of the file and add a new test module:

```rust
#[cfg(test)]
mod verify_tests {
    #[test]
    fn verify_counts_differing_bytes() {
        let written:   Vec<u8> = vec![0x00, 0x01, 0x02, 0x03];
        let read_back: Vec<u8> = vec![0x00, 0xFF, 0x02, 0xFF];
        let diff = read_back.iter().zip(written.iter()).filter(|(a, b)| a != b).count();
        assert_eq!(diff, 2);
    }

    #[test]
    fn verify_passes_when_identical() {
        let written:   Vec<u8> = vec![0xAA, 0xBB];
        let read_back: Vec<u8> = vec![0xAA, 0xBB];
        let diff = read_back.iter().zip(written.iter()).filter(|(a, b)| a != b).count();
        assert_eq!(diff, 0);
    }
}
```

- [ ] **Step 2: Run to verify tests pass (they test pure logic, no hardware)**

```bash
cd src-tauri && cargo test verify_tests
```

Expected: 2 tests pass.

- [ ] **Step 3: Add `verify: bool` parameter to flash_write**

Find `flash_write` in `src-tauri/src/commands/flash.rs` (around line 114). Replace the full function with:

```rust
#[tauri::command]
pub async fn flash_write(
    path:       String,
    programmer: String,
    verify:     bool,
    app:        AppHandle,
) -> Result<(), String> {
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let settings     = crate::settings::load_settings(&app);
    let device = FlashromDevice {
        programmer:  programmer.clone(),
        binary_path: crate::settings::resolve_flashrom_path(&settings, &resource_dir),
    };

    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    emit_status(&app, "Schreibe NOR (Löschen + Schreiben)...", "info");
    info!("flash_write: path={}, programmer={}, verify={}", path, programmer, verify);

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

    if verify {
        emit_status(&app, "Verifiziere...", "info");
        let read_back = {
            let app_c = app.clone();
            let dev   = device.clone();
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
            let diff = read_back.iter().zip(data.iter()).filter(|(a, b)| a != b).count();
            return Err(format!("Verify fehlgeschlagen: {} Bytes weichen ab", diff));
        }
        emit_status(&app, "Verify OK ✓", "info");
    } else {
        emit_status(&app, "NOR erfolgreich geschrieben ✓", "info");
    }

    Ok(())
}
```

- [ ] **Step 4: Run all Rust tests**

```bash
cd src-tauri && cargo test
```

Expected: All tests pass including `verify_tests`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/flash.rs
git commit -m "feat(tauri): add optional verify read-back to flash_write command"
```

---

## Task 4: Frontend flash write verify checkbox

**Files:**
- Modify: `src/lib/api/tauri.ts`
- Modify: `src/lib/components/FlashPanel.svelte`

No new unit tests — TypeScript compile check is the gate.

- [ ] **Step 1: Update the flashWrite API wrapper**

In `src/lib/api/tauri.ts`, find the `flashWrite` export (around line 25):

```ts
export const flashWrite = (path: string, programmer: string) =>
  invoke<void>('flash_write', { path, programmer });
```

Replace with:

```ts
export const flashWrite = (path: string, programmer: string, verify: boolean): Promise<void> =>
  invoke<void>('flash_write', { path, programmer, verify });
```

- [ ] **Step 2: Run tests to verify the type change compiles**

```bash
npm run test
```

Expected: TypeScript compile error — `confirmWrite` calls `flashWrite` with 2 args, now needs 3. This is expected and confirms the type was wired.

- [ ] **Step 3: Add `writeVerify` state and checkbox in FlashPanel**

In `src/lib/components/FlashPanel.svelte`, find the existing local state declarations at the top of `<script>`:

```ts
let programmers = $state<string[]>([]);
let phaseLabel  = $state('');
```

Add below them:

```ts
let writeVerify = $state(true);
```

- [ ] **Step 4: Add the verify checkbox to the write preview dialog**

Find the write preview card's action buttons section in the template (around line 242):

```svelte
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
```

Replace with:

```svelte
<!-- Verify option + action buttons -->
<div class="flex flex-col gap-2 pt-1">
  <label class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
    <input
      type="checkbox"
      bind:checked={writeVerify}
      class="accent-blue-500"
    />
    Nach dem Schreiben verifizieren
  </label>
  <div class="flex items-center gap-2">
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
```

- [ ] **Step 5: Update `confirmWrite` to pass `writeVerify`**

Find `confirmWrite` in the script section:

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
```

Replace with:

```ts
async function confirmWrite() {
  const preview = $flashWritePreview;
  if (!preview) return;

  flashWritePreview.set(null);
  flashBusy.set(true);
  flashLog.set([]);
  flashProgress.set(null);
  try {
    await flashWrite(preview.path, $flashProgrammer, writeVerify);
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

- [ ] **Step 6: Run all tests**

```bash
npm run test
```

Expected: All 24 tests pass, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/api/tauri.ts src/lib/components/FlashPanel.svelte
git commit -m "feat(ui): add verify checkbox to flash write dialog"
```
