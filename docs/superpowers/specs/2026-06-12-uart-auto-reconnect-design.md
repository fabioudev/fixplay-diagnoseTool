# UART Auto-Reconnect — Design Spec

## Overview

Wenn der serielle Port abbricht (Console neu gestartet, Kabel gewackelt), versucht die App automatisch die Verbindung wiederherzustellen. Der User aktiviert das Feature per Checkbox im UART-Panel. Ein Reconnect-Thread in Rust versucht alle 2s den Port neu zu öffnen. Das Frontend zeigt `⟳ Reconnecting…` am Connect-Button solange der Versuch läuft.

---

## Backend (`src-tauri/`)

### `src-tauri/src/state.rs` — neue AppState-Felder

Vier neue Felder, spiegeln das `uart_poll_thread`-Muster exakt:

```rust
pub auto_reconnect:   Arc<AtomicBool>,
pub reconnect_port:   Mutex<Option<String>>,
pub reconnect_stop:   Mutex<Option<Arc<AtomicBool>>>,
pub reconnect_thread: Mutex<Option<JoinHandle<()>>>,
```

`Default`-Impl ergänzen:

```rust
auto_reconnect:   Arc::new(AtomicBool::new(false)),
reconnect_port:   Mutex::new(None),
reconnect_stop:   Mutex::new(None),
reconnect_thread: Mutex::new(None),
```

---

### `src-tauri/src/commands/uart.rs` — Änderungen

#### Neues Payload-Struct

```rust
#[derive(Clone, Serialize)]
struct ReconnectingPayload {
    active: bool,
}
```

#### `uart_connect` — Port-Name speichern

Am Ende von `uart_connect`, vor dem `Ok(())`, den Port-Namen in `reconnect_port` speichern:

```rust
*state.reconnect_port.lock().unwrap() = Some(port);
```

#### `uart_disconnect` — Reconnect-Thread stoppen

In `uart_disconnect`, nach dem bestehenden Thread-Cleanup, den Reconnect-Thread ebenfalls stoppen:

```rust
if let Some(flag) = state.reconnect_stop.lock().unwrap().take() {
    flag.store(true, Ordering::Relaxed);
}
if let Some(handle) = state.reconnect_thread.lock().unwrap().take() {
    let _ = handle.join();
}
state.auto_reconnect.store(false, Ordering::Relaxed);
```

`uart_disconnect` setzt `auto_reconnect = false`, damit ein manueller Disconnect nie zu einem Reconnect führt.

#### Reader-Loop-Fehlerpath — Reconnect spawnen

Im `Err(e)` Arm von `reader_loop` (nach dem bestehenden `app.emit("uart://status", ...)`) hinzufügen:

```rust
if state.auto_reconnect.load(Ordering::Relaxed)
    && state.reconnect_stop.lock().unwrap().is_none()
{
    if let Some(port) = state.reconnect_port.lock().unwrap().clone() {
        let baud_rate = crate::settings::load_settings(&app).baud_rate;
        let stop       = Arc::new(AtomicBool::new(false));
        let stop_clone = Arc::clone(&stop);
        let app_clone  = app.clone();
        let handle = std::thread::spawn(move || {
            reconnect_loop(port, baud_rate, app_clone, stop_clone);
        });
        *state.reconnect_stop.lock().unwrap()   = Some(stop);
        *state.reconnect_thread.lock().unwrap() = Some(handle);
    }
}
```

Dieselbe Logik in `poll_loop` an der Stelle, wo ein Write-Fehler zum Disconnect führt (nach `app.emit("uart://status", ...)`).

#### Neues Command `uart_set_auto_reconnect`

```rust
#[tauri::command]
pub async fn uart_set_auto_reconnect(
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Immer erst laufenden Reconnect-Thread stoppen
    if let Some(flag) = state.reconnect_stop.lock().unwrap().take() {
        flag.store(true, Ordering::Relaxed);
    }
    if let Some(handle) = state.reconnect_thread.lock().unwrap().take() {
        let _ = handle.join();
    }

    state.auto_reconnect.store(enabled, Ordering::Relaxed);
    Ok(())
}
```

#### Neue Hilfsfunktion `reconnect_loop`

```rust
fn reconnect_loop(port: String, baud_rate: u32, app: AppHandle, stop: Arc<AtomicBool>) {
    let _ = app.emit("uart://reconnecting", ReconnectingPayload { active: true });

    loop {
        // 2s in 100ms-Schritten — stop-Flag wird oft geprüft
        for _ in 0..20 {
            if stop.load(Ordering::Relaxed) {
                let _ = app.emit("uart://reconnecting", ReconnectingPayload { active: false });
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        if stop.load(Ordering::Relaxed) {
            let _ = app.emit("uart://reconnecting", ReconnectingPayload { active: false });
            return;
        }

        // Port-Open-Versuch
        let open_result = serialport::new(&port, baud_rate)
            .timeout(Duration::from_millis(100))
            .open();

        if let Ok(open_port) = open_result {
            let write_port = match open_port.try_clone() { Ok(p) => p, Err(_) => continue };
            let read_port  = match open_port.try_clone() { Ok(p) => p, Err(_) => continue };
            drop(open_port);

            let state = app.state::<AppState>();
            {
                let mut uart_guard = state.uart.lock().unwrap();
                let uart = uart_guard.get_or_insert_with(UartPort::default);
                uart.set_port(write_port);
            }

            let new_stop   = Arc::new(AtomicBool::new(false));
            let stop_clone = Arc::clone(&new_stop);
            let db_clone   = Arc::clone(&state.error_db);
            let app_clone  = app.clone();

            let handle = std::thread::spawn(move || {
                reader_loop(read_port, stop_clone, app_clone, db_clone);
            });

            *state.uart_stop.lock().unwrap()   = Some(new_stop);
            *state.uart_thread.lock().unwrap() = Some(handle);

            // Reconnect-Thread-Handles aus State räumen (wir sind fertig)
            state.reconnect_stop.lock().unwrap().take();
            state.reconnect_thread.lock().unwrap().take();

            let _ = app.emit("uart://reconnecting", ReconnectingPayload { active: false });
            let _ = app.emit("uart://status", StatusPayload { connected: true });
            return;
        }
    }
}
```

