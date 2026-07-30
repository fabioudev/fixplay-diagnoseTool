<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
  import { open as openDialog } from '@tauri-apps/plugin-dialog';
  import {
    flashBusy, flashProgress, flashResult, flashLog,
    flashProgrammer, flashProgrammers, flashWriteRequest, flashWritePreview, nextFlashLogId,
  } from '$lib/stores/flash';
  import { flashListProgrammers, flashGetBinaryStatus, flashReadId, flashRead, flashWrite, flashValidateFile, flashFreeDiskSpace, openPath } from '$lib/api/tauri';
  import type { FlashProgressEvent, FlashStatusEvent, FlashReadResult, ChipId, DiskSpace } from '$lib/api/types';
  import { logTimestampFormat, formatLogTimestamp } from '$lib/utils/time';
  import LL from '$lib/i18n/i18n-svelte';
  import { get } from 'svelte/store';
  import type { TranslationFunctions } from '$lib/i18n/i18n-types';
  import type { LocalizedString } from 'typesafe-i18n';
  import HardwareGuide from './HardwareGuide.svelte';

  let programmers = $state<string[]>([]);
  let phaseLabel  = $state('');
  let etaLabel    = $state('');
  let writeVerify = $state(true);
  let chipId      = $state<ChipId | null>(null);
  let chipIdBusy  = $state(false);
  let diskSpace   = $state<DiskSpace | null>(null);

  /** A NOR read writes 2 MiB twice plus the archived copy — warn well below that. */
  const DISK_WARN_BYTES = 64 * 1024 * 1024; // 64 MiB

  /** Human-readable binary byte size (MiB / GiB / TiB). */
  function formatBytes(bytes: number): string {
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
  }

  async function refreshDiskSpace() {
    diskSpace = await flashFreeDiskSpace().catch(() => null);
  }

  // Per-phase ETA tracking. Progress resets to 0 at each phase (read1/read2/
  // write/verify), so we anchor on the first event of the current phase and
  // extrapolate the remaining time from the observed rate. Only shown once
  // enough of the phase has elapsed to give a non-noisy estimate.
  let etaPhase  = $state('');
  let etaStart  = $state(0);

  function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return '';
    const s = Math.round(ms / 1000);
    if (s < 60) return `~${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `~${m}m ${r}s`;
  }

  const PHASE_LABELS: Record<string, (ll: TranslationFunctions) => LocalizedString> = {
    read1:  (ll) => ll.flash.phase.read1(),
    read2:  (ll) => ll.flash.phase.read2(),
    write:  (ll) => ll.flash.phase.write(),
    verify: (ll) => ll.flash.phase.verify(),
  };

  const VALIDATION_ITEMS: { key: string; label: (ll: TranslationFunctions) => LocalizedString; tip: (ll: TranslationFunctions) => LocalizedString }[] = [
    { key: 'header_ok',     label: (ll) => ll.flash.validation.headerOk.label(), tip: (ll) => ll.flash.validation.headerOk.tip() },
    { key: 'mbr1_ok',       label: (ll) => ll.flash.validation.mbr1.label(),     tip: (ll) => ll.flash.validation.mbr1.tip() },
    { key: 'mbr2_ok',       label: (ll) => ll.flash.validation.mbr2.label(),     tip: (ll) => ll.flash.validation.mbr2.tip() },
    { key: 'emc_ipl_a_ok',  label: (ll) => ll.flash.validation.emcIplA.label(),  tip: (ll) => ll.flash.validation.emcIplA.tip() },
    { key: 'emc_ipl_b_ok',  label: (ll) => ll.flash.validation.emcIplB.label(),  tip: (ll) => ll.flash.validation.emcIplB.tip() },
    { key: 'usb_pdc_a_ok',  label: (ll) => ll.flash.validation.usbPdcA.label(),  tip: (ll) => ll.flash.validation.usbPdcA.tip() },
    { key: 'usb_pdc_b_ok',  label: (ll) => ll.flash.validation.usbPdcB.label(),  tip: (ll) => ll.flash.validation.usbPdcB.tip() },
    { key: 'size_ok',       label: (ll) => ll.flash.validation.size.label(),     tip: (ll) => ll.flash.validation.size.tip() },
  ];

  const unlisten: Array<() => void> = [];

  onMount(async () => {
    programmers = await flashListProgrammers().catch(() => []);
    flashProgrammers.set(programmers);
    if (programmers.length > 0 && !$flashProgrammer) {
      flashProgrammer.set(programmers[0]);
    }

    // flashrom binary self-check: warn up front if the bundled/user flashrom
    // is missing, empty, or not executable — rather than an opaque failure on
    // the first read/write.
    const binaryStatus = await flashGetBinaryStatus().catch(() => null);
    if (binaryStatus && !binaryStatus.ok) {
      flashLog.update((log) => [
        {
          id: nextFlashLogId(),
          timestamp_ms: Date.now(),
          message: get(LL).flash.binaryProblem({ reason: binaryStatus.reason ?? get(LL).common.unknown(), path: binaryStatus.path }),
          level: 'error',
        },
        ...log,
      ]);
    }

    // Free-disk-space indicator for the archive volume (#43).
    refreshDiskSpace();

    const [u1, u2, u3] = await Promise.all([
      listen<FlashProgressEvent>('flash://progress', (e) => {
        flashProgress.set(e.payload);
        const phaseFn = PHASE_LABELS[e.payload.phase];
        phaseLabel = phaseFn ? phaseFn(get(LL)) : e.payload.phase;
        // ETA: re-anchor whenever the phase changes, then extrapolate from the
        // observed rate once ≥20% of the phase is done.
        const now = Date.now();
        if (etaPhase !== e.payload.phase) { etaPhase = e.payload.phase; etaStart = now; }
        const elapsed = now - etaStart;
        const pct = e.payload.percent;
        if (pct > 0 && pct < 100 && elapsed > 0) {
          etaLabel = pct >= 20
            ? get(LL).flash.eta({ time: formatDuration((100 - pct) * elapsed / pct) })
            : '';
        } else if (pct >= 100) {
          etaLabel = '';
        }
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
        etaLabel = ''; etaPhase = ''; etaStart = 0;
        // A completed read archives a dump — refresh the free-space indicator.
        refreshDiskSpace();
      }),
    ]);
    unlisten.push(u1, u2, u3);
  });

  onDestroy(() => unlisten.forEach((fn) => fn()));

  async function handleReadId() {
    if (!$flashProgrammer) return;
    chipIdBusy = true;
    try {
      chipId = await flashReadId($flashProgrammer);
    } catch (e: unknown) {
      chipId = null;
      flashLog.update((log) => [
        { id: nextFlashLogId(), timestamp_ms: Date.now(), message: get(LL).flash.chipIdError({ error: String(e) }), level: 'error' },
        ...log,
      ]);
    } finally {
      chipIdBusy = false;
    }
  }

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
    const storedPath = $flashWriteRequest;
    let selected: string;

    if (storedPath) {
      selected = storedPath;
      flashWriteRequest.set(null);
    } else {
      const result = await openDialog({
        title:   get(LL).flash.selectNorFile(),
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

    // Without verify a silent write error can brick the chip — make the bypass
    // a deliberate choice rather than an accidental checkbox state.
    if (!writeVerify && !confirm(get(LL).flash.confirmWriteNoVerify())) {
      return;
    }

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
      refreshDiskSpace();
    }
  }

  function cancelWrite() {
    flashWritePreview.set(null);
  }
</script>

<section class="flex flex-col gap-4 flex-1 bg-gray-900 rounded-lg p-4 min-h-0">
  <div>
    <h2 class="text-lg font-semibold text-gray-100">{$LL.header.flash()}</h2>
    <p class="text-xs text-gray-500 mt-0.5">
      {$LL.flash.intro()}
    </p>
  </div>

  <HardwareGuide variant="ch341a" />

  <!-- Controls -->
  <div class="flex flex-wrap items-center gap-2">
    <div class="relative">
      <select
        bind:value={$flashProgrammer}
        disabled={$flashBusy}
        title={$LL.flash.programmerTitle()}
        class="appearance-none bg-gray-800 text-gray-100 text-sm rounded px-2 py-1 pr-6
               border border-gray-700 disabled:opacity-50 focus:outline-none"
      >
        {#each programmers as p (p)}
          <option value={p}>{p}</option>
        {:else}
          <option value="">{$LL.flash.noProgrammers()}</option>
        {/each}
      </select>
      <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
    </div>

    <button
      onclick={handleRead}
      disabled={$flashBusy || !$flashProgrammer}
      title={$LL.flash.readTitle()}
      class="px-3 py-1 text-sm rounded bg-blue-700 hover:bg-blue-600 text-white
             disabled:opacity-40"
    >
      {$flashBusy ? $LL.flash.running() : $LL.flash.read()}
    </button>

    <button
      onclick={handleWrite}
      disabled={$flashBusy || !$flashProgrammer || $flashWritePreview !== null}
      title={$LL.flash.writeTitle()}
      class="px-3 py-1 text-sm rounded bg-orange-700 hover:bg-orange-600 text-white
             disabled:opacity-40"
    >
      {$LL.flash.write()}
    </button>

    <button
      onclick={handleReadId}
      disabled={chipIdBusy || !$flashProgrammer}
      title={$LL.flash.readIdTitle()}
      class="px-3 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-100
             disabled:opacity-40"
    >
      {chipIdBusy ? $LL.flash.running() : $LL.flash.detectChip()}
    </button>

    {#if !$flashProgrammer && programmers.length === 0}
      <span class="text-xs text-yellow-500">
        {$LL.flash.noProgrammerWarn()}
      </span>
    {/if}
  </div>

  {#if diskSpace}
    {@const low = diskSpace.free_bytes < DISK_WARN_BYTES}
    <p
      class="text-xs flex items-center gap-1.5 {low ? 'text-red-400' : 'text-gray-500'}"
      title={$LL.flash.diskSpaceTitle()}
    >
      {#if low}⚠ {/if}
      {$LL.flash.storage()} <span class="font-mono">{formatBytes(diskSpace.free_bytes)}</span>
      {$LL.flash.freeOf()} <span class="font-mono">{formatBytes(diskSpace.total_bytes)}</span>
      {#if low}{$LL.flash.diskSpaceLow()}{/if}
    </p>
  {/if}

  <!-- Chip identification (from flash_read_id / JEDEC ID) -->
  {#if chipId}
    <div class="rounded bg-gray-800 border border-gray-700 px-3 py-2 text-xs flex flex-wrap items-center gap-x-4 gap-y-1">
      <span class="text-gray-500 font-semibold">{$LL.flash.chip()}</span>
      <span class="text-gray-100">{chipId.description}</span>
      <span class="text-gray-500">{$LL.flash.manufacturer()} <span class="text-gray-200 font-mono">0x{chipId.manufacturer.toString(16).padStart(2, '0')}</span></span>
      <span class="text-gray-500">{$LL.flash.device()} <span class="text-gray-200 font-mono">0x{chipId.device.toString(16).padStart(4, '0')}</span></span>
      {#if chipId.manufacturer === 0 && chipId.device === 0}
        <span class="text-gray-500" title={$LL.flash.noJedecIdTitle()}>{$LL.flash.noJedecId()}</span>
      {/if}
    </div>
  {/if}

  <!-- Progress bar -->
  {#if $flashProgress !== null}
    <div class="flex flex-col gap-1">
      <div class="flex justify-between text-xs text-gray-400">
        <span>{phaseLabel}</span>
        <span>{$flashProgress.percent}%{etaLabel ? ` · ${etaLabel}` : ''}</span>
      </div>
      <div class="w-full bg-gray-700 rounded-full h-2">
        <div
          class="bg-blue-500 h-2 rounded-full transition-all duration-200"
          style="width: {$flashProgress.percent}%"
        ></div>
      </div>
      <div class="flex items-center justify-between">
        <p class="text-xs text-gray-600">{$LL.flash.inProgress()}</p>
        <button
          class="text-xs text-red-400 hover:text-red-300 underline"
          onclick={() => { flashBusy.set(false); flashProgress.set(null); etaLabel = ''; etaPhase = ''; etaStart = 0; flashLog.update((l) => [{ id: nextFlashLogId(), timestamp_ms: Date.now(), message: get(LL).flash.userAbortLog(), level: 'warn' }, ...l]); }}
        >{$LL.flash.forceStop()}</button>
      </div>
    </div>
  {/if}

  <!-- Write preview card -->
  {#if $flashWritePreview}
    {@const p = $flashWritePreview}
    {@const validationOk = p.validation.size_ok && p.validation.header_ok && p.validation.mbr1_ok && p.validation.mbr2_ok && p.validation.emc_ipl_a_ok && p.validation.emc_ipl_b_ok && p.validation.usb_pdc_a_ok && p.validation.usb_pdc_b_ok}
    <div class="rounded bg-gray-800 border border-gray-700 p-3 text-xs flex flex-col gap-3">

      {#if !validationOk}
        <div class="flex items-center gap-2 rounded bg-yellow-900 border border-yellow-700 px-3 py-2">
          <span class="text-yellow-400 font-semibold">{$LL.flash.validationErrorsWarn()}</span>
        </div>
      {/if}

      <!-- Validation checklist -->
      <div>
        <p class="text-gray-400 font-semibold mb-1">{$LL.flash.validationHeading()}</p>
        <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
          {#each VALIDATION_ITEMS as item (item.key)}
            <div class="flex items-center gap-1" title={item.tip($LL)}>
              <span class="{(p.validation as unknown as Record<string, boolean>)[item.key] ? 'text-green-400' : 'text-red-400'}">
                {(p.validation as unknown as Record<string, boolean>)[item.key] ? '✓' : '✗'}
              </span>
              <span class="text-gray-300">{item.label($LL)}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- NVS info -->
      {#if p.nvs}
        <div>
          <p class="text-gray-400 font-semibold mb-1">{$LL.flash.consoleInfo()}</p>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt class="text-gray-500" title={$LL.flash.nvsSerialTitle()}>Serial:</dt>
            <dd class="text-gray-200 font-mono">{p.nvs.serial || '—'}</dd>
            <dt class="text-gray-500" title={$LL.flash.nvsMacTitle()}>MAC:</dt>
            <dd class="text-gray-200 font-mono">{p.nvs.mac_address}</dd>
            <dt class="text-gray-500" title={$LL.flash.nvsSkuTitle()}>SKU:</dt>
            <dd class="text-gray-200">{p.nvs.sku || '—'}</dd>
            <dt class="text-gray-500" title={$LL.flash.nvsBoardIdTitle()}>Board ID:</dt>
            <dd class="text-gray-200 font-mono">{p.nvs.board_id || '—'}</dd>
            <dt class="text-gray-500" title={$LL.flash.nvsFwTitle()}>Firmware:</dt>
            <dd class="text-gray-200 font-mono">{p.nvs.fw_version}</dd>
          </dl>
        </div>
      {/if}

      <!-- File info -->
      <div class="flex items-center gap-2">
        <span class="text-gray-500 shrink-0">{$LL.flash.file()}</span>
        <span class="text-gray-300 font-mono truncate flex-1">{p.path}</span>
        <span class="text-gray-500 shrink-0">{(p.size_bytes / 1024 / 1024).toFixed(2)} MB</span>
      </div>

      <!-- Verify option + action buttons -->
      <div class="flex flex-col gap-2 pt-1 border-t border-gray-700">
        <label
          class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none"
          title={$LL.flash.verifyTitle()}
        >
          <input
            type="checkbox"
            bind:checked={writeVerify}
            class="accent-blue-500"
          />
          {$LL.flash.verifyAfterWrite()}
        </label>
        {#if !writeVerify}
          <div
            class="flex items-center gap-2 text-xs text-red-400 font-medium"
            title={$LL.flash.verifyOffTitle()}
          >
            <span>{$LL.flash.verifyOffWarn()}</span>
          </div>
        {/if}
        <div class="flex items-center gap-2">
          <button
            onclick={confirmWrite}
            title={$LL.flash.writeNowTitle()}
            class="px-3 py-1.5 text-sm rounded bg-orange-700 hover:bg-orange-600 text-white font-medium"
          >
            {$LL.flash.writeNow()}
          </button>
          <button
            onclick={cancelWrite}
            title={$LL.flash.cancelWriteTitle()}
            class="px-3 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
          >
            {$LL.common.cancel()}
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
          ? $LL.flash.dumpsMatchTitle()
          : $LL.flash.dumpsDifferTitle()}
      >
        <span class="text-gray-400 font-semibold">{$LL.flash.dumpCompare()}</span>
        <span class="{r.dumps_match ? 'text-green-400' : 'text-yellow-400'}">
          {r.dumps_match ? $LL.flash.dumpsIdentical() : $LL.flash.dumpsDiffer()}
        </span>
      </div>

      <!-- Validation checklist -->
      <div>
        <p class="text-gray-400 font-semibold mb-1">{$LL.flash.validationHeading()}</p>
        <div class="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
          {#each VALIDATION_ITEMS as item (item.key)}
            <div class="flex items-center gap-1" title={item.tip($LL)}>
              <span class="{(r.validation as unknown as Record<string, boolean>)[item.key] ? 'text-green-400' : 'text-red-400'}">
                {(r.validation as unknown as Record<string, boolean>)[item.key] ? '✓' : '✗'}
              </span>
              <span class="text-gray-300">{item.label($LL)}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- NVS info -->
      {#if r.nvs}
        <div>
          <p class="text-gray-400 font-semibold mb-1">{$LL.flash.consoleInfo()}</p>
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt class="text-gray-500" title={$LL.flash.nvsSerialTitle()}>Serial:</dt>
            <dd class="text-gray-200 font-mono">{r.nvs.serial || '—'}</dd>
            <dt class="text-gray-500" title={$LL.flash.nvsMacTitle()}>MAC:</dt>
            <dd class="text-gray-200 font-mono">{r.nvs.mac_address}</dd>
            <dt class="text-gray-500" title={$LL.flash.nvsSkuTitle()}>SKU:</dt>
            <dd class="text-gray-200">{r.nvs.sku || '—'}</dd>
            <dt class="text-gray-500" title={$LL.flash.nvsBoardIdTitle()}>Board ID:</dt>
            <dd class="text-gray-200 font-mono">{r.nvs.board_id || '—'}</dd>
            <dt class="text-gray-500" title={$LL.flash.nvsFwTitle()}>Firmware:</dt>
            <dd class="text-gray-200 font-mono">{r.nvs.fw_version}</dd>
          </dl>
        </div>
      {/if}

      <!-- Archive path -->
      <div class="flex items-center gap-2">
        <span class="text-gray-500 shrink-0">{$LL.flash.archive()}</span>
        <span class="text-gray-300 font-mono text-xs truncate flex-1">{r.archive_path}</span>
        <button
          onclick={() => openPath(r.archive_path)}
          title={$LL.flash.openArchiveTitle()}
          class="text-xs text-blue-400 hover:text-blue-300 shrink-0"
        >
          {$LL.common.open()}
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
        <span class="text-gray-600 mr-2">{formatLogTimestamp(entry.timestamp_ms, $logTimestampFormat)}</span>
        {entry.message}
      </div>
    {:else}
      <span class="text-gray-600 text-xs">{$LL.flash.logEmpty()}</span>
    {/each}
  </div>
</section>
