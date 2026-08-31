<script lang="ts">
  import { onMount } from 'svelte';
  import { AlertTriangle } from 'lucide-svelte';
  import { open as openDialog } from '@tauri-apps/plugin-dialog';
  import {
    flashBusy, flashProgress, flashResult, flashLog, flashPhase, flashEtaRemainingMs,
    FLASH_PHASE_LABELS, formatFlashDuration,
    flashProgrammer, flashProgrammers, flashWriteRequest, flashWritePreview, nextFlashLogId,
    pushFlashLog, isValidationOk, failedValidationKeys,
  } from '$lib/stores/flash';
  import { flashListProgrammers, flashGetBinaryStatus, flashReadId, flashRead, flashWrite, flashValidateFile, flashFreeDiskSpace, openPath } from '$lib/api/tauri';
  import type { ChipId, DiskSpace, FlashReadResult } from '$lib/api/types';
  import { logTimestampFormat, formatLogTimestamp } from '$lib/utils/time';
  import LL from '$lib/i18n/i18n-svelte';
  import { get } from 'svelte/store';
  import type { TranslationFunctions } from '$lib/i18n/i18n-types';
  import type { LocalizedString } from 'typesafe-i18n';
  import HardwareGuide from './HardwareGuide.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';

  let programmers = $state<string[]>([]);
  let writeVerify = $state(true);
  let chipId      = $state<ChipId | null>(null);
  let chipIdBusy  = $state(false);
  let diskSpace   = $state<DiskSpace | null>(null);

  // Write confirmation dialog: opens instead of writing straight away whenever
  // the dump failed validation or verify is off. The backend re-validates too
  // (write_gate, defense-in-depth) — this dialog is what makes the operator
  // *intentionally* override that gate via allow_invalid.
  let writeConfirmOpen = $state(false);

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

  function validationLabel(key: string, ll: TranslationFunctions): LocalizedString {
    return VALIDATION_ITEMS.find((i) => i.key === key)?.label(ll) ?? (key as LocalizedString);
  }

  /**
   * Reactive dialog copy for the dangerous-write confirmation. Must be $derived
   * (not function calls with get()): plain prop expressions in the template
   * only re-evaluate when their tracked inputs change, and get() reads stores
   * untracked — the dialog would freeze at its mount-time preview (null) and
   * open with empty copy and no type-to-confirm gate.
   */
  const writeConfirm = $derived.by(() => {
    const preview = $flashWritePreview;
    if (!preview) return { title: '', message: '', typeToConfirm: '' };
    const bad = failedValidationKeys(preview.validation);
    if (bad.length > 0) {
      const failed = bad.map((k) => validationLabel(k, $LL)).join(', ');
      return {
        title: $LL.flash.writeBlockedTitle(),
        message: $LL.flash.writeBlockedMessage({ count: bad.length, failed }),
        typeToConfirm: preview.nvs?.serial || $LL.flash.writeConfirmWord(),
      };
    }
    return {
      title: $LL.flash.writeConfirmTitle(),
      message: $LL.flash.writeNoVerifyMessage(),
      typeToConfirm: '',
    };
  });

  // Localized display labels are derived here (not stored at event time) so a
  // locale switch mid-operation still shows the right text. Unknown phase keys
  // fall back to the raw key rather than hiding progress.
  const phaseLabel = $derived.by(() => {
    const phase = $flashPhase;
    if (!phase) return '';
    const fn = FLASH_PHASE_LABELS[phase];
    return fn ? fn($LL) : phase;
  });

  const etaLabel = $derived($flashEtaRemainingMs === null ? '' : $LL.flash.eta({ time: formatFlashDuration($flashEtaRemainingMs) }));

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
      pushFlashLog({
        id: nextFlashLogId(),
        timestamp_ms: Date.now(),
        message: get(LL).flash.binaryProblem({ reason: binaryStatus.reason ?? get(LL).common.unknown(), path: binaryStatus.path }),
        level: 'error',
      });
    }

    // Free-disk-space indicator for the archive volume (#43).
    refreshDiskSpace();
  });

  // A completed read archives a dump — refresh the free-space indicator. The
  // lastResultSeen guard dedupes the onMount fetch and the mid-operation
  // flashResult.set(null) reset (the effect would otherwise fire twice per
  // completed read). (The flash:// listeners themselves live in the flash
  // store so they survive panel switches; this purely-local concern stays
  // component-side.)
  let lastResultSeen: FlashReadResult | null = null;
  $effect(() => {
    if ($flashResult !== null && $flashResult !== lastResultSeen) {
      lastResultSeen = $flashResult;
      void refreshDiskSpace();
    }
  });

  async function handleReadId() {
    if (!$flashProgrammer) return;
    chipIdBusy = true;
    try {
      chipId = await flashReadId($flashProgrammer);
    } catch (e: unknown) {
      chipId = null;
      pushFlashLog({ id: nextFlashLogId(), timestamp_ms: Date.now(), message: get(LL).flash.chipIdError({ error: String(e) }), level: 'error' });
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
      pushFlashLog({ id: nextFlashLogId(), timestamp_ms: Date.now(), message: String(e), level: 'error' });
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
      pushFlashLog({ id: nextFlashLogId(), timestamp_ms: Date.now(), message: String(e), level: 'error' });
    } finally {
      flashBusy.set(false);
    }
  }

  /**
   * The "Jetzt schreiben" click: gate instead of trusting the operator.
   * A failed validation or a verify-off write opens a blocking ConfirmDialog
   * (type-to-confirm when the dump is invalid) — without verify or with a
   * defective image, a silent write error bricks the chip.
   */
  function confirmWrite() {
    const preview = $flashWritePreview;
    if (!preview) return;
    if (!isValidationOk(preview.validation) || !writeVerify) {
      writeConfirmOpen = true;
      return;
    }
    void doWrite();
  }

  async function doWrite() {
    const preview = $flashWritePreview;
    if (!preview) return;

    flashWritePreview.set(null);
    flashBusy.set(true);
    flashLog.set([]);
    flashProgress.set(null);
    try {
      const allowInvalid = !isValidationOk(preview.validation);
      await flashWrite(preview.path, $flashProgrammer, writeVerify, allowInvalid);
    } catch (e: unknown) {
      pushFlashLog({ id: nextFlashLogId(), timestamp_ms: Date.now(), message: String(e), level: 'error' });
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

  <!-- Persistent 5V danger strip: the single most destructive hardware mistake
       here is a classic black CH341A on a 3.3 V NOR — never only inside the
       collapsed guide. -->
  <div class="flex items-center gap-2 rounded border border-red-700 bg-red-950 px-3 py-2 text-xs text-red-300">
    <AlertTriangle class="h-4 w-4 shrink-0" />
    <span>{$LL.hwGuide.ch341a.dangerShort()}</span>
  </div>

  <HardwareGuide variant="ch341a" />

  {#if $flashWriteRequest}
    <!-- Archive handoff: a dump is armed for the next "Schreiben" click — keep
         the origin visible until the request is consumed. -->
    <div class="rounded border border-blue-800 bg-blue-950/50 px-3 py-2 text-xs text-blue-200" title={$LL.flash.writeTitle()}>
      {$LL.flash.armedFromArchive({ file: $flashWriteRequest })}
    </div>
  {/if}

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
      <p class="text-xs text-gray-600">{$LL.flash.inProgress()}</p>
      <!-- No "force stop" button: a UI-only abort used to lie (flashrom kept
           running) and re-armed other buttons against the running child. A real
           abort needs the backend; until then the UI stays honest: the
           operation runs to completion or to the watchdog. -->
    </div>
  {/if}

  <!-- Write preview card -->
  {#if $flashWritePreview}
    {@const p = $flashWritePreview}
    {@const validationOk = isValidationOk(p.validation)}
    <div class="rounded bg-gray-800 border border-gray-700 p-3 text-xs flex flex-col gap-3">

      {#if !validationOk}
        <!-- Full-width red block: the backend refuses invalid images unless
             allow_invalid is passed — this banner plus the confirm dialog are
             what turn that refusal into a conscious operator override. -->
        <div class="rounded border border-red-700 bg-red-950 px-3 py-2 flex flex-col gap-1">
          <span class="text-red-300 font-semibold flex items-center gap-2">
            <AlertTriangle class="h-4 w-4 shrink-0" />
            {$LL.flash.validationErrorsWarn()}
          </span>
          <span class="text-red-300">
            {$LL.flash.validationFailedSummary({ failed: failedValidationKeys(p.validation).map((k) => validationLabel(k, $LL)).join(', ') })}
          </span>
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

  <!-- Blocking write confirmation: dangerous writes (failed validation / verify
       off) go through here instead of writing on click. Type-to-confirm text is
       the console serial (fallback: locale word) so the operator confirms the
       exact target, not just a checkbox. -->
  <ConfirmDialog
    bind:open={writeConfirmOpen}
    title={writeConfirm.title}
    message={writeConfirm.message}
    confirmLabel={$LL.flash.writeNow()}
    confirmDanger
    typeToConfirm={writeConfirm.typeToConfirm}
    onconfirm={() => void doWrite()}
  />

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
