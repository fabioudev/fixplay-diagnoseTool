
<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { sleep } from '$lib/controllers/utils';
  import { pushControllerLog, stickState, stickCircularity, stickDeadzone } from '$lib/stores/controller';
  import { CIRCULARITY_DATA_SIZE, calculateCircularityError } from '$lib/utils/stick-renderer';
  import StickVisualizer from './StickVisualizer.svelte';
  import { X, Loader2 } from 'lucide-svelte';
  import { trapFocus } from '$lib/utils/focusTrap';
  import { fade, scale } from 'svelte/transition';
  import { get } from 'svelte/store';
  import LL from '$lib/i18n/i18n-svelte';

  let {
    open = $bindable(false),
    manager,
    onDone,
    initialMode = 'center' as 'center' | 'range',
  }: {
    open: boolean;
    manager: { calibrateSticksBegin: () => Promise<void>; calibrateSticksSample: () => Promise<void>; calibrateSticksEnd: () => Promise<void>; calibrateRangeBegin: () => Promise<void>; calibrateRangeEnd: () => Promise<void>; getInMemoryModuleData: () => Promise<number[] | null>; } | null;
    onDone?: (success: boolean, message: string) => void;
    initialMode?: 'center' | 'range';
  } = $props();

  type Mode = 'center' | 'range';
  // Seed from the prop once (untracked) — `mode` is user-mutable afterwards and
  // must not follow a later prop change.
  let mode = $state<Mode>(untrack(() => initialMode));
  let step = $state(0);
  let totalSteps = $state(6);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let success = $state(false);
  let statusText = $state('');

  // Before/after comparison (#48): snapshot the in-memory finetune module data
  // (12 little-endian u16 values) before calibration starts, then read it again
  // after a successful calibration to show the per-value delta.
  let beforeData = $state<number[] | null>(null);
  let afterData  = $state<number[] | null>(null);
  /** Per-index {before, after, delta} for the 12 finetune values; null until
   *  both snapshots exist and have equal length. */
  const calibDiff = $derived(
    beforeData && afterData && beforeData.length === afterData.length
      ? beforeData.map((b, i) => ({ before: b, after: afterData![i], delta: afterData![i] - b }))
      : null
  );

  // ── Range calibration: live sampling of stick motion ──
  // For each stick we keep 48 angular bins (CIRCULARITY_DATA_SIZE) and record
  // the maximum radius seen in each bin as the user sweeps the stick in a
  // full circle. The result feeds the circularity overlay in the stick dial.
  let rangeUnsub: (() => void) | null = null;
  let rangeLeft = new Array<number>(CIRCULARITY_DATA_SIZE).fill(0);
  let rangeRight = new Array<number>(CIRCULARITY_DATA_SIZE).fill(0);
  /** Fraction of angular bins that have received motion (0..1), reactive. */
  let rangeCoverage = $state(0);

  function resetRangeSampling() {
    if (rangeUnsub) { rangeUnsub(); rangeUnsub = null; }
    rangeLeft = new Array<number>(CIRCULARITY_DATA_SIZE).fill(0);
    rangeRight = new Array<number>(CIRCULARITY_DATA_SIZE).fill(0);
    rangeCoverage = 0;
  }

  /** Record a stick sample into a 48-bin max-radius circularity array. */
  function sampleStick(x: number, y: number, bins: number[]) {
    const r = Math.sqrt(x * x + y * y);
    if (r < 0.08) return; // ignore near-center noise
    const angle = Math.atan2(y, x); // -π..π
    const bin = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * CIRCULARITY_DATA_SIZE) % CIRCULARITY_DATA_SIZE;
    if (r > bins[bin]) bins[bin] = r;
  }

  function coverage(bins: number[]): number {
    return bins.filter((b) => b > 0.2).length / CIRCULARITY_DATA_SIZE;
  }

  function reset() {
    step = 0;
    busy = false;
    error = null;
    success = false;
    statusText = '';
    beforeData = null;
    afterData = null;
    resetRangeSampling();
  }

  async function runCenterCalibration() {
    if (!manager) return;
    busy = true;
    error = null;
    success = false;
    try {
      statusText = get(LL).calibration.init();
      step = 1;
      await sleep(100);
      await manager.calibrateSticksBegin();
      step = 2;
      statusText = get(LL).calibration.measureCenter({ n: 1 });
      await sleep(150);
      await manager.calibrateSticksSample();
      step = 3;
      statusText = get(LL).calibration.measureCenter({ n: 2 });
      await sleep(150);
      await manager.calibrateSticksSample();
      step = 4;
      statusText = get(LL).calibration.measureCenter({ n: 3 });
      await sleep(150);
      await manager.calibrateSticksSample();
      step = 5;
      statusText = get(LL).calibration.save();
      await sleep(200);
      await manager.calibrateSticksSample();
      await sleep(500);
      await manager.calibrateSticksEnd();
      step = 6;
      success = true;
      statusText = get(LL).calibration.centerDone();
      pushControllerLog(get(LL).calibration.centerCompletedLog(), 'info');
      if (manager) { afterData = await manager.getInMemoryModuleData().catch(() => null); }
      onDone?.(true, get(LL).calibration.centerDoneShort());
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      statusText = get(LL).calibration.errorPrefix({ error });
      pushControllerLog(get(LL).calibration.centerFailedLog({ error }), 'error');
      onDone?.(false, error);
    } finally {
      busy = false;
    }
  }

  async function runRangeCalibration() {
    if (!manager) return;
    busy = true;
    error = null;
    success = false;
    resetRangeSampling();
    try {
      statusText = get(LL).calibration.startRange();
      step = 1;
      await manager.calibrateRangeBegin();
      step = 2;
      statusText = get(LL).calibration.moveSticks();
      // Sample stick motion live while the user sweeps. The subscription stays
      // active until finishRangeCalibration() (or close/reset) tears it down.
      rangeUnsub = stickState.subscribe((s) => {
        sampleStick(s.left.x, s.left.y, rangeLeft);
        sampleStick(s.right.x, s.right.y, rangeRight);
        rangeCoverage = Math.min(coverage(rangeLeft), coverage(rangeRight));
      });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      statusText = get(LL).calibration.errorPrefix({ error });
      pushControllerLog(get(LL).calibration.rangeBeginFailedLog({ error }), 'error');
      resetRangeSampling();
      busy = false;
    }
  }

  async function finishRangeCalibration() {
    if (!manager) return;
    busy = true;
    try {
      // Stop sampling before sending the end feature report.
      if (rangeUnsub) { rangeUnsub(); rangeUnsub = null; }
      statusText = get(LL).calibration.saveRange();
      step = 3;
      await manager.calibrateRangeEnd();
      step = 4;
      success = true;
      // Publish the sampled circularity polygons so the stick visualizers in
      // the controller panel render the green/red range overlay.
      stickCircularity.set({ left: [...rangeLeft], right: [...rangeRight] });
      const leftErr = calculateCircularityError(rangeLeft);
      const rightErr = calculateCircularityError(rangeRight);
      statusText = get(LL).calibration.rangeDone({ left: leftErr.toFixed(1), right: rightErr.toFixed(1) });
      pushControllerLog(get(LL).calibration.rangeCompletedLog(), 'info');
      if (manager) { afterData = await manager.getInMemoryModuleData().catch(() => null); }
      onDone?.(true, get(LL).calibration.rangeDoneShort());
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      statusText = get(LL).calibration.errorPrefix({ error });
      pushControllerLog(get(LL).calibration.rangeEndFailedLog({ error }), 'error');
      onDone?.(false, error);
    } finally {
      busy = false;
    }
  }

  async function start() {
    reset();
    // Snapshot the finetune data before calibration so we can show the delta.
    if (manager) { beforeData = await manager.getInMemoryModuleData().catch(() => null); }
    if (mode === 'center') {
      totalSteps = 6;
      await runCenterCalibration();
    } else {
      totalSteps = 4;
      await runRangeCalibration();
    }
  }

  function close() {
    open = false;
    reset();
  }

  // If the panel unmounts while range sampling is mid-flight (e.g. route
  // change), tear down the stickState subscription so it doesn't leak.
  onDestroy(resetRangeSampling);

  let prevOpen = $state(false);
  $effect(() => {
    if (open && !prevOpen) {
      mode = initialMode;
      start();
    }
    prevOpen = open;
  });
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') close(); }} />

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" transition:fade={{ duration: 150 }}>
    <div class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800" use:trapFocus transition:scale={{ duration: 150, start: 0.96 }}>
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
          {mode === 'center' ? $LL.calibration.titleCenter() : $LL.calibration.titleRange()}
        </h2>
        <button class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" onclick={close} aria-label={$LL.calibration.closeAria()}>
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Mode tabs -->
      <div class="mb-4 flex gap-2">
        <button
          class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition {mode === 'center' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}"
          onclick={() => (mode = 'center')}
          disabled={busy}
        >
          {$LL.calibration.tabCenter()}
        </button>
        <button
          class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition {mode === 'range' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}"
          onclick={() => (mode = 'range')}
          disabled={busy}
        >
          {$LL.calibration.tabRange()}
        </button>
      </div>

      <!-- Progress bar -->
      <div class="mb-4">
        <div class="mb-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>{$LL.calibration.step({ step, total: totalSteps })}</span>
          <span>{Math.round((step / totalSteps) * 100)}%</span>
        </div>
        <div class="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
          <div class="h-full rounded-full bg-blue-600 transition-all duration-300" style="width: {(step / totalSteps) * 100}%"></div>
        </div>
      </div>

      <!-- Status -->
      <div class="mb-4 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        {#if busy}
          <Loader2 class="h-4 w-4 animate-spin" />
        {/if}
        <span>{statusText}</span>
      </div>

      {#if error}
        <div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </div>
      {/if}

      {#if success}
        <div class="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300">
          ✓ {statusText}
        </div>
      {/if}

      <!-- Before/after finetune comparison (#48) -->
      {#if calibDiff}
        {@const changed = calibDiff.filter((d) => d.delta !== 0).length}
        <div class="mb-4 rounded-lg border border-slate-200 p-3 dark:border-slate-600">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200">{$LL.calibration.beforeAfter()}</h3>
            <span class="text-xs text-slate-500 dark:text-slate-400">{$LL.calibration.valuesChanged({ changed })}</span>
          </div>
          <div class="grid grid-cols-12 gap-1 text-center text-[10px] font-mono">
            {#each calibDiff as d, i (i)}
              <div
                class="rounded px-0.5 py-1 {d.delta === 0
                  ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'}"
                title={$LL.calibration.valueTitle({ index: i + 1, before: d.before, after: d.after, delta: `${d.delta > 0 ? '+' : ''}${d.delta}` })}
              >
                <div class="text-slate-400 dark:text-slate-500">{i + 1}</div>
                <div>{d.after}</div>
                <div class="text-[9px] {d.delta > 0 ? 'text-green-600 dark:text-green-400' : d.delta < 0 ? 'text-red-600 dark:text-red-400' : ''}">
                  {d.delta > 0 ? '+' : ''}{d.delta}
                </div>
              </div>
            {/each}
          </div>
          <p class="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
            {$LL.calibration.finetuneHint()}
          </p>
        </div>
      {/if}

      <!-- Stick preview -->
      <div class="mb-4 flex justify-center gap-4">
        <div class="flex flex-col items-center gap-1">
          <StickVisualizer
            side="left"
            size={100}
            enableZoomCenter
            deadzone={$stickDeadzone}
            circularityData={$stickCircularity.left}
          />
          <span class="text-xs text-slate-500">{$LL.calibration.left()}</span>
        </div>
        <div class="flex flex-col items-center gap-1">
          <StickVisualizer
            side="right"
            size={100}
            enableZoomCenter
            deadzone={$stickDeadzone}
            circularityData={$stickCircularity.right}
          />
          <span class="text-xs text-slate-500">{$LL.calibration.right()}</span>
        </div>
      </div>

      {#if mode === 'range' && step === 2 && !success}
        <div class="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          {$LL.calibration.rangeHint()}
          <div class="mt-1 text-xs">
            {$LL.calibration.coverage({ percent: Math.round(rangeCoverage * 100) })}
            {#if rangeCoverage < 1}{$LL.calibration.keepGoing()}{/if}
          </div>
        </div>
      {/if}

      <!-- Actions -->
      <div class="flex justify-end gap-2">
        {#if mode === 'range' && step === 2 && !busy}
          <button class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" onclick={finishRangeCalibration}>
            {$LL.calibration.done()}
          </button>
        {/if}
        <button class="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500" onclick={close}>
          {success ? $LL.calibration.closeAria() : $LL.calibration.cancel()}
        </button>
      </div>
    </div>
  </div>
{/if}

