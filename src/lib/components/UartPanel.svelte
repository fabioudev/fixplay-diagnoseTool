<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import LL from '$lib/i18n/i18n-svelte';
  import HardwareGuide from './HardwareGuide.svelte';
  import { uartConnected, uartPorts, uartLog, autoPollEnabled, nextLogId, dbCodeCount, dbLoading, uartReconnecting } from '$lib/stores/uart';
  import {
    uartListPorts,
    uartConnect,
    uartDisconnect,
    uartSendErrlog,
    uartSendVersion,
    uartSendRaw,
    uartClearErrlog,
    uartSetAutoPoll,
    uartSetAutoReconnect,
    uartUpdateDb,
    uartGetDbInfo,
    uartSearchErrorDb,
    uartPoll,
    uartLoopbackTest,
    settingsGet,
    settingsSave,
  } from '$lib/api/tauri';
  import { appSettings } from '$lib/stores/settings';
  import { logTimestampFormat, formatLogTimestamp } from '$lib/utils/time';
  import { formatErrorCodeHex, formatHex8, uartLogMatches } from '$lib/utils/uartLog';
  import type { UartEntryEvent, ErrorSearchResult, UartPortInfo, UartLogEntry } from '$lib/api/types';

  let selectedPort    = $state('');
  let loading         = $state(false);
  let dbUpdating      = $state(false);
  let dbQuery         = $state('');
  let searchResults   = $state<ErrorSearchResult[]>([]);
  let loopbackPending = $state(false);
  let autoReconnect   = $state(false);

  // Raw terminal mode (#45): free-form line send with a chosen line ending.
  let rawInput      = $state('');
  let rawLineEnding = $state<'none' | 'cr' | 'lf' | 'crlf'>('crlf');

  async function sendRaw() {
    const line = rawInput;
    if (!line || !$uartConnected) return;
    pushLog(`[→ ${line}]`, 'status');
    try {
      await uartSendRaw(line, rawLineEnding);
    } catch (e) {
      pushLog(get(LL).uart.sendFailed({ error: String(e) }), 'error');
    }
    rawInput = '';
  }

  // Log filter: the box also feeds the live DB search, so both roles must
  // agree on the canonical 0xXXXXXXXX form (a decimal string used to be
  // inserted via result-click and never matched the hex log text).
  const filteredLog = $derived(
    dbQuery.trim()
      ? $uartLog.filter((e) => uartLogMatches(e, dbQuery))
      : $uartLog
  );

  let debounceTimer:    ReturnType<typeof setTimeout>  | null = null;
  let pollInterval:     ReturnType<typeof setInterval> | null = null;
  let dbLoadingTimeout: ReturnType<typeof setTimeout>  | null = null;
  let responseTimeout:  ReturnType<typeof setTimeout>  | null = null;

  // Connection state as last seen by the poll — used to detect transitions
  // without depending on Tauri events (they are not reliably delivered).
  let prevConnected    = false;
  let prevReconnecting = false;
  let gotDataSinceCommand = false;

  function pushLog(raw: string, kind?: 'status' | 'error', parsed?: UartEntryEvent) {
    const entry: UartLogEntry = { id: nextLogId(), timestamp_ms: Date.now(), raw, kind, parsed };
    uartLog.update((log) => [entry, ...log.slice(0, 499)]);
  }

  /// Before sending a command, arm a warning in case the console stays silent.
  function expectResponse(label: string, timeoutMs = 3000) {
    gotDataSinceCommand = false;
    if (responseTimeout) clearTimeout(responseTimeout);
    responseTimeout = setTimeout(() => {
      if (!gotDataSinceCommand) {
        pushLog(
          get(LL).uart.noResponse({ label }),
          'error'
        );
      }
    }, timeoutMs);
  }

  /// Translate well-known console responses into readable log entries.
  function interpretLine(raw: string): UartLogEntry {
    const base = { id: nextLogId(), timestamp_ms: Date.now() };
    if (/^NG\b/.test(raw)) {
      return { ...base, raw: get(LL).uart.commandRejected({ raw }), kind: 'error' };
    }
    if (raw.startsWith('OK')) {
      const payload = raw
        .replace(/^OK\s*/, '')
        .replace(/:[0-9A-Fa-f]{2}$/, '')
        .replace(/\s+/g, '');
      if (/^0*$/.test(payload)) {
        return { ...base, raw: get(LL).uart.emptyEntryNoError({ raw }), kind: 'status' };
      }
      if (/^0*F+$/i.test(payload)) {
        return { ...base, raw: get(LL).uart.emptyEntryCleared({ raw }), kind: 'status' };
      }
    }
    return { ...base, raw };
  }

  function formatEntry(e: UartEntryEvent): string {
    return [
      formatHex8(e.entry.error_code),
      formatHex8(e.entry.timestamp),
      formatHex8(e.entry.power_states),
      formatHex8(e.entry.up_cause),
      e.entry.temp_soc.toFixed(1) + '°C',
    ].join(', ');
  }

  async function pollTick() {
    let r;
    try {
      r = await uartPoll();
    } catch {
      return; // app shutting down or backend busy — try again next tick
    }

    // --- connection state transitions ---
    const wasConnected    = prevConnected;
    const wasReconnecting = prevReconnecting;
    prevConnected    = r.connected;
    prevReconnecting = r.reconnecting;
    uartConnected.set(r.connected);
    uartReconnecting.set(r.reconnecting);

    if (wasConnected && !r.connected) {
      if (r.reconnecting) {
        pushLog(get(LL).uart.connLostReconnecting(), 'status');
      } else {
        pushLog(get(LL).uart.connBroken(), 'error');
        autoPollEnabled.set(false);
      }
    }
    if (!wasConnected && r.connected && wasReconnecting) {
      pushLog(get(LL).uart.reconnected({ port: selectedPort }), 'status');
    }
    if (wasReconnecting && !r.reconnecting && !r.connected) {
      pushLog(get(LL).uart.reconnectDone(), 'status');
    }

    // --- error DB status ---
    if (r.db_count != null) {
      dbCodeCount.set(r.db_count);
      dbLoading.set(false);
    }

    // --- new output from the console ---
    if (r.lines.length > 0 || r.entries.length > 0) {
      gotDataSinceCommand = true;
      const items: UartLogEntry[] = [
        ...r.lines.map(interpretLine),
        ...r.entries.map((e): UartLogEntry => ({
          id: nextLogId(), timestamp_ms: Date.now(), raw: formatEntry(e), parsed: e,
        })),
      ];
      // newest first in the log view
      items.reverse();
      uartLog.update((log) => [...items, ...log].slice(0, 500));
    }

    // --- overflow warning: backend dropped lines at its buffer cap ---
    if (r.dropped_lines > 0) {
      pushLog(
        get(LL).uart.linesDropped({ count: r.dropped_lines }),
        'error',
      );
    }
  }

  function onSearchInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    dbQuery = val;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (val.trim()) {
        searchResults = await uartSearchErrorDb(val.trim()).catch(() => []);
      } else {
        searchResults = [];
      }
    }, 300);
  }

  async function refreshPorts() {
    const ports = await uartListPorts().catch(() => [] as UartPortInfo[]);
    uartPorts.set(ports);
    const bridge    = ports.find(p => p.is_bridge);
    const preferred = bridge ?? ports[0];
    if (!selectedPort && preferred) {
      selectedPort = preferred.name;
    } else if (!ports.some(p => p.name === selectedPort)) {
      selectedPort = preferred?.name ?? '';
    }
  }

  async function connect() {
    loading = true;
    try {
      await uartConnect(selectedPort);
      prevConnected = true;
      uartConnected.set(true);
      autoReconnect = $appSettings.auto_reconnect;
      pushLog(get(LL).uart.connected({ port: selectedPort }), 'status');
    } catch (e) {
      pushLog(get(LL).uart.connectError({ error: String(e) }), 'error');
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
      prevConnected    = false;
      prevReconnecting = false;
      uartConnected.set(false);
      uartReconnecting.set(false);
      autoPollEnabled.set(false);
      pushLog(get(LL).uart.disconnected(), 'status');
    } catch (e) {
      pushLog(get(LL).uart.disconnectError({ error: String(e) }), 'error');
    } finally {
      loading = false;
    }
  }

  let errlogPending = $state(false);

  async function fetchErrlog() {
    errlogPending = true;
    pushLog(get(LL).uart.errlogRequested(), 'status');
    // Arm before sending: sending all 10 queries takes ~1.5 s
    expectResponse('errlog', 5000);
    try {
      await uartSendErrlog();
    } catch (e) {
      pushLog(get(LL).uart.errlogError({ error: String(e) }), 'error');
    } finally {
      errlogPending = false;
    }
  }

  async function fetchVersion() {
    pushLog(get(LL).uart.versionRequested(), 'status');
    expectResponse('version');
    try {
      await uartSendVersion();
    } catch (e) {
      pushLog(get(LL).uart.versionError({ error: String(e) }), 'error');
    }
  }

  let confirmClear = $state(false);
  let confirmClearTimeout: ReturnType<typeof setTimeout> | null = null;

  async function clearErrlog() {
    if (!confirmClear) {
      confirmClear = true;
      if (confirmClearTimeout) clearTimeout(confirmClearTimeout);
      confirmClearTimeout = setTimeout(() => (confirmClear = false), 4000);
      return;
    }
    confirmClear = false;
    if (confirmClearTimeout) clearTimeout(confirmClearTimeout);
    pushLog(get(LL).uart.errlogClearing(), 'status');
    expectResponse('errlog clear');
    try {
      await uartClearErrlog();
    } catch (e) {
      pushLog(get(LL).uart.clearError({ error: String(e) }), 'error');
    }
  }

  async function loopbackTest() {
    loopbackPending = true;
    try {
      const ok = await uartLoopbackTest();
      if (ok) {
        pushLog('LOOPBACK:PING ✓');
      } else {
        pushLog(get(LL).uart.loopbackNoEcho(), 'error');
      }
    } catch (e) {
      pushLog(get(LL).uart.loopbackError({ error: String(e) }), 'error');
    } finally {
      loopbackPending = false;
    }
  }

  async function toggleAutoPoll(enabled: boolean) {
    try {
      await uartSetAutoPoll(enabled);
      autoPollEnabled.set(enabled);
      pushLog(enabled ? get(LL).uart.autoPollOn() : get(LL).uart.autoPollOff(), 'status');
    } catch (e) {
      pushLog(get(LL).uart.autoPollError({ error: String(e) }), 'error');
    }
  }

  async function updateDb() {
    dbUpdating = true;
    dbLoading.set(true);
    try {
      const count = await uartUpdateDb();
      dbCodeCount.set(count);
      pushLog(get(LL).uart.dbUpdated({ count: count.toLocaleString() }), 'status');
    } catch (e) {
      pushLog(get(LL).uart.dbUpdateError({ error: String(e) }), 'error');
    } finally {
      dbLoading.set(false);
      dbUpdating = false;
    }
  }

  onMount(async () => {
    await refreshPorts();

    const s = await settingsGet().catch(() => null);
    if (s) appSettings.set(s);

    const count = await uartGetDbInfo().catch(() => null);
    dbCodeCount.set(count ?? null);
    if (count === null) {
      // A background fetch may still be running — show spinner, give up after 30 s
      dbLoading.set(true);
      dbLoadingTimeout = setTimeout(() => dbLoading.set(false), 30_000);
    }

    // Single source of truth: poll the backend for everything (state + output).
    pollInterval = setInterval(pollTick, 300);
  });

  onDestroy(() => {
    if (debounceTimer)       clearTimeout(debounceTimer);
    if (pollInterval)        clearInterval(pollInterval);
    if (dbLoadingTimeout)    clearTimeout(dbLoadingTimeout);
    if (responseTimeout)     clearTimeout(responseTimeout);
    if (confirmClearTimeout) clearTimeout(confirmClearTimeout);
    dbLoading.set(false);
    uartReconnecting.set(false);
  });
