# UART Auto-Reconnect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a serial port connection drops, the app automatically attempts to reconnect every 2 seconds until it succeeds, controlled by a user-facing checkbox.

**Architecture:** A new `reconnect_loop` thread in Rust polls the port every 2s; it is spawned from both the reader-loop and poll-loop error paths when `auto_reconnect` is enabled. A `spawn_reconnect_if_enabled` helper avoids code duplication. The frontend adds a `uartReconnecting` store and a new `uart://reconnecting` listener; the connect button shows `⟳ Reconnecting…` (clickable to cancel) while the thread is active.

**Tech Stack:** Rust (std::thread, Arc, AtomicBool, serialport), Tauri v2 (AppHandle, State, Emitter), SvelteKit + Svelte 5 (writable store, listen)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src-tauri/src/state.rs` | Add 4 reconnect fields to AppState |
| Modify | `src-tauri/src/commands/uart.rs` | ReconnectingPayload, reconnect_loop, spawn_reconnect_if_enabled, uart_set_auto_reconnect, modify uart_connect / uart_disconnect / reader_loop / poll_loop |
| Modify | `src-tauri/src/lib.rs` | Register uart_set_auto_reconnect in invoke_handler |
| Modify | `src/lib/stores/uart.ts` | Add uartReconnecting writable |
| Modify | `src/lib/stores/uart.test.ts` | 2 new tests for uartReconnecting |
| Modify | `src/lib/api/tauri.ts` | Add uartSetAutoReconnect wrapper |
| Modify | `src/lib/components/UartPanel.svelte` | Checkbox, uart://reconnecting listener, button/status states |

---

## Task 1: Backend — reconnect state, thread, command

**Files:**
- Modify: `src-tauri/src/state.rs`
- Modify: `src-tauri/src/commands/uart.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing tests for `ReconnectingPayload` in `src-tauri/src/commands/uart.rs`**

Add at the bottom of the file (after the existing `db_status_tests` module):

```rust
#[cfg(test)]
mod reconnect_tests {
    use super::*;

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
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/fabiom/IdeaProjects/fixplay-diagnoseTool/src-tauri && cargo test reconnect 2>&1 | tail -15
```

Expected: compile error — `ReconnectingPayload` not defined yet.

- [ ] **Step 3: Add 4 new fields to `src-tauri/src/state.rs`**

The current file ends at the `Default` impl. Add the 4 new fields to the struct and their defaults. Replace the full file content with:

```rust
use fixplay_uart::{ErrorDb, UartPort};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

#[allow(dead_code)]
pub struct AppState {
    pub uart:             Mutex<Option<UartPort>>,
    pub uart_stop:        Mutex<Option<Arc<AtomicBool>>>,
    pub uart_thread:      Mutex<Option<JoinHandle<()>>>,
    pub uart_poll_stop:   Mutex<Option<Arc<AtomicBool>>>,
    pub uart_poll_thread: Mutex<Option<JoinHandle<()>>>,
    pub error_db:         Arc<Mutex<Option<ErrorDb>>>,
    pub auto_reconnect:   Arc<AtomicBool>,
    pub reconnect_port:   Mutex<Option<String>>,
    pub reconnect_stop:   Mutex<Option<Arc<AtomicBool>>>,
    pub reconnect_thread: Mutex<Option<JoinHandle<()>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            uart:             Mutex::new(None),
            uart_stop:        Mutex::new(None),
            uart_thread:      Mutex::new(None),
            uart_poll_stop:   Mutex::new(None),
            uart_poll_thread: Mutex::new(None),
            error_db:         Arc::new(Mutex::new(None)),
            auto_reconnect:   Arc::new(AtomicBool::new(false)),
            reconnect_port:   Mutex::new(None),
            reconnect_stop:   Mutex::new(None),
            reconnect_thread: Mutex::new(None),
        }
    }
}
```

- [ ] **Step 4: Add `ReconnectingPayload` struct to `src-tauri/src/commands/uart.rs`**

Insert after the `DbStatusPayload` struct (around line 35):

```rust
#[derive(Clone, Serialize)]
struct ReconnectingPayload {
    active: bool,
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /home/fabiom/IdeaProjects/fixplay-diagnoseTool/src-tauri && cargo test reconnect 2>&1 | tail -10
```

