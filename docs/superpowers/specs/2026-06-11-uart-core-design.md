# UART Core Implementation Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement full PS5 UART diagnostics — serial connection, PS5 protocol (checksum, errlog/version commands), response parsing, error code database with local caching, and a real-time frontend UI with auto-poll support.

**Architecture:** The Rust backend owns the serial port in a dedicated `std::thread`; the thread reads lines and pushes Tauri events to the frontend. A separate `ErrorDb` struct (backed by a local JSON cache) decodes error codes. The frontend listens for events, renders decoded entries as rich cards, and offers manual and auto-poll modes.

**Tech Stack:** `serialport 4` (Rust, blocking I/O), `reqwest` (blocking, for DB fetch), `thiserror`, `tracing`, SvelteKit + Svelte 5, Tauri v2 events.

---

## 1. Rust Backend — `crates/fixplay-uart`

### 1.1 `port.rs` — Real Connection

`UartPort` gains an `Arc<AtomicBool>` stop-flag and `Arc<Mutex<Option<Box<dyn serialport::SerialPort>>>>` port handle.

`connect(port: &str, baud_rate: u32)`:
- Opens port via `serialport::new(port, baud_rate).timeout(Duration::from_millis(100)).open()`
- Stores the open port in the shared handle
- Sets `connected = true`

`disconnect()`:
- Sets stop-flag to `true`
- Drops the port from the shared handle
- Sets `connected = false`

`write_line(line: &str)`:
- Writes bytes to the open port
- Returns `Err(UartError::NotConnected)` if port is not open

### 1.2 `protocol.rs` (new file)

**Checksum:** `(cmd.bytes().map(|b| b as u32).sum::<u32>() % 256) as u8`

**`build_command(cmd: &str) -> String`:**
```
format!("{}:{:02X}\r\n", cmd, checksum(cmd))
```

Examples:
- `"errlog"` → checksum = `(101+114+114+108+111+103) % 256 = 155 = 0x9B` → `"errlog:9B\r\n"`
- `"version"` → checksum calculated same way → `"version:XX\r\n"`

**`parse_errlog_line(line: &str) -> Option<ErrlogEntry>`:**
- Splits on `,`
- Expects exactly 9 comma-separated hex fields
- Returns `None` if format doesn't match (raw line is still emitted)