#### Command registrieren

In `src-tauri/src/lib.rs` `uart_set_auto_reconnect` zum `invoke_handler!`-Macro hinzufügen.

---

## Frontend (`src/`)

### `src/lib/stores/uart.ts`

```ts
export const uartReconnecting = writable<boolean>(false);
```

### `src/lib/api/tauri.ts`

```ts
export const uartSetAutoReconnect = (enabled: boolean): Promise<void> =>
  invoke<void>('uart_set_auto_reconnect', { enabled });
```

### `src/lib/components/UartPanel.svelte`

**Imports:** `uartReconnecting` aus Store, `uartSetAutoReconnect` aus API.

**Lokaler State:**

```ts
let autoReconnect = $state(false);
```

**Fünfter Listener in `onMount`** (nach `u4`):

```ts
listen<{ active: boolean }>('uart://reconnecting', (e) => {
  uartReconnecting.set(e.payload.active);
}),
```

→ `const [u1, u2, u3, u4, u5] = await Promise.all([...])` und `unlisten.push(u1, u2, u3, u4, u5)`.

Außerdem in `uart://status`-Listener: wenn `connected: true`, auch `uartReconnecting.set(false)` (Sicherheits-Reset).

**Checkbox im Template** (nur sichtbar wenn verbunden oder reconnecting):

```svelte
{#if $uartConnected || $uartReconnecting}
  <label class="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
    <input
      type="checkbox"
      checked={autoReconnect}
      onchange={async (e) => {
        autoReconnect = (e.target as HTMLInputElement).checked;
        await uartSetAutoReconnect(autoReconnect);
      }}
      class="accent-blue-500"
    />
    Auto-Reconnect
  </label>
{/if}
```

**Connect-Button-State:** Der Button zeigt drei Zustände — ist immer klickbar (auch während Reconnecting, damit der User abbrechen kann):

| Zustand             | Text              | Disabled               |
| ------------------- | ----------------- | ---------------------- |
| `$uartReconnecting` | `⟳ Reconnecting…` | nein — Klick bricht ab |
| `$uartConnected`    | `Trennen`         | nein                   |
| sonst               | `Verbinden`       | nein                   |

```svelte
<button
  onclick={$uartConnected || $uartReconnecting ? disconnect : connect}
  disabled={connecting}
  class="..."
>
  {#if $uartReconnecting}
    ⟳ Reconnecting…
  {:else if $uartConnected}
    Trennen
  {:else}
    Verbinden
  {/if}
</button>
```

Klick auf `⟳ Reconnecting…` ruft `disconnect()` auf, was `uartSetAutoReconnect(false)` und anschließend `uartDisconnect()` ausführt — der Reconnect-Thread wird gestoppt.

**`disconnect`-Funktion** — setzt `autoReconnect = false` vor dem Disconnect:

```ts
async function disconnect() {
  autoReconnect = false;
  await uartSetAutoReconnect(false);
  await uartDisconnect();
}
```

---

## Tests

### Rust (`src-tauri/src/commands/uart.rs`)

```rust
#[test]
fn reconnecting_payload_serializes_active() {
    let p = ReconnectingPayload { active: true };
    let json = serde_json::to_string(&p).unwrap();
    assert!(json.contains("\"active\":true"));
}

#[test]
fn reconnecting_payload_serializes_inactive() {
    let p = ReconnectingPayload { active: false };
    let json = serde_json::to_string(&p).unwrap();
    assert!(json.contains("\"active\":false"));
}
```

### Frontend (`src/lib/stores/uart.test.ts`)

```ts
it('uartReconnecting starts as false', () => {
  expect(get(uartReconnecting)).toBe(false);
});
it('uartReconnecting can be set to true', () => {
  uartReconnecting.set(true);
  expect(get(uartReconnecting)).toBe(true);
});
```

---

## Dateien-Übersicht

| Aktion | Pfad                                  |
| ------ | ------------------------------------- |
| Modify | `src-tauri/src/state.rs`              |
| Modify | `src-tauri/src/commands/uart.rs`      |
| Modify | `src-tauri/src/lib.rs`                |
| Modify | `src/lib/stores/uart.ts`              |
| Modify | `src/lib/stores/uart.test.ts`         |
| Modify | `src/lib/api/tauri.ts`                |
| Modify | `src/lib/components/UartPanel.svelte` |
