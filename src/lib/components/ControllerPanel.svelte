
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Gamepad2, Usb, Battery, Activity, Wrench, Zap, Lightbulb, RefreshCw, Power, Crosshair, Copy, WrapText, Download } from 'lucide-svelte';
  import { copyToClipboard } from '$lib/utils/clipboard';
  import { save as saveDialog } from '@tauri-apps/plugin-dialog';
  import { saveTextFile } from '$lib/api/tauri';
  import StickVisualizer from './StickVisualizer.svelte';
  import ControllerVisualizer from './ControllerVisualizer.svelte';
  import TesterPanel from './TesterPanel.svelte';
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
    stickDeadzone,
    stickCircularity,
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
  let circOpen = $state(false);
  let quickTestOpen = $state(false);
  let connecting = $state(false);
  let connectError = $state<string | null>(null);
  let fwVersion = $state<string>('—');
  let macAddress = $state<string>('—');
  let copied = $state<string | null>(null);
  let wrapLog = $state(false);
  const driftLeft = $derived(Math.sqrt($stickState.left.x ** 2 + $stickState.left.y ** 2));
  const driftRight = $derived(Math.sqrt($stickState.right.x ** 2 + $stickState.right.y ** 2));

  async function doCopy(text: string, label: string) {
    await copyToClipboard(text, (ok) => {
      if (ok) { copied = label; setTimeout(() => (copied = null), 1500); }
    });
  }

  function logToText(): string {
    return $controllerLog
      .map((e) => `${new Date(e.timestamp_ms).toLocaleTimeString()} [${e.level}] ${e.message}`)
      .join('\n');
  }

  async function copyLog() {
    await copyToClipboard(logToText(), (ok) => {
      if (ok) { copied = 'Protokoll'; setTimeout(() => (copied = null), 1500); }
    });
  }

  async function exportLog() {
    const path = await saveDialog({
      title: 'Protokoll speichern',
      defaultPath: `controller-log-${Date.now()}.txt`,
      filters: [{ name: 'Text', extensions: ['txt'] }],
    }).catch(() => null);
    if (path && typeof path === 'string') {
      await saveTextFile(path, logToText()).catch(console.error);
      copied = 'Protokoll gespeichert'; setTimeout(() => (copied = null), 1500);
    }
  }
  let pollInterval: ReturnType<typeof setInterval> | null = null;

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

      // Start polling before getInfo so transport (USB vs BT) is detected
      // from the first input report. Feature-report writes need correct CRC
      // framing on Bluetooth, and transport defaults to 'usb' until an input
      // report arrives — without this, getBdAddr's 0x80 write would be sent
      // without CRC on BT and silently dropped by the controller.
      pollInterval = setInterval(async () => {
        try {
          const result = await invoke<HidPollResult>('hid_poll');
          if (!result.connected) {
            await disconnect();
            return;
          }
          for (const report of result.reports) {
            const data = new DataView(new Uint8Array(report.data).buffer);
            manager?.processControllerInput({ data, reportId: report.report_id });
          }
        } catch {
          // ignore transient poll errors
        }
      }, 16);

      // Brief pause for the first input report to arrive and set transport.
      await new Promise((r) => setTimeout(r, 80));

      const info = await ctrl.getInfo();
      controllerInfo.set(info);
      fwVersion  = info.infoItems?.find((i) => i.key === 'FW Version')?.value ?? '—';
      macAddress = info.infoItems?.find((i) => i.key === 'Bluetooth Address')?.value ?? '—';
      pushControllerLog(`Controller verbunden: ${ctrl.getModel()}`, 'info');
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
      <div class="rounded-lg bg-gray-800/60 p-3" title="DualSense-Modell (DS5 = Standard, DS5 Edge = Pro-Controller)">
        <div class="text-xs text-gray-500">Modell</div>
        <div class="text-sm font-medium text-gray-200">{$controllerModel ?? '—'}</div>
      </div>
      <div class="rounded-lg bg-gray-800/60 p-3" title="Akkustand des Controllers">
        <div class="text-xs text-gray-500">Batterie</div>
        <div class="flex items-center gap-1.5 text-sm font-medium text-gray-200">
          <Battery class="h-4 w-4" /> {$batteryStatus.bat_txt || '—'}
        </div>
      </div>
      <div class="rounded-lg bg-gray-800/60 p-3" title="Bluetooth-MAC-Adresse des Controllers">
        <div class="text-xs text-gray-500">MAC</div>
        <div class="flex items-center justify-between gap-1">
          <div class="text-sm font-medium text-gray-200 truncate">{macAddress}</div>
          <button class="text-gray-600 hover:text-gray-300 shrink-0" onclick={() => doCopy(macAddress, 'MAC')} title="MAC kopieren">
            <Copy class="h-3 w-3" />
          </button>
        </div>
      </div>
      <div class="rounded-lg bg-gray-800/60 p-3" title="Firmware-Version des Controllers">
        <div class="text-xs text-gray-500">Firmware</div>
        <div class="flex items-center justify-between gap-1">
          <div class="text-sm font-medium text-gray-200 truncate">{fwVersion}</div>
          <button class="text-gray-600 hover:text-gray-300 shrink-0" onclick={() => doCopy(fwVersion, 'FW')} title="Firmware kopieren">
            <Copy class="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>

    <!-- Quick actions — calibration, circularity test, quick test (most important, at top) -->
    <div class="flex flex-wrap gap-2">
      <button class="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700" onclick={() => (calibOpen = true)}>
        <Wrench class="h-4 w-4" /> Kalibrierung
      </button>
      <button class="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700" onclick={() => (circOpen = true)}>
        <Crosshair class="h-4 w-4" /> Rundheit
      </button>
      <button class="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-700" onclick={() => (quickTestOpen = true)}>
        <Zap class="h-4 w-4" /> Schnelltest
      </button>
      <button class="flex items-center gap-1.5 rounded-lg bg-amber-600/20 px-4 py-2 text-sm text-amber-400 hover:bg-amber-600/30" onclick={flashController} title="Änderungen dauerhaft im Controller speichern">
        <Lightbulb class="h-4 w-4" /> Speichern
      </button>
      <button class="flex items-center gap-1.5 rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-600" onclick={resetController}>
        <RefreshCw class="h-4 w-4" /> Reset
      </button>
    </div>

    <!-- Live controller graphic — buttons/sticks/triggers highlight as pressed -->
    <div class="rounded-xl bg-gray-800/40 p-4">
      <div class="mb-2 flex items-center gap-2 text-sm font-medium text-gray-300">
        <Gamepad2 class="h-4 w-4" /> Live-Controller
      </div>
      <div class="flex justify-center">
        <ControllerVisualizer size={460} />
      </div>
    </div>

    <!-- Manual testers: lights / vibration / adaptive triggers -->
    <TesterPanel {manager} />

    <!-- Sticks -->
    <div class="rounded-xl bg-gray-800/40 p-4">
      <div class="mb-3 flex items-center gap-2 text-sm font-medium text-gray-300">
        <Activity class="h-4 w-4" /> Sticks
      </div>
      <div class="flex justify-center gap-6">
        <div class="flex flex-col items-center gap-2">
          <StickVisualizer
            side="left"
            size={140}
            enableZoomCenter
            deadzone={$stickDeadzone}
            circularityData={$stickCircularity.left}
          />
          <span class="text-xs text-gray-500">Links (L3)</span>
          <span class="text-[10px] {driftLeft < 0.05 ? 'text-green-500' : driftLeft < 0.15 ? 'text-amber-400' : 'text-red-400'}">
            Drift: {(driftLeft * 100).toFixed(1)}%
          </span>
        </div>
        <div class="flex flex-col items-center gap-2">
          <StickVisualizer
            side="right"
            size={140}
            enableZoomCenter
            deadzone={$stickDeadzone}
            circularityData={$stickCircularity.right}
          />
          <span class="text-xs text-gray-500">Rechts (R3)</span>
          <span class="text-[10px] {driftRight < 0.05 ? 'text-green-500' : driftRight < 0.15 ? 'text-amber-400' : 'text-red-400'}">
            Drift: {(driftRight * 100).toFixed(1)}%
          </span>
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

    <!-- Log -->
    <div class="rounded-xl bg-gray-900/60 p-3">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-xs font-medium text-gray-500">Protokoll</span>
        <div class="flex items-center gap-1">
          <button class="text-gray-600 hover:text-gray-300 p-0.5" onclick={copyLog} title="Protokoll kopieren">
            <Copy class="h-3 w-3" />
          </button>
          <button class="text-gray-600 hover:text-gray-300 p-0.5" onclick={exportLog} title="Protokoll als Datei speichern">
            <Download class="h-3 w-3" />
          </button>
          <button class="text-gray-600 hover:text-gray-300 p-0.5" onclick={() => (wrapLog = !wrapLog)} title={wrapLog ? 'Zeilenumbruch aus' : 'Zeilenumbruch an'}>
            <WrapText class="h-3 w-3 {wrapLog ? 'text-teal-400' : ''}" />
          </button>
          <button class="text-gray-600 hover:text-gray-300 p-0.5" onclick={() => controllerLog.set([])} title="Protokoll löschen">
            <RefreshCw class="h-3 w-3" />
          </button>
        </div>
      </div>
      <div class="max-h-40 space-y-1 overflow-y-auto text-xs font-mono {wrapLog ? 'break-words' : 'whitespace-nowrap'}">
        {#each $controllerLog as entry (entry.id)}
          <div class="{entry.level === 'error' ? 'text-red-400' : entry.level === 'warn' ? 'text-amber-400' : 'text-gray-400'}">
            <span class="text-gray-600">{new Date(entry.timestamp_ms).toLocaleTimeString()}</span> {entry.message}
          </div>
        {/each}
      </div>
    </div>
    {#if copied}
      <div class="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-teal-600 px-4 py-2 text-xs text-white shadow-lg z-50 transition-opacity">
        {copied} kopiert
      </div>
    {/if}
  {/if}
</div>

<CalibrationModal bind:open={calibOpen} {manager} />
<CalibrationModal bind:open={circOpen} {manager} initialMode="range" />
<QuickTestModal bind:open={quickTestOpen} {manager} />

