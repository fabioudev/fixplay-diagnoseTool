<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
  import { open as openDialog } from '@tauri-apps/plugin-dialog';
  import {
    flashBusy, flashProgress, flashResult, flashLog,
    flashProgrammer, flashWritePath, flashWritePreview, nextFlashLogId,
  } from '$lib/stores/flash';
  import { flashListProgrammers, flashRead, flashWrite, flashValidateFile, openPath } from '$lib/api/tauri';
  import type { FlashProgressEvent, FlashStatusEvent, FlashReadResult } from '$lib/api/types';

  let programmers = $state<string[]>([]);
  let phaseLabel  = $state('');
  let writeVerify = $state(true);

  const PHASE_LABELS: Record<string, string> = {
    read1:  'Lesen 1/2…',
    read2:  'Lesen 2/2…',
    write:  'Schreiben…',
    verify: 'Verifizieren…',
  };

  const VALIDATION_ITEMS = [
    { key: 'header_ok',     label: 'NOR Header',   tip: 'Der NOR-Header enthält grundlegende Chip-Metadaten. Fehlt er, ist die Firmware-Datei leer oder falsch.' },
    { key: 'mbr1_ok',       label: 'MBR 1',        tip: 'Master Boot Record 1 — enthält die Partitionstabelle. Beide MBRs müssen vorhanden und lesbar sein.' },
    { key: 'mbr2_ok',       label: 'MBR 2',        tip: 'Master Boot Record 2 — Backup-Kopie von MBR 1. Abweichungen zwischen MBR1 und MBR2 deuten auf Korruption hin.' },
    { key: 'emc_ipl_a_ok',  label: 'EmcIpl A',     tip: 'EMC Initial Program Loader A — Bootloader des EMC-Chips (Energieverwaltung). Fehlt dieser, startet die Konsole ggf. nicht.' },
    { key: 'emc_ipl_b_ok',  label: 'EmcIpl B',     tip: 'EMC Initial Program Loader B — Redundante Kopie von EmcIpl A.' },
    { key: 'usb_pdc_a_ok',  label: 'USB PDC A',    tip: 'USB Power Delivery Controller Firmware A — steuert die USB-C-Stromversorgung der PS5.' },
    { key: 'usb_pdc_b_ok',  label: 'USB PDC B',    tip: 'USB Power Delivery Controller Firmware B — Backup-Kopie von USB PDC A.' },
    { key: 'size_ok',       label: 'Größe (2 MB)',  tip: 'PS5 NOR-Chips haben immer exakt 2 MiB (2.097.152 Bytes). Andere Größen deuten auf ein abgebrochenes Lesen hin.' },
  ] as const;

  const unlisten: Array<() => void> = [];

  onMount(async () => {
    programmers = await flashListProgrammers().catch(() => []);
    if (programmers.length > 0 && !$flashProgrammer) {
      flashProgrammer.set(programmers[0]);
    }

    const [u1, u2, u3] = await Promise.all([
      listen<FlashProgressEvent>('flash://progress', (e) => {
        flashProgress.set(e.payload);
        phaseLabel = PHASE_LABELS[e.payload.phase] ?? e.payload.phase;
      }),
      listen<FlashStatusEvent>('flash://status', (e) => {
        flashLog.update((log) => [
          {
            id:           nextFlashLogId(),
            timestamp_ms: Date.now(),
            message:      e.payload.message,
            level:        e.payload.level as 'info' | 'warn' | 'error',
          },
          ...log.slice(0, 199),
        ]);
      }),
      listen<FlashReadResult>('flash://result', (e) => {
        flashResult.set(e.payload);
        flashBusy.set(false);
        flashProgress.set(null);
      }),
    ]);
    unlisten.push(u1, u2, u3);
  });

  onDestroy(() => unlisten.forEach((fn) => fn()));

  async function handleRead() {
    flashBusy.set(true);
    flashResult.set(null);
    flashLog.set([]);
    flashProgress.set(null);
    await flashRead($flashProgrammer).catch((e: unknown) => {
      flashLog.update((log) => [
        { id: nextFlashLogId(), timestamp_ms: Date.now(), message: String(e), level: 'error' },
        ...log,
      ]);
      flashBusy.set(false);
      flashProgress.set(null);
    });
  }

  async function handleWrite() {
    const storedPath = $flashWritePath;
    let selected: string;

    if (storedPath) {
      selected = storedPath;
      flashWritePath.set(null);
    } else {
      const result = await openDialog({
        title:   'NOR-Datei wählen',
        filters: [{ name: 'NOR Binary', extensions: ['bin'] }],
      });
      if (!result || typeof result !== 'string') return;
      selected = result;
    }

    flashBusy.set(true);
    try {
      const preview = await flashValidateFile(selected);
      flashWritePreview.set(preview);
    } catch (e: unknown) {
      flashLog.update((log) => [
        { id: nextFlashLogId(), timestamp_ms: Date.now(), message: String(e), level: 'error' },
        ...log,
      ]);
    } finally {
      flashBusy.set(false);
    }
  }

  async function confirmWrite() {
    const preview = $flashWritePreview;
    if (!preview) return;

    flashWritePreview.set(null);
    flashBusy.set(true);
    flashLog.set([]);
    flashProgress.set(null);
    try {
      await flashWrite(preview.path, $flashProgrammer, writeVerify);
    } catch (e: unknown) {
      flashLog.update((log) => [
        { id: nextFlashLogId(), timestamp_ms: Date.now(), message: String(e), level: 'error' },
        ...log,
      ]);
    } finally {
      flashBusy.set(false);
      flashProgress.set(null);
    }
  }

  function cancelWrite() {
    flashWritePreview.set(null);
  }
