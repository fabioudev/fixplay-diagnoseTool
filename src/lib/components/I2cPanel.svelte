<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    i2cConnected, i2cPorts, xboxDbCount, xboxDbLoading, i2cScanResults,
    i2cErrlogEntries, i2cLog, nextI2cLogId, type I2cLogEntry,
  } from '$lib/stores/i2c';
  import {
    i2cListPorts, i2cConnect, i2cDisconnect, i2cScan, i2cRead, i2cWrite,
    i2cReadEeprom, i2cErrlog, i2cInfo, i2cPoll, i2cUpdateXboxDb, i2cGetDbInfo,
    i2cSearchXboxDb,
  } from '$lib/api/tauri';
  import type { I2cPortInfo, I2cInfo, I2cErrorSearchResult } from '$lib/api/types';
  import { logTimestampFormat, formatLogTimestamp } from '$lib/utils/time';

  let selectedPort = $state('');
  let loading      = $state(false);
  let busy         = $state<string | null>(null); // which action is in flight

  // Read form
  let readAddr = $state('0x48');
  let readReg  = $state('0x00');
  let readLen  = $state(16);

  // EEPROM form
  let eepromAddr   = $state('0x50');
  let eepromOffset = $state(0);
  let eepromLen    = $state(256);

  // Write form
  let writeAddr = $state('0x48');
  let writeReg  = $state('0x00');
  let writeData = $state('01 02 03');

  // Most recent hex dump + scan + info
  let dump      = $state<number[]>([]);
  let dumpLabel = $state('');
  let info      = $state<I2cInfo | null>(null);

  // Xbox DB search
  let dbQuery       = $state('');
  let searchResults = $state<I2cErrorSearchResult[]>([]);

  let pollInterval:    ReturnType<typeof setInterval> | null = null;
  let dbLoadingTimeout: ReturnType<typeof setTimeout>  | null = null;
  let debounceTimer:   ReturnType<typeof setTimeout>   | null = null;

  function pushLog(raw: string, kind?: 'status' | 'error') {
    const entry: I2cLogEntry = { id: nextI2cLogId(), timestamp_ms: Date.now(), raw, kind };
    i2cLog.update((log) => [entry, ...log].slice(0, 200));
  }

  function parseHexByte(s: string): number | null {
    const t = s.trim().toLowerCase().replace(/^0x/, '');
    const n = parseInt(t, 16);
    return Number.isNaN(n) || n < 0 || n > 0xff ? null : n;
  }
  function parseHexBytes(s: string): number[] | null {
    const parts = s.trim().split(/[\s,]+/).filter(Boolean);
    const out: number[] = [];
    for (const p of parts) {
      const b = parseHexByte(p);
      if (b === null) return null;
      out.push(b);
    }
    return out;
  }
  function hex(n: number, w = 2): string {
    return n.toString(16).toUpperCase().padStart(w, '0');
  }
  function ascii(b: number): string {
    return b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '·';
  }

  /// Build the classic offset | hex | ascii dump.
  let dumpRows = $derived(
    (() => {
      const rows: { off: string; hex: string; ascii: string }[] = [];
      for (let i = 0; i < dump.length; i += 16) {
        const chunk = dump.slice(i, i + 16);
        rows.push({
          off:    hex(i, 4),
          hex:    chunk.map((b) => hex(b)).join(' ').padEnd(47, ' '),
          ascii:  chunk.map(ascii).join(''),
        });
      }
      return rows;
    })()
  );

  async function pollTick() {
    let r;
    try { r = await i2cPoll(); } catch { return; }
    i2cConnected.set(r.connected);
    if (r.db_count != null) {
      xboxDbCount.set(r.db_count);
      xboxDbLoading.set(false);
    }
  }

  async function refreshPorts() {
    const ports = await i2cListPorts().catch(() => [] as I2cPortInfo[]);
    i2cPorts.set(ports);
    const pico    = ports.find((p) => p.is_pico);
    const bridge  = ports.find((p) => p.is_bridge);
    const preferred = pico ?? bridge ?? ports[0];
    if (!selectedPort && preferred) {
      selectedPort = preferred.name;
    } else if (!ports.some((p) => p.name === selectedPort)) {
      selectedPort = preferred?.name ?? '';
    }
  }

  async function connect() {
    loading = true;
    try {
      await i2cConnect(selectedPort);
      i2cConnected.set(true);
      pushLog(`[Verbunden — ${selectedPort}]`, 'status');
    } catch (e) {
      pushLog(`Verbindungsfehler: ${String(e)}`, 'error');
    } finally {
      loading = false;
    }
  }

  async function disconnect() {
    loading = true;
    try {
      await i2cDisconnect();
      i2cConnected.set(false);
      dump = [];
      info = null;
      i2cScanResults.set([]);
      i2cErrlogEntries.set([]);
      pushLog('[Getrennt]', 'status');
    } catch (e) {
      pushLog(`Trennen fehlgeschlagen: ${String(e)}`, 'error');
    } finally {
      loading = false;
    }
  }

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (!$i2cConnected) { pushLog('Nicht verbunden — zuerst "Verbinden" klicken', 'error'); return undefined; }
    busy = label;
    try {
      const res = await fn();
      return res;
    } catch (e) {
      pushLog(`${label} fehlgeschlagen: ${String(e)}`, 'error');
      return undefined;
    } finally {
      busy = null;
    }
  }

  async function scan() {
    const addrs = await run('Scan', () => i2cScan());
    if (addrs) {
      i2cScanResults.set(addrs);
      pushLog(`[Scan — ${addrs.length} Geräte gefunden: ${addrs.map((a) => '0x' + hex(a)).join(', ') || 'keine'}]`, 'status');
    }
  }

  async function fetchInfo() {
    const i = await run('Info', () => i2cInfo());
    if (i) {
      info = i;
      pushLog(`[Info — FW ${i.firmware}, ${i.bus} (SCL=${i.scl} SDA=${i.sda}${i.voltage ? ' ' + i.voltage : ''})]`, 'status');
    }
  }

  async function fetchErrlog() {
    const entries = await run('Errlog', () => i2cErrlog());
    if (entries) {
      i2cErrlogEntries.set(entries);
      // Clear any prior hex dump so the errlog cards are actually visible —
      // the display area prefers the dump when present.
      dump = [];
      dumpLabel = '';
      pushLog(`[Errlog — ${entries.length} Xbox-Fehler ausgelesen]`, 'status');
    }
  }

  async function doRead() {
    const addr = parseHexByte(readAddr);
    const len  = Number(readLen);
    if (addr === null || len <= 0 || len > 4096) { pushLog('Ungültige Lese-Parameter (Addr 0x00–0xFF, Len ≤ 4096)', 'error'); return; }
    const reg  = readReg.trim() === '' ? null : parseHexByte(readReg);
    if (readReg.trim() !== '' && reg === null) { pushLog('Ungültiges Register (Hex 0x00–0xFF oder leer)', 'error'); return; }
    const data = await run('Read', () => i2cRead(addr, reg, len));
    if (data) {
      dump = data;
      dumpLabel = `read 0x${hex(addr)}${reg !== null ? ' @0x' + hex(reg) : ''} (${data.length} bytes)`;
      pushLog(`[Read 0x${hex(addr)} — ${data.length} Bytes]`, 'status');
    }
  }

  async function doReadEeprom() {
    const addr   = parseHexByte(eepromAddr);
    const offset = Number(eepromOffset);
    const len    = Number(eepromLen);
    if (addr === null || offset < 0 || offset > 0xffff || len <= 0 || len > 65535) {
      pushLog('Ungültige EEPROM-Parameter (Len ≤ 65535, Offset ≤ 65535)', 'error'); return;
    }
    const data = await run('EEPROM-Read', () => i2cReadEeprom(addr, offset, len));
    if (data) {
      dump = data;
      dumpLabel = `eeprom 0x${hex(addr)} @0x${hex(offset, 4)} (${data.length} bytes)`;
      pushLog(`[EEPROM-Read 0x${hex(addr)} — ${data.length} Bytes]`, 'status');
    }
  }

  async function doWrite() {
    const addr = parseHexByte(writeAddr);
    const reg  = writeReg.trim() === '' ? null : parseHexByte(writeReg);
    const data = parseHexBytes(writeData);
    if (addr === null) { pushLog('Ungültige Schreib-Adresse', 'error'); return; }
    if (writeReg.trim() !== '' && reg === null) { pushLog('Ungültiges Register', 'error'); return; }
    if (data === null || data.length === 0) { pushLog('Ungültige Daten (Hex-Bytes, z.B. "01 02 03")', 'error'); return; }
    const ok = await run('Write', () => i2cWrite(addr, reg, data));
    if (ok !== undefined) {
      pushLog(`[Write 0x${hex(addr)}${reg !== null ? ' @0x' + hex(reg) : ''} — ${data.length} Bytes]`, 'status');
    }
  }

  async function updateDb() {
    busy = 'DB';
    xboxDbLoading.set(true);
    try {
      const count = await i2cUpdateXboxDb();
      xboxDbCount.set(count);
      pushLog(`[Xbox-Fehlercode-DB aktualisiert — ${count.toLocaleString()} Codes]`, 'status');
    } catch (e) {
      pushLog(`DB-Update fehlgeschlagen: ${String(e)}`, 'error');
    } finally {
      xboxDbLoading.set(false);
      busy = null;
    }
  }

  function onSearchInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    dbQuery = val;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (val.trim()) {
        searchResults = await i2cSearchXboxDb(val.trim()).catch(() => []);
      } else {
        searchResults = [];
      }
    }, 300);
  }

  onMount(async () => {
    await refreshPorts();
    const count = await i2cGetDbInfo().catch(() => null);
    xboxDbCount.set(count ?? null);
    if (count === null) {
      xboxDbLoading.set(true);
      dbLoadingTimeout = setTimeout(() => xboxDbLoading.set(false), 30_000);
    }
    pollInterval = setInterval(pollTick, 500);
  });

  onDestroy(() => {
    if (pollInterval)    clearInterval(pollInterval);
    if (dbLoadingTimeout) clearTimeout(dbLoadingTimeout);
    if (debounceTimer)   clearTimeout(debounceTimer);
    xboxDbLoading.set(false);
  });
