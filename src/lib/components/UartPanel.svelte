<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
  import { uartConnected, uartPorts, uartLog, autoPollEnabled, nextLogId, dbCodeCount, dbLoading, uartReconnecting } from '$lib/stores/uart';
  import {
    uartListPorts,
    uartConnect,
    uartDisconnect,
    uartSendErrlog,
    uartSendVersion,
    uartSetAutoPoll,
    uartSetAutoReconnect,
    uartUpdateDb,
    uartGetDbInfo,
    uartSearchErrorDb,
    uartConnectionStatus,
    uartLoopbackTest,
    settingsGet,
    settingsSave,
  } from '$lib/api/tauri';
  import { appSettings } from '$lib/stores/settings';
  import type { UartEntryEvent, UartStatusEvent, ErrorSearchResult, UartPortInfo } from '$lib/api/types';

  let selectedPort      = $state('');
  let loading           = $state(false);
  let dbUpdating        = $state(false);
  let dbQuery           = $state('');
  let searchResults     = $state<ErrorSearchResult[]>([]);
  let loopbackPending   = $state(false);

  const filteredLog = $derived(
    dbQuery.trim()
      ? $uartLog.filter((e) => e.raw.toLowerCase().includes(dbQuery.toLowerCase()))
      : $uartLog
  );

  let debounceTimer:      ReturnType<typeof setTimeout>  | null = null;
  let pollInterval:       ReturnType<typeof setInterval> | null = null;
  let prevConnectedForPoll = false;
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

  let autoReconnect = $state(false);

  async function connect() {
    loading = true;
    try {
      await uartConnect(selectedPort);
      uartConnected.set(true);
      prevConnectedForPoll = true;
      autoReconnect = $appSettings.auto_reconnect;
    } catch (e) {
      uartLog.update((log) => [
        {
          id:           nextLogId(),
          timestamp_ms: Date.now(),
          raw:          `Verbindungsfehler: ${String(e)}`,
          kind:         'error' as const,
        },
        ...log.slice(0, 499),
      ]);
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
      uartConnected.set(false);
      uartReconnecting.set(false);
      prevConnectedForPoll = false;
      uartLog.update((log) => [
        {
          id:           nextLogId(),
          timestamp_ms: Date.now(),
          raw:          '[Getrennt]',
          kind:         'status' as const,
        },
        ...log.slice(0, 499),
      ]);
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  async function fetchErrlog() {
    await uartSendErrlog().catch(console.error);
  }

  async function loopbackTest() {
    loopbackPending = true;
    try {
      const ok = await uartLoopbackTest();
      uartLog.update((log) => [
        {
          id:           nextLogId(),
          timestamp_ms: Date.now(),
          raw:          ok
            ? 'LOOPBACK:PING ✓'
            : 'LOOPBACK:TIMEOUT — kein Echo empfangen (RX mit TX verbunden?)',
          kind:         ok ? undefined : 'error' as const,
        },
        ...log.slice(0, 499),
      ]);
    } catch (e) {
      uartLog.update((log) => [
        {
          id:           nextLogId(),
          timestamp_ms: Date.now(),
          raw:          `Loopback-Fehler: ${String(e)}`,
          kind:         'error' as const,
        },
        ...log.slice(0, 499),
      ]);
    } finally {
      loopbackPending = false;
    }
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

    const s = await settingsGet().catch(() => null);
    if (s) appSettings.set(s);

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
      listen<UartStatusEvent>('uart://status', (_e) => {
        // State is managed by direct invoke return values and the polling interval.
        // We ignore these events to avoid duplicate log entries and unreliable state flips.
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

    // Poll Rust thread state every 1.5 s to catch USB unplug without relying on events
    pollInterval = setInterval(async () => {
      try {
        const status = await uartConnectionStatus();
        const wasConnected = prevConnectedForPoll;
        prevConnectedForPoll = status.connected;
        uartConnected.set(status.connected);
        uartReconnecting.set(status.reconnecting);
        if (wasConnected && !status.connected && !status.reconnecting) {
          uartLog.update((log) => [
            {
              id:           nextLogId(),
              timestamp_ms: Date.now(),
              raw:          '[Verbindung unterbrochen]',
              kind:         'status' as const,
            },
            ...log.slice(0, 499),
          ]);
        }
      } catch {
        // ignore — invoke fails when app is shutting down
      }
    }, 1500);
  });

  onDestroy(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (pollInterval)  clearInterval(pollInterval);
    unlisten.forEach((fn) => fn());
    dbLoading.set(false);
    uartReconnecting.set(false);
  });
</script>

<section class="flex flex-col gap-4 flex-1 bg-gray-900 rounded-lg p-4 min-h-0">
  <div>
    <h2 class="text-lg font-semibold text-gray-100">UART Diagnostik</h2>
    <p class="text-xs text-gray-500 mt-0.5">
      Live-Verbindung zur PS5-Diagnosebrücke (CH340, CP210x, FTDI o.ä.) — Fehler-Log, Firmware-Version und Temperatur auslesen
    </p>
  </div>

  <!-- Controls -->
  <div class="flex flex-wrap items-center gap-2">
    <div class="relative">
      <select
        bind:value={selectedPort}
        disabled={$uartConnected || $uartReconnecting}
        title="UART-Port der Diagnosebrücke. Erkannte Bridges (CH340, CP210x, FTDI usw.) werden automatisch hervorgehoben und bevorzugt ausgewählt. Klicke ↻ nach dem Einstecken."
        class="appearance-none bg-gray-800 text-gray-100 text-sm rounded px-2 py-1 pr-6
               border border-gray-700 disabled:opacity-50 focus:outline-none"
      >
        {#each $uartPorts as p (p.name)}
          <option value={p.name}>
            {p.name}{p.is_bridge ? ` — ${p.description}` : ''}
          </option>
        {:else}
          <option value="">Keine Ports gefunden — Bridge einstecken und ↻ klicken</option>
        {/each}
      </select>
      <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
    </div>

    <button
      onclick={refreshPorts}
      disabled={$uartConnected || $uartReconnecting}
      title="Port-Liste aktualisieren — klicke hier nachdem du die UART-Bridge eingesteckt hast."
      class="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40"
    >
      ↻
    </button>

    <button
      onclick={$uartConnected || $uartReconnecting ? disconnect : connect}
      disabled={loading || (!$uartConnected && !$uartReconnecting && !selectedPort)}
      title={$uartConnected
        ? 'Verbindung trennen und UART-Port freigeben.'
        : $uartReconnecting
          ? 'Automatischen Reconnect-Versuch abbrechen und trennen.'
          : 'Mit dem ausgewählten UART-Port verbinden. Die PS5 muss eingeschaltet oder im Standby sein.'}
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
        ⟳ Reconnecting…
      {:else if $uartConnected}
        Trennen
      {:else if loading}
        Verbinde…
      {:else}
        Verbinden
      {/if}
    </button>

    {#if $uartConnected || $uartReconnecting}
      <label
        class="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none"
        title="Verbindet automatisch neu wenn die Bridge kurz getrennt und wieder eingesteckt wird. Nützlich bei losen Steckern. Einstellung wird gespeichert."
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
        Auto-Reconnect
      </label>
    {/if}

    <button
      onclick={fetchErrlog}
      disabled={!$uartConnected}
      title="Sendet den 'errlog'-Befehl an die PS5. Die Konsole antwortet mit dem gespeicherten Fehler-Log des SoC (bis zu mehreren Einträgen). Ergebnisse erscheinen im Log mit Fehlercode, Temperatur und Zeitstempel."
      class="px-3 py-1 text-sm rounded bg-blue-700 hover:bg-blue-600 text-white
             disabled:opacity-40"
    >
      Errlog
    </button>

    <button
      onclick={() => uartSendVersion().catch(console.error)}
      disabled={!$uartConnected}
      title="Sendet den 'version'-Befehl an die PS5. Die Konsole antwortet mit der aktuell installierten Firmware-Version."
      class="px-3 py-1 text-sm rounded bg-blue-700 hover:bg-blue-600 text-white
             disabled:opacity-40"
    >
      Version
    </button>

    <button
      onclick={loopbackTest}
      disabled={!$uartConnected || loopbackPending}
      title="Hardware-Test: RX und TX auf der Bridge kurzschließen (Draht oder Büroklammer), dann hier klicken. Kommt das Echo zurück, funktionieren TX-Pin, RX-Pin und Bridge-Chip korrekt."
      class="px-3 py-1 text-sm rounded bg-purple-700 hover:bg-purple-600 text-white
             disabled:opacity-40"
    >
      {loopbackPending ? '⟳ Loopback…' : 'Loopback'}
    </button>

    <label
      class="flex items-center gap-1 text-sm text-gray-300 select-none cursor-pointer"
      title="Sendet den 'errlog'-Befehl automatisch alle paar Sekunden. Nützlich um neue Fehler live mitzuverfolgen ohne manuell zu klicken. Nur während aktiver Verbindung verfügbar."
    >
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
        <span class="text-xs text-gray-500 flex items-center gap-1" title="Fehlercodes-Datenbank wird geladen…">
          <span class="inline-block animate-spin">⟳</span> Lade DB…
        </span>
      {:else if $dbCodeCount !== null}
        <span
          class="text-xs text-green-400"
          title="Anzahl der geladenen PS5-Fehlercodes in der lokalen Datenbank. Wird für die automatische Beschreibung von Errlog-Einträgen verwendet."
        >
          {$dbCodeCount.toLocaleString()} Codes
        </span>
      {:else}
        <span
          class="text-xs text-red-400"
          title="Fehlercodes-Datenbank konnte nicht geladen werden. Klicke 'DB aktualisieren' (benötigt Internetverbindung) oder prüfe die Verbindung."
        >
          Nicht geladen
        </span>
      {/if}
      <button
        onclick={updateDb}
        disabled={dbUpdating}
        title="Lädt die neueste Fehlercodes-Datenbank von GitHub herunter und speichert sie lokal. Benötigt Internetverbindung. Lokal gecachte DB bleibt auch offline verfügbar."
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
        Reconnecting… — Bridge aus- und wieder einstecken oder "Trennen" klicken um abzubrechen
      {:else if $uartConnected}
        Verbunden — {selectedPort}
      {:else}
        Getrennt — Port wählen und "Verbinden" klicken
      {/if}
    </span>
  </div>

  <!-- DB Search -->
  <div class="flex flex-col gap-1">
    <div class="relative">
      <input
        type="text"
        placeholder="Fehlercode (hex) oder Beschreibung suchen…"
        oninput={onSearchInput}
        value={dbQuery}
        title="Suche in der lokalen Fehlercodes-Datenbank. Eingabe als Hexzahl (z.B. 80000001) für exakte Suche, oder Text für Volltextsuche in Beschreibungen. Filtert auch das Log."
        class="w-full bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5 border border-gray-700
               placeholder:text-gray-600 focus:outline-none focus:border-gray-500"
      />
      {#if dbQuery}
        <button
          onclick={() => { dbQuery = ''; searchResults = []; }}
          title="Suche zurücksetzen"
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
            title="Klicken um diesen Code als Log-Filter zu setzen"
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
        <div
          class="rounded bg-gray-800 border border-gray-700 p-2 text-xs"
          title="Erkannter Errlog-Eintrag — Fehlercode automatisch aus der Datenbank aufgelöst"
        >
          <div class="flex items-start justify-between gap-2">
            <span class="font-mono font-bold text-orange-400" title="Fehlercode (hexadezimal)">
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
            <span title="SoC-Temperatur zum Zeitpunkt des Fehlers">
              Temp: <span class="text-cyan-400">{entry.parsed.entry.temp_soc.toFixed(1)} °C</span>
            </span>
            <span title="Power-State-Register — gibt Auskunft über aktiven Energiezustand der Konsole">
              PowerStates: {entry.parsed.entry.power_states.toString(16).toUpperCase().padStart(8, '0')}
            </span>
            <span title="UpCause — Ursache für den letzten Systemstart (0=normal, andere Werte = Reset/Absturz)">
              UpCause: {entry.parsed.entry.up_cause.toString(16).toUpperCase().padStart(8, '0')}
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
          {entry.raw.startsWith('LOOPBACK:') ? `✓ Echo: ${entry.raw}` : entry.raw}
        </div>
      {/if}
    {:else}
      <span class="text-gray-600 text-xs">
        {dbQuery.trim()
          ? 'Keine Treffer für diesen Filter.'
          : 'Kein Output — verbinde die UART-Bridge und klicke "Errlog" oder "Version".'}
      </span>
    {/each}
  </div>
</section>
