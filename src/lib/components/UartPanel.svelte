<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { uartConnected, uartPorts, uartLog, autoPollEnabled, nextLogId, dbCodeCount, dbLoading, uartReconnecting } from '$lib/stores/uart';
  import {
    uartListPorts,
    uartConnect,
    uartDisconnect,
    uartSendErrlog,
    uartSendVersion,
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
  import type { UartEntryEvent, ErrorSearchResult, UartPortInfo, UartLogEntry } from '$lib/api/types';

  let selectedPort    = $state('');
  let loading         = $state(false);
  let dbUpdating      = $state(false);
  let dbQuery         = $state('');
  let searchResults   = $state<ErrorSearchResult[]>([]);
  let loopbackPending = $state(false);
  let autoReconnect   = $state(false);

  const filteredLog = $derived(
    dbQuery.trim()
      ? $uartLog.filter((e) => e.raw.toLowerCase().includes(dbQuery.toLowerCase()))
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
          `[Keine Antwort auf "${label}" — Verkabelung (TX↔RX gekreuzt?), Baudrate und Konsolen-Status prüfen]`,
          'error'
        );
      }
    }, timeoutMs);
  }

  /// Translate well-known console responses into readable log entries.
  function interpretLine(raw: string): UartLogEntry {
    const base = { id: nextLogId(), timestamp_ms: Date.now() };
    if (/^NG\b/.test(raw)) {
      return { ...base, raw: `${raw} — Befehl von der Konsole abgelehnt`, kind: 'error' };
    }
    if (raw.startsWith('OK')) {
      const payload = raw
        .replace(/^OK\s*/, '')
        .replace(/:[0-9A-Fa-f]{2}$/, '')
        .replace(/\s+/g, '');
      if (/^0*$/.test(payload)) {
        return { ...base, raw: `${raw} — leerer Eintrag (kein Fehler gespeichert)`, kind: 'status' };
      }
      if (/^0*F+$/i.test(payload)) {
        return { ...base, raw: `${raw} — leerer Eintrag (Historie gelöscht)`, kind: 'status' };
      }
    }
    return { ...base, raw };
  }

  function formatEntry(e: UartEntryEvent): string {
    return [
      e.entry.error_code.toString(16).toUpperCase().padStart(8, '0'),
      e.entry.timestamp.toString(16).toUpperCase().padStart(8, '0'),
      e.entry.power_states.toString(16).toUpperCase().padStart(8, '0'),
      e.entry.up_cause.toString(16).toUpperCase().padStart(8, '0'),
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
        pushLog('[Verbindung verloren — Auto-Reconnect läuft…]', 'status');
      } else {
        pushLog('[Verbindung unterbrochen — USB-Kabel und Bridge prüfen]', 'error');
        autoPollEnabled.set(false);
      }
    }
    if (!wasConnected && r.connected && wasReconnecting) {
      pushLog(`[Wieder verbunden — ${selectedPort}]`, 'status');
    }
    if (wasReconnecting && !r.reconnecting && !r.connected) {
      pushLog('[Reconnect beendet]', 'status');
    }

    // --- error DB status ---
    if (r.db_count !== null) {
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
        `[${r.dropped_lines} Zeile(n) verworfen — Puffer-Überlauf, Ausgabe unvollständig]`,
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
      pushLog(`[Verbunden — ${selectedPort}]`, 'status');
    } catch (e) {
      pushLog(`Verbindungsfehler: ${String(e)}`, 'error');
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
      pushLog('[Getrennt]', 'status');
    } catch (e) {
      pushLog(`Trennen fehlgeschlagen: ${String(e)}`, 'error');
    } finally {
      loading = false;
    }
  }

  let errlogPending = $state(false);

  async function fetchErrlog() {
    errlogPending = true;
    pushLog('[→ Fehler-Historie angefordert (errlog 0–9)]', 'status');
    // Arm before sending: sending all 10 queries takes ~1.5 s
    expectResponse('errlog', 5000);
    try {
      await uartSendErrlog();
    } catch (e) {
      pushLog(`Errlog fehlgeschlagen: ${String(e)}`, 'error');
    } finally {
      errlogPending = false;
    }
  }

  async function fetchVersion() {
    pushLog('[→ version angefordert]', 'status');
    expectResponse('version');
    try {
      await uartSendVersion();
    } catch (e) {
      pushLog(`Version fehlgeschlagen: ${String(e)}`, 'error');
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
    pushLog('[→ Fehler-Historie wird gelöscht (errlog clear)]', 'status');
    expectResponse('errlog clear');
    try {
      await uartClearErrlog();
    } catch (e) {
      pushLog(`Löschen fehlgeschlagen: ${String(e)}`, 'error');
    }
  }

  async function loopbackTest() {
    loopbackPending = true;
    try {
      const ok = await uartLoopbackTest();
      if (ok) {
        pushLog('LOOPBACK:PING ✓');
      } else {
        pushLog('Loopback: kein Echo innerhalb 1 s — RX mit TX verbunden?', 'error');
      }
    } catch (e) {
      pushLog(`Loopback-Fehler: ${String(e)}`, 'error');
    } finally {
      loopbackPending = false;
    }
  }

  async function toggleAutoPoll(enabled: boolean) {
    try {
      await uartSetAutoPoll(enabled);
      autoPollEnabled.set(enabled);
      pushLog(enabled ? '[Auto-Poll aktiviert — errlog alle 5 s]' : '[Auto-Poll deaktiviert]', 'status');
    } catch (e) {
      pushLog(`Auto-Poll fehlgeschlagen: ${String(e)}`, 'error');
    }
  }

  async function updateDb() {
    dbUpdating = true;
    dbLoading.set(true);
    try {
      const count = await uartUpdateDb();
      dbCodeCount.set(count);
      pushLog(`[Fehlercode-DB aktualisiert — ${count.toLocaleString()} Codes]`, 'status');
    } catch (e) {
      pushLog(`DB-Update fehlgeschlagen: ${String(e)}`, 'error');
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
      disabled={!$uartConnected || errlogPending}
      title="Fragt die komplette Fehler-Historie der PS5 ab (errlog 0–9, die letzten 10 gespeicherten Einträge). Gefundene Fehler erscheinen als Karten mit Code, Beschreibung und Temperatur; leere Einträge werden grau markiert."
      class="px-3 py-1 text-sm rounded bg-blue-700 hover:bg-blue-600 text-white
             disabled:opacity-40"
    >
      {errlogPending ? '⟳ Errlog…' : 'Errlog'}
    </button>

    <button
      onclick={clearErrlog}
      disabled={!$uartConnected}
      title="Löscht die gespeicherte Fehler-Historie auf der PS5 unwiderruflich (errlog clear). Sinnvoll nach einer Reparatur, um zu prüfen ob neue Fehler auftreten. Erfordert zweiten Klick zur Bestätigung."
      class="px-3 py-1 text-sm rounded text-white disabled:opacity-40
             {confirmClear
               ? 'bg-red-700 hover:bg-red-600'
               : 'bg-gray-700 hover:bg-gray-600'}"
    >
      {confirmClear ? 'Wirklich löschen?' : 'Historie löschen'}
    </button>

    <button
      onclick={fetchVersion}
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
      title="Sendet den 'errlog'-Befehl automatisch alle 5 Sekunden. Nützlich um neue Fehler live mitzuverfolgen ohne manuell zu klicken. Nur während aktiver Verbindung verfügbar."
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
          <span class="text-gray-600 mr-2">{new Date(entry.timestamp_ms).toLocaleTimeString()}</span>{entry.raw.startsWith('LOOPBACK:') ? `✓ Echo: ${entry.raw}` : entry.raw}
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
