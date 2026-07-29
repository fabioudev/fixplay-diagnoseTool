<script lang="ts">
  // Live microphone audio-level meter for the DualSense controller.
  // Uses WebAudio getUserMedia to capture from the DualSense USB mic device,
  // then an AnalyserNode to compute RMS level and display a bar.
  //
  // The DualSense mic appears as a USB audio input device. We enumerate audio
  // devices, find the one whose label contains "DualSense" or "Wireless
  // Controller", and request a mono audio stream from it.
  import { Mic, MicOff } from 'lucide-svelte';
  import { onDestroy } from 'svelte';

  let { active = false }: { active?: boolean } = $props();

  let level = $state(0);        // 0..100
  let peak = $state(0);         // peak hold, decays over 2s
  let deviceFound = $state(false);
  let permissionDenied = $state(false);
  let errorMsg = $state<string | null>(null);

  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let stream: MediaStream | null = null;
  let rafId: number | null = null;
  let peakDecay: ReturnType<typeof setInterval> | null = null;

  async function start(): Promise<void> {
    if (audioCtx) return; // already running
    try {
      // Find the DualSense mic device
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mic = devices.find(
        (d) =>
          d.kind === 'audioinput' &&
          (d.label.includes('DualSense') ||
            d.label.includes('Wireless Controller') ||
            d.label.includes('PS5')),
      );
      if (!mic) {
        deviceFound = false;
        errorMsg = 'Kein DualSense-Mikrofon gefunden. Controller per USB verbinden.';
        return;
      }
      deviceFound = true;

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

      peakDecay = setInterval(() => { peak = Math.max(0, peak - 2); }, 100);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyser) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        level = Math.round(Math.min(100, rms * 400));
        if (level > peak) peak = level;
        rafId = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        permissionDenied = true;
        errorMsg = 'Mikrofon-Zugriff verweigert. Bitte in den Browser-Einstellungen erlauben.';
      } else {
        errorMsg = 'Mikrofon-Fehler: ' + (e instanceof Error ? e.message : String(e));
      }
    }
  }

  function stop(): void {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    if (peakDecay) { clearInterval(peakDecay); peakDecay = null; }
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    analyser = null;
    level = 0;
    peak = 0;
    deviceFound = false;
    permissionDenied = false;
    errorMsg = null;
  }

  $effect(() => {
    if (active) start(); else stop();
  });

  onDestroy(() => stop());
</script>

<div class="flex flex-col gap-2">
  {#if errorMsg}
    <div class="text-xs text-red-400 bg-red-900/20 rounded p-2">{errorMsg}</div>
  {:else if active && deviceFound}
    <div class="flex items-center gap-2">
      <Mic class="h-4 w-4 text-teal-400" />
      <span class="text-xs text-gray-400">Pegel:</span>
      <div class="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-75"
          style="width:{level}%; background: {level > 80 ? '#ef4444' : level > 50 ? '#f59e0b' : '#009688'}"
        ></div>
      </div>
      <span class="text-xs text-gray-500 w-8 text-right tabular-nums">{level}%</span>
      <span class="text-[10px] text-gray-600 w-8 text-right tabular-nums">max {peak}%</span>
    </div>
  {:else if active && !deviceFound}
    <div class="flex items-center gap-2 text-xs text-gray-500">
      <MicOff class="h-4 w-4" /> Suche DualSense-Mikrofon…
    </div>
  {:else}
    <div class="flex items-center gap-2 text-xs text-gray-600">
      <MicOff class="h-4 w-4" /> Mikrofon-Pegel inaktiv
    </div>
  {/if}
</div>
