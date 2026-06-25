<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { stickState } from '$lib/stores/controller';
  import { drawStickDial } from '$lib/utils/stick-renderer';

  let {
    side = 'left' as 'left' | 'right',
    size = 120,
    enableZoomCenter = false,
    circularityData = null as number[] | null,
  }: {
    side?: 'left' | 'right';
    size?: number;
    enableZoomCenter?: boolean;
    circularityData?: number[] | null;
  } = $props();

  let canvas: HTMLCanvasElement;
  let rafId: number | null = null;

  function render() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const stick = $stickState[side];
    const cx = size / 2;
    const cy = size / 2;
    const sz = size / 2 - 6;
    drawStickDial(ctx, cx, cy, sz, stick.x, stick.y, {
      circularity_data: circularityData,
      enable_zoom_center: enableZoomCenter,
      highlight: false,
    });
  }

  function loop() {
    render();
    rafId = requestAnimationFrame(loop);
  }

  onMount(() => {
    loop();
  });

  onDestroy(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
  });
</script>

<canvas bind:this={canvas} style="width:{size}px; height:{size}px;" class="rounded-lg bg-white"></canvas>
