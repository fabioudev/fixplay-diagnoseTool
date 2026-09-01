<script lang="ts">
  import { onMount } from 'svelte';
  import { stickState } from '$lib/stores/controller';
  import { drawStickDial } from '$lib/utils/stick-renderer';

  let {
    side = 'left' as 'left' | 'right',
    size = 120,
    enableZoomCenter = false,
    circularityData = null as number[] | null,
    deadzone = 0,
  }: {
    side?: 'left' | 'right';
    size?: number;
    enableZoomCenter?: boolean;
    circularityData?: number[] | null;
    deadzone?: number;
  } = $props();

  let canvas: HTMLCanvasElement;

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
      deadzone,
      highlight: false,
    });
  }

  // Re-render only when the inputs actually change — the old implementation
  // ran a permanent requestAnimationFrame loop (60 fps forever) even with a
  // motionless stick, burning CPU/battery for no visual update. $effect tracks
  // the reactive reads inside render() (stick state, deadzone, circularity,
  // size) and re-runs precisely when one of them changes.
  $effect(() => {
    // Touch every reactive input so the effect re-runs on any change.
    const _s = $stickState[side];
    const _d = deadzone;
    const _c = circularityData;
    const _z = size;
    void _s;
    void _d;
    void _c;
    void _z;
    render();
  });

  onMount(() => {
    render();
  });
</script>

<canvas bind:this={canvas} style="width:{size}px; height:{size}px;" class="rounded-lg bg-white"
></canvas>
