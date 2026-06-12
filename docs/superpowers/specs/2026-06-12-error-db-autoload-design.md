# Error DB Auto-Load — Design Spec

## Overview

The Error DB (beschreibt PlayStation-Fehlercodes) ist bereits implementiert, aber nur verfügbar wenn der User manuell "DB aktualisieren" klickt oder ein Cache vorhanden ist. Dieses Feature macht die DB zuverlässig verfügbar: gebündelt in der App als Offline-Fallback, plus automatischer Hintergrund-Fetch wenn kein User-Cache existiert. Das UI zeigt den Ladezustand live.

---

## Startup-Sequenz (`src-tauri/src/lib.rs`)

Die bestehende `setup`-Closure wird auf eine dreistufige Sequenz erweitert:

```
1. from_cache(app_data_dir/error_codes.json)
   → Erfolg: in AppState laden, uart://db-status { source: "cache" } emittieren, fertig

2. from_cache(resource_dir/error_codes.json)    ← neu: gebündelte Fallback-DB
   → Erfolg: in AppState laden, in app_data_dir kopieren (als User-Cache),
             uart://db-status { source: "bundled" } emittieren

3. Hintergrund-Thread spawnen (wenn Schritt 1 fehlschlug)
   → fetch_and_cache(app_data_dir/error_codes.json)
   → Erfolg: AppState updaten, uart://db-status { source: "fetched" } emittieren
   → Fehler: uart://db-status { source: "failed", loaded: false } emittieren
```

Wenn Schritt 1 erfolgreich: kein Hintergrund-Fetch (Update ist manuell via "DB aktualisieren").
Wenn Schritt 2 oder nichts: immer Hintergrund-Fetch spawnen.

Der Hintergrund-Thread läuft als `std::thread::spawn` (blockierendes reqwest) außerhalb des Tauri-Async-Kontexts — gleiche Methode wie `fetch_and_cache` heute.

---

## Neues Event: `uart://db-status`

```rust
#[derive(serde::Serialize, Clone)]
struct DbStatusPayload {
    loaded: bool,
    count:  Option<usize>,
    source: String,   // "cache" | "bundled" | "fetched" | "failed"
}
```

Wird emittiert von:
- `setup()` nach jedem Ladeversuch (Stufe 1, 2, 3)
- `uart_update_error_db` nach erfolgreichem manuellen Update (source: "fetched")

Das bestehende `uart://db_updated`-Event in `uart_update_error_db` wird durch `uart://db-status` ersetzt (der Payload ist informativer; das Frontend nutzt `uart://db_updated` bisher nicht).

---

## Gebündelte Fallback-DB

**Datei:** `src-tauri/resources/error_codes.json`

Lokal: leere `[]` als Platzhalter (kompiliert ohne Fehler, DB hat 0 Einträge).
Im Release-Build: CI überschreibt mit der neuesten DB vor dem Tauri-Build.

**`src-tauri/tauri.conf.json`** — resources-Liste erweitern:
```json
"resources": ["binaries/flashrom", "binaries/flashrom.exe", "resources/error_codes.json"]
```

---

## CI-Integration (`.github/workflows/release.yml`)

Neuer Schritt **vor** `Build Tauri bundles`, in beiden Matrix-Jobs (Linux + Windows):

```yaml
- name: Bundle latest Error DB
  run: curl -fsSL "https://raw.githubusercontent.com/amoamare/Console-Service-Tool/master/Resources/ErrorCodes.json" -o src-tauri/resources/error_codes.json
```

Falls `curl` fehlschlägt (Netz-Problem im CI), schlägt der Build-Step fehl — das ist gewollt (kein stiller leerer Bundle).

---

## Frontend

### Store (`src/lib/stores/uart.ts`)

```ts
export const dbLoading = writable<boolean>(false);
```

`dbLoading` ist `true` wenn ein Hintergrund-Fetch läuft (kein Cache, aber noch kein `uart://db-status` empfangen).

### UartPanel.svelte — Änderungen

**Neuer Listener in `onMount`:**
```ts
listen<{ loaded: boolean; count: number | null; source: string }>('uart://db-status', (e) => {
  dbCodeCount.set(e.payload.loaded ? (e.payload.count ?? null) : null);
  dbLoading.set(false);
}),
```

**`onMount`-Logik für `dbLoading`:**
```ts
const count = await uartGetDbInfo().catch(() => null);
dbCodeCount.set(count ?? null);
if (count === null) {
  dbLoading.set(true);  // Hintergrund-Fetch könnte laufen
}
```

**Zustandsanzeige** (DB-Statuszeile, obere rechte Ecke):

| Zustand | Anzeige |
|---------|---------|
| `$dbLoading` | `⟳ Lade DB…` (grau, `animate-spin` auf dem Icon) |
| `$dbCodeCount === null && !$dbLoading` | `Nicht geladen` (rot-grau) |
| `$dbCodeCount !== null` | `{count.toLocaleString()} Codes` (grün) |

Der `DB aktualisieren`-Button:
- setzt `dbLoading.set(true)` beim Klick (während `updateDb()` läuft)
- bleibt immer sichtbar (auch bei geladenem Count — für manuelle Updates)

### Store-Test (`src/lib/stores/uart.test.ts`)

```ts
it('dbLoading starts as false', () => {
  expect(get(dbLoading)).toBe(false);
});
it('dbLoading can be set to true', () => {
  dbLoading.set(true);
  expect(get(dbLoading)).toBe(true);
});
```

---

## Dateien-Übersicht

| Aktion | Pfad |
|--------|------|
| Modify | `src-tauri/src/lib.rs` |
| Modify | `src-tauri/src/commands/uart.rs` |
| Modify | `src-tauri/tauri.conf.json` |
| Create | `src-tauri/resources/error_codes.json` (Platzhalter `[]`) |
| Modify | `src/lib/stores/uart.ts` |
| Modify | `src/lib/stores/uart.test.ts` |
| Modify | `src/lib/components/UartPanel.svelte` |
| Modify | `.github/workflows/release.yml` |
