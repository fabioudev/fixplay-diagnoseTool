<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
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
  import type { UartEntryEvent, UartStatusEvent, ErrorSearchResult } from '$lib/api/types';

  let selectedPort  = $state('');
  let loading       = $state(false);
  let dbUpdating    = $state(false);
  let dbQuery       = $state('');
  let searchResults = $state<ErrorSearchResult[]>([]);

  const filteredLog = $derived(
    dbQuery.trim()
      ? $uartLog.filter((e) => e.raw.toLowerCase().includes(dbQuery.toLowerCase()))
      : $uartLog
  );

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
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
    const ports = await uartListPorts().catch(() => [] as string[]);
    uartPorts.set(ports);
    if (ports.length > 0 && !selectedPort) {
      selectedPort = ports[0];
    } else if (!ports.includes(selectedPort)) {
      selectedPort = ports[0] ?? '';
    }
  }

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

  async function fetchErrlog() {
    await uartSendErrlog().catch(console.error);
  }

  async function toggleAutoPoll(enabled: boolean) {
    try {
      await uartSetAutoPoll(enabled);
      autoPollEnabled.set(enabled);
    } catch (e) {
      console.error(e);
    }
  }

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

  const unlisten: Array<() => void> = [];

  onMount(async () => {
    await refreshPorts();

    const [u1, u2, u3, u4, u5] = await Promise.all([
      listen<string>('uart://line', (e) => {
        uartLog.update((log) => [
          { id: nextLogId(), timestamp_ms: Date.now(), raw: e.payload },
          ...log.slice(0, 499),
        ]);
      }),
      listen<UartEntryEvent>('uart://entry', (e) => {
        uartLog.update((log) => [
          {
            id: nextLogId(),
            timestamp_ms: Date.now(),
            raw: [
              e.payload.entry.error_code.toString(16).toUpperCase().padStart(8, '0'),
              e.payload.entry.timestamp.toString(16).toUpperCase().padStart(8, '0'),
              e.payload.entry.power_states.toString(16).toUpperCase().padStart(8, '0'),
              e.payload.entry.up_cause.toString(16).toUpperCase().padStart(8, '0'),
              e.payload.entry.temp_soc.toFixed(1) + '°C',
            ].join(', '),
            parsed: e.payload,
          },
          ...log.slice(0, 499),
        ]);
      }),
      listen<UartStatusEvent>('uart://status', (e) => {
        uartConnected.set(e.payload.connected);
        if (e.payload.connected) uartReconnecting.set(false);
      }),
      listen<{ loaded: boolean; count: number | null; source: string }>('uart://db-status', (e) => {
        dbCodeCount.set(e.payload.loaded ? (e.payload.count ?? null) : null);
        dbLoading.set(false);
      }),
      listen<{ active: boolean }>('uart://reconnecting', (e) => {
        uartReconnecting.set(e.payload.active);
      }),
    ]);
    unlisten.push(u1, u2, u3, u4, u5);

    const count = await uartGetDbInfo().catch(() => null);
    dbCodeCount.set(count ?? null);
    if (count === null) {
      dbLoading.set(true);
    }
  });

  onDestroy(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    unlisten.forEach((fn) => fn());
    dbLoading.set(false);
    uartReconnecting.set(false);
  });
</script>

<section class="flex flex-col gap-4 flex-1 bg-gray-900 rounded-lg p-4 min-h-0">
  <h2 class="text-lg font-semibold text-gray-100">UART Diagnostics</h2>

  <!-- Controls -->
  <div class="flex flex-wrap items-center gap-2">
    <select
      bind:value={selectedPort}
      disabled={$uartConnected || $uartReconnecting}
      class="bg-gray-800 text-gray-100 text-sm rounded px-2 py-1 border border-gray-700
             disabled:opacity-50"
    >
      {#each $uartPorts as p (p)}
        <option value={p}>{p}</option>
      {:else}
        <option value="">Keine Ports gefunden</option>
      {/each}
    </select>

    <button
      onclick={refreshPorts}
      disabled={$uartConnected || $uartReconnecting}
      class="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40"
    >
      ↻
    </button>

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

    {#if $uartConnected || $uartReconnecting}
      <label class="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={autoReconnect}
          onchange={async (e) => {
            const newState = (e.target as HTMLInputElement).checked;
            try {
              await uartSetAutoReconnect(newState);
              autoReconnect = newState;
            } catch (err) {
              console.error(err);
            }
          }}
          class="accent-blue-500"
        />
        Auto-Reconnect
      </label>
    {/if}

    <button
      onclick={fetchErrlog}
      disabled={!$uartConnected}
      class="px-3 py-1 text-sm rounded bg-blue-700 hover:bg-blue-600 text-white
             disabled:opacity-40"
    >
      Errlog
    </button>

    <label class="flex items-center gap-1 text-sm text-gray-300 select-none cursor-pointer">
      <input
        type="checkbox"
        checked={$autoPollEnabled}
        disabled={!$uartConnected}
        onchange={(e) => toggleAutoPoll((e.target as HTMLInputElement).checked)}
        class="accent-blue-500 disabled:opacity-40"
      />
      Auto-Poll
    </label>

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
  </div>

  <!-- Status indicator -->
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

  <!-- DB Search -->
  <div class="flex flex-col gap-1">
    <div class="relative">
      <input
        type="text"
        placeholder="Code oder Beschreibung suchen…"
        oninput={onSearchInput}
        value={dbQuery}
        class="w-full bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5 border border-gray-700
               placeholder:text-gray-600 focus:outline-none focus:border-gray-500"
      />
      {#if dbQuery}
        <button
          onclick={() => { dbQuery = ''; searchResults = []; }}
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
            onclick={() => { dbQuery = r.code.toString(); searchResults = []; }}
            class="w-full text-left px-2 py-1.5 hover:bg-gray-700 flex items-center gap-2 border-b
                   border-gray-700 last:border-0"
          >
            <span class="font-mono text-orange-400 shrink-0 w-24">
              0x{r.code.toString(16).toUpperCase().padStart(8, '0')}
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
        <div class="rounded bg-gray-800 border border-gray-700 p-2 text-xs">
          <div class="flex items-start justify-between gap-2">
            <span class="font-mono font-bold text-orange-400">
              0x{entry.parsed.entry.error_code.toString(16).toUpperCase().padStart(8, '0')}
            </span>
            <span class="text-gray-500 shrink-0">
              {new Date(entry.timestamp_ms).toLocaleTimeString()}
            </span>
          </div>
          {#if entry.parsed.description}
            <p class="text-gray-200 mt-1">{entry.parsed.description}</p>
          {/if}
          <div class="mt-1 flex flex-wrap gap-3 text-gray-400 font-mono">
            <span>Temp: <span class="text-cyan-400">{entry.parsed.entry.temp_soc.toFixed(1)} °C</span></span>
            <span>PowerStates: {entry.parsed.entry.power_states.toString(16).toUpperCase().padStart(8, '0')}</span>
            <span>UpCause: {entry.parsed.entry.up_cause.toString(16).toUpperCase().padStart(8, '0')}</span>
          </div>
        </div>
      {:else}
        <div class="font-mono text-xs text-green-400 leading-relaxed">{entry.raw}</div>
      {/if}
    {:else}
      <span class="text-gray-600 text-xs">
        {dbQuery.trim() ? 'Keine Treffer für diesen Filter.' : 'Kein Output…'}
      </span>
    {/each}
  </div>
</section>
