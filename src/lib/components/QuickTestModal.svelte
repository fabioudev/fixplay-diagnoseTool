
<script lang="ts">
  import { pushControllerLog } from '$lib/stores/controller';
  import { X, Loader2, Play, Square } from 'lucide-svelte';
  import type { AdaptiveTriggerConfig } from '$lib/controllers/base-controller';

  type TestId = 'buttons' | 'haptic' | 'adaptive' | 'lights' | 'speaker';
  type TestStatus = 'idle' | 'running' | 'pass' | 'fail';

  let {
    open = $bindable(false),
    manager,
  }: {
    open: boolean;
    manager: {
      setVibration: (heavyLeft: number, lightRight: number) => Promise<void>;
      setAdaptiveTrigger: (left: AdaptiveTriggerConfig, right: AdaptiveTriggerConfig) => Promise<void>;
      setLightbarColor: (r: number, g: number, b: number) => Promise<void>;
      setPlayerIndicator: (pattern: number) => Promise<void>;
      setMuteLed: (mode: number) => Promise<void>;
      resetLights: () => Promise<void>;
      setSpeakerTone: (output?: 'speaker' | 'headphones', duration?: number, doneCb?: (r: { success: boolean }) => void) => Promise<void>;
      resetSpeakerSettings: () => Promise<void>;
    } | null;
  } = $props();

  const tests: { id: TestId; label: string; desc: string }[] = [
    { id: 'buttons', label: 'Buttons', desc: 'Drücke alle Buttons um sie zu testen.' },
    { id: 'haptic', label: 'Vibration', desc: 'Testet die Rumble-Motoren.' },
    { id: 'adaptive', label: 'Adaptive Trigger', desc: 'Setzt Trigger-Widerstand.' },
    { id: 'lights', label: 'Lichter', desc: 'Lightbar und Player-LED.' },
    { id: 'speaker', label: 'Lautsprecher', desc: 'Spielt einen Ton ab.' },
  ];

  let statuses = $state<Record<TestId, TestStatus>>({
    buttons: 'idle',
    haptic: 'idle',
    adaptive: 'idle',
    lights: 'idle',
    speaker: 'idle',
  });

  let lightsInterval: ReturnType<typeof setInterval> | null = null;

  async function runTest(id: TestId) {
    if (!manager) return;
    statuses[id] = 'running';
    try {
      switch (id) {
        case 'haptic':
          await manager.setVibration(255, 0);
          await new Promise((r) => setTimeout(r, 500));
          await manager.setVibration(0, 255);
          await new Promise((r) => setTimeout(r, 500));
          await manager.setVibration(0, 0);
          statuses[id] = 'pass';
          break;
        case 'adaptive':
          await manager.setAdaptiveTrigger(
            { mode: 'resistance', force: 255, start: 0, end: 320 },
            { mode: 'resistance', force: 255, start: 0, end: 320 }
          );
          await new Promise((r) => setTimeout(r, 3000));
          await manager.setAdaptiveTrigger({ mode: 'off', force: 0, start: 0, end: 0 }, { mode: 'off', force: 0, start: 0, end: 0 });
          statuses[id] = 'pass';
          break;
        case 'lights':
          await startLightsTest();
          break;
        case 'speaker':
          await manager.setSpeakerTone('speaker', 1000, (r) => {
            statuses[id] = r.success ? 'pass' : 'fail';
          });
          break;
        case 'buttons':
          statuses[id] = 'pass';
          break;
      }
      pushControllerLog(`Quick test '${id}' completed`, 'info');
    } catch (e) {
      statuses[id] = 'fail';
      pushControllerLog(`Quick test '${id}' failed: ${e}`, 'error');
    }
  }

  async function startLightsTest() {
    if (!manager) return;
    const colors = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
    ];
    const patterns = [0b10001, 0b01010, 0b00100, 0b11111, 0b00000];
    let ci = 0;
    let pi = 0;
    await manager.setMuteLed(2);
    lightsInterval = setInterval(async () => {
      try {
        await manager!.setLightbarColor(colors[ci].r, colors[ci].g, colors[ci].b);
        await manager!.setPlayerIndicator(patterns[pi]);
        pi = (pi + 1) % patterns.length;
        if (pi === 0) ci = (ci + 1) % colors.length;
      } catch {
        /* ignore */
      }
    }, 200);
  }

  async function stopLightsTest() {
    if (lightsInterval) {
      clearInterval(lightsInterval);
      lightsInterval = null;
    }
    if (manager) {
      try {
        await manager.resetLights();
      } catch {
        /* ignore */
      }
    }
    statuses.lights = 'pass';
  }

  function close() {
    if (lightsInterval) {
      clearInterval(lightsInterval);
      lightsInterval = null;
    }
    if (manager) {
      manager.setVibration(0, 0).catch(() => {});
      manager.setAdaptiveTrigger({ mode: 'off', force: 0, start: 0, end: 0 }, { mode: 'off', force: 0, start: 0, end: 0 }).catch(() => {});
      manager.resetLights().catch(() => {});
      manager.resetSpeakerSettings().catch(() => {});
    }
    open = false;
    statuses = { buttons: 'idle', haptic: 'idle', adaptive: 'idle', lights: 'idle', speaker: 'idle' };
  }

  function statusColor(s: TestStatus): string {
    return s === 'pass'
      ? 'text-green-600'
      : s === 'fail'
        ? 'text-red-600'
        : s === 'running'
          ? 'text-blue-600'
          : 'text-slate-400';
  }

  function statusLabel(s: TestStatus): string {
    return s === 'pass' ? '✓ OK' : s === 'fail' ? '✗ Fehler' : s === 'running' ? 'Läuft…' : 'Nicht getestet';
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Schnelltest</h2>
        <button class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" onclick={close} aria-label="Schließen">
          <X class="h-5 w-5" />
        </button>
      </div>

      <div class="space-y-2">
        {#each tests as test (test.id)}
          <div class="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-600">
            <div>
              <div class="text-sm font-medium text-slate-800 dark:text-slate-100">{test.label}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">{test.desc}</div>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs font-medium {statusColor(statuses[test.id])}">
                {statusLabel(statuses[test.id])}
              </span>
              {#if test.id === 'lights' && statuses.lights === 'running'}
                <button class="rounded-lg bg-red-100 p-2 text-red-600 hover:bg-red-200" onclick={stopLightsTest} aria-label="Stop">
                  <Square class="h-4 w-4" />
                </button>
              {:else}
                <button
                  class="rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:opacity-50"
                  onclick={() => runTest(test.id)}
                  disabled={statuses[test.id] === 'running'}
                  aria-label="Start"
                >
                  {#if statuses[test.id] === 'running'}
                    <Loader2 class="h-4 w-4 animate-spin" />
                  {:else}
                    <Play class="h-4 w-4" />
                  {/if}
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <div class="mt-4 flex justify-end">
        <button class="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500" onclick={close}>
          Schließen
        </button>
      </div>
    </div>
  </div>
{/if}


