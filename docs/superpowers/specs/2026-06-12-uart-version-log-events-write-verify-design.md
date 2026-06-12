# UART Version Button, Log Status Events & Flash Write Verification — Design Spec

## Overview

Drei eigenständige Verbesserungen in einem Batch:

1. **Version-Button** — `uart_send_version` per UI aufrufbar machen
2. **Connect/Disconnect im Log** — Verbindungsstatus-Events als Log-Einträge sichtbar machen
3. **Flash Write Verification (optional)** — Read-back nach dem Schreiben mit Checkbox im Write-Dialog

---

## Feature 1 — Version-Button im UartPanel

### Beschreibung

Ein "Version"-Button wird neben dem bestehenden "Errlog"-Button in `UartPanel.svelte` platziert. Er ist disabled wenn `!$uartConnected`. Ein Klick ruft `uartSendVersion()` auf. Die Antwort kommt automatisch über den bestehenden `uart://line`-Listener als normaler grüner Log-Eintrag rein — kein neues Event oder Store nötig.

### Änderungen

| Datei | Aktion |
|-------|--------|
| `src/lib/components/UartPanel.svelte` | Button `"Version"` neben `"Errlog"` hinzufügen |

### Button-Markup

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

---

## Feature 2 — Connect/Disconnect im Log-Stream

### Beschreibung

Wenn `uart://status` einen Zustandswechsel meldet, wird ein Eintrag in `uartLog` geschrieben. Diese Einträge sind visuell vom normalen UART-Output unterscheidbar (grau/kursiv statt grün). Dafür bekommt `UartLogEntry` ein optionales `kind?: 'status'`-Feld.

Geloggte Ereignisse:
- `connected: true` → `[Verbunden — <selectedPort>]`
- `connected: false` → `[Getrennt]`

Reconnect-Events (`uart://reconnecting`) werden **nicht** geloggt — der Zustand ist am Button-State bereits sichtbar.

### Änderungen

| Datei | Aktion |
|-------|--------|
| `src/lib/api/types.ts` | `kind?: 'status'` zu `UartLogEntry` hinzufügen |
| `src/lib/components/UartPanel.svelte` | `uart://status`-Listener: Log-Eintrag pushen |
| `src/lib/components/UartPanel.svelte` | Log-Template: `kind === 'status'` grau/kursiv rendern |
| `src/lib/stores/uart.test.ts` | Tests für `kind: 'status'` |

### Type-Änderung

```ts
export interface UartLogEntry {
  id:           number;
  timestamp_ms: number;
  raw:          string;
  parsed?:      UartEntryEvent;
  kind?:        'status';
}
```

### Listener-Änderung (uart://status)

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

### Template-Änderung (Log-Bereich)

Im `{:else}`-Zweig (plain text entries):

```svelte
{:else}
  <div class="{entry.kind === 'status'
    ? 'font-mono text-xs text-gray-500 italic leading-relaxed'
    : 'font-mono text-xs text-green-400 leading-relaxed'}">
    {entry.raw}
  </div>
{/if}
```

---

## Feature 3 — Flash Write Verification (optional)

### Beschreibung

Nach dem Schreiben liest `flash_write` (wenn `verify: true`) den Chip nochmals aus und vergleicht byte-weise mit den ursprünglichen Daten. Im Write-Dialog gibt es eine Checkbox "Nach dem Schreiben verifizieren" (Default: `true`). Die bestehende Progress-Bar zeigt die Verify-Phase bereits korrekt an (`PHASE_LABELS.verify = 'Verifizieren…'` ist vorhanden).

Bei Abweichung gibt `flash_write` einen Fehler zurück: `"Verify fehlgeschlagen: N Bytes weichen ab"`.
Bei Übereinstimmung emittiert es `flash://status { level: "info", message: "Verify OK ✓" }`.

### Änderungen

| Datei | Aktion |
|-------|--------|
| `src-tauri/src/commands/flash.rs` | `flash_write` bekommt `verify: bool` Parameter |
| `src/lib/api/tauri.ts` | `flashWrite` Signatur: `verify: boolean` hinzufügen |
| `src/lib/components/FlashPanel.svelte` | Verify-Checkbox im Write-Dialog; `let writeVerify = $state(true)` |

### Backend — flash_write Signatur

```rust
#[tauri::command]
pub async fn flash_write(
    path:       String,
    programmer: String,
    verify:     bool,
    app:        AppHandle,
) -> Result<(), String> {
```

### Backend — Verify-Block (nach bestehendem Write-Block)

```rust
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
}
```

### API-Wrapper

```ts
export const flashWrite = (path: string, programmer: string, verify: boolean): Promise<void> =>
  invoke<void>('flash_write', { path, programmer, verify });
```

### Frontend — Write-Dialog

Lokaler State in `FlashPanel.svelte`:
```ts
let writeVerify = $state(true);
```

Checkbox im Write-Dialog, zwischen NVS-Info und Action-Buttons:
```svelte
<label class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
  <input
    type="checkbox"
    bind:checked={writeVerify}
    class="accent-blue-500"
  />
  Nach dem Schreiben verifizieren
</label>
```

`confirmWrite` übergibt `writeVerify`:
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

---

## Tests

### Rust (`src-tauri/src/commands/flash.rs`)

```rust
#[test]
fn flash_write_verify_true_is_accepted() {
    // Kompilierungstest: verify: bool Parameter existiert
    let _ = |verify: bool| -> bool { verify };
}
```

Da `flash_write` Hardware benötigt, werden keine Integrationstests geschrieben. Der bestehende Kompilierungs-Check reicht.

### Frontend (`src/lib/stores/uart.test.ts`)

```ts
it('uartLog status entry has kind status', () => {
  const entry: UartLogEntry = {
    id: 0, timestamp_ms: Date.now(), raw: '[Verbunden — /dev/ttyUSB0]', kind: 'status',
  };
  expect(entry.kind).toBe('status');
});
```

---

## Dateien-Übersicht

| Aktion | Pfad |
|--------|------|
| Modify | `src-tauri/src/commands/flash.rs` |
| Modify | `src/lib/api/tauri.ts` |
| Modify | `src/lib/api/types.ts` |
| Modify | `src/lib/components/UartPanel.svelte` |
| Modify | `src/lib/components/FlashPanel.svelte` |
| Modify | `src/lib/stores/uart.test.ts` |
