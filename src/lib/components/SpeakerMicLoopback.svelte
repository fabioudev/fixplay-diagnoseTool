<script lang="ts">
  // Speaker→Mic loopback test (#50). Plays a tone on the DualSense speaker
  // while capturing the DualSense USB mic, and compares the mic level during
  // the tone against a pre-tone baseline. A significant rise means the speaker
  // drives the mic (both work and are acoustically coupled); no rise means
  // either the speaker or the mic is dead, or the mic can't hear the speaker.
  //
  // The mic capture mirrors MicLevelMeter: enumerate audio inputs, pick the
  // one labelled DualSense / Wireless Controller / PS5, open a raw stream
  // (no echo-cancellation / noise-suppression so the tone comes through), and
  // read RMS from an AnalyserNode.
  import { onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { pushControllerLog } from '$lib/stores/controller';
  import { Volume2, CheckCircle2, XCircle, Loader2 } from 'lucide-svelte';
  import LL from '$lib/i18n/i18n-svelte';
  import type { ControllerManager } from '$lib/controllers/controller-manager';

  let {
    manager,
  }: {
    manager: ControllerManager | null;
  } = $props();

  type Result = 'idle' | 'ok' | 'fail' | 'error';
  let running   = $state(false);
  let result    = $state<Result>('idle');
  let baseline  = $state(0); // mic RMS % peak during the silent pre-phase
  let peakTone  = $state(0); // mic RMS % peak while the speaker tone plays
  let errorMsg  = $state<string | null>(null);

  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let stream: MediaStream | null = null;

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** 0..100 RMS level from the analyser's current time-domain buffer. */
  function sampleLevel(): number {
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.round(Math.min(100, Math.sqrt(sum / data.length) * 400));
  }

  /** Open the DualSense mic. Returns null on success or an error string. */
  async function openMic(): Promise<string | null> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mic = devices.find(
        (d) =>
          d.kind === 'audioinput' &&
          (d.label.includes('DualSense') ||
            d.label.includes('Wireless Controller') ||
            d.label.includes('PS5')),
      );
      if (!mic) return get(LL).tester.micNotFound();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: mic.deviceId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      return null;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        return get(LL).tester.micDenied();
      }
      return get(LL).tester.micError({ error: e instanceof Error ? e.message : String(e) });
    }
  }

  function teardownMic(): void {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
    analyser = null;
  }

  /** Max sample level over `ms` (polling every 40 ms). */
  async function maxLevelOver(ms: number): Promise<number> {
    let max = 0;
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const lvl = sampleLevel();
      if (lvl > max) max = lvl;
      await sleep(40);
    }
    return max;
  }

  async function run(): Promise<void> {
    if (!manager || running) return;
    running = true;
    result = 'idle';
    errorMsg = null;
    baseline = 0;
    peakTone = 0;
    try {
      const micErr = await openMic();
      if (micErr) { result = 'error'; errorMsg = micErr; return; }

      // 1) Baseline: ~500 ms of silence before the tone.
      baseline = await maxLevelOver(500);

      // 2) Play the speaker tone and measure the mic peak while it plays.
      await manager.setSpeakerTone('speaker').catch((e: unknown) => {
        throw new Error(get(LL).tester.speakerError({ error: e instanceof Error ? e.message : String(e) }));
      });
      peakTone = await maxLevelOver(1200);

      // 3) Stop the tone.
      await manager.resetSpeakerSettings().catch(() => {});

      // 4) Verdict: the tone must clearly exceed the baseline. A working
      //    speaker→mic path on a USB-connected DualSense typically pushes the
      //    mic well above 25 %; require both an absolute floor and a rise over
      //    the silent baseline so ambient noise alone can't pass it.
      const ok = peakTone >= 25 && peakTone > baseline + 15;
      result = ok ? 'ok' : 'fail';
      pushControllerLog(
        ok
          ? get(LL).tester.loopbackLogOk({ baseline, peak: peakTone })
          : get(LL).tester.loopbackLogFail({ baseline, peak: peakTone }),
        ok ? 'info' : 'warn',
      );
    } catch (e) {
      result = 'error';
      errorMsg = e instanceof Error ? e.message : String(e);
      pushControllerLog(get(LL).tester.loopbackLogError({ error: errorMsg }), 'error');
    } finally {
      teardownMic();
      running = false;
    }
  }

  onDestroy(teardownMic);
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-center gap-2">
    <button
      onclick={run}
      disabled={!manager || running}
      title={$LL.tester.loopbackTitle()}
      class="px-3 py-1 text-sm rounded bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-40 flex items-center gap-1.5"
    >
      {#if running}
        <Loader2 class="h-4 w-4 animate-spin" /> {$LL.tester.loopbackRunning()}
      {:else}
        <Volume2 class="h-4 w-4" /> {$LL.tester.loopbackStart()}
      {/if}
    </button>

    {#if result === 'ok'}
      <span class="flex items-center gap-1 text-xs text-green-400">
        <CheckCircle2 class="h-4 w-4" /> {$LL.tester.loopbackOk()}
      </span>
    {:else if result === 'fail'}
      <span class="flex items-center gap-1 text-xs text-red-400">
        <XCircle class="h-4 w-4" /> {$LL.tester.loopbackFail()}
      </span>
    {:else if result === 'error'}
      <span class="text-xs text-red-400">{errorMsg}</span>
    {/if}
  </div>

  {#if result === 'ok' || result === 'fail'}
    <div class="text-[11px] text-gray-500 flex gap-4">
      <span>{$LL.tester.baseline()}: <span class="font-mono text-gray-300">{baseline}%</span></span>
      <span>{$LL.tester.toneLevel()}: <span class="font-mono text-gray-300">{peakTone}%</span></span>
    </div>
  {/if}
</div>