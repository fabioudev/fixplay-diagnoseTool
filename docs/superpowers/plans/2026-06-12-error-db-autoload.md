# Error DB Auto-Load Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make error code descriptions always available — bundled in the app for offline use, auto-fetched in the background when no user cache exists, with live status shown in the UART panel.

**Architecture:** A new `DbStatusPayload` event (`uart://db-status`) is emitted from both the Tauri startup sequence and the manual update command. The startup loads in priority order: user cache → bundled resource → background fetch. The frontend stores loading state in a new `dbLoading` writable and updates the status badge live via the new event. The CI pipeline downloads the latest DB JSON before building so it is bundled in every release artifact.

**Tech Stack:** Rust (std::thread, Arc, Mutex, serde_json), Tauri v2 (AppHandle, resource_dir, emit), SvelteKit + Svelte 5, GitHub Actions (curl)

---

## File Map

| Action | Path                                   | Responsibility                                                             |
| ------ | -------------------------------------- | -------------------------------------------------------------------------- |
| Create | `src-tauri/resources/error_codes.json` | Placeholder `[]` — CI overwrites with real DB                              |
| Modify | `src-tauri/tauri.conf.json`            | Add `resources/error_codes.json` to bundled resources                      |
| Modify | `src-tauri/src/commands/uart.rs`       | Add `DbStatusPayload`, emit `uart://db-status` from `uart_update_error_db` |
| Modify | `src-tauri/src/lib.rs`                 | 3-step startup load + background fetch thread                              |
| Modify | `src/lib/stores/uart.ts`               | Add `dbLoading` writable                                                   |
| Modify | `src/lib/stores/uart.test.ts`          | Tests for `dbLoading`                                                      |
| Modify | `src/lib/components/UartPanel.svelte`  | New `uart://db-status` listener + status badge UX                          |
| Modify | `.github/workflows/release.yml`        | `curl` step to download latest DB before build                             |

---

## Task 1: Backend — bundled resource, db-status event, startup sequence

**Files:**

- Create: `src-tauri/resources/error_codes.json`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/commands/uart.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create the bundled resource placeholder**

```bash
mkdir -p /path/to/repo/src-tauri/resources
echo '[]' > src-tauri/resources/error_codes.json
```

The file must contain valid JSON (`[]` = empty array). `ErrorDb::from_json("[]")` returns an empty but valid DB. CI will overwrite this with the real data before building.

- [ ] **Step 2: Add the resource to `src-tauri/tauri.conf.json`**

Find the `"resources"` array (currently line 34). Change from:

```json
"resources": ["binaries/flashrom", "binaries/flashrom.exe"]
```

To:

```json
"resources": ["binaries/flashrom", "binaries/flashrom.exe", "resources/error_codes.json"]
```

- [ ] **Step 3: Write failing tests in `src-tauri/src/commands/uart.rs`**

Add `DbStatusPayload` struct and a `#[cfg(test)]` block with 2 tests. Add the struct near the top of the file (after the existing `ErrorSearchResult` struct):

```rust
#[derive(serde::Serialize, Clone)]
pub(crate) struct DbStatusPayload {
    pub loaded: bool,
    pub count:  Option<usize>,
    pub source: String,
}
```

Add at the bottom of `src-tauri/src/commands/uart.rs` (after existing tests if any, otherwise new block):

```rust
#[cfg(test)]
mod db_status_tests {
    use super::*;

    #[test]
    fn db_status_payload_serializes_loaded() {
        let p = DbStatusPayload { loaded: true, count: Some(1234), source: "cache".into() };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"loaded\":true"));
        assert!(json.contains("\"count\":1234"));
        assert!(json.contains("\"source\":\"cache\""));
    }

    #[test]
    fn db_status_payload_serializes_failed() {
        let p = DbStatusPayload { loaded: false, count: None, source: "failed".into() };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"loaded\":false"));
        assert!(json.contains("\"count\":null"));
    }
}
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd src-tauri && cargo test db_status -- --nocapture 2>&1 | tail -15
```

Expected: compile error — `DbStatusPayload` not defined yet.

- [ ] **Step 5: Add `DbStatusPayload` to `src-tauri/src/commands/uart.rs`**

Insert after the existing `ErrorSearchResult` struct (around line 28):

```rust
#[derive(serde::Serialize, Clone)]
pub(crate) struct DbStatusPayload {
    pub loaded: bool,
    pub count:  Option<usize>,
    pub source: String,
}
```

- [ ] **Step 6: Replace `uart://db_updated` with `uart://db-status` in `uart_update_error_db`**

In `uart_update_error_db` (around line 179), replace:

```rust
    app.emit("uart://db_updated", ()).map_err(|e| e.to_string())?;
    Ok(count)
```

With:

```rust
    app.emit("uart://db-status", DbStatusPayload {
        loaded: true,
        count:  Some(count),
        source: "fetched".into(),
    }).map_err(|e| e.to_string())?;
    Ok(count)
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd src-tauri && cargo test db_status -- --nocapture 2>&1 | tail -10
```

Expected: 2 tests PASS.