</script>

<section class="flex flex-col gap-4 flex-1 bg-gray-900 rounded-lg p-4 min-h-0">
  <div>
    <h2 class="text-lg font-semibold text-gray-100">I2C / Pico Diagnostik</h2>
    <p class="text-xs text-gray-500 mt-0.5">
      Live-Verbindung zu einem Raspberry Pi Pico (USB CDC) mit fixplay-pico-i2c Firmware — I2C-Scan, Register-/EEPROM-Read, Write und Xbox-Fehler-Log auslesen
    </p>
  </div>

  <!-- Controls -->
  <div class="flex flex-wrap items-center gap-2">
    <div class="relative">
      <select
        bind:value={selectedPort}
        disabled={$i2cConnected}
        title="USB-CDC Port des Pico. Erkannte Pico-Boards (RP2040, VID 2E8A) werden automatisch hervorgehoben und bevorzugt ausgewählt. Klicke ↻ nach dem Einstecken."
        class="appearance-none bg-gray-800 text-gray-100 text-sm rounded px-2 py-1 pr-6
               border border-gray-700 disabled:opacity-50 focus:outline-none"
      >
        {#each $i2cPorts as p (p.name)}
          <option value={p.name}>
            {p.name}{p.is_pico ? ` — Pico (${p.description})` : p.is_bridge ? ` — ${p.description}` : ''}
          </option>
        {:else}
          <option value="">Kein Port gefunden — Pico einstecken und ↻ klicken</option>
        {/each}
      </select>
      <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
    </div>

    <button
      onclick={refreshPorts}
      disabled={$i2cConnected}
      title="Port-Liste aktualisieren — klicke hier nachdem du den Pico eingesteckt hast."
      class="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40"
    >↻</button>

    <button
      onclick={$i2cConnected ? disconnect : connect}
      disabled={loading || (!$i2cConnected && !selectedPort)}
      title={$i2cConnected ? 'Verbindung trennen und CDC-Port freigeben.' : 'Mit dem Pico verbinden. Der Pico muss mit fixplay-pico-i2c geflasht sein.'}
      class="px-3 py-1 text-sm rounded font-medium
             {$i2cConnected
               ? 'bg-red-700 hover:bg-red-600 text-white'
               : loading
                 ? 'bg-blue-800 text-white cursor-wait'
                 : 'bg-green-700 hover:bg-green-600 text-white'}
             disabled:opacity-40"
    >
      {#if $i2cConnected}Trennen{:else if loading}Verbinde…{:else}Verbinden{/if}
    </button>

    <button
      onclick={scan}
      disabled={!$i2cConnected || busy !== null}
      title="Sucht alle aktiven Geräte auf dem I2C-Bus (Adressen 0x03–0x77)."
      class="px-3 py-1 text-sm rounded bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-40"
    >{busy === 'Scan' ? '⟳ …' : 'Scan'}</button>

    <button
      onclick={fetchInfo}
      disabled={!$i2cConnected || busy !== null}
      title="Fragt Firmware-Version und I2C-Bus-Konfiguration des Pico ab."
      class="px-3 py-1 text-sm rounded bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-40"
    >{busy === 'Info' ? '⟳ …' : 'Info'}</button>

    <button
      onclick={fetchErrlog}
      disabled={!$i2cConnected || busy !== null}
      title="Liest die Xbox-Fehler-Historie über I2C/SMBus aus. Codes werden automatisch gegen die Xbox-Fehlercode-DB aufgelöst."
      class="px-3 py-1 text-sm rounded bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-40"
    >{busy === 'Errlog' ? '⟳ …' : 'Errlog'}</button>

    <div class="flex items-center gap-2 ml-auto">
      {#if $xboxDbLoading}
        <span class="text-xs text-gray-500 flex items-center gap-1" title="Xbox-Fehlercodes-Datenbank wird geladen…">
          <span class="inline-block animate-spin">⟳</span> Lade DB…
        </span>
      {:else if $xboxDbCount != null}
        <span class="text-xs text-green-400" title="Anzahl der geladenen Xbox-Fehlercodes">
          {$xboxDbCount.toLocaleString()} Codes
        </span>
      {:else}
        <span class="text-xs text-red-400" title="DB konnte nicht geladen werden — 'DB aktualisieren' klicken (benötigt Internet).">
          Nicht geladen
        </span>
      {/if}
      <button
        onclick={updateDb}
        disabled={busy !== null}
        title="Lädt die neueste Xbox-Fehlercodes-Datenbank herunter und speichert sie lokal. Benötigt Internetverbindung."
        class="px-3 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-40"
      >{busy === 'DB' ? 'Updating…' : 'DB aktualisieren'}</button>
    </div>
  </div>

  <!-- Status -->
  <div class="flex items-center gap-2">
    <span class="w-2 h-2 rounded-full {$i2cConnected ? 'bg-green-400' : 'bg-gray-600'}"></span>
    <span class="text-xs text-gray-400">
      {#if $i2cConnected}Verbunden — {selectedPort}{:else}Getrennt — Port wählen und "Verbinden" klicken{/if}
    </span>
  </div>

  <!-- Scan + Info results -->
  <div class="flex flex-col gap-1.5">
    {#if $i2cScanResults.length > 0}
      <div class="flex flex-wrap items-center gap-1.5 text-xs">
        <span class="text-gray-500">Gefunden:</span>
        {#each $i2cScanResults as a (a)}
          <span class="font-mono text-green-400 bg-gray-800 rounded px-1.5 py-0.5">0x{a.toString(16).toUpperCase().padStart(2, '0')}</span>
        {/each}
      </div>
    {/if}
    {#if info}
      <div class="text-xs text-gray-400 font-mono">
        FW <span class="text-cyan-400">{info.firmware}</span> · {info.bus} · SCL={info.scl} SDA={info.sda}{info.voltage ? ` · ${info.voltage}` : ''}
      </div>
    {/if}
  </div>

  <!-- Action forms -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
    <!-- Read -->
    <div class="flex flex-col gap-1.5 bg-gray-950 rounded p-2.5">
      <span class="text-xs font-medium text-gray-400">Register lesen</span>
      <div class="flex gap-1.5 text-xs">
        <input bind:value={readAddr} placeholder="Addr 0x48" title="7-bit I2C-Adresse (Hex)" class="flex-1 w-20 bg-gray-800 text-gray-100 rounded px-2 py-1 border border-gray-700 focus:outline-none font-mono">
        <input bind:value={readReg} placeholder="Reg 0x00" title="Register (Hex) — leer = current-pointer read" class="flex-1 w-20 bg-gray-800 text-gray-100 rounded px-2 py-1 border border-gray-700 focus:outline-none font-mono">
        <input type="number" bind:value={readLen} min="1" max="4096" class="w-16 bg-gray-800 text-gray-100 rounded px-2 py-1 border border-gray-700 focus:outline-none" title="Anzahl Bytes (≤ 4096)">
      </div>
      <button onclick={doRead} disabled={!$i2cConnected || busy !== null} class="text-xs px-2 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-40">Lesen</button>
    </div>

    <!-- EEPROM -->
    <div class="flex flex-col gap-1.5 bg-gray-950 rounded p-2.5">
      <span class="text-xs font-medium text-gray-400">EEPROM lesen</span>
      <div class="flex gap-1.5 text-xs">
        <input bind:value={eepromAddr} placeholder="Addr 0x50" class="flex-1 w-20 bg-gray-800 text-gray-100 rounded px-2 py-1 border border-gray-700 focus:outline-none font-mono">
        <input type="number" bind:value={eepromOffset} min="0" max="65535" class="w-20 bg-gray-800 text-gray-100 rounded px-2 py-1 border border-gray-700 focus:outline-none" title="Offset (0–65535)">
        <input type="number" bind:value={eepromLen} min="1" max="65535" class="w-16 bg-gray-800 text-gray-100 rounded px-2 py-1 border border-gray-700 focus:outline-none" title="Anzahl Bytes (1–65535)">
      </div>
      <button onclick={doReadEeprom} disabled={!$i2cConnected || busy !== null} class="text-xs px-2 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-40">EEPROM lesen</button>
    </div>

    <!-- Write -->
    <div class="flex flex-col gap-1.5 bg-gray-950 rounded p-2.5">
      <span class="text-xs font-medium text-gray-400">Schreiben</span>
      <div class="flex gap-1.5 text-xs">
        <input bind:value={writeAddr} placeholder="Addr 0x48" class="w-20 bg-gray-800 text-gray-100 rounded px-2 py-1 border border-gray-700 focus:outline-none font-mono">
        <input bind:value={writeReg} placeholder="Reg 0x00" class="w-20 bg-gray-800 text-gray-100 rounded px-2 py-1 border border-gray-700 focus:outline-none font-mono">
        <input bind:value={writeData} placeholder="01 02 03" class="flex-1 min-w-0 bg-gray-800 text-gray-100 rounded px-2 py-1 border border-gray-700 focus:outline-none font-mono" title="Hex-Bytes, durch Leerzeichen getrennt">
      </div>
      <button onclick={doWrite} disabled={!$i2cConnected || busy !== null} class="text-xs px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 text-white disabled:opacity-40">Schreiben</button>
    </div>
  </div>

  <!-- Hex dump -->
  <div class="flex-1 min-h-40 overflow-auto bg-gray-950 rounded p-2.5 font-mono text-xs">
    {#if dumpRows.length > 0}
      <div class="text-gray-600 mb-1 text-[11px]">{dumpLabel}</div>
      {#each dumpRows as row (row.off)}
        <div class="leading-relaxed whitespace-pre">
          <span class="text-gray-600">{row.off}  </span><span class="text-green-400">{row.hex}</span>  <span class="text-gray-300">{row.ascii}</span>
        </div>
      {/each}
    {:else if $i2cErrlogEntries.length > 0}
      <!-- Xbox errlog cards -->
      <div class="flex flex-col gap-2 font-sans">
        {#each $i2cErrlogEntries as e (e.code + (e.timestamp ?? ''))}
          <div class="rounded bg-gray-800 border border-gray-700 p-2 text-xs">
            <div class="flex items-start justify-between gap-2">
              <span class="font-mono font-bold text-orange-400" title="Xbox-Fehlercode">{e.code}</span>
              {#if e.timestamp !== null}
                <span class="text-gray-500 text-[11px]">#{e.timestamp}</span>
              {/if}
            </div>
            {#if e.description}
              <p class="text-gray-200 mt-1">{e.description}</p>
            {:else}
              <p class="text-gray-500 italic mt-1">Unbekannter Code — nicht in der Xbox-Fehlercode-DB</p>
            {/if}
            {#if e.source}
              <span class="text-gray-500 text-[11px]">Quelle: {e.source}</span>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <span class="text-gray-600">Keine Daten — "Scan", "Lesen" oder "Errlog" klicken.</span>
    {/if}
  </div>

  <!-- DB Search -->
  <div class="flex flex-col gap-1">
    <div class="relative">
      <input
        type="text"
        placeholder="Xbox-Fehlercode (z.B. E74 oder 0102) oder Beschreibung suchen…"
        oninput={onSearchInput}
        value={dbQuery}
        title="Suche in der lokalen Xbox-Fehlercodes-Datenbank. Code (z.B. E74) für exakte Suche, oder Text für Volltextsuche."
        class="w-full bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5 border border-gray-700
               placeholder:text-gray-600 focus:outline-none focus:border-gray-500"
      >
      {#if dbQuery}
        <button onclick={() => { dbQuery = ''; searchResults = []; if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; } }} title="Suche zurücksetzen" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs">✕</button>
      {/if}
    </div>
    {#if searchResults.length > 0}
      <div class="bg-gray-800 rounded border border-gray-700 text-xs max-h-40 overflow-y-auto">
        {#each searchResults as r (r.code)}
          <div class="w-full text-left px-2 py-1.5 hover:bg-gray-700 flex items-center gap-2 border-b border-gray-700 last:border-0">
            <span class="font-mono text-orange-400 shrink-0 w-20">{r.code}</span>
            <span class="text-gray-200 truncate flex-1">{r.description}</span>
            <span class="text-gray-500 shrink-0 text-xs">{r.category}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Action log -->
  {#if $i2cLog.length > 0}
    <div class="max-h-28 overflow-y-auto bg-gray-950 rounded p-2 flex flex-col gap-0.5 font-mono text-[11px]">
      {#each $i2cLog.slice(0, 50) as entry (entry.id)}
        <div class={entry.kind === 'error' ? 'text-red-400' : entry.kind === 'status' ? 'text-gray-500 italic' : 'text-green-400'}>
          <span class="text-gray-600 mr-2">{formatLogTimestamp(entry.timestamp_ms, $logTimestampFormat)}</span>{entry.raw}
        </div>
      {/each}
    </div>
  {/if}
</section>