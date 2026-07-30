<script lang="ts">
  // Touchpad gesture visualizer (#57). Renders the DualSense touchpad as a
  // rectangle, plots the live finger positions + their fading trails, and shows
  // the recognized gesture label (tap / swipe±direction / hold / two-finger)
  // plus a short event log. All recognition lives in the testable
  // TouchGestureTracker; this component only feeds it the `$touchPoints` store
  // and renders the result.
  import { touchPoints } from '$lib/stores/controller';
  import { TouchGestureTracker } from '$lib/controllers/touch-gesture';
  import type { TouchGestureEvent, TouchContactLabel } from '$lib/controllers/touch-gesture';

  const tracker = new TouchGestureTracker();

  // Normalize raw pad coords (x: 0..1919, y: 0..941) to 0..1 for rendering.
  function nx(p: { x: number }): number { return p.x / 1919; }
  function ny(p: { y: number }): number { return p.y / 941; }

  // Live state mirrored from the tracker on each report.
  let label = $state<TouchContactLabel>('idle');
  let events = $state<TouchGestureEvent[]>([]);
  let trails = $state<{ x: number; y: number }[][]>([[], []]);
  let points = $state<{ x: number; y: number; active: boolean; id: number }[]>([]);

  const LABEL_DE: Record<TouchContactLabel, string> = {
    idle: 'Bereit',
    touch: 'Berührung',
    hold: 'Halten',
    'two-finger': 'Zwei-Finger',
  };

  function eventText(ev: TouchGestureEvent): string {
    switch (ev.type) {
      case 'tap': return `Tipp (${ev.durationMs}ms)`;
      case 'hold': return `Halten (${ev.durationMs}ms)`;
      case 'swipe': return `Wischen ${ev.direction} (${Math.round(ev.displacement)}u)`;
      case 'two-finger': return 'Zwei-Finger-Berührung';
      default: return ev.type;
    }
  }

  // Feed every touchPoints update into the tracker. The DualSense polls at
  // ~60-250 Hz so the live label (esp. hold) refreshes promptly without a
  // separate timer.
  $effect(() => {
    const pts = $touchPoints;
    tracker.update(pts, Date.now());
    label = tracker.label;
    events = [...tracker.events];
    trails = tracker.trails.map((t) => [...t]);
    points = pts.map((p) => ({ x: p.x, y: p.y, active: p.active, id: p.id }));
  });
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center justify-between">
    <span class="text-xs text-gray-400">Aktuelle Geste</span>
    <span class="text-xs font-semibold text-teal-300">{LABEL_DE[label]}</span>
  </div>

  <!-- Touchpad surface with finger dots + fading trails. -->
  <div class="relative mx-auto w-full max-w-[260px] aspect-[2/1] rounded-lg border border-gray-600 bg-gray-800 overflow-hidden">
    <!-- subtle grid -->
    <div class="absolute inset-0 opacity-30" style="background-image: linear-gradient(#374151 1px,transparent 1px),linear-gradient(90deg,#374151 1px,transparent 1px); background-size: 25% 25%;"></div>
    {#each trails as trail, fi (fi)}
      {#if trail.length > 1}
        <svg class="absolute inset-0 w-full h-full" viewBox="0 0 100 50" preserveAspectRatio="none">
          <polyline
            points={trail.map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 50).toFixed(2)}`).join(' ')}
            fill="none"
            stroke={fi === 0 ? '#5eecd9' : '#f59e0b'}
            stroke-width="0.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            opacity="0.7"
          />
        </svg>
      {/if}
    {/each}
    {#each points as p (p.id)}
      {#if p.active}
        <div
          class="absolute w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2 border border-white/40 transition-[left,top] duration-75"
          style="left: {nx(p) * 100}%; top: {ny(p) * 100}%; background: {p.id === 0 ? '#5eecd9' : '#f59e0b'};"
        ></div>
      {/if}
    {/each}
  </div>

  <!-- Gesture event log (newest first). -->
  <div>
    <div class="text-xs text-gray-400 mb-1">Gesten-Verlauf</div>
    {#if events.length === 0}
      <div class="text-xs text-gray-600 italic">Noch keine Geste erkannt.</div>
    {:else}
      <ul class="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
        {#each events as ev, i (i)}
          <li class="text-xs font-mono text-gray-400">
            <span class="text-gray-600">›</span> {eventText(ev)}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>