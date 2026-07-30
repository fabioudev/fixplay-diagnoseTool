<script lang="ts">
  // Microphone frequency-spectrum view for the DualSense controller (#59).
  // Opens the DualSense USB mic (same device discovery as MicLevelMeter) and
  // renders a live FFT magnitude spectrum on a canvas: per-bin bars with a
  // falling peak-hold marker, a dB scale, and a frequency axis. Useful for
  // spotting a dead/quiet channel, hum (50 Hz), or a clipped high end during
  // mic diagnostics.
  import { Mic, MicOff } from 'lucide-svelte';
  import { onDestroy } from 'svelte';

  let { active = false }: { active?: boolean } = $props();

  let canvas: HTMLCanvasElement | null = null;
  let deviceFound = $state(false);
  let permissionDenied = $state(false);
  let errorMsg = $state<string | null>(null);

  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let stream: MediaStream | null = null;
  let rafId: number | null = null;

  // Peak-hold per displayed bar (0..1), decays slowly so peaks are visible.
  let peaks: number[] = [];

  async function start(): Promise<void> {
    if (audioCtx) return;
    try {
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
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);

      const bins = analyser.frequencyBinCount; // fftSize/2 = 512
      const data = new Uint8Array(bins);
      // We only render the low ~quarter of the spectrum (up to ~5.4 kHz at
      // 44.1 kHz sample rate / 1024 FFT) where the DualSense mic is most
      // informative; the rest is mostly noise.
      const VIEW_BINS = 128;
      peaks = new Array(VIEW_BINS).fill(0);

      const draw = (): void => {
        if (!analyser || !canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        analyser.getByteFrequencyData(data);

        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const barW = W / VIEW_BINS;
        for (let i = 0; i < VIEW_BINS; i++) {
          const v = data[i] / 255; // 0..1
          if (v > peaks[i]) peaks[i] = v;
          else peaks[i] = Math.max(0, peaks[i] - 0.012); // decay

          const barH = v * H;
          const x = i * barW;
          // Gradient: low freqs teal, highs amber.
          const hue = 180 - (i / VIEW_BINS) * 140;
          ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
          ctx.fillRect(x + 0.5, H - barH, barW - 1, barH);

          // Peak-hold marker.
          const py = H - peaks[i] * H;
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillRect(x + 0.5, py, barW - 1, 1.5);
        }
        rafId = requestAnimationFrame(draw);
      };
      draw();
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
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    analyser = null;
    peaks = [];
    deviceFound = false;
    permissionDenied = false;
    errorMsg = null;
    // Clear the canvas.
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
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
    <div class="relative">
      <canvas bind:this={canvas} width={520} height={120} class="w-full rounded-lg bg-gray-900 border border-gray-700" style="height:120px"></canvas>
      <!-- frequency axis -->
      <div class="flex justify-between text-[9px] text-gray-600 mt-0.5 px-0.5">
        <span>0 Hz</span><span>1,3 kHz</span><span>2,7 kHz</span><span>4 kHz</span><span>5,4 kHz</span>
      </div>
    </div>
  {:else if active && !deviceFound}
    <div class="flex items-center gap-2 text-xs text-gray-500">
      <MicOff class="h-4 w-4" /> Suche DualSense-Mikrofon…
    </div>
  {:else}
    <div class="flex items-center gap-2 text-xs text-gray-600">
      <MicOff class="h-4 w-4" /> Frequenz-Spektrum inaktiv
    </div>
  {/if}
</div>