Expected: 2 tests PASS.

- [ ] **Step 6: Add `spawn_reconnect_if_enabled` helper to `src-tauri/src/commands/uart.rs`**

Add this function before `reader_loop` (which is currently the first `fn` after the `#[tauri::command]` blocks). The helper avoids code duplication between reader_loop and poll_loop:

```rust
fn spawn_reconnect_if_enabled(state: &AppState, app: &AppHandle) {
    if !state.auto_reconnect.load(Ordering::Relaxed) {
        return;
    }
    if state.reconnect_stop.lock().unwrap().is_some() {
        return; // reconnect thread already running
    }
    let port = match state.reconnect_port.lock().unwrap().clone() {
        Some(p) => p,
        None => return,
    };
    let baud_rate  = crate::settings::load_settings(app).baud_rate;
    let stop_flag  = Arc::new(AtomicBool::new(false));
    let stop_clone = Arc::clone(&stop_flag);
    let app_clone  = app.clone();
    let handle = std::thread::spawn(move || {
        reconnect_loop(port, baud_rate, app_clone, stop_clone);
    });
    *state.reconnect_stop.lock().unwrap()   = Some(stop_flag);
    *state.reconnect_thread.lock().unwrap() = Some(handle);
}
```

- [ ] **Step 7: Add `reconnect_loop` function to `src-tauri/src/commands/uart.rs`**

Add after `spawn_reconnect_if_enabled`:

```rust
fn reconnect_loop(port: String, baud_rate: u32, app: AppHandle, stop: Arc<AtomicBool>) {
    let _ = app.emit("uart://reconnecting", ReconnectingPayload { active: true });

    loop {
        // 2 seconds in 100ms increments so stop flag is checked often
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

        let open_result = serialport::new(&port, baud_rate)
            .timeout(Duration::from_millis(100))
            .open();

        if let Ok(open_port) = open_result {
            let write_port = match open_port.try_clone() { Ok(p) => p, Err(_) => continue };
            let read_port  = match open_port.try_clone() { Ok(p) => p, Err(_) => continue };
            drop(open_port);

            let state      = app.state::<AppState>();
            let db_clone   = Arc::clone(&state.error_db);
            let app_clone  = app.clone();

            {
                let mut uart_guard = state.uart.lock().unwrap();
                let uart = uart_guard.get_or_insert_with(UartPort::default);
                uart.set_port(write_port);
            }

            let new_stop   = Arc::new(AtomicBool::new(false));
            let stop_clone = Arc::clone(&new_stop);
            let handle = std::thread::spawn(move || {
                reader_loop(read_port, stop_clone, app_clone, db_clone);
            });

            *state.uart_stop.lock().unwrap()   = Some(new_stop);
            *state.uart_thread.lock().unwrap() = Some(handle);

            // Remove our own handles from state (thread is done after this return)
            state.reconnect_stop.lock().unwrap().take();
            state.reconnect_thread.lock().unwrap().take();

            let _ = app.emit("uart://reconnecting", ReconnectingPayload { active: false });
            let _ = app.emit("uart://status", StatusPayload { connected: true });
            return;
        }
    }
}
```

- [ ] **Step 8: Modify `uart_connect` to store the port name**

In `uart_connect`, add this line just before `app.emit("uart://status", ...)`:

```rust
*state.reconnect_port.lock().unwrap() = Some(port.clone());
```

The full end of `uart_connect` (lines 84–89) becomes:

```rust
    *state.uart_stop.lock().unwrap()   = Some(stop_flag);
    *state.uart_thread.lock().unwrap() = Some(handle);

    *state.reconnect_port.lock().unwrap() = Some(port);

    app.emit("uart://status", StatusPayload { connected: true })
        .map_err(|e| e.to_string())?;
    Ok(())
```

- [ ] **Step 9: Modify `uart_disconnect` to stop the reconnect thread**

After the existing thread cleanup in `uart_disconnect` (after the `uart.disconnect()` call, before `app.emit`), add:

