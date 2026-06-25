
<script lang="ts">
  import { sleep } from '$lib/controllers/utils';
  import { pushControllerLog } from '$lib/stores/controller';
  import StickVisualizer from './StickVisualizer.svelte';
  import { X, Loader2 } from 'lucide-svelte';

  let {
    open = $bindable(false),
    manager,
    onDone,
  }: {
    open: boolean;
    manager: { calibrateSticksBegin: () => Promise<void>; calibrateSticksSample: () => Promise<void>; calibrateSticksEnd: () => Promise<void>; calibrateRangeBegin: () => Promise<void>; calibrateRangeEnd: () => Promise<void>; } | null;
    onDone?: (success: boolean, message: string) => void;
  } = $props();

  type Mode = 'center' | 'range';
  let mode = $state<Mode>('center');
  let step = $state(0);
  let totalSteps = $state(6);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let success = $state(false);
  let statusText = $state('');

  function reset() {
    step = 0;
    busy = false;
    error = null;
    success = false;
    statusText = '';
  }

  async function runCenterCalibration() {
    if (!manager) return;
    busy = true;
    error = null;
    success = false;
    try {
      statusText = 'Initialisiere Kalibrierung...';
      step = 1;
      await sleep(100);
      await manager.calibrateSticksBegin();
      step = 2;
      statusText = 'Messe Stick-Mittelpunkt (1/4)...';
      await sleep(150);
      await manager.calibrateSticksSample();
      step = 3;
      statusText = 'Messe Stick-Mittelpunkt (2/4)...';
      await sleep(150);
      await manager.calibrateSticksSample();
      step = 4;
      statusText = 'Messe Stick-Mittelpunkt (3/4)...';
      await sleep(150);
      await manager.calibrateSticksSample();
      step = 5;
      statusText = 'Speichere Kalibrierung...';
      await sleep(200);
      await manager.calibrateSticksSample();
      await sleep(500);
      await manager.calibrateSticksEnd();
      step = 6;
      success = true;
      statusText = 'Stick-Mittelkalibrierung abgeschlossen!';
      pushControllerLog('Stick center calibration completed', 'info');
      onDone?.(true, 'Stick-Mittelkalibrierung abgeschlossen');
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      statusText = 'Fehler: ' + error;
      pushControllerLog('Center calibration failed: ' + error, 'error');
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
    try {
      statusText = 'Starte Range-Kalibrierung...';
      step = 1;
      await manager.calibrateRangeBegin();
      statusText = 'Bewege beide Sticks mehrfach im vollen Kreis.';
      step = 2;
      // In a full implementation we'd monitor stick movement here.
      // For now we just wait for user to press Done.
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      statusText = 'Fehler: ' + error;
      pushControllerLog('Range calibration begin failed: ' + error, 'error');
      busy = false;
    }
  }

  async function finishRangeCalibration() {
    if (!manager) return;
    busy = true;
    try {
      statusText = 'Speichere Range-Kalibrierung...';
      step = 3;
      await manager.calibrateRangeEnd();
      step = 4;
      success = true;
      statusText = 'Range-Kalibrierung abgeschlossen!';
      pushControllerLog('Range calibration completed', 'info');
      onDone?.(true, 'Range-Kalibrierung abgeschlossen');
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      statusText = 'Fehler: ' + error;
      pushControllerLog('Range calibration end failed: ' + error, 'error');
      onDone?.(false, error);
    } finally {
      busy = false;
    }
  }

  async function start() {
    reset();
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

  let prevOpen = $state(false);
  $effect(() => {
    if (open && !prevOpen) {
      start();
    }
    prevOpen = open;
  });
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
          {mode === 'center' ? 'Stick-Mittelkalibrierung' : 'Range-Kalibrierung'}
        </h2>
        <button class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" onclick={close} aria-label="Schließen">
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
          Mittelpunkt
        </button>
        <button
          class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition {mode === 'range' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}"
          onclick={() => (mode = 'range')}
          disabled={busy}
        >
          Range
        </button>
      </div>

      <!-- Progress bar -->
      <div class="mb-4">
        <div class="mb-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Schritt {step} / {totalSteps}</span>
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

      <!-- Stick preview -->
      <div class="mb-4 flex justify-center gap-4">
        <div class="flex flex-col items-center gap-1">
          <StickVisualizer side="left" size={100} />
          <span class="text-xs text-slate-500">Links</span>
        </div>
        <div class="flex flex-col items-center gap-1">
          <StickVisualizer side="right" size={100} />
          <span class="text-xs text-slate-500">Rechts</span>
        </div>
      </div>

      {#if mode === 'range' && step === 2 && !success}
        <div class="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          Bewege beide Sticks mehrfach vollständig im Kreis. Klicke "Fertig" wenn du bereit bist.
        </div>
      {/if}

      <!-- Actions -->
      <div class="flex justify-end gap-2">
        {#if mode === 'range' && step === 2 && !busy}
          <button class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" onclick={finishRangeCalibration}>
            Fertig
          </button>
        {/if}
        <button class="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500" onclick={close}>
          {success ? 'Schließen' : 'Abbrechen'}
        </button>
      </div>
    </div>
  </div>
{/if}