</script>

<section class="flex flex-col gap-4 flex-1 bg-gray-900 rounded-lg p-4 min-h-0">
  <div>
    <h2 class="text-lg font-semibold text-gray-100">NOR Flash Diagnose</h2>
    <p class="text-xs text-gray-500 mt-0.5">
      NOR-Chip auslesen, Dumps archivieren und Firmware zurückspielen — benötigt angeschlossenen Programmer (CH341A, RT809H o.ä.)
    </p>
  </div>

  <!-- Controls -->
  <div class="flex flex-wrap items-center gap-2">
    <div class="relative">
      <select
        bind:value={$flashProgrammer}
        disabled={$flashBusy}
        title="Angeschlossener Flash-Programmer. flashrom wird im Hintergrund zur Kommunikation verwendet. Unterstützt CH341A, RT809H und alle anderen flashrom-kompatiblen Geräte."
        class="appearance-none bg-gray-800 text-gray-100 text-sm rounded px-2 py-1 pr-6
               border border-gray-700 disabled:opacity-50 focus:outline-none"
      >
        {#each programmers as p (p)}
          <option value={p}>{p}</option>
        {:else}
          <option value="">Keine Programmer gefunden</option>
        {/each}
      </select>
      <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
    </div>

    <button
      onclick={handleRead}
      disabled={$flashBusy || !$flashProgrammer}
      title="Liest den NOR-Chip zweimal hintereinander aus und vergleicht beide Lesevorgänge auf Übereinstimmung. Das Dump wird automatisch im Archiv gespeichert. Dauer: ca. 1–3 Minuten."
      class="px-3 py-1 text-sm rounded bg-blue-700 hover:bg-blue-600 text-white
             disabled:opacity-40"
    >
      {$flashBusy ? 'Läuft…' : 'Lesen'}
    </button>

    <button
      onclick={handleWrite}
      disabled={$flashBusy || !$flashProgrammer || $flashWritePreview !== null}
      title="Öffnet eine .bin-Datei und zeigt eine Vorschau mit Validierungsergebnis bevor der Schreibvorgang gestartet wird. Tipp: Dump aus dem Archiv laden, dann direkt hier verwenden."
      class="px-3 py-1 text-sm rounded bg-orange-700 hover:bg-orange-600 text-white
             disabled:opacity-40"
    >
      Schreiben
    </button>

    {#if !$flashProgrammer && programmers.length === 0}
      <span class="text-xs text-yellow-500">
        ⚠ Kein Programmer erkannt — USB prüfen und flashrom installiert?
      </span>
    {/if}
  </div>

  <!-- Progress bar -->
  {#if $flashProgress !== null}
    <div class="flex flex-col gap-1">
      <div class="flex justify-between text-xs text-gray-400">
        <span>{phaseLabel}</span>
        <span>{$flashProgress.percent}%</span>
      </div>
      <div class="w-full bg-gray-700 rounded-full h-2">
        <div
          class="bg-blue-500 h-2 rounded-full transition-all duration-200"
          style="width: {$flashProgress.percent}%"
        ></div>
      </div>
      <p class="text-xs text-gray-600">Vorgang nicht unterbrechen — Abbruch beim Schreiben kann den Chip unbrauchbar machen.</p>
    </div>
  {/if}

  <!-- Write preview card -->
  {#if $flashWritePreview}
    {@const p = $flashWritePreview}
    {@const validationOk = p.validation.size_ok && p.validation.header_ok && p.validation.mbr1_ok && p.validation.mbr2_ok && p.validation.emc_ipl_a_ok && p.validation.emc_ipl_b_ok && p.validation.usb_pdc_a_ok && p.validation.usb_pdc_b_ok}
    <div class="rounded bg-gray-800 border border-gray-700 p-3 text-xs flex flex-col gap-3">

      {#if !validationOk}
        <div class="flex items-center gap-2 rounded bg-yellow-900 border border-yellow-700 px-3 py-2">
          <span class="text-yellow-400 font-semibold">⚠ Validierungsfehler erkannt — Fortfahren auf eigene Gefahr</span>
        </div>
      {/if}

      <!-- Validation checklist -->
      <div>
        <p class="text-gray-400 font-semibold mb-1">Validierung:</p>
        <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
          {#each VALIDATION_ITEMS as item (item.key)}
            <div class="flex items-center gap-1" title={item.tip}>
              <span class="{(p.validation as unknown as Record<string, boolean>)[item.key] ? 'text-green-400' : 'text-red-400'}">
                {(p.validation as unknown as Record<string, boolean>)[item.key] ? '✓' : '✗'}
              </span>
              <span class="text-gray-300">{item.label}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- NVS info -->
      {#if p.nvs}
        <div>
          <p class="text-gray-400 font-semibold mb-1">Konsoleninfo (aus NVS-Partition):</p>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt class="text-gray-500" title="Seriennummer der Konsole — auf dem Aufkleber unter dem Standfuß">Serial:</dt>
            <dd class="text-gray-200 font-mono">{p.nvs.serial || '—'}</dd>
            <dt class="text-gray-500" title="MAC-Adresse des WLAN-Chips">MAC:</dt>
            <dd class="text-gray-200 font-mono">{p.nvs.mac_address}</dd>
            <dt class="text-gray-500" title="Modellkennung (CFI-Nummer)">SKU:</dt>
            <dd class="text-gray-200">{p.nvs.sku || '—'}</dd>
            <dt class="text-gray-500" title="Board-Revision (z.B. B chassis)">Board ID:</dt>
            <dd class="text-gray-200 font-mono">{p.nvs.board_id || '—'}</dd>
            <dt class="text-gray-500" title="Zuletzt installierte Firmware-Version">Firmware:</dt>
            <dd class="text-gray-200 font-mono">{p.nvs.fw_version}</dd>
          </dl>
        </div>
      {/if}

      <!-- File info -->
      <div class="flex items-center gap-2">
        <span class="text-gray-500 shrink-0">Datei:</span>
        <span class="text-gray-300 font-mono truncate flex-1">{p.path}</span>
        <span class="text-gray-500 shrink-0">{(p.size_bytes / 1024 / 1024).toFixed(2)} MB</span>
      </div>

      <!-- Verify option + action buttons -->
      <div class="flex flex-col gap-2 pt-1 border-t border-gray-700">
        <label
          class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none"
          title="Empfohlen: Liest den Chip nach dem Schreiben vollständig zurück und vergleicht Byte für Byte mit der Quelldatei. Erhöht die Dauer um ca. 50 %, schützt aber vor stillen Schreibfehlern."
        >
          <input
            type="checkbox"
            bind:checked={writeVerify}
            class="accent-blue-500"
          />
          Nach dem Schreiben verifizieren (empfohlen)
        </label>
        <div class="flex items-center gap-2">
          <button
            onclick={confirmWrite}
            title="Startet den Schreibvorgang. Den Programmer NICHT trennen — Unterbrechung kann den Chip unbrauchbar machen."
            class="px-3 py-1.5 text-sm rounded bg-orange-700 hover:bg-orange-600 text-white font-medium"
          >
            Jetzt schreiben
          </button>
          <button
            onclick={cancelWrite}
            title="Bricht ab — der Chip wird nicht verändert."
            class="px-3 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Result card -->
  {#if $flashResult}
    {@const r = $flashResult}
    <div class="rounded bg-gray-800 border border-gray-700 p-3 text-xs flex flex-col gap-3">

      <!-- Dump match badge -->
      <div
        class="flex items-center gap-2"
        title={r.dumps_match
          ? 'Beide Lesevorgänge sind Byte für Byte identisch — der Dump ist zuverlässig.'
          : 'Die beiden Lesevorgänge weichen voneinander ab. Der Chip könnte beschädigt sein, oder es gab einen Übertragungsfehler. Erneut lesen empfohlen.'}
      >
        <span class="text-gray-400 font-semibold">Dump-Vergleich:</span>
        <span class="{r.dumps_match ? 'text-green-400' : 'text-yellow-400'}">
          {r.dumps_match ? '✓ Identisch' : '⚠ Abweichung erkannt'}
        </span>
      </div>

      <!-- Validation checklist -->
      <div>
        <p class="text-gray-400 font-semibold mb-1">Validierung:</p>
        <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
          {#each VALIDATION_ITEMS as item (item.key)}
            <div class="flex items-center gap-1" title={item.tip}>
              <span class="{(r.validation as unknown as Record<string, boolean>)[item.key] ? 'text-green-400' : 'text-red-400'}">
                {(r.validation as unknown as Record<string, boolean>)[item.key] ? '✓' : '✗'}
              </span>
              <span class="text-gray-300">{item.label}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- NVS info -->
      {#if r.nvs}
        <div>
          <p class="text-gray-400 font-semibold mb-1">Konsoleninfo (aus NVS-Partition):</p>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt class="text-gray-500" title="Seriennummer der Konsole">Serial:</dt>
            <dd class="text-gray-200 font-mono">{r.nvs.serial || '—'}</dd>
            <dt class="text-gray-500" title="MAC-Adresse des WLAN-Chips">MAC:</dt>
            <dd class="text-gray-200 font-mono">{r.nvs.mac_address}</dd>
            <dt class="text-gray-500" title="Modellkennung (CFI-Nummer)">SKU:</dt>
            <dd class="text-gray-200">{r.nvs.sku || '—'}</dd>
            <dt class="text-gray-500" title="Board-Revision">Board ID:</dt>
            <dd class="text-gray-200 font-mono">{r.nvs.board_id || '—'}</dd>
            <dt class="text-gray-500" title="Zuletzt installierte Firmware-Version">Firmware:</dt>
            <dd class="text-gray-200 font-mono">{r.nvs.fw_version}</dd>
          </dl>
        </div>
      {/if}

      <!-- Archive path -->
      <div class="flex items-center gap-2">
        <span class="text-gray-500 shrink-0">Archiv:</span>
        <span class="text-gray-300 font-mono text-xs truncate flex-1">{r.archive_path}</span>
        <button
          onclick={() => openPath(r.archive_path)}
          title="Öffnet den Archiv-Ordner im Dateimanager"
          class="text-xs text-blue-400 hover:text-blue-300 shrink-0"
        >
          Öffnen
        </button>
      </div>
    </div>
  {/if}

  <!-- Status log -->
  <div class="flex-1 min-h-32 overflow-y-auto bg-gray-950 rounded p-3 flex flex-col gap-1">
    {#each $flashLog as entry (entry.id)}
      <div class="font-mono text-xs leading-relaxed {
        entry.level === 'error' ? 'text-red-400' :
        entry.level === 'warn'  ? 'text-yellow-400' :
                                  'text-green-400'
      }">
        <span class="text-gray-600 mr-2">{new Date(entry.timestamp_ms).toLocaleTimeString()}</span>
        {entry.message}
      </div>
    {:else}
      <span class="text-gray-600 text-xs">Kein Output — starte mit "Lesen" um den NOR-Chip auszulesen.</span>
    {/each}
  </div>
</section>