**Field layout (from C# reference tool):**

| Index | Name | Format | Notes |
|-------|------|--------|-------|
| 0 | ErrorCode | 8 hex chars | `u32` |
| 1 | Timestamp | 8 hex chars | `u32`, seconds |
| 2 | PowerStates | 8 hex chars | `u32` |
| 3 | UpCause | 8 hex chars | `u32` |
| 4 | TempSoC | 4 hex chars | high byte + low byte / 256.0 |
| 5–8 | Reserved | — | stored as raw strings |

**Temperature decode:** `temp_soc = (raw >> 8) as f32 + ((raw & 0xFF) as f32 / 256.0)`

### 1.3 `ErrlogEntry` in `fixplay-core/src/types.rs` (new struct)

```rust
pub struct ErrlogEntry {
    pub error_code:   u32,
    pub timestamp:    u32,
    pub power_states: u32,
    pub up_cause:     u32,
    pub temp_soc:     f32,
    pub raw_fields:   [String; 4],  // fields 5-8
}
```

Derives: `Debug, Clone, Serialize, Deserialize`.

### 1.4 `error_db.rs` (new file in `crates/fixplay-uart/src/`)

```rust
pub struct ErrorDb {
    entries: HashMap<u32, ErrorEntry>,
}

pub struct ErrorEntry {
    pub code:        u32,
    pub description: String,
    pub category:    String,
}
```

- `ErrorDb::from_cache(path: &Path) -> Result<Self, UartError>` — reads and parses local JSON
- `ErrorDb::fetch_and_cache(path: &Path) -> Result<Self, UartError>` — HTTP GET from GitHub raw URL, writes to `path`, parses result
- `ErrorDb::lookup(&self, code: u32) -> Option<&ErrorEntry>`

The GitHub JSON URL is `https://raw.githubusercontent.com/amoamare/Console-Service-Tool/master/Resources/ErrorCodes.json`.

JSON format from the reference tool:
```json
[{ "Code": 2147484673, "Description": "...", "Category": "..." }]
```
`Code` is decimal; parsed as `u32`.

**Startup logic:** Try `from_cache` first. If the cache file doesn't exist, call `fetch_and_cache` automatically.

**`reqwest` dependency** added to `fixplay-uart/Cargo.toml` with `features = ["blocking"]`.

---

## 2. Tauri Layer — `src-tauri/src/`

### 2.1 `state.rs` — AppState additions

```rust
pub struct AppState {
    pub ch341:      Mutex<Option<Ch341Device>>,
    pub uart:       Mutex<Option<UartPort>>,
    pub uart_stop:  Mutex<Option<Arc<AtomicBool>>>,
    pub uart_thread: Mutex<Option<JoinHandle<()>>>,
    pub error_db:   Mutex<Option<ErrorDb>>,
}
```

`Default` implemented manually (all `None`).

### 2.2 `commands/uart.rs` — Commands

| Command | Signature | Effect |
|---------|-----------|--------|
| `uart_list_ports` | `() -> Result<Vec<String>, String>` | Returns `UartPort::list_ports()` |
| `uart_connect` | `(port: String, state, app_handle)` | Opens port, spawns reader thread |
| `uart_disconnect` | `(state, app_handle)` | Sets stop-flag, joins thread, emits `uart://status` |
| `uart_send_errlog` | `(state)` | Writes `build_command("errlog")` to port |
| `uart_send_version` | `(state)` | Writes `build_command("version")` to port |
| `uart_set_auto_poll` | `(enabled: bool, state)` | Starts/stops 5s auto-errlog timer |
| `uart_update_error_db` | `(state, app_handle)` | Fetches fresh DB, emits `uart://db_updated` |

### 2.3 Reader Thread (spawned by `uart_connect`)

```
loop {
  if stop_flag.load(Ordering::Relaxed) { break; }
  match port.read_line() {
    Ok(Some(line)) => {
      app_handle.emit("uart://line", &line);
      if let Some(entry) = parse_errlog_line(&line) {
        let description = error_db.lookup(entry.error_code).map(|e| e.description.clone());
        app_handle.emit("uart://entry", UartEntryEvent { entry, description });
      }
    }
    Ok(None) => { /* timeout, continue */ }
    Err(_) => { app_handle.emit("uart://status", false); break; }
  }
}
```

### 2.4 Tauri Events (backend → frontend)

| Event | Payload | When |
|-------|---------|------|
| `uart://line` | `String` | Every raw line received |
| `uart://entry` | `{ entry: ErrlogEntry, description: Option<String> }` | When a line parses as ErrlogEntry |
| `uart://status` | `{ connected: bool }` | On connect, disconnect, or read error |
| `uart://db_updated` | `()` | After successful DB fetch |

All new commands registered in `src-tauri/src/lib.rs` `invoke_handler`.

---

## 3. Frontend

### 3.1 `src/lib/api/types.ts` additions

```ts
export interface ErrlogEntry {
  error_code: number;
  timestamp: number;
  power_states: number;
  up_cause: number;
  temp_soc: number;
  raw_fields: [string, string, string, string];
}

export interface UartEntryEvent {
  entry: ErrlogEntry;
  description: string | null;
}

export interface UartLogEntry {
  id: number;                  // monotonic counter, for keyed {#each}
  timestamp_ms: number;        // Date.now() when received
  raw: string;
  parsed?: UartEntryEvent;
}
```

### 3.2 `src/lib/stores/uart.ts` (replace)

```ts
export const uartConnected = writable<boolean>(false);
export const uartPorts     = writable<string[]>([]);
export const uartLog       = writable<UartLogEntry[]>([]);
export const autoPollEnabled = writable<boolean>(false);
```

### 3.3 `src/lib/api/tauri.ts` additions

```ts
export const uartListPorts   = () => invoke<string[]>('uart_list_ports');
export const uartConnect     = (port: string) => invoke<void>('uart_connect', { port });
export const uartDisconnect  = () => invoke<void>('uart_disconnect');
export const uartSendErrlog  = () => invoke<void>('uart_send_errlog');
export const uartSendVersion = () => invoke<void>('uart_send_version');
export const uartSetAutoPoll = (enabled: boolean) => invoke<void>('uart_set_auto_poll', { enabled });
export const uartUpdateDb    = () => invoke<void>('uart_update_error_db');
```

### 3.4 `UartPanel.svelte` (full rewrite)

**Controls bar:**
- `<select>` populated from `$uartPorts` (refreshed on mount and on "Refresh" button)
- "Verbinden" / "Trennen" button (disabled if no port selected)
- "Errlog" button (disabled if not connected)
- "Auto-Poll" toggle checkbox (calls `uartSetAutoPoll`)
- "DB aktualisieren" button

**Log area** (scrollable, newest entries prepended):
- Raw-only lines: `font-mono text-xs text-green-400`
- Parsed entries: styled card showing:
  - Error code (hex) in red/orange + description text
  - Temperature: `XX.X °C`
  - PowerStates, UpCause: hex values
  - Relative timestamp

**Event setup (on mount, cleaned up on destroy):**
```ts
const unsubLine   = await listen('uart://line',   handleLine);
const unsubEntry  = await listen('uart://entry',  handleEntry);
const unsubStatus = await listen('uart://status', handleStatus);
onDestroy(() => { unsubLine(); unsubEntry(); unsubStatus(); });
```

---

## 4. Error Handling

- `UartError::PortNotFound(String)` — already defined
- `UartError::Serial(String)` — already defined
- `UartError::NotConnected` — already defined
- New: `UartError::DbFetch(String)` for HTTP errors
- All Tauri commands return `Result<T, String>` (convert via `.map_err(|e| e.to_string())`)

---

## 5. Testing

**`protocol.rs` unit tests:**
- `checksum("errlog")` returns correct value
- `build_command("errlog")` produces correct formatted string
- `parse_errlog_line` returns `Some` on valid 9-field input
- `parse_errlog_line` returns `None` on malformed input
- Temperature decode: `0x3400` → `52.0`, `0x3480` → `52.5`

**`error_db.rs` unit tests:**
- `lookup` finds known code
- `lookup` returns `None` for unknown code
- Round-trip: JSON parse → lookup

**`port.rs` unit tests:**
- Already have: `new_port_is_disconnected`, `disconnect_ok`, `read_line_when_disconnected`

**Frontend store tests (`uart.test.ts` extended):**
- `uartLog` appends on `handleLine`
- `uartConnected` updates on `handleStatus`
