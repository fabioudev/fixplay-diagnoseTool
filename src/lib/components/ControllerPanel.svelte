
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Gamepad2, Usb, Battery, Activity, Wrench, Zap, Lightbulb, Volume2, RefreshCw, Power } from 'lucide-svelte';
  import StickVisualizer from './StickVisualizer.svelte';
  import CalibrationModal from './CalibrationModal.svelte';
  import QuickTestModal from './QuickTestModal.svelte';
  import {
    controllerConnected,
    controllerModel,
    controllerInfo,
    batteryStatus,
    buttonState,
    triggerState,
    stickState,
    controllerLog,
    pushControllerLog,
    applyProcessedInput,
  } from '$lib/stores/controller';
  import { invoke } from '@tauri-apps/api/core';
  import {
    createControllerManager,
    createControllerForDevice,
    type ControllerManager,
    type ProcessedInput,
  } from '$lib/controllers/controller-manager';
  import { hidConnect, type HidPollResult } from '$lib/controllers/tauri-hid-device';

  let manager = $state<ControllerManager | null>(null);
  let calibOpen = $state(false);
  let quickTestOpen = $state(false);
  let connecting = $state(false);
  let connectError = $state<string | null>(null);
  let fwVersion = $state<string>('—');
  let macAddress = $state<string>('—');
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  const BUTTON_LABELS: Record<string, string> = {
    triangle: '△', cross: '✕', circle: '○', square: '□',
    l1: 'L1', r1: 'R1', l3: 'L3', r3: 'R3',
    up: 'D↑', down: 'D↓', left: 'D←', right: 'D→',
    create: 'Create', touchpad: 'Touch', options: 'Options', ps: 'PS', mute: 'Mute',
  };

  async function connect() {
    connecting = true;
    connectError = null;
    try {
      // Try DualSense (0x0ce6) then DualSense Edge (0x0df2)
      let device = null;
      for (const productId of [0x0ce6, 0x0df2]) {
        try {
          device = await hidConnect(0x054c, productId);
          break;
        } catch {
          // try next product id
        }
      }
      if (!device) {
        throw new Error('Kein DualSense per USB gefunden. Controller einstecken und erneut versuchen.');
      }

      const ctrl = createControllerForDevice(device);
      if (!ctrl) throw new Error('Nicht unterstützter Controller.');

      manager = createControllerManager();
      manager.setControllerInstance(ctrl);
      manager.setInputHandler((input: ProcessedInput) => applyProcessedInput(input));

      controllerConnected.set(true);
      controllerModel.set(ctrl.getModel());
      const info = await ctrl.getInfo();
      controllerInfo.set(info);
      fwVersion  = info.infoItems?.find((i) => i.key === 'FW Version')?.value ?? '—';
      macAddress = info.infoItems?.find((i) => i.key === 'Bluetooth Address')?.value ?? '—';
      pushControllerLog(`Controller verbunden: ${ctrl.getModel()}`, 'info');

      // Poll for input reports at ~60 fps
      pollInterval = setInterval(async () => {
        try {
          const result = await invoke<HidPollResult>('hid_poll');
          if (!result.connected) {
            await disconnect();
            return;
          }
          for (const report of result.reports) {
            const data = new DataView(new Uint8Array(report.data).buffer);
            manager?.processControllerInput({ data });
          }
        } catch {
          // ignore transient poll errors
        }
      }, 16);
    } catch (e) {
      connectError = e instanceof Error ? e.message : String(e);
      pushControllerLog('Verbindung fehlgeschlagen: ' + connectError, 'error');
    } finally {
      connecting = false;
    }
  }

  async function disconnect() {
    if (pollInterval !== null) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (manager) {
      await manager.disconnect();
      manager = null;
    }
    controllerConnected.set(false);
    controllerModel.set(null);
    controllerInfo.set(null);
    buttonState.set({});
    triggerState.set({ l2: 0, r2: 0 });
    stickState.set({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } });
    pushControllerLog('Controller getrennt', 'info');
  }

  async function flashController() {
    if (!manager) return;
    try {
      const res = await manager.flash();
      pushControllerLog(res.message, res.success ? 'info' : 'error');
    } catch (e) {
      pushControllerLog('Flash fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)), 'error');
    }
  }

  async function resetController() {
    if (!manager) return;
    try {
      await manager.reset();
      pushControllerLog('Controller zurückgesetzt', 'info');
    } catch (e) {
      pushControllerLog('Reset fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)), 'error');
    }
  }

  onDestroy(() => {
    disconnect().catch(() => {});
  });
</script>

<div class="flex h-full flex-col gap-4 p-4 overflow-y-auto">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <Gamepad2 class="h-6 w-6 text-blue-500" />
      <div>
        <h1 class="text-lg font-semibold text-gray-100">Controller-Diagnose</h1>
        <p class="text-xs text-gray-500">PS5 DualSense Kalibrierung & Test</p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      {#if $controllerConnected}
        <button class="flex items-center gap-1.5 rounded-lg bg-red-600/20 px-3 py-2 text-sm text-red-400 hover:bg-red-600/30" onclick={disconnect}>
          <Power class="h-4 w-4" /> Trennen
        </button>
      {:else}
        <button class="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50" onclick={connect} disabled={connecting}>
          <Usb class="h-4 w-4" /> {connecting ? 'Verbinde…' : 'Verbinden'}
        </button>
      {/if}
    </div>
  </div>

  {#if connectError}
    <div class="rounded-lg bg-red-900/30 p-3 text-sm text-red-300">{connectError}</div>
  {/if}

  {#if !$controllerConnected}
    <div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <Gamepad2 class="h-16 w-16 text-gray-600" />
      <div>
        <p class="text-gray-400">Kein Controller verbunden</p>
        <p class="text-sm text-gray-600">Klicke auf "Verbinden" und wähle deinen DualSense Controller.</p>
      </div>
    </div>
  {:else}
    <!-- Info bar -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-lg bg-gray-800/60 p-3">
        <div class="text-xs text-gray-500">Modell</div>
        <div class="text-sm font-medium text-gray-200">{$controllerModel ?? '—'}</div>
      </div>
      <div class="rounded-lg bg-gray-800/60 p-3">
        <div class="text-xs text-gray-500">Batterie</div>
        <div class="flex items-center gap-1.5 text-sm font-medium text-gray-200">
          <Battery class="h-4 w-4" /> {$batteryStatus.bat_txt || '—'}
        </div>
      </div>
      <div class="rounded-lg bg-gray-800/60 p-3">
        <div class="text-xs text-gray-500">MAC</div>
        <div class="text-sm font-medium text-gray-200">{macAddress}</div>
      </div>
      <div class="rounded-lg bg-gray-800/60 p-3">
        <div class="text-xs text-gray-500">Firmware</div>
        <div class="text-sm font-medium text-gray-200">{fwVersion}</div>
      </div>
    </div>

    <!-- Sticks -->
    <div class="rounded-xl bg-gray-800/40 p-4">
      <div class="mb-3 flex items-center gap-2 text-sm font-medium text-gray-300">
        <Activity class="h-4 w-4" /> Sticks
      </div>
      <div class="flex justify-center gap-6">
        <div class="flex flex-col items-center gap-2">
          <StickVisualizer side="left" size={140} />
          <span class="text-xs text-gray-500">Links (L3)</span>
        </div>
        <div class="flex flex-col items-center gap-2">
          <StickVisualizer side="right" size={140} />
          <span class="text-xs text-gray-500">Rechts (R3)</span>
        </div>
      </div>
    </div>

    <!-- Triggers -->
    <div class="rounded-xl bg-gray-800/40 p-4">
      <div class="mb-3 text-sm font-medium text-gray-300">Trigger</div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <div class="mb-1 flex justify-between text-xs text-gray-500"><span>L2</span><span>{$triggerState.l2}</span></div>
          <div class="h-3 overflow-hidden rounded-full bg-gray-700">
            <div class="h-full bg-blue-500 transition-all" style="width: {($triggerState.l2 / 255) * 100}%"></div>
          </div>
        </div>
        <div>
          <div class="mb-1 flex justify-between text-xs text-gray-500"><span>R2</span><span>{$triggerState.r2}</span></div>
          <div class="h-3 overflow-hidden rounded-full bg-gray-700">
            <div class="h-full bg-blue-500 transition-all" style="width: {($triggerState.r2 / 255) * 100}%"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Buttons -->
    <div class="rounded-xl bg-gray-800/40 p-4">
      <div class="mb-3 text-sm font-medium text-gray-300">Buttons</div>
      <div class="flex flex-wrap gap-2">
        {#each Object.keys(BUTTON_LABELS) as btn}
          <div class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs {$buttonState[btn] ? 'bg-green-600/30 text-green-300' : 'bg-gray-700/50 text-gray-400'}">
            <span class="font-medium">{BUTTON_LABELS[btn]}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Actions -->
    <div class="flex flex-wrap gap-2">
      <button class="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700" onclick={() => (calibOpen = true)}>
        <Wrench class="h-4 w-4" /> Kalibrierung
      </button>
      <button class="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700" onclick={() => (quickTestOpen = true)}>
        <Zap class="h-4 w-4" /> Schnelltest
      </button>
      <button class="flex items-center gap-1.5 rounded-lg bg-amber-600/20 px-4 py-2 text-sm text-amber-400 hover:bg-amber-600/30" onclick={flashController}>
        <Lightbulb class="h-4 w-4" /> Flash
      </button>
      <button class="flex items-center gap-1.5 rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-600" onclick={resetController}>
        <RefreshCw class="h-4 w-4" /> Reset
      </button>
    </div>

    <!-- Log -->
    <div class="rounded-xl bg-gray-900/60 p-3">
      <div class="mb-2 text-xs font-medium text-gray-500">Protokoll</div>
      <div class="max-h-40 space-y-1 overflow-y-auto text-xs font-mono">
        {#each $controllerLog as entry}
          <div class="{entry.level === 'error' ? 'text-red-400' : entry.level === 'warn' ? 'text-amber-400' : 'text-gray-400'}">
            <span class="text-gray-600">{new Date(entry.timestamp_ms).toLocaleTimeString()}</span> {entry.message}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<CalibrationModal bind:open={calibOpen} {manager} />
<QuickTestModal bind:open={quickTestOpen} {manager} />

