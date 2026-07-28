
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { pushControllerLog, buttonState, micConnected } from '$lib/stores/controller';
  import { X, Loader2, Play, Square, Mic } from 'lucide-svelte';
  import MicLevelMeter from './MicLevelMeter.svelte';
  import type { AdaptiveTriggerConfig } from '$lib/controllers/base-controller';

  type TestId = 'buttons' | 'haptic' | 'adaptive' | 'lights' | 'speaker' | 'microphone';
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
    { id: 'microphone', label: 'Mikrofon', desc: 'Prüft Mikrofon-Präsenz und Pegel.' },
  ];

  let statuses = $state<Record<TestId, TestStatus>>({
    buttons: 'idle',
    haptic: 'idle',
    adaptive: 'idle',
    lights: 'idle',
    speaker: 'idle',
    microphone: 'idle',
  });

  let lightsInterval: ReturnType<typeof setInterval> | null = null;
  let micActive = $state(false);

  // ── Buttons test: require every digital button to be pressed at least once ──
  // The analog triggers (l2/r2) are exercised via the trigger readout, not here.
  const EXPECTED_BUTTONS = [
    'up', 'right', 'down', 'left',
    'square', 'cross', 'circle', 'triangle',
    'l1', 'r1', 'create', 'options', 'l3', 'r3',
    'ps', 'touchpad', 'mute',
  ] as const;
  const BUTTONS_TIMEOUT_MS = 45_000;
  let buttonsUnsub: (() => void) | null = null;
  let buttonsTimer: ReturnType<typeof setTimeout> | null = null;
  /** Resolve fn of the currently-running buttons-test promise, if any. */
  let buttonsResolve: (() => void) | null = null;
  /** Buttons still missing from the current buttons test run (reactive). */
  let missingButtons = $state<string[]>([]);

  async function runButtonsTest() {
    // Clean up any previous run first (also resolves a still-pending promise).
    abortButtonsTest();
    const pressed = new SvelteSet<string>();
    missingButtons = [...EXPECTED_BUTTONS];
    statuses.buttons = 'running';

    await new Promise<void>((resolve) => {
      buttonsResolve = resolve;
      const finish = (result: TestStatus, logMsg?: string) => {
        stopButtonsTest();
        buttonsResolve = null;
        statuses.buttons = result;
        if (logMsg) pushControllerLog(logMsg, result === 'pass' ? 'info' : 'error');
        resolve();
      };

      buttonsUnsub = buttonState.subscribe((b) => {
        for (const name of EXPECTED_BUTTONS) {
          if (b[name]) pressed.add(name);
        }
        missingButtons = EXPECTED_BUTTONS.filter((n) => !pressed.has(n));
        if (missingButtons.length === 0) {
          finish('pass', "Quick test 'buttons' completed — all buttons pressed");
        }
      });

      buttonsTimer = setTimeout(() => {
        finish('fail', "Quick test 'buttons' timed out — not all buttons pressed");
      }, BUTTONS_TIMEOUT_MS);
    });
  }

  function stopButtonsTest() {
    if (buttonsUnsub) { buttonsUnsub(); buttonsUnsub = null; }
    if (buttonsTimer) { clearTimeout(buttonsTimer); buttonsTimer = null; }
  }

  /** stopButtonsTest + resolve a still-pending buttons-test promise so closing
   *  the modal mid-test doesn't leave an orphaned `await` hanging forever. */
  function abortButtonsTest() {
    stopButtonsTest();
    if (buttonsResolve) {
      const resolve = buttonsResolve;
      buttonsResolve = null;
      resolve();
    }
  }

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
          await runButtonsTest();
          break;
        case 'microphone':
          micActive = true;
          // Wait 500ms for the mic level meter to stabilise, then check presence
          await new Promise((r) => setTimeout(r, 500));
          if ($micConnected) {
            statuses[id] = 'pass';
            pushControllerLog("Quick test 'microphone' — Mikrofon erkannt", 'info');
          } else {
            statuses[id] = 'fail';
            pushControllerLog("Quick test 'microphone' — kein Mikrofon erkannt", 'error');
          }
          break;
      }
      pushControllerLog(`Quick test '${id}' completed`, 'info');
    } catch (e) {
      statuses[id] = 'fail';
      pushControllerLog(`Quick test '${id}' failed: ${e}`, 'error');
    }
  }

  // Whether the running lights test has already recorded an HID write error.
  // Set from the interval callback and read by stopLightsTest so a silent
  // failure surfaces as 'fail' instead of an unconditional 'pass'.
  let lightsTestFailed = false;

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
    lightsTestFailed = false;
    await manager.setMuteLed(2);
    lightsInterval = setInterval(async () => {
      try {
        await manager!.setLightbarColor(colors[ci].r, colors[ci].g, colors[ci].b);
        await manager!.setPlayerIndicator(patterns[pi]);
        pi = (pi + 1) % patterns.length;
        if (pi === 0) ci = (ci + 1) % colors.length;
      } catch (e) {
        // A real HID write failure (e.g. controller gone) must surface as a
        // failed test — previously this was swallowed and the test reported
        // "pass" with the lights not actually changing.
        lightsTestFailed = true;
        if (lightsInterval) {
          clearInterval(lightsInterval);
          lightsInterval = null;
        }
        statuses.lights = 'fail';
        pushControllerLog(`Quick test 'lights' failed: ${e}`, 'error');
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
      } catch (e) {
        // A reset failure is also a real failure, not a silent "pass".
        lightsTestFailed = true;
        pushControllerLog(`Quick test 'lights' reset failed: ${e}`, 'error');
      }
    }
    statuses.lights = lightsTestFailed ? 'fail' : 'pass';
  }

  function close() {
    if (lightsInterval) {
      clearInterval(lightsInterval);
      lightsInterval = null;
    }
    abortButtonsTest();
    missingButtons = [];
    if (manager) {
      manager.setVibration(0, 0).catch(() => {});
      manager.setAdaptiveTrigger({ mode: 'off', force: 0, start: 0, end: 0 }, { mode: 'off', force: 0, start: 0, end: 0 }).catch(() => {});
      manager.resetLights().catch(() => {});
      manager.resetSpeakerSettings().catch(() => {});
    }
    micActive = false;
    open = false;
    statuses = { buttons: 'idle', haptic: 'idle', adaptive: 'idle', lights: 'idle', speaker: 'idle', microphone: 'idle' };
  }

  // Tear down subscriptions/timers if the panel unmounts mid-test (route
  // change). close() covers the user-initiated case; this covers the rest.
  onDestroy(() => {
    abortButtonsTest();
    if (lightsInterval) {
      clearInterval(lightsInterval);
      lightsInterval = null;
    }
  });

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
              {#if test.id === 'buttons' && statuses.buttons === 'running'}
                <div class="mt-2">
                  <svg viewBox="0 0 200 120" class="w-full max-w-[200px]" role="img" aria-label="Button-Übersicht">
                    <!-- Body -->
                    <rect x="8" y="10" width="184" height="100" rx="28" fill="#1e293b" stroke="#334155" stroke-width="1" />
                    <!-- D-pad -->
                    <g transform="translate(48 55)">
                      <rect x="-6" y="-18" width="12" height="12" rx="2" fill={missingButtons.includes('up') ? '#7f1d1d' : '#14532d'} stroke={missingButtons.includes('up') ? '#ef4444' : '#22c55e'} stroke-width="0.8" />
                      <rect x="-6" y="6" width="12" height="12" rx="2" fill={missingButtons.includes('down') ? '#7f1d1d' : '#14532d'} stroke={missingButtons.includes('down') ? '#ef4444' : '#22c55e'} stroke-width="0.8" />
                      <rect x="-18" y="-6" width="12" height="12" rx="2" fill={missingButtons.includes('left') ? '#7f1d1d' : '#14532d'} stroke={missingButtons.includes('left') ? '#ef4444' : '#22c55e'} stroke-width="0.8" />
                      <rect x="6" y="-6" width="12" height="12" rx="2" fill={missingButtons.includes('right') ? '#7f1d1d' : '#14532d'} stroke={missingButtons.includes('right') ? '#ef4444' : '#22c55e'} stroke-width="0.8" />
                    </g>
                    <!-- Face buttons -->
                    <g transform="translate(152 55)">
                      <circle cx="0" cy="-12" r="5" fill={missingButtons.includes('triangle') ? '#7f1d1d' : '#14532d'} stroke={missingButtons.includes('triangle') ? '#ef4444' : '#22c55e'} stroke-width="0.8" />
                      <circle cx="12" cy="0" r="5" fill={missingButtons.includes('circle') ? '#7f1d1d' : '#14532d'} stroke={missingButtons.includes('circle') ? '#ef4444' : '#22c55e'} stroke-width="0.8" />
                      <circle cx="0" cy="12" r="5" fill={missingButtons.includes('cross') ? '#7f1d1d' : '#14532d'} stroke={missingButtons.includes('cross') ? '#ef4444' : '#22c55e'} stroke-width="0.8" />
                      <circle cx="-12" cy="0" r="5" fill={missingButtons.includes('square') ? '#7f1d1d' : '#14532d'} stroke={missingButtons.includes('square') ? '#ef4444' : '#22c55e'} stroke-width="0.8" />
                    </g>
                    <!-- L1/R1 -->
                    <rect x="20" y="18" width="24" height="6" rx="3" fill={missingButtons.includes('l1') ? '#7f1d1d' : '#14532d'} stroke={missingButtons.includes('l1') ? '#ef4444' : '#22c55e'} stroke-width="0.8" />
                    <rect x="156" y="18" width="24" height="6" rx="3" fill={missingButtons.includes('r1') ? '#7f1d1d' : '#14532d'} stroke={missingButtons.includes('r1') ? '#ef4444' : '#22c55e'} stroke-width="0.8" />
                    <!-- L3/R3 -->
                    <circle cx="70" cy="85" r="10" fill="none" stroke={missingButtons.includes('l3') ? '#ef4444' : '#22c55e'} stroke-width="1" />
                    <circle cx="130" cy="85" r="10" fill="none" stroke={missingButtons.includes('r3') ? '#ef4444' : '#22c55e'} stroke-width="1" />
                    <!-- Create/Options -->
                    <rect x="72" y="30" width="8" height="4" rx="2" fill={missingButtons.includes('create') ? '#7f1d1d' : '#14532d'} stroke={missingButtons.includes('create') ? '#ef4444' : '#22c55e'} stroke-width="0.6" />
                    <rect x="120" y="30" width="8" height="4" rx="2" fill={missingButtons.includes('options') ? '#7f1d1d' : '#14532d'} stroke={missingButtons.includes('options') ? '#ef4444' : '#22c55e'} stroke-width="0.6" />
                    <!-- PS + Touchpad + Mute -->
                    <circle cx="100" cy="70" r="4" fill={missingButtons.includes('ps') ? '#7f1d1d' : '#14532d'} stroke={missingButtons.includes('ps') ? '#ef4444' : '#22c55e'} stroke-width="0.8" />
                    <rect x="80" y="22" width="40" height="10" rx="3" fill={missingButtons.includes('touchpad') ? '#7f1d1d' : '#14532d'} stroke={missingButtons.includes('touchpad') ? '#ef4444' : '#22c55e'} stroke-width="0.8" />
                    <circle cx="100" cy="58" r="2" fill={missingButtons.includes('mute') ? '#7f1d1d' : '#fbbf24'} stroke={missingButtons.includes('mute') ? '#ef4444' : '#22c55e'} stroke-width="0.6" />
                  </svg>
                  <div class="text-xs text-gray-500 mt-1 text-center">
                    {missingButtons.length === 0 ? 'Alle gedrückt ✓' : `${missingButtons.length} fehlen`}
                  </div>
                </div>
              {/if}
              {#if test.id === 'microphone' && statuses.microphone === 'running'}
                <div class="mt-2">
                  <MicLevelMeter active={micActive} />
                </div>
              {/if}
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