- [ ] **Step 8: Update `src-tauri/src/lib.rs` — 3-step startup + background fetch**

Replace the entire `.setup(|app| { ... })` closure with:

```rust
        .setup(|app| {
            let cache_path    = app.path().app_data_dir()?.join("error_codes.json");
            let resource_path = app.path().resource_dir().ok()
                                   .map(|r| r.join("error_codes.json"));
            let state         = app.state::<AppState>();

            // Step 1: try user cache
            let cache_ok = match fixplay_uart::ErrorDb::from_cache(&cache_path) {
                Ok(db) => {
                    let count = db.len();
                    *state.error_db.lock().unwrap() = Some(db);
                    tracing::info!("error DB loaded from cache ({} codes)", count);
                    let _ = app.handle().emit("uart://db-status",
                        crate::commands::uart::DbStatusPayload {
                            loaded: true, count: Some(count), source: "cache".into(),
                        });
                    true
                }
                Err(e) => { tracing::warn!("error DB cache miss: {}", e); false }
            };

            // Step 2: try bundled resource (only if no user cache)
            if !cache_ok {
                if let Some(ref rpath) = resource_path {
                    if let Ok(db) = fixplay_uart::ErrorDb::from_cache(rpath) {
                        let count = db.len();
                        *state.error_db.lock().unwrap() = Some(db);
                        tracing::info!("error DB loaded from bundled resource ({} codes)", count);
                        let _ = std::fs::copy(rpath, &cache_path);
                        let _ = app.handle().emit("uart://db-status",
                            crate::commands::uart::DbStatusPayload {
                                loaded: true, count: Some(count), source: "bundled".into(),
                            });
                    }
                }

                // Step 3: spawn background fetch
                let error_db   = std::sync::Arc::clone(&state.error_db);
                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    match fixplay_uart::ErrorDb::fetch_and_cache(&cache_path) {
                        Ok(db) => {
                            let count = db.len();
                            *error_db.lock().unwrap() = Some(db);
                            tracing::info!("error DB fetched in background ({} codes)", count);
                            let _ = app_handle.emit("uart://db-status",
                                crate::commands::uart::DbStatusPayload {
                                    loaded: true, count: Some(count), source: "fetched".into(),
                                });
                        }
                        Err(e) => {
                            tracing::warn!("background DB fetch failed: {}", e);
                            let loaded = error_db.lock().unwrap().is_some();
                            let count  = error_db.lock().unwrap()
                                            .as_ref().map(|db| db.len());
                            let _ = app_handle.emit("uart://db-status",
                                crate::commands::uart::DbStatusPayload {
                                    loaded, count, source: "failed".into(),
                                });
                        }
                    }
                });
            }

            Ok(())
        })
```

- [ ] **Step 9: Build to verify it compiles**

```bash
cd src-tauri && cargo build 2>&1 | tail -20
```

Expected: compiles without errors or warnings.

- [ ] **Step 10: Run full test suite**

```bash
cd src-tauri && cargo test 2>&1 | grep -E "test result|FAILED"
```

Expected: all tests pass, no regressions (14+ tests).

- [ ] **Step 11: Commit**

```bash
git add src-tauri/resources/error_codes.json \
        src-tauri/tauri.conf.json \
        src-tauri/src/commands/uart.rs \
        src-tauri/src/lib.rs
git commit -m "feat(tauri): add error DB bundled resource, db-status event, and background auto-fetch"
```

---

## Task 2: Frontend — dbLoading store + UartPanel status badge

**Files:**

- Modify: `src/lib/stores/uart.ts`
- Modify: `src/lib/stores/uart.test.ts`
- Modify: `src/lib/components/UartPanel.svelte`

- [ ] **Step 1: Write failing tests in `src/lib/stores/uart.test.ts`**

Add `dbLoading` to the import line (line 3):

```ts
import {
  uartLog,
  uartConnected,
  uartPorts,
  autoPollEnabled,
  nextLogId,
  dbCodeCount,
  dbLoading,
} from './uart';
```

Add to the `beforeEach` block:

```ts
dbLoading.set(false);
```

Add two new tests at the end of the `describe` block:

```ts
it('dbLoading starts as false', () => {
  expect(get(dbLoading)).toBe(false);
});

it('dbLoading can be set to true', () => {
  dbLoading.set(true);
  expect(get(dbLoading)).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test -- uart 2>&1 | tail -15
```

Expected: FAIL — `dbLoading` not exported from `./uart`.

- [ ] **Step 3: Add `dbLoading` to `src/lib/stores/uart.ts`**

Append after `dbCodeCount`:

```ts
export const dbLoading = writable<boolean>(false);
```

Full file after change:

```ts
import { writable } from 'svelte/store';
import type { UartLogEntry } from '$lib/api/types';

export const uartConnected = writable<boolean>(false);
export const uartPorts = writable<string[]>([]);
export const uartLog = writable<UartLogEntry[]>([]);
export const autoPollEnabled = writable<boolean>(false);
export const dbCodeCount = writable<number | null>(null);
export const dbLoading = writable<boolean>(false);

let _nextId = 0;
export function nextLogId(): number {
  return _nextId++;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- uart 2>&1 | tail -15
```