</script>

<section class="flex flex-col gap-4 flex-1 bg-gray-900 rounded-lg p-4 min-h-0">
  <div>
    <h2 class="text-lg font-semibold text-gray-100">{$LL.header.uart()}</h2>
    <p class="text-xs text-gray-500 mt-0.5">
      {$LL.uart.intro()}
    </p>
  </div>

  <HardwareGuide variant="uart" />

  <!-- Controls -->
  <div class="flex flex-wrap items-center gap-2">
    <div class="relative">
      <select
        bind:value={selectedPort}
        disabled={$uartConnected || $uartReconnecting}
        title={$LL.uart.portSelectTitle()}
        class="appearance-none bg-gray-800 text-gray-100 text-sm rounded px-2 py-1 pr-6
               border border-gray-700 disabled:opacity-50 focus:outline-none"
      >
        {#each $uartPorts as p (p.name)}
          <option value={p.name}>
            {p.name}{p.is_bridge ? ` — ${p.description}` : ''}
          </option>
        {:else}
          <option value="">{$LL.uart.noPorts()}</option>
        {/each}
      </select>
      <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
    </div>

    <button
      onclick={refreshPorts}
      disabled={$uartConnected || $uartReconnecting}
      title={$LL.uart.refreshPortsTitle()}
      class="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40"
    >
      ↻
    </button>

    <button
      onclick={$uartConnected || $uartReconnecting ? disconnect : connect}
      disabled={loading || (!$uartConnected && !$uartReconnecting && !selectedPort)}
      title={$uartConnected
        ? $LL.uart.disconnectTitle()
        : $uartReconnecting
          ? $LL.uart.cancelReconnectTitle()
          : $LL.uart.connectTitle()}
      class="px-3 py-1 text-sm rounded font-medium
             {$uartConnected
               ? 'bg-red-700 hover:bg-red-600 text-white'
               : $uartReconnecting
                 ? 'bg-yellow-700 hover:bg-yellow-600 text-white'
                 : loading
                   ? 'bg-blue-800 text-white cursor-wait'
                   : 'bg-green-700 hover:bg-green-600 text-white'}
             disabled:opacity-40"
    >
      {#if $uartReconnecting}
        {$LL.uart.reconnecting()}
      {:else if $uartConnected}
        {$LL.uart.disconnectBtn()}
      {:else if loading}
        {$LL.uart.connecting()}
      {:else}
        {$LL.uart.connectBtn()}
      {/if}
    </button>

    {#if $uartConnected || $uartReconnecting}
      <label
        class="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none"
        title={$LL.uart.autoReconnectTitle()}
      >
        <input
          type="checkbox"
          checked={autoReconnect}
          onchange={async (e) => {
            const newState = (e.target as HTMLInputElement).checked;
            try {
              await uartSetAutoReconnect(newState);
              autoReconnect = newState;
              const newSettings = { ...$appSettings, auto_reconnect: newState };
              appSettings.set(newSettings);
              await settingsSave(newSettings).catch(console.error);
            } catch (err) {
              console.error(err);
            }
          }}
          class="accent-blue-500"
        />
        {$LL.uart.autoReconnect()}
      </label>
    {/if}

    <button
      onclick={fetchErrlog}
      disabled={!$uartConnected || errlogPending}
      title={$LL.uart.errlogTitle()}
      class="px-3 py-1 text-sm rounded bg-blue-700 hover:bg-blue-600 text-white
             disabled:opacity-40"
    >
      {errlogPending ? $LL.uart.errlogPending() : $LL.uart.errlog()}
    </button>

    <button
      onclick={clearErrlog}
      disabled={!$uartConnected}
      title={$LL.uart.clearTitle()}
      class="px-3 py-1 text-sm rounded text-white disabled:opacity-40
             {confirmClear
               ? 'bg-red-700 hover:bg-red-600'
               : 'bg-gray-700 hover:bg-gray-600'}"
    >
      {confirmClear ? $LL.uart.confirmClear() : $LL.uart.clearHistory()}
    </button>

    <button
      onclick={fetchVersion}
      disabled={!$uartConnected}
      title={$LL.uart.versionTitle()}
      class="px-3 py-1 text-sm rounded bg-blue-700 hover:bg-blue-600 text-white
             disabled:opacity-40"
    >
      {$LL.uart.version()}
    </button>

    <button
      onclick={loopbackTest}
      disabled={!$uartConnected || loopbackPending}
      title={$LL.uart.loopbackTitle()}
      class="px-3 py-1 text-sm rounded bg-purple-700 hover:bg-purple-600 text-white
             disabled:opacity-40"
    >
      {loopbackPending ? $LL.uart.loopbackPending() : $LL.uart.loopback()}
    </button>

    <label
      class="flex items-center gap-1 text-sm text-gray-300 select-none cursor-pointer"
      title={$LL.uart.autoPollTitle()}
    >
      <input
        type="checkbox"
        checked={$autoPollEnabled}
        disabled={!$uartConnected}
        onchange={(e) => toggleAutoPoll((e.target as HTMLInputElement).checked)}
        class="accent-blue-500 disabled:opacity-40"
      />
      {$LL.uart.autoPoll()}
    </label>

    <div class="flex items-center gap-2 ml-auto">
      {#if $dbLoading}
        <span class="text-xs text-gray-500 flex items-center gap-1" title={$LL.uart.dbLoadingTitle()}>
          <span class="inline-block animate-spin">⟳</span> {$LL.uart.loadingDb()}
        </span>
      {:else if $dbCodeCount != null}
        <span
          class="text-xs text-green-400"
          title={$LL.uart.codesTitle()}
        >
          {$LL.uart.codes({ count: $dbCodeCount.toLocaleString() })}
        </span>
      {:else}
        <span
          class="text-xs text-red-400"
          title={$LL.uart.dbNotLoadedTitle()}
        >
          {$LL.uart.dbNotLoaded()}
        </span>
      {/if}
      <button
        onclick={updateDb}
        disabled={dbUpdating}
        title={$LL.uart.updateDbTitle()}
        class="px-3 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200
               disabled:opacity-40"
      >
        {dbUpdating ? $LL.uart.updating() : $LL.uart.updateDb()}
      </button>
    </div>
  </div>

  <!-- Raw terminal (#45): send an arbitrary line with a chosen line ending -->
  {#if $uartConnected}
    <div class="flex items-center gap-2">
      <input
        type="text"
        placeholder={$LL.uart.rawPlaceholder()}
        bind:value={rawInput}
        onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendRaw(); } }}
        title={$LL.uart.rawTitle()}
        class="flex-1 bg-gray-800 text-gray-100 text-xs font-mono rounded px-2 py-1.5 border border-gray-700
               placeholder:text-gray-600 focus:outline-none focus:border-gray-500"
      />
      <select
        bind:value={rawLineEnding}
        title={$LL.uart.lineEndingTitle()}
        class="bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5 border border-gray-700 focus:outline-none focus:border-gray-500"
      >
        <option value="crlf">CR+LF</option>
        <option value="lf">LF</option>
        <option value="cr">CR</option>
        <option value="none">{$LL.uart.lineEndingNone()}</option>
      </select>
      <button
        onclick={sendRaw}
        disabled={!rawInput}
        title={$LL.uart.sendTitle()}
        class="px-3 py-1.5 text-sm rounded bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-40"
      >
        {$LL.uart.send()}
      </button>
    </div>
  {/if}

  <!-- Status indicator -->
  <div class="flex items-center gap-2">
    <span class="w-2 h-2 rounded-full
      {$uartConnected ? 'bg-green-400' : $uartReconnecting ? 'bg-yellow-400 animate-pulse' : 'bg-gray-600'}">
    </span>
    <span class="text-xs text-gray-400">
      {#if $uartReconnecting}
        {$LL.uart.statusReconnecting()}
      {:else if $uartConnected}
        {$LL.uart.statusConnected({ port: selectedPort })}
      {:else}
        {$LL.uart.statusDisconnected()}
      {/if}
    </span>
  </div>

  <!-- DB Search -->
  <div class="flex flex-col gap-1">
    <div class="relative">
      <input
        type="text"
        placeholder={$LL.uart.searchPlaceholder()}
        oninput={onSearchInput}
        value={dbQuery}
        title={$LL.uart.searchTitle()}
        class="w-full bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5 border border-gray-700
               placeholder:text-gray-600 focus:outline-none focus:border-gray-500"
      />
      {#if dbQuery}
        <button
          onclick={() => { dbQuery = ''; searchResults = []; }}
          title={$LL.uart.searchResetTitle()}
          class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
        >
          ✕
        </button>
      {/if}
    </div>

    {#if searchResults.length > 0}
      <div class="bg-gray-800 rounded border border-gray-700 text-xs max-h-40 overflow-y-auto">
        {#each searchResults as r (r.code)}
          <button
            onclick={() => { dbQuery = formatErrorCodeHex(r.code); searchResults = []; }}
            title={$LL.uart.searchResultTitle()}
            class="w-full text-left px-2 py-1.5 hover:bg-gray-700 flex items-center gap-2 border-b
                   border-gray-700 last:border-0"
          >
            <span class="font-mono text-orange-400 shrink-0 w-24">
              {formatErrorCodeHex(r.code)}
            </span>
            <span class="text-gray-200 truncate flex-1">{r.description}</span>
            <span class="text-gray-500 shrink-0 text-xs">{r.category}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Log area -->
  <div class="flex-1 min-h-48 overflow-y-auto bg-gray-950 rounded p-3 flex flex-col gap-2">
    {#each filteredLog as entry (entry.id)}
      {#if entry.parsed}
        <div
          class="rounded bg-gray-800 border border-gray-700 p-2 text-xs"
          title={$LL.uart.errlogEntryTitle()}
        >
          <div class="flex items-start justify-between gap-2">
            <span class="font-mono font-bold text-orange-400" title={$LL.uart.errorCodeTitle()}>
              {formatErrorCodeHex(entry.parsed.entry.error_code)}
            </span>
            <span class="text-gray-500 shrink-0">
              {formatLogTimestamp(entry.timestamp_ms, $logTimestampFormat)}
            </span>
          </div>
          {#if entry.parsed.description}
            <p class="text-gray-200 mt-1">{entry.parsed.description}</p>
          {/if}
          <div class="mt-1 flex flex-wrap gap-3 text-gray-400 font-mono">
            <span title={$LL.uart.tempTitle()}>
              {$LL.uart.temp()} <span class="text-cyan-400">{entry.parsed.entry.temp_soc.toFixed(1)} °C</span>
            </span>
            <span title={$LL.uart.powerStatesTitle()}>
              {$LL.uart.powerStates()} {formatHex8(entry.parsed.entry.power_states)}
            </span>
            <span title={$LL.uart.upCauseTitle()}>
              {$LL.uart.upCause()} {formatHex8(entry.parsed.entry.up_cause)}
            </span>
          </div>
        </div>
      {:else}
        <div class="font-mono text-xs leading-relaxed {
          entry.kind === 'status'              ? 'text-gray-500 italic' :
          entry.kind === 'error'               ? 'text-red-400' :
          entry.raw.startsWith('LOOPBACK:')    ? 'text-cyan-400 font-semibold' :
                                                 'text-green-400'
        }">
          <span class="text-gray-600 mr-2">{formatLogTimestamp(entry.timestamp_ms, $logTimestampFormat)}</span>{entry.raw.startsWith('LOOPBACK:') ? $LL.uart.echo({ raw: entry.raw }) : entry.raw}
        </div>
      {/if}
    {:else}
      <span class="text-gray-600 text-xs">
        {dbQuery.trim()
          ? $LL.uart.noMatches()
          : $LL.uart.logEmpty()}
      </span>
    {/each}
  </div>
</section>