```rust
    // Stop reconnect thread and disable auto-reconnect on manual disconnect
    if let Some(flag) = state.reconnect_stop.lock().unwrap().take() {
        flag.store(true, Ordering::Relaxed);
    }
    if let Some(handle) = state.reconnect_thread.lock().unwrap().take() {
        let _ = handle.join();
    }
    state.auto_reconnect.store(false, Ordering::Relaxed);
```

The full `uart_disconnect` function becomes:

```rust
#[tauri::command]
pub async fn uart_disconnect(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    info!("uart_disconnect invoked");

    if let Some(flag) = state.uart_stop.lock().unwrap().take() {
        flag.store(true, Ordering::Relaxed);
    }
    if let Some(handle) = state.uart_thread.lock().unwrap().take() {
        let _ = handle.join();
    }
    if let Some(uart) = state.uart.lock().unwrap().as_mut() {
        let _ = uart.disconnect();
    }

    // Stop reconnect thread and disable auto-reconnect on manual disconnect
    if let Some(flag) = state.reconnect_stop.lock().unwrap().take() {
        flag.store(true, Ordering::Relaxed);
    }
    if let Some(handle) = state.reconnect_thread.lock().unwrap().take() {
        let _ = handle.join();
    }
    state.auto_reconnect.store(false, Ordering::Relaxed);

    app.emit("uart://status", StatusPayload { connected: false })
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 10: Modify the `reader_loop` error path to spawn reconnect thread**

In the `Err(e)` arm of `reader_loop` (currently lines 270–280), after the existing `app.emit("uart://status", ...)` line, add one call:

```rust
            Err(e) => {
                error!("reader_loop error: {}", e);
                let state = app.state::<AppState>();
                if let Some(uart) = state.uart.lock().unwrap().as_mut() {
                    let _ = uart.disconnect();
                }
                state.uart_stop.lock().unwrap().take();
                state.uart_thread.lock().unwrap().take();
                let _ = app.emit("uart://status", StatusPayload { connected: false });
                spawn_reconnect_if_enabled(&state, &app);
                break;
            }