Expected: all uart store tests PASS (11 tests including the 2 new ones).

```bash
npm run test 2>&1 | tail -5
```

Expected: full suite passes, no regressions.

- [ ] **Step 5: Update `src/lib/components/UartPanel.svelte`**

**5a — Update the import line** at the top of the script (line 4):

```ts
import {
  uartConnected,
  uartPorts,
  uartLog,
  autoPollEnabled,
  nextLogId,
  dbCodeCount,
  dbLoading,
} from '$lib/stores/uart';
```

**5b — Update `onMount`** to set `dbLoading` and listen for `uart://db-status`.

In the `onMount` block, replace:

```ts
const count = await uartGetDbInfo().catch(() => null);
dbCodeCount.set(count ?? null);
```

With:

```ts
const count = await uartGetDbInfo().catch(() => null);
dbCodeCount.set(count ?? null);
if (count === null) {
  dbLoading.set(true);
}
```

Add a fourth listener alongside `u1, u2, u3`. Change:

```ts
    const [u1, u2, u3] = await Promise.all([
```

to:

```ts
    const [u1, u2, u3, u4] = await Promise.all([
```

And add the fourth listener at the end of the `Promise.all` array (after the `uart://status` listener):

```ts
      listen<{ loaded: boolean; count: number | null; source: string }>('uart://db-status', (e) => {
        dbCodeCount.set(e.payload.loaded ? (e.payload.count ?? null) : null);
        dbLoading.set(false);
      }),
```

Update the `unlisten.push` call:

```ts
unlisten.push(u1, u2, u3, u4);
```

**5c — Replace the DB status badge** in the template. Find the existing status section (the `<div class="flex items-center gap-2 ml-auto">` block containing `dbCodeCount` and `DB aktualisieren`):

```svelte
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
```

Replace with:

```svelte
<div class="flex items-center gap-2 ml-auto">
  {#if $dbLoading}
    <span class="text-xs text-gray-500 flex items-center gap-1">
      <span class="inline-block animate-spin">⟳</span> Lade DB…
    </span>
  {:else if $dbCodeCount !== null}
    <span class="text-xs text-green-400">{$dbCodeCount.toLocaleString()} Codes</span>
  {:else}
    <span class="text-xs text-red-400">Nicht geladen</span>
  {/if}
  <button
    onclick={updateDb}
    disabled={dbUpdating}
    class="px-3 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200
               disabled:opacity-40"
  >
    {dbUpdating ? 'Updating…' : 'DB aktualisieren'}
  </button>
</div>
```

Also update `updateDb` to set `dbLoading` while fetching. Replace the current `updateDb` function:

```ts
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
```

With:

```ts
async function updateDb() {
  dbUpdating = true;
  dbLoading.set(true);
  try {
    const count = await uartUpdateDb();
    dbCodeCount.set(count);
    dbLoading.set(false);
  } catch (e) {
    console.error(e);
    dbLoading.set(false);
  } finally {
    dbUpdating = false;
  }
}
```

- [ ] **Step 6: Run full test suite**

```bash
npm run test 2>&1 | tail -5
```

Expected: all tests pass (21 tests across 3 files — 2 new uart store tests added).

- [ ] **Step 7: Build to verify no TypeScript errors**

```bash
npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/lib/stores/uart.ts src/lib/stores/uart.test.ts \
        src/lib/components/UartPanel.svelte
git commit -m "feat(frontend): add dbLoading store and live db-status badge in UART panel"
```

---

## Task 3: CI — Bundle DB in release workflow

**Files:**

- Modify: `.github/workflows/release.yml`

No automated test for YAML — verify by reading the diff after editing.

- [ ] **Step 1: Add the DB download step to `.github/workflows/release.yml`**

Insert a new step between `Install dependencies` (line 112–113) and `Build Tauri bundles` (line 115–116):

```yaml
- name: Bundle latest Error DB
  run: curl -fsSL "https://raw.githubusercontent.com/amoamare/Console-Service-Tool/master/Resources/ErrorCodes.json" -o src-tauri/resources/error_codes.json
```

After the edit, the relevant section should look like:

```yaml
- name: Install dependencies
  run: npm ci

- name: Bundle latest Error DB
  run: curl -fsSL "https://raw.githubusercontent.com/amoamare/Console-Service-Tool/master/Resources/ErrorCodes.json" -o src-tauri/resources/error_codes.json

- name: Build Tauri bundles
  run: npm run tauri build ${{ matrix.build_args }}
```

`-f` makes curl fail on HTTP errors, `-s` suppresses progress, `-L` follows redirects. If the download fails, the CI job fails loudly — no silent empty bundle.

- [ ] **Step 2: Verify the YAML is syntactically valid**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/release.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Step 3: Run full test suite one final time**

```bash
npm run test 2>&1 | tail -5 && cd src-tauri && cargo test 2>&1 | grep -E "test result|FAILED"
```

Expected: all frontend and Rust tests pass.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat(ci): bundle latest error DB JSON before each release build"
```
