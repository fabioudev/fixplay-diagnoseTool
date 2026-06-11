# Tab System, Dump Archive Browser & Error-DB UI — Design Spec

## Overview

Three coordinated UI/backend improvements:
1. **Tab system** — replace side-by-side layout with a top-level tab bar (`[NOR Flash]` / `[UART]`)
2. **Dump Archive Browser** — collapsible section inside the Flash tab listing saved NOR dumps with actions
3. **Error-DB UI** — count badge + search field inside the UART tab

---

## Feature 1: Tab System

### Layout

`+page.svelte` is rebuilt around a tab bar. Two tabs: **NOR Flash** and **UART**. Active tab stored as `$state<'flash' | 'uart'>`.

```
┌─────────────────────────────────────┐
│  [NOR Flash ●]  [UART]              │
├─────────────────────────────────────┤
│                                     │
│  active panel content               │
│                                     │
└─────────────────────────────────────┘
```

### Mount strategy

- `UartPanel` stays **always mounted** (hidden via `class="hidden"` when inactive) so auto-poll and event listeners survive tab switches.
- `FlashPanel` + `ArchiveSection` only render when the Flash tab is active (`{#if activeTab === 'flash'}`).

### Styling

Tab bar: `bg-gray-900` background, active tab has `border-b-2 border-blue-500 text-white`, inactive is `text-gray-400 hover:text-gray-200`. Matches existing dark theme.

### Files changed

- `src/routes/+page.svelte` — rewritten

---

## Feature 2: Dump Archive Browser

### Rust backend

Two new Tauri commands in `src-tauri/src/commands/flash.rs`:

**`archive_list_dumps(app: AppHandle) -> Result<Vec<SerialArchive>, String>`**

Reads `{app_data_dir}/dumps/`. For each subdirectory (= serial number), finds all `.json` metadata files, parses them, and returns the structured list sorted by timestamp descending.

Return type (serialized to frontend):
```rust
pub struct DumpEntry {
    pub bin_path:      String,
    pub timestamp:     u64,
    pub size_bytes:    usize,
    pub validation_ok: bool,
    pub fw_version:    Option<String>,
    pub serial:        String,
}

pub struct SerialArchive {
    pub serial: String,
    pub dumps:  Vec<DumpEntry>,
}
```

**`archive_delete_dump(bin_path: String) -> Result<(), String>`**

Deletes `{bin_path}` and `{bin_path}.json` (derived by replacing `.bin` extension with `.json`). Returns error if `.bin` does not exist.

Both commands registered in `src-tauri/src/lib.rs`.

### Frontend types

Added to `src/lib/api/types.ts`:

```ts
export interface DumpEntry {
  bin_path:      string;
  timestamp:     number;
  size_bytes:    number;
  validation_ok: boolean;
  fw_version:    string | null;
  serial:        string;
}

export interface SerialArchive {
  serial: string;
  dumps:  DumpEntry[];
}
```

### Store

Added to `src/lib/stores/flash.ts`:

```ts
export const flashWritePath = writable<string | null>(null);
```

When set, the "Schreiben" button in `FlashPanel` uses this path directly instead of opening the file dialog. Cleared after write completes or on error.

`FlashPanel.svelte` updated: if `$flashWritePath !== null`, skip `openDialog` and use the stored path.

### API wrappers

Added to `src/lib/api/tauri.ts`:

```ts
export const archiveListDumps  = () => invoke<SerialArchive[]>('archive_list_dumps');
export const archiveDeleteDump = (binPath: string) =>
  invoke<void>('archive_delete_dump', { binPath });
```

### Component: `ArchiveSection.svelte`

New file: `src/lib/components/ArchiveSection.svelte`

**State:**
- `open: boolean` — collapsed/expanded
- `archives: SerialArchive[]` — loaded on mount and after delete
- `loading: boolean`

**Header:** "Archiv (N Dumps)" + chevron toggle. N = total dump count across all serials.