```

- [ ] **Step 11: Replace `poll_loop` to safely spawn reconnect on write error**

The current `poll_loop` holds the `uart` mutex lock when the write error occurs. To safely call `spawn_reconnect_if_enabled` (which acquires other mutexes), the lock must be released first. Replace the entire `poll_loop` function with:

```rust
fn poll_loop(app: AppHandle, stop: Arc<AtomicBool>) {
    loop {
        // Sleep 5 seconds in 100ms increments to check stop flag often
        for _ in 0..50 {
            if stop.load(Ordering::Relaxed) {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        if stop.load(Ordering::Relaxed) {
            return;
        }

        // Scope block so the uart lock is released before spawn_reconnect_if_enabled
        let had_write_error = {
            let state = app.state::<AppState>();
            let mut guard = state.uart.lock().unwrap();
            if let Some(uart) = guard.as_mut() {
                if uart.is_connected() {
                    let cmd = build_command("errlog");
                    if let Err(e) = uart.write_line(&cmd) {
                        error!("poll_loop write error: {}", e);
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            } else {
                false
            }
        }; // uart lock released here

        if had_write_error {
            let state = app.state::<AppState>();
            let _ = app.emit("uart://status", StatusPayload { connected: false });
            spawn_reconnect_if_enabled(&state, &app);
            return;
        }
    }
}
```

- [ ] **Step 12: Add `uart_set_auto_reconnect` command to `src-tauri/src/commands/uart.rs`**

Add after `uart_set_auto_poll` (around line 163):

```rust
#[tauri::command]
pub async fn uart_set_auto_reconnect(
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Always stop any running reconnect thread first
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

- [ ] **Step 13: Register `uart_set_auto_reconnect` in `src-tauri/src/lib.rs`**

In the `invoke_handler!` macro (around line 100), add after `commands::uart::uart_set_auto_poll,`:

```rust
            commands::uart::uart_set_auto_reconnect,
```

- [ ] **Step 14: Build to verify compilation**

```bash
cd /home/fabiom/IdeaProjects/fixplay-diagnoseTool/src-tauri && cargo build 2>&1 | tail -20
```

Expected: compiles with no errors. Fix any errors before continuing.

- [ ] **Step 15: Run full Rust test suite**

```bash
cd /home/fabiom/IdeaProjects/fixplay-diagnoseTool/src-tauri && cargo test 2>&1 | grep -E "test result|FAILED"
```

Expected: all tests pass (18+ tests including the 2 new reconnect ones).

- [ ] **Step 16: Commit**

```bash
cd /home/fabiom/IdeaProjects/fixplay-diagnoseTool
git add src-tauri/src/state.rs \
        src-tauri/src/commands/uart.rs \
        src-tauri/src/lib.rs
git commit -m "feat(tauri): add UART auto-reconnect thread and command"
```

---

## Task 2: Frontend — uartReconnecting store, API wrapper, UartPanel UI

**Files:**
- Modify: `src/lib/stores/uart.ts`
- Modify: `src/lib/stores/uart.test.ts`
- Modify: `src/lib/api/tauri.ts`
- Modify: `src/lib/components/UartPanel.svelte`

- [ ] **Step 1: Write failing tests in `src/lib/stores/uart.test.ts`**

Add `uartReconnecting` to the import (line 3):

```ts
import { uartLog, uartConnected, uartPorts, autoPollEnabled, nextLogId, dbCodeCount, dbLoading, uartReconnecting } from './uart';
```

Add to the `beforeEach` block (after `dbLoading.set(false)`):

```ts
    uartReconnecting.set(false);
```

Add two new tests at the end of the `describe` block (before the closing `}`):

```ts
  it('uartReconnecting starts as false', () => {
    expect(get(uartReconnecting)).toBe(false);
  });

  it('uartReconnecting can be set to true', () => {
    uartReconnecting.set(true);
    expect(get(uartReconnecting)).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/fabiom/IdeaProjects/fixplay-diagnoseTool && npm run test -- uart 2>&1 | tail -15
```

Expected: FAIL — `uartReconnecting` not exported from `./uart`.

- [ ] **Step 3: Add `uartReconnecting` to `src/lib/stores/uart.ts`**

After `dbLoading`, add:

```ts
export const uartReconnecting = writable<boolean>(false);
```

Full file after the change:

```ts
import { writable } from 'svelte/store';
import type { UartLogEntry } from '$lib/api/types';

export const uartConnected   = writable<boolean>(false);
export const uartPorts       = writable<string[]>([]);
export const uartLog         = writable<UartLogEntry[]>([]);
export const autoPollEnabled = writable<boolean>(false);
export const dbCodeCount     = writable<number | null>(null);
export const dbLoading       = writable<boolean>(false);
export const uartReconnecting = writable<boolean>(false);

let _nextId = 0;
export function nextLogId(): number {
  return _nextId++;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/fabiom/IdeaProjects/fixplay-diagnoseTool && npm run test -- uart 2>&1 | tail -10
```

Expected: all uart tests PASS (13 tests including the 2 new ones).

```bash
npm run test 2>&1 | tail -5
```

Expected: full suite passes.

- [ ] **Step 5: Add `uartSetAutoReconnect` to `src/lib/api/tauri.ts`**

After `uartSetAutoPoll`:

```ts
export const uartSetAutoReconnect = (enabled: boolean): Promise<void> =>
  invoke<void>('uart_set_auto_reconnect', { enabled });
```

- [ ] **Step 6: Update `src/lib/components/UartPanel.svelte`**

Read the full file first, then apply all changes:

**6a — Update imports** (script top):

```ts
import { uartConnected, uartPorts, uartLog, autoPollEnabled, nextLogId, dbCodeCount, dbLoading, uartReconnecting } from '$lib/stores/uart';
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

**6b — Replace `toggleConnect` with `connect` + `disconnect` + `autoReconnect` state**

Remove:
```ts
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
```

Add in its place:
```ts
  let autoReconnect = $state(false);

  async function connect() {
    loading = true;
    try {
      await uartConnect(selectedPort);
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  async function disconnect() {
    autoReconnect = false;
    await uartSetAutoReconnect(false).catch(console.error);
    loading = true;
    try {
      await uartDisconnect();
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }
```

**6c — Add `u5` listener for `uart://reconnecting` in `onMount`**

Change:
```ts
    const [u1, u2, u3, u4] = await Promise.all([
```
to:
```ts
    const [u1, u2, u3, u4, u5] = await Promise.all([
```

Add the fifth listener at the end of the Promise.all array (after the `uart://db-status` listener):
```ts
      listen<{ active: boolean }>('uart://reconnecting', (e) => {
        uartReconnecting.set(e.payload.active);
      }),
```

Change `unlisten.push(u1, u2, u3, u4)` to `unlisten.push(u1, u2, u3, u4, u5)`.

Also in the `uart://status` listener, add a safety reset for `uartReconnecting`:
```ts
      listen<UartStatusEvent>('uart://status', (e) => {
        uartConnected.set(e.payload.connected);
        if (e.payload.connected) uartReconnecting.set(false);
      }),
```

**6d — Add `uartReconnecting.set(false)` in `onDestroy`**

```ts
  onDestroy(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    unlisten.forEach((fn) => fn());
    dbLoading.set(false);
    uartReconnecting.set(false);
  });
```

**6e — Update the connect button in the template**

Replace:
```svelte
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
```

With:
```svelte
    <button
      onclick={$uartConnected || $uartReconnecting ? disconnect : connect}
      disabled={loading || (!$uartConnected && !$uartReconnecting && !selectedPort)}
      class="px-3 py-1 text-sm rounded font-medium
             {$uartConnected
               ? 'bg-red-700 hover:bg-red-600 text-white'
               : $uartReconnecting
                 ? 'bg-yellow-700 hover:bg-yellow-600 text-white'
                 : 'bg-green-700 hover:bg-green-600 text-white'}
             disabled:opacity-40"
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

**6f — Add Auto-Reconnect checkbox** (after the connect button, before the Errlog button):

```svelte
    {#if $uartConnected || $uartReconnecting}
      <label class="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={autoReconnect}
          onchange={async (e) => {
            autoReconnect = (e.target as HTMLInputElement).checked;
            await uartSetAutoReconnect(autoReconnect).catch(console.error);
          }}
          class="accent-blue-500"
        />
        Auto-Reconnect
      </label>
    {/if}
```

**6g — Update port selector and refresh button disabled state** to also disable during reconnecting:

```svelte
    <select
      bind:value={selectedPort}
      disabled={$uartConnected || $uartReconnecting}
      ...
    >
```

```svelte
    <button
      onclick={refreshPorts}
      disabled={$uartConnected || $uartReconnecting}
      ...
    >
```

**6h — Update the status indicator** to show reconnecting state:

Replace:
```svelte
  <div class="flex items-center gap-2">
    <span class="w-2 h-2 rounded-full {$uartConnected ? 'bg-green-400' : 'bg-gray-600'}"></span>
    <span class="text-xs text-gray-400">
      {$uartConnected ? `Verbunden — ${selectedPort}` : 'Getrennt'}
    </span>
  </div>
```

With:
```svelte
  <div class="flex items-center gap-2">
    <span class="w-2 h-2 rounded-full
      {$uartConnected ? 'bg-green-400' : $uartReconnecting ? 'bg-yellow-400 animate-pulse' : 'bg-gray-600'}">
    </span>
    <span class="text-xs text-gray-400">
      {#if $uartReconnecting}
        Reconnecting…
      {:else if $uartConnected}
        Verbunden — {selectedPort}
      {:else}
        Getrennt
      {/if}
    </span>
  </div>
```

- [ ] **Step 7: Run full test suite**

```bash
cd /home/fabiom/IdeaProjects/fixplay-diagnoseTool && npm run test 2>&1 | tail -5
```

Expected: all tests pass (23 tests across 3 files).

- [ ] **Step 8: Build to verify no TypeScript errors**

```bash
npm run build 2>&1 | tail -10
```

Expected: build succeeds with no errors. Fix any TypeScript errors before continuing.

- [ ] **Step 9: Commit**

```bash
cd /home/fabiom/IdeaProjects/fixplay-diagnoseTool
git add src/lib/stores/uart.ts \
        src/lib/stores/uart.test.ts \
        src/lib/api/tauri.ts \
        src/lib/components/UartPanel.svelte
git commit -m "feat(frontend): add auto-reconnect toggle and reconnecting UI state"
```
