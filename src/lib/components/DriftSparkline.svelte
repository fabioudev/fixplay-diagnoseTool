<script lang="ts">
  // Rolling sparkline of stick drift magnitude over time. The instantaneous
  // drift % next to each stick only shows the *current* rest-offset; drift is
  // often intermittent, so a short history lets the user spot jitter and
  // stickiness that a single snapshot hides. Samples are taken on every stick
  // state change (the same rate the live dial updates).

  import { stickState } from '$lib/stores/controller';
  import { onMount } from 'svelte';

  let {
    side = 'left' as 'left' | 'right',
    width = 120,
    height = 28,
    samples = 80,
  }: {
    side?: 'left' | 'right';
    width?: number;
    height?: number;
    samples?: number;
  } = $props();

  let canvas: HTMLCanvasElement;
  const buf = new Array<number>(samples).fill(0);

  function sample(): number {
    const s = $stickState[side];
    return Math.min(1, Math.sqrt(s.x * s.x + s.y * s.y));
  }

  function render() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Threshold bands mirror the textual drift indicator: <5% green, <15% amber, else red.
    const greenY = height - 0.05 * height;
    const amberY = height - 0.15 * height;
    ctx.fillStyle = 'rgba(34,197,94,0.12)';
    ctx.fillRect(0, greenY, width, height - greenY);
    ctx.fillStyle = 'rgba(245,158,11,0.10)';
    ctx.fillRect(0, amberY, width, greenY - amberY);

    // Line plot of drift magnitude (0 at bottom, 100% at top).
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < buf.length; i++) {
      const x = (i / (buf.length - 1)) * width;
      const y = height - buf[i] * height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Append a sample on every stick-state change, then redraw.
  $effect(() => {
    const _s = $stickState[side];
    void _s;
    buf.push(sample());
    buf.shift();
    render();
  });

  onMount(render);
</script>

<canvas bind:this={canvas} style="width:{width}px; height:{height}px;" class="rounded bg-gray-900/60" title="Drift-Verlauf (letzte {samples} Samples)"></canvas>