**Body (when open):**
- Groups by serial number (bold label + dump count)
- Each dump entry: formatted date, firmware version (or "—"), green/red validation badge
- Three action buttons per entry:
  - **Laden** — sets `flashWritePath` store to `entry.bin_path`; visual confirmation ("Geladen ✓" for 2s)
  - **Ordner öffnen** — calls `openPath(entry.bin_path.replace(/\/[^/]+$/, ''))`
  - **Löschen** — shows inline confirmation ("Wirklich löschen?"), on confirm calls `archiveDeleteDump`, reloads list

**Refresh:** Called on mount. Also subscribes to `$flashResult` store — whenever `flashResult` changes to a non-null value, the archive list is reloaded automatically (a successful read always produces a new dump).

**Placement:** Rendered below the existing `FlashPanel` content inside the Flash tab in `+page.svelte`.

---

## Feature 3: Error-DB UI

### Rust backend changes

**`uart_update_error_db`** — return type changed from `Result<(), String>` to `Result<usize, String>`. Returns `db.len()` after update.

New method on `ErrorDb`:
```rust
pub fn len(&self) -> usize { self.entries.len() }
pub fn is_empty(&self) -> bool { self.entries.is_empty() }
```

**New command: `uart_get_db_info(state) -> Result<Option<usize>, String>`**

Returns `Some(count)` if DB is loaded, `None` if not. Called on mount to populate the count badge without triggering a download.

**New command: `uart_search_error_db(state, query: String) -> Result<Vec<ErrorSearchResult>, String>`**

```rust
pub struct ErrorSearchResult {
    pub code:        u32,
    pub description: String,
    pub category:    String,
}
```

Search logic:
- If `query` parses as `u32` → exact lookup, returns 0 or 1 result
- Otherwise → case-insensitive substring match on `description`, max 20 results

### Frontend types

Added to `src/lib/api/types.ts`:

```ts
export interface ErrorSearchResult {
  code:        number;
  description: string;
  category:    string;
}
```

### Store

Added to `src/lib/stores/uart.ts`:

```ts
export const dbCodeCount = writable<number | null>(null);
```

`null` = not loaded, `number` = count of loaded codes.

### API wrappers

Added to `src/lib/api/tauri.ts`:

```ts
export const uartGetDbInfo      = () => invoke<number | null>('uart_get_db_info');
export const uartSearchErrorDb  = (query: string) =>
  invoke<ErrorSearchResult[]>('uart_search_error_db', { query });
```

`uartUpdateErrorDb` return type updated from `invoke<void>` to `invoke<number>`.

### UartPanel changes

**Count badge:** Next to "DB aktualisieren" button:
- `$dbCodeCount === null` → `"Nicht geladen"` (gray)
- `$dbCodeCount !== null` → `"${$dbCodeCount.toLocaleString()} Codes"` (green)

On mount: calls `uartGetDbInfo()` and sets `dbCodeCount`. After `updateDb()` succeeds: sets `dbCodeCount` from return value.

**Search field:** Input above the live log, placeholder `"Code oder Beschreibung…"`. Debounced 300ms. On change:
- Calls `uartSearchErrorDb(query)`, shows results in a small dropdown/panel below the input
- Also filters `$uartLog` — only entries whose `raw` string contains the query are shown (when query non-empty)
- Clear button (×) resets query and filter

Search results panel shows up to 20 rows: `[code in hex] Description (Category)`. Clicking a result fills the search input with that code and closes the dropdown.

---

## Files Summary

| Action | Path |
|--------|------|
| Rewrite | `src/routes/+page.svelte` |
| Modify  | `src/lib/components/FlashPanel.svelte` |
| Create  | `src/lib/components/ArchiveSection.svelte` |
| Modify  | `src/lib/components/UartPanel.svelte` |
| Modify  | `src/lib/stores/flash.ts` |
| Modify  | `src/lib/stores/uart.ts` |
| Modify  | `src/lib/api/types.ts` |
| Modify  | `src/lib/api/tauri.ts` |
| Modify  | `src-tauri/src/commands/flash.rs` |
| Modify  | `src-tauri/src/commands/uart.rs` |
| Modify  | `crates/fixplay-core/src/error_db.rs` → `crates/fixplay-uart/src/error_db.rs` |
| Modify  | `src-tauri/src/lib.rs` |
