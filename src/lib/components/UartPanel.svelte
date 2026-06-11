<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
  import { uartConnected, uartPorts, uartLog, autoPollEnabled, nextLogId } from '$lib/stores/uart';
  import {
    uartListPorts,
    uartConnect,
    uartDisconnect,
    uartSendErrlog,
    uartSetAutoPoll,
    uartUpdateDb,
  } from '$lib/api/tauri';
  import type { UartEntryEvent, UartStatusEvent } from '$lib/api/types';

  let selectedPort = $state('');
  let loading = $state(false);
  let dbUpdating = $state(false);

  async function refreshPorts() {
    const ports = await uartListPorts().catch(() => [] as string[]);
    uartPorts.set(ports);
    if (ports.length > 0 && !selectedPort) selectedPort = ports[0];
  }

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

  async function fetchErrlog() {
    await uartSendErrlog().catch(console.error);
  }

  async function toggleAutoPoll(enabled: boolean) {
    autoPollEnabled.set(enabled);
    await uartSetAutoPoll(enabled).catch(console.error);
  }

  async function updateDb() {
    dbUpdating = true;
    await uartUpdateDb().catch(console.error);
    dbUpdating = false;
  }

  const unlisten: Array<() => void> = [];

  onMount(async () => {
    await refreshPorts();

    unlisten.push(
      await listen<string>('uart://line', (e) => {
        uartLog.update((log) => [
          { id: nextLogId(), timestamp_ms: Date.now(), raw: e.payload },
          ...log.slice(0, 499),
        ]);
      })
    );

    unlisten.push(
      await listen<UartEntryEvent>('uart://entry', (e) => {
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
      })
    );

    unlisten.push(
      await listen<UartStatusEvent>('uart://status', (e) => {
        uartConnected.set(e.payload.connected);
      })
    );
  });

  onDestroy(() => {
    unlisten.forEach((fn) => fn());
  });
</script>

<section class="flex flex-col gap-4 flex-1 bg-gray-900 rounded-lg p-4 min-h-0">
  <h2 class="text-lg font-semibold text-gray-100">UART Diagnostics</h2>

  <!-- Controls -->
  <div class="flex flex-wrap items-center gap-2">
    <select
      bind:value={selectedPort}
      disabled={$uartConnected}
      class="bg-gray-800 text-gray-100 text-sm rounded px-2 py-1 border border-gray-700
             disabled:opacity-50"
    >
      {#each $uartPorts as p}
        <option value={p}>{p}</option>
      {:else}
        <option value="">No ports found</option>
      {/each}
    </select>

    <button
      onclick={refreshPorts}
      disabled={$uartConnected}
      class="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40"
    >
      ↻
    </button>

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

    <button
      onclick={updateDb}
      disabled={dbUpdating}
      class="px-3 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200
             disabled:opacity-40 ml-auto"
    >
      {dbUpdating ? 'Updating…' : 'DB aktualisieren'}
    </button>
  </div>

  <!-- Status indicator -->
  <div class="flex items-center gap-2">
    <span class="w-2 h-2 rounded-full {$uartConnected ? 'bg-green-400' : 'bg-gray-600'}"></span>
    <span class="text-xs text-gray-400">
      {$uartConnected ? `Verbunden — ${selectedPort}` : 'Getrennt'}
    </span>
  </div>

  <!-- Log area -->
  <div class="flex-1 min-h-48 overflow-y-auto bg-gray-950 rounded p-3 flex flex-col gap-2">
    {#each $uartLog as entry (entry.id)}
      {#if entry.parsed}
        <!-- Decoded errlog card -->
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
        <!-- Raw line -->
        <div class="font-mono text-xs text-green-400 leading-relaxed">{entry.raw}</div>
      {/if}
    {:else}
      <span class="text-gray-600 text-xs">No output yet…</span>
    {/each}
  </div>
</section>
