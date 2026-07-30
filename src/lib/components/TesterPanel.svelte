<script lang="ts">
  // Manual testers for the three DualSense actuator systems the repair tech
  // needs to verify: lightbar + player LEDs + mute LED, rumble motors, and
  // adaptive triggers. Unlike QuickTestModal (scripted pass/fail), these give
  // live sliders / pickers so you can dial in a value and watch the controller
  // respond — the "tester für lichter / vibratoren / adaptive trigger" the
  // panel was missing.
  import { Lightbulb, Vibrate, Gauge, Play, Square, RotateCcw, Volume2, Mic, Compass, Hand } from 'lucide-svelte';
  import { get } from 'svelte/store';
  import { pushControllerLog, lightbarColor, triggerState, buttonState, micConnected } from '$lib/stores/controller';
  import LL from '$lib/i18n/i18n-svelte';
  import type { TranslationFunctions } from '$lib/i18n/i18n-types';
  import type { LocalizedString } from 'typesafe-i18n';
  import type { AdaptiveTriggerConfig } from '$lib/controllers/base-controller';
  import type { ControllerManager } from '$lib/controllers/controller-manager';
  import MicLevelMeter from './MicLevelMeter.svelte';
  import MicSpectrumView from './MicSpectrumView.svelte';
  import SpeakerMicLoopback from './SpeakerMicLoopback.svelte';
  import ImuVisualizer from './ImuVisualizer.svelte';
  import TouchpadGestureVisualizer from './TouchpadGestureVisualizer.svelte';

  let {
    manager,
  }: {
    manager: ControllerManager | null;
  } = $props();

  type Tab = 'lights' | 'vibration' | 'trigger' | 'speaker' | 'imu' | 'touch';
  let tab = $state<Tab>('lights');

  // ── Lights ────────────────────────────────────────────────────────────────
  let r = $state(0);
  let g = $state(0);
  let b = $state(255);
  let brightness = $state(80); // % — scales the RGB actually sent
  // Player-LED bits: 5 individual LEDs (bit0..bit4). pattern = OR of active bits.
  let leds = $state<boolean[]>([false, false, false, false, false]);
  let muteMode = $state<0 | 1 | 2>(0); // 0 off, 1 on, 2 pulse

  const LIGHT_PRESETS: { id: string; label: (ll: TranslationFunctions) => LocalizedString; r: number; g: number; b: number }[] = [
    { id: 'off', label: (ll) => ll.tester.presetOff(), r: 0, g: 0, b: 0 },
    { id: 'red', label: (ll) => ll.tester.presetRed(), r: 255, g: 0, b: 0 },
    { id: 'green', label: (ll) => ll.tester.presetGreen(), r: 0, g: 255, b: 0 },
    { id: 'blue', label: (ll) => ll.tester.presetBlue(), r: 0, g: 0, b: 255 },
    { id: 'white', label: (ll) => ll.tester.presetWhite(), r: 255, g: 255, b: 255 },
    { id: 'pink', label: (ll) => ll.tester.presetPink(), r: 255, g: 0, b: 255 },
    { id: 'cyan', label: (ll) => ll.tester.presetCyan(), r: 0, g: 255, b: 255 },
    { id: 'teal', label: (ll) => ll.tester.presetTeal(), r: 0, g: 150, b: 136 },
  ];
  const PLAYER_PRESETS: { id: string; label: (ll: TranslationFunctions) => LocalizedString; pattern: number }[] = [
    { id: 'off', label: (ll) => ll.tester.playerOff(), pattern: 0 },
    { id: 'p1', label: () => 'P1' as LocalizedString, pattern: 0b10001 },
    { id: 'p2', label: () => 'P2' as LocalizedString, pattern: 0b10010 },
    { id: 'p3', label: () => 'P3' as LocalizedString, pattern: 0b10101 },
    { id: 'p4', label: () => 'P4' as LocalizedString, pattern: 0b10110 },
    { id: 'all', label: (ll) => ll.tester.playerAll(), pattern: 0b11111 },
  ];

  function ledPattern(): number {
    return leds.reduce((acc, on, i) => acc | (on ? 1 << i : 0), 0);
  }

  function scaled(v: number): number {
    return Math.round((v * brightness) / 100);
  }

  async function applyLights(): Promise<void> {
    if (!manager) return;
    try {
      const rr = scaled(r);
      const gg = scaled(g);
      const bb = scaled(b);
      await manager.setLightbarColor(rr, gg, bb);
      lightbarColor.set({ r: rr, g: gg, b: bb });
      await manager.setPlayerIndicator(ledPattern());
      await manager.setMuteLed(muteMode);
      pushControllerLog(get(LL).tester.lightsLog({ r: rr, g: gg, b: bb, leds: ledPattern(), mute: muteMode }), 'info');
    } catch (e) {
      pushControllerLog(get(LL).tester.lightsFailed({ error: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  async function resetLights(): Promise<void> {
    if (!manager) return;
    try {
      await manager.resetLights();
      r = 0; g = 0; b = 0; brightness = 80; leds = [false, false, false, false, false]; muteMode = 0;
      lightbarColor.set({ r: 0, g: 0, b: 0 });
      pushControllerLog(get(LL).tester.lightsReset(), 'info');
    } catch (e) {
      pushControllerLog(get(LL).tester.lightsResetFailed({ error: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  // ── Vibration ─────────────────────────────────────────────────────────────
  let heavy = $state(0); // left (strong) motor
  let light = $state(0); // right (weak) motor
  let pulseTimer: ReturnType<typeof setInterval> | null = null;

  async function applyVibration(): Promise<void> {
    if (!manager) return;
    try {
      await manager.setVibration(heavy, light);
    } catch (e) {
      pushControllerLog(get(LL).tester.vibFailed({ error: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  async function stopVibration(): Promise<void> {
    heavy = 0;
    light = 0;
    if (pulseTimer) {
      clearInterval(pulseTimer);
      pulseTimer = null;
    }
    if (manager) await manager.setVibration(0, 0).catch(() => {});
  }

  async function runPulse(): Promise<void> {
    if (!manager || pulseTimer) return;
    let on = false;
    pulseTimer = setInterval(async () => {
      on = !on;
      try {
        await manager!.setVibration(on ? heavy : 0, on ? light : 0);
      } catch {
        if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
      }
    }, 220);
    // auto-stop after ~2.5s
    setTimeout(() => {
      if (pulseTimer) { clearInterval(pulseTimer); pulseTimer = null; }
      manager?.setVibration(0, 0).catch(() => {});
    }, 2500);
  }

  // ── Adaptive triggers ──────────────────────────────────────────────────────
  type TriggerMode = 'off' | 'resistance' | 'single' | 'auto';
  const TRIGGER_MODES: { id: TriggerMode; label: (ll: TranslationFunctions) => LocalizedString }[] = [
    { id: 'off', label: (ll) => ll.tester.modeOff() },
    { id: 'resistance', label: (ll) => ll.tester.modeResistance() },
    { id: 'single', label: (ll) => ll.tester.modeSingle() },
    { id: 'auto', label: (ll) => ll.tester.modeAuto() },
  ];
  let lMode = $state<TriggerMode>('off');
  let lStart = $state(0);
  let lEnd = $state(255);
  let lForce = $state(180);
  let lFreq = $state(10);
  let rMode = $state<TriggerMode>('off');
  let rStart = $state(0);
  let rEnd = $state(255);
  let rForce = $state(180);
  let rFreq = $state(10);

  async function applyTriggers(): Promise<void> {
    if (!manager) return;
    try {
      const left: AdaptiveTriggerConfig = { mode: lMode, start: lStart, end: lEnd, force: lForce };
      const right: AdaptiveTriggerConfig = { mode: rMode, start: rStart, end: rEnd, force: rForce };
      // 'auto' uses frequency as start per the protocol (param0 = frequency).
      if (lMode === 'auto') (left as { frequency?: number }).frequency = lFreq;
      if (rMode === 'auto') (right as { frequency?: number }).frequency = rFreq;
      await manager.setAdaptiveTrigger(left, right);
      pushControllerLog(get(LL).tester.triggerLog({ l: lMode, r: rMode }), 'info');
    } catch (e) {
      pushControllerLog(get(LL).tester.triggerFailed({ error: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  async function resetTriggers(): Promise<void> {
    if (!manager) return;
    lMode = 'off'; rMode = 'off';
    await manager.setAdaptiveTrigger(
      { mode: 'off', start: 0, end: 0, force: 0 },
      { mode: 'off', start: 0, end: 0, force: 0 },
    ).catch(() => {});
    pushControllerLog(get(LL).tester.triggerReset(), 'info');
  }

  // ── Test-pattern auto-sequences (one-click per category) ──────────────────
  let lightsRunning = $state(false);
  let vibRunning = $state(false);
  let triggerRunning = $state(false);
  let patternAbort: (() => void) | null = null;

  function stopPattern(): void {
    patternAbort?.();
    patternAbort = null;
    lightsRunning = false;
    vibRunning = false;
    triggerRunning = false;
  }

  async function runLightsPattern(): Promise<void> {
    if (!manager || lightsRunning) return;
    lightsRunning = true;
    let aborted = false;
    patternAbort = () => { aborted = true; };
    try {
      const colors = [
        { r: 255, g: 0, b: 0 },    // Rot
        { r: 0, g: 255, b: 0 },    // Grün
        { r: 0, g: 0, b: 255 },    // Blau
        { r: 255, g: 255, b: 255 }, // Weiß
        { r: 255, g: 0, b: 255 },  // Pink
        { r: 0, g: 255, b: 255 },  // Cyan
      ];
      for (const c of colors) {
        if (aborted) break;
        r = c.r; g = c.g; b = c.b;
        await manager.setLightbarColor(c.r, c.g, c.b);
        lightbarColor.set(c);
        await sleep(400);
      }
      // Cycle player LEDs 1→5
      for (const pattern of [0b10001, 0b10010, 0b10101, 0b10110, 0b11111]) {
        if (aborted) break;
        leds = [0, 1, 2, 3, 4].map((i) => ((pattern >> i) & 1) === 1);
        await manager.setPlayerIndicator(pattern);
        await sleep(350);
      }
      // Mute LED: on → pulse → off
      if (!aborted) { muteMode = 1; await manager.setMuteLed(1); await sleep(400); }
      if (!aborted) { muteMode = 2; await manager.setMuteLed(2); await sleep(500); }
      if (!aborted) { muteMode = 0; await manager.setMuteLed(0); await sleep(200); }
      // Reset
      if (!aborted) await resetLights();
      pushControllerLog(get(LL).tester.lightsPatternDone(), 'info');
    } catch (e) {
      pushControllerLog(get(LL).tester.lightsPatternFailed({ error: e instanceof Error ? e.message : String(e) }), 'error');
    } finally {
      lightsRunning = false;
      if (patternAbort) patternAbort = null;
    }
  }

  async function runVibPattern(): Promise<void> {
    if (!manager || vibRunning) return;
    vibRunning = true;
    let aborted = false;
    patternAbort = () => { aborted = true; };
    try {
      // Ramp up heavy motor
      for (let v = 0; v <= 255 && !aborted; v += 51) {
        heavy = v; light = 0;
        await manager.setVibration(heavy, light);
        await sleep(120);
      }
      // Ramp up light motor
      for (let v = 0; v <= 200 && !aborted; v += 50) {
        heavy = 0; light = v;
        await manager.setVibration(heavy, light);
        await sleep(120);
      }
      // Pulse both 3×
      for (let i = 0; i < 3 && !aborted; i++) {
        await manager.setVibration(200, 150);
        await sleep(200);
        await manager.setVibration(0, 0);
        await sleep(200);
      }
      if (!aborted) {
        heavy = 0; light = 0;
        await manager.setVibration(0, 0);
      }
      pushControllerLog(get(LL).tester.vibPatternDone(), 'info');
    } catch (e) {
      pushControllerLog(get(LL).tester.vibPatternFailed({ error: e instanceof Error ? e.message : String(e) }), 'error');
    } finally {
      vibRunning = false;
      if (patternAbort) patternAbort = null;
    }
  }

  async function runTriggerPattern(): Promise<void> {
    if (!manager || triggerRunning) return;
    triggerRunning = true;
    let aborted = false;
    patternAbort = () => { aborted = true; };
    try {
      const modes: { mode: TriggerMode; start: number; end: number; force: number; freq?: number }[] = [
        { mode: 'resistance', start: 0, end: 0, force: 200 },
        { mode: 'single', start: 80, end: 200, force: 150 },
        { mode: 'auto', start: 0, end: 0, force: 120, freq: 10 },
        { mode: 'off', start: 0, end: 0, force: 0 },
      ];
      for (const m of modes) {
        if (aborted) break;
        lMode = m.mode; rMode = m.mode;
        lStart = m.start; rStart = m.start;
        lEnd = m.end; rEnd = m.end;
        lForce = m.force; rForce = m.force;
        if (m.freq !== undefined) { lFreq = m.freq; rFreq = m.freq; }
        const cfg: AdaptiveTriggerConfig = { mode: m.mode, start: m.start, end: m.end, force: m.force };
        if (m.freq !== undefined) (cfg as { frequency?: number }).frequency = m.freq;
        await manager.setAdaptiveTrigger(cfg, cfg);
        await sleep(1200);
      }
      if (!aborted) await resetTriggers();
      pushControllerLog(get(LL).tester.triggerPatternDone(), 'info');
    } catch (e) {
      pushControllerLog(get(LL).tester.triggerPatternFailed({ error: e instanceof Error ? e.message : String(e) }), 'error');
    } finally {
      triggerRunning = false;
      if (patternAbort) patternAbort = null;
    }
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ── Speaker / Microphone ──────────────────────────────────────────────────
  let speakerPlaying = $state(false);
  let micActive = $state(false);
  let spectrumActive = $state(false);

  async function playSpeakerTone(durationMs: number): Promise<void> {
    if (!manager || speakerPlaying) return;
    speakerPlaying = true;
    try {
      await new Promise<void>((resolve) => {
        manager!.setSpeakerTone('speaker', durationMs, () => resolve());
      });
      pushControllerLog(get(LL).tester.speakerLog({ ms: durationMs }), 'info');
    } catch (e) {
      pushControllerLog(get(LL).tester.speakerFailed({ error: e instanceof Error ? e.message : String(e) }), 'error');
    } finally {
      speakerPlaying = false;
    }
  }

  async function stopSpeaker(): Promise<void> {
    if (!manager) return;
    await manager.resetSpeakerSettings().catch(() => {});
    speakerPlaying = false;
  }

  // ── Typed slider/row descriptors ──────────────────────────────────────────
  // Declared as *typed* arrays (not inline literals in markup) so the `#each`
  // destructuring keeps each member's exact type. Inline mixed tuples get
  // widened to a union (`string | ((v:number)=>number)`), which makes `get()`
  // not callable — svelte-check flagged ~40 "This expression is not callable".
  type ColorSlider = [label: string, get: () => number, set: (v: number) => void, color: string];
  const COLOR_SLIDERS: ColorSlider[] = [
    ['R', () => r, (v: number) => (r = v), '#ef4444'],
    ['G', () => g, (v: number) => (g = v), '#22c55e'],
    ['B', () => b, (v: number) => (b = v), '#3b82f6'],
  ];

  type VibSlider = { label: (ll: TranslationFunctions) => LocalizedString; get: () => number; set: (v: number) => void };
  const VIB_SLIDERS: VibSlider[] = [
    { label: (ll) => ll.tester.vibLeft(), get: () => heavy, set: (v: number) => (heavy = v) },
    { label: (ll) => ll.tester.vibRight(), get: () => light, set: (v: number) => (light = v) },
  ];

  interface TriggerRow {
    name: string;
    getMode: () => TriggerMode;
    setMode: (m: TriggerMode) => void;
    getStart: () => number;
    setStart: (v: number) => void;
    getEnd: () => number;
    setEnd: (v: number) => void;
    getForce: () => number;
    setForce: (v: number) => void;
    getFreq: () => number;
    setFreq: (v: number) => void;
    getLevel: () => number;
  }
  const TRIGGER_ROWS: TriggerRow[] = [
    { name: 'L2', getMode: () => lMode, setMode: (m) => (lMode = m), getStart: () => lStart, setStart: (v) => (lStart = v), getEnd: () => lEnd, setEnd: (v) => (lEnd = v), getForce: () => lForce, setForce: (v) => (lForce = v), getFreq: () => lFreq, setFreq: (v) => (lFreq = v), getLevel: () => $triggerState.l2 },
    { name: 'R2', getMode: () => rMode, setMode: (m) => (rMode = m), getStart: () => rStart, setStart: (v) => (rStart = v), getEnd: () => rEnd, setEnd: (v) => (rEnd = v), getForce: () => rForce, setForce: (v) => (rForce = v), getFreq: () => rFreq, setFreq: (v) => (rFreq = v), getLevel: () => $triggerState.r2 },
  ];

  type TabDef = { id: Tab; label: (ll: TranslationFunctions) => LocalizedString; icon: typeof Lightbulb };
  const TABS: TabDef[] = [
    { id: 'lights', label: (ll) => ll.tester.lights(), icon: Lightbulb },
    { id: 'vibration', label: (ll) => ll.tester.vibration(), icon: Vibrate },
    { id: 'trigger', label: (ll) => ll.tester.trigger(), icon: Gauge },
    { id: 'speaker', label: (ll) => ll.tester.audio(), icon: Volume2 },
    { id: 'imu', label: (ll) => ll.tester.imu(), icon: Compass },
    { id: 'touch', label: (ll) => ll.tester.touchpad(), icon: Hand },
  ];
</script>

<div class="rounded-xl bg-gray-800/40 p-4">
  <div class="mb-3 flex items-center gap-1.5">
    {#each TABS as tb (tb.id)}
      <button
        onclick={() => (tab = tb.id)}
        class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors
               {tab === tb.id ? 'bg-teal-500/15 text-teal-300 border border-teal-500/40' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 border border-transparent'}"
      >
        <tb.icon class="h-3.5 w-3.5" /> {tb.label($LL)}
      </button>
    {/each}
  </div>

  {#if tab === 'lights'}
    <!-- Lightbar color -->
    <div class="flex flex-col gap-3">
      <div class="flex items-center gap-4">
        <div class="flex flex-col gap-2 flex-1">
          {#each COLOR_SLIDERS as [label, get, set, color], i (i)}
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-400 w-3" style="color:{color}">{label}</span>
              <input type="range" min="0" max="255" value={get()} oninput={(e) => set(parseFloat((e.target as HTMLInputElement).value))} class="flex-1" style="accent-color:{color}" />
              <span class="text-xs text-gray-500 w-8 text-right tabular-nums">{get()}</span>
            </div>
          {/each}
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-400 w-3">%</span>
            <input type="range" min="0" max="100" value={brightness} oninput={(e) => (brightness = parseFloat((e.target as HTMLInputElement).value))} class="flex-1 accent-teal-500" />
            <span class="text-xs text-gray-500 w-8 text-right tabular-nums">{brightness}</span>
          </div>
        </div>
        <div class="w-16 h-16 rounded-lg border border-gray-600 shrink-0" style="background: rgb({scaled(r)},{scaled(g)},{scaled(b)})"></div>
      </div>

      <div class="flex flex-wrap gap-1.5">
        {#each LIGHT_PRESETS as p (p.id)}
          <button class="rounded px-2 py-1 text-xs bg-gray-700/60 hover:bg-gray-600 text-gray-300" onclick={() => { r = p.r; g = p.g; b = p.b; }}>{p.label($LL)}</button>
        {/each}
      </div>

      <!-- Player LEDs -->
      <div class="border-t border-gray-700 pt-3">
        <div class="text-xs text-gray-400 mb-1.5">{$LL.tester.playerLeds()}</div>
        <div class="flex items-center gap-2 flex-wrap">
          {#each leds as on, i (i)}
            <button
              onclick={() => (leds = leds.map((v, idx) => (idx === i ? !v : v)))}
              class="w-7 h-7 rounded-full border text-xs font-medium {on ? 'bg-teal-500/30 border-teal-400 text-teal-200' : 'bg-gray-700/60 border-gray-600 text-gray-500'}"
            >{i + 1}</button>
          {/each}
          <span class="text-xs text-gray-600 ml-1">{$LL.tester.pattern()}: 0b{ledPattern().toString(2).padStart(5, '0')}</span>
        </div>
        <div class="flex flex-wrap gap-1.5 mt-2">
          {#each PLAYER_PRESETS as p (p.id)}
            <button class="rounded px-2 py-0.5 text-xs bg-gray-700/60 hover:bg-gray-600 text-gray-300" onclick={() => { leds = [0, 1, 2, 3, 4].map((i) => ((p.pattern >> i) & 1) === 1); }}>{p.label($LL)}</button>
          {/each}
        </div>
      </div>

      <!-- Mute LED -->
      <div class="border-t border-gray-700 pt-3 flex items-center gap-2">
        <span class="text-xs text-gray-400">{$LL.tester.muteLed()}</span>
        {#each [{ id: 0, label: (ll: TranslationFunctions) => ll.tester.muteOff() }, { id: 1, label: (ll: TranslationFunctions) => ll.tester.muteOn() }, { id: 2, label: (ll: TranslationFunctions) => ll.tester.mutePulse() }] as m (m.id)}
          <button class="rounded px-2 py-0.5 text-xs {muteMode === m.id ? 'bg-amber-500/30 text-amber-200 border border-amber-400/50' : 'bg-gray-700/60 text-gray-400 hover:bg-gray-600'}" onclick={() => (muteMode = m.id as 0 | 1 | 2)}>{m.label($LL)}</button>
        {/each}
      </div>

      <div class="flex gap-2 pt-2">
        <button class="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700" onclick={applyLights}><Play class="h-4 w-4" /> {$LL.tester.apply()}</button>
        {#if lightsRunning}
          <button class="flex items-center gap-1.5 rounded-lg bg-red-600/20 px-4 py-2 text-sm text-red-400 hover:bg-red-600/30" onclick={stopPattern}><Square class="h-4 w-4" /> {$LL.tester.stop()}</button>
        {:else}
          <button class="flex items-center gap-1.5 rounded-lg bg-amber-600/20 px-4 py-2 text-sm text-amber-400 hover:bg-amber-600/30" onclick={runLightsPattern}><Play class="h-4 w-4" /> {$LL.tester.testPattern()}</button>
        {/if}
        <button class="flex items-center gap-1.5 rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-600" onclick={resetLights}><RotateCcw class="h-4 w-4" /> {$LL.tester.reset()}</button>
      </div>
    </div>
  {:else if tab === 'vibration'}
    <div class="flex flex-col gap-3">
      <div class="text-xs text-gray-500">{$LL.tester.vibHint()}</div>
      {#each VIB_SLIDERS as vib (vib.label)}
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400 w-28 shrink-0">{vib.label($LL)}</span>
          <input type="range" min="0" max="255" value={vib.get()} oninput={(e) => vib.set(parseFloat((e.target as HTMLInputElement).value))} class="flex-1 accent-teal-500" />
          <span class="text-xs text-gray-500 w-8 text-right tabular-nums">{vib.get()}</span>
        </div>
      {/each}
      <div class="flex flex-wrap gap-2 pt-1">
        <button class="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700" onclick={applyVibration}><Play class="h-4 w-4" /> {$LL.tester.start()}</button>
        <button class="flex items-center gap-1.5 rounded-lg bg-amber-600/20 px-4 py-2 text-sm text-amber-400 hover:bg-amber-600/30" onclick={runPulse}><Vibrate class="h-4 w-4" /> {$LL.tester.pulse()}</button>
        <button class="flex items-center gap-1.5 rounded-lg bg-red-600/20 px-4 py-2 text-sm text-red-400 hover:bg-red-600/30" onclick={stopVibration}><Square class="h-4 w-4" /> {$LL.tester.stop()}</button>
        {#if vibRunning}
          <button class="flex items-center gap-1.5 rounded-lg bg-red-600/20 px-4 py-2 text-sm text-red-400 hover:bg-red-600/30" onclick={stopPattern}><Square class="h-4 w-4" /> {$LL.tester.stopPattern()}</button>
        {:else}
          <button class="flex items-center gap-1.5 rounded-lg bg-purple-600/20 px-4 py-2 text-sm text-purple-400 hover:bg-purple-600/30" onclick={runVibPattern}><Play class="h-4 w-4" /> {$LL.tester.testPattern()}</button>
        {/if}
      </div>
    </div>
  {:else if tab === 'trigger'}
    <div class="flex flex-col gap-3">
      <div class="text-xs text-gray-500">{$LL.tester.triggerHint()}</div>
      {#each TRIGGER_ROWS as row (row.name)}
        {@const name = row.name}
        {@const getMode = row.getMode}
        {@const setMode = row.setMode}
        {@const getStart = row.getStart}
        {@const setStart = row.setStart}
        {@const getEnd = row.getEnd}
        {@const setEnd = row.setEnd}
        {@const getForce = row.getForce}
        {@const setForce = row.setForce}
        {@const getFreq = row.getFreq}
        {@const setFreq = row.setFreq}
        {@const getLevel = row.getLevel}
        <div class="rounded-lg bg-gray-900/40 p-3 border border-gray-700">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-gray-300">{name}</span>
            <span class="text-xs text-gray-500">{$LL.tester.input()}: <span class="text-teal-300 tabular-nums">{getLevel()}</span>/255</span>
          </div>
          <div class="flex items-center gap-1.5 mb-2">
            {#each TRIGGER_MODES as m (m.id)}
              <button class="rounded px-2 py-0.5 text-xs {getMode() === m.id ? 'bg-teal-500/30 text-teal-200 border border-teal-400/50' : 'bg-gray-700/60 text-gray-400 hover:bg-gray-600 border border-transparent'}" onclick={() => setMode(m.id)}>{m.label($LL)}</button>
            {/each}
          </div>
          {#if getMode() !== 'off'}
            {#if getMode() === 'resistance'}
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs text-gray-400 w-16">{$LL.tester.paramStart()}</span>
                <input type="range" min="0" max="255" value={getStart()} oninput={(e) => setStart(parseFloat((e.target as HTMLInputElement).value))} class="flex-1 accent-teal-500" />
                <span class="text-xs text-gray-500 w-8 text-right tabular-nums">{getStart()}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400 w-16">{$LL.tester.paramForce()}</span>
                <input type="range" min="0" max="255" value={getForce()} oninput={(e) => setForce(parseFloat((e.target as HTMLInputElement).value))} class="flex-1 accent-teal-500" />
                <span class="text-xs text-gray-500 w-8 text-right tabular-nums">{getForce()}</span>
              </div>
            {:else if getMode() === 'single'}
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs text-gray-400 w-16">{$LL.tester.paramStart()}</span>
                <input type="range" min="0" max="255" value={getStart()} oninput={(e) => setStart(parseFloat((e.target as HTMLInputElement).value))} class="flex-1 accent-teal-500" />
                <span class="text-xs text-gray-500 w-8 text-right tabular-nums">{getStart()}</span>
              </div>
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs text-gray-400 w-16">{$LL.tester.paramEnd()}</span>
                <input type="range" min="0" max="255" value={getEnd()} oninput={(e) => setEnd(parseFloat((e.target as HTMLInputElement).value))} class="flex-1 accent-teal-500" />
                <span class="text-xs text-gray-500 w-8 text-right tabular-nums">{getEnd()}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400 w-16">{$LL.tester.paramForce()}</span>
                <input type="range" min="0" max="255" value={getForce()} oninput={(e) => setForce(parseFloat((e.target as HTMLInputElement).value))} class="flex-1 accent-teal-500" />
                <span class="text-xs text-gray-500 w-8 text-right tabular-nums">{getForce()}</span>
              </div>
            {:else if getMode() === 'auto'}
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs text-gray-400 w-16">{$LL.tester.paramFreq()}</span>
                <input type="range" min="0" max="15" value={getFreq()} oninput={(e) => setFreq(parseFloat((e.target as HTMLInputElement).value))} class="flex-1 accent-teal-500" />
                <span class="text-xs text-gray-500 w-8 text-right tabular-nums">{getFreq()}</span>
              </div>
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs text-gray-400 w-16">{$LL.tester.paramStart()}</span>
                <input type="range" min="0" max="255" value={getStart()} oninput={(e) => setStart(parseFloat((e.target as HTMLInputElement).value))} class="flex-1 accent-teal-500" />
                <span class="text-xs text-gray-500 w-8 text-right tabular-nums">{getStart()}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400 w-16">{$LL.tester.paramForce()}</span>
                <input type="range" min="0" max="255" value={getForce()} oninput={(e) => setForce(parseFloat((e.target as HTMLInputElement).value))} class="flex-1 accent-teal-500" />
                <span class="text-xs text-gray-500 w-8 text-right tabular-nums">{getForce()}</span>
              </div>
            {/if}
          {/if}
        </div>
      {/each}
      <div class="flex gap-2 pt-1">
        <button class="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm text-white hover:bg-teal-700" onclick={applyTriggers}><Play class="h-4 w-4" /> {$LL.tester.apply()}</button>
        {#if triggerRunning}
          <button class="flex items-center gap-1.5 rounded-lg bg-red-600/20 px-4 py-2 text-sm text-red-400 hover:bg-red-600/30" onclick={stopPattern}><Square class="h-4 w-4" /> {$LL.tester.stop()}</button>
        {:else}
          <button class="flex items-center gap-1.5 rounded-lg bg-amber-600/20 px-4 py-2 text-sm text-amber-400 hover:bg-amber-600/30" onclick={runTriggerPattern}><Play class="h-4 w-4" /> {$LL.tester.testPattern()}</button>
        {/if}
        <button class="flex items-center gap-1.5 rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-600" onclick={resetTriggers}><RotateCcw class="h-4 w-4" /> {$LL.tester.reset()}</button>
      </div>
    </div>
  {:else if tab === 'speaker'}
    <div class="flex flex-col gap-3">
      <!-- Mic presence + mute -->
      <div class="flex items-center gap-3 text-xs">
        <span class="text-gray-400">{$LL.tester.microphone()}:</span>
        <span class="flex items-center gap-1 { $micConnected ? 'text-teal-400' : 'text-gray-600' }">
          <Mic class="h-3.5 w-3.5" />
          {$micConnected ? $LL.tester.micConnected() : $LL.tester.micDisconnected()}
        </span>
        <span class="text-gray-600">|</span>
        <span class="text-gray-400">{$LL.tester.mute()}:</span>
        <span class={$buttonState['mute'] ? 'text-amber-400' : 'text-gray-600'}>
          {$buttonState['mute'] ? $LL.tester.muted() : $LL.tester.active()}
        </span>
      </div>

      <!-- Live mic level meter -->
      <div class="border-t border-gray-700 pt-2">
        <div class="text-xs text-gray-400 mb-1.5">{$LL.tester.micLevel()}</div>
        <MicLevelMeter active={micActive} />
        <div class="flex gap-2 mt-2">
          {#if micActive}
            <button class="flex items-center gap-1.5 rounded-lg bg-red-600/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-600/30" onclick={() => (micActive = false)}><Square class="h-3.5 w-3.5" /> {$LL.tester.levelOff()}</button>
          {:else}
            <button class="flex items-center gap-1.5 rounded-lg bg-teal-600/20 px-3 py-1.5 text-xs text-teal-400 hover:bg-teal-600/30" onclick={() => (micActive = true)}><Mic class="h-3.5 w-3.5" /> {$LL.tester.levelOn()}</button>
          {/if}
        </div>
      </div>

      <!-- Frequency spectrum view (#59) -->
      <div class="border-t border-gray-700 pt-2">
        <div class="text-xs text-gray-400 mb-1.5">{$LL.tester.spectrum()}</div>
        <MicSpectrumView active={spectrumActive} />
        <div class="flex gap-2 mt-2">
          {#if spectrumActive}
            <button class="flex items-center gap-1.5 rounded-lg bg-red-600/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-600/30" onclick={() => (spectrumActive = false)}><Square class="h-3.5 w-3.5" /> {$LL.tester.spectrumOff()}</button>
          {:else}
            <button class="flex items-center gap-1.5 rounded-lg bg-teal-600/20 px-3 py-1.5 text-xs text-teal-400 hover:bg-teal-600/30" onclick={() => (spectrumActive = true)}><Mic class="h-3.5 w-3.5" /> {$LL.tester.spectrumOn()}</button>
          {/if}
        </div>
      </div>

      <!-- Speaker tone test -->
      <div class="border-t border-gray-700 pt-2">
        <div class="text-xs text-gray-400 mb-1.5">{$LL.tester.speakerTone()}</div>
        <div class="flex flex-wrap gap-2">
          <button
            class="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs text-white hover:bg-teal-700 disabled:opacity-50"
            onclick={() => playSpeakerTone(500)}
            disabled={speakerPlaying}
          ><Volume2 class="h-3.5 w-3.5" /> {$LL.tester.toneShort()}</button>
          <button
            class="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs text-white hover:bg-teal-700 disabled:opacity-50"
            onclick={() => playSpeakerTone(2000)}
            disabled={speakerPlaying}
          ><Volume2 class="h-3.5 w-3.5" /> {$LL.tester.toneLong()}</button>
          {#if speakerPlaying}
            <button class="flex items-center gap-1.5 rounded-lg bg-red-600/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-600/30" onclick={stopSpeaker}><Square class="h-3.5 w-3.5" /> {$LL.tester.stop()}</button>
          {/if}
        </div>
      </div>

      <!-- Speaker→Mic loopback test (#50) -->
      <div class="border-t border-gray-700 pt-2">
        <div class="text-xs text-gray-400 mb-1.5">{$LL.tester.loopback()}</div>
        <SpeakerMicLoopback {manager} />
      </div>
    </div>
  {:else if tab === 'imu'}
    <div class="flex flex-col gap-3">
      <p class="text-xs text-gray-500">
        {$LL.tester.imuIntro()}
      </p>
      <ImuVisualizer />
    </div>
  {:else if tab === 'touch'}
    <div class="flex flex-col gap-3">
      <p class="text-xs text-gray-500">
        {$LL.tester.touchIntro()}
      </p>
      <TouchpadGestureVisualizer />
    </div>
  {/if}
</div>