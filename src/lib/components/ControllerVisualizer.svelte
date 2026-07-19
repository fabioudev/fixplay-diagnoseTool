<script lang="ts">
  // Live graphical DualSense: every button/stick/trigger the manager reports is
  // mirrored onto an SVG controller so you can SEE what is pressed. Reads the
  // same stores ControllerPanel has always used (buttonState / stickState /
  // triggerState / touchPoints) plus the lightbarColor the tester drives.
  //
  // Visual language matches the app brand: idle = muted slate, pressed = teal
  // (#009688) with a soft glow. The face buttons keep a faint classic-color hint
  // (△ green / ○ red / ✕ blue / □ pink) so the layout is instantly readable.
  import {
    buttonState,
    triggerState,
    stickState,
    touchPoints,
    lightbarColor,
  } from '$lib/stores/controller';

  let { size = 460 }: { size?: number } = $props();

  const pressed = (name: string): boolean => !!$buttonState[name];

  // PlayStation face-button accent colors (faint when idle, brightened when pressed).
  const FACE_COLOR: Record<string, string> = {
    triangle: '#3fb950', // green
    circle: '#f85149', // red
    cross: '#58a6ff', // blue
    square: '#d2a8ff', // pink
  };

  function faceFill(name: string): string {
    return pressed(name) ? FACE_COLOR[name] : '#1f2937';
  }
  function faceStroke(name: string): string {
    return pressed(name) ? FACE_COLOR[name] : '#374151';
  }

  // Generic digital button (dpad, shoulders, create/options/ps/touchpad/mute).
  function btnFill(name: string): string {
    return pressed(name) ? '#009688' : '#1f2937';
  }
  function btnStroke(name: string): string {
    return pressed(name) ? '#5eecd9' : '#374151';
  }

  // Analog stick geometry.
  const STICK_R = 30;
  const LEFT_CX = 108;
  const LEFT_CY = 188;
  const RIGHT_CX = 312;
  const RIGHT_CY = 188;
  const DOT_R = 9;

  function stickDot(side: 'left' | 'right'): { cx: number; cy: number } {
    const s = $stickState[side];
    const cx = side === 'left' ? LEFT_CX : RIGHT_CX;
    const cy = side === 'left' ? LEFT_CY : RIGHT_CY;
    return { cx: cx + s.x * (STICK_R * 0.62), cy: cy + s.y * (STICK_R * 0.62) };
  }

  const lightCss = $derived(`rgb(${$lightbarColor.r}, ${$lightbarColor.g}, ${$lightbarColor.b})`);
  const lightGlow = $derived(
    $lightbarColor.r + $lightbarColor.g + $lightbarColor.b > 12
      ? `drop-shadow(0 0 6px ${lightCss})`
      : 'none',
  );

  // L2/R2 trigger depression fill (0..255 -> fraction of the trigger well).
  const l2Frac = $derived(Math.max(0, Math.min(1, $triggerState.l2 / 255)));
  const r2Frac = $derived(Math.max(0, Math.min(1, $triggerState.r2 / 255)));

  // Touchpad: show up to two touch points scaled into the pad rect.
  const TP = { x: 168, y: 96, w: 84, h: 40 };
  function touchDot(i: number): { x: number; y: number; active: boolean } | null {
    const p = $touchPoints[i];
    if (!p || !p.active) return null;
    // Touchpad raw range ~ 0..1919 x, 0..941 y.
    const x = TP.x + (p.x / 1919) * TP.w;
    const y = TP.y + (p.y / 941) * TP.h;
    return { x, y, active: p.active };
  }
</script>

<svg
  viewBox="0 0 420 250"
  class="controller-viz"
  style="width:{size}px; max-width:100%; height:auto;"
  role="img"
  aria-label="DualSense Live-Visualisierung"
>
  <defs>
    <filter id="viz-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.5" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <linearGradient id="shell" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0f172a" />
      <stop offset="1" stop-color="#111827" />
    </linearGradient>
  </defs>

  <!-- Body shell -->
  <rect x="16" y="30" width="388" height="190" rx="60" ry="60"
    fill="url(#shell)" stroke="#1f2937" stroke-width="1.5" />

  <!-- Lightbar strip (top, glows with current color) -->
  <rect x="150" y="34" width="120" height="5" rx="2.5"
    fill={lightCss} style="filter: {lightGlow}" />

  <!-- L2 / R2 trigger wells (analog fill) -->
  <g>
    <rect x="58" y="40" width="64" height="14" rx="7" fill="#0b1220" stroke="#374151" />
    <rect x="58" y="40" width={64 * l2Frac} height="14" rx="7" fill="#009688" opacity="0.85" />
    <text x="90" y="31" text-anchor="middle" class="lbl" fill="#6b7280">L2</text>

    <rect x="298" y="40" width="64" height="14" rx="7" fill="#0b1220" stroke="#374151" />
    <rect x="298" y="40" width={64 * r2Frac} height="14" rx="7" fill="#009688" opacity="0.85" />
    <text x="330" y="31" text-anchor="middle" class="lbl" fill="#6b7280">R2</text>
  </g>

  <!-- L1 / R1 bumpers -->
  <rect x="58" y="58" width="64" height="11" rx="5.5"
    fill={btnFill('l1')} stroke={btnStroke('l1')} stroke-width="1.4" />
  <text x="90" y="51" text-anchor="middle" class="lbl-sm" fill="#9ca3af">L1</text>
  <rect x="298" y="58" width="64" height="11" rx="5.5"
    fill={btnFill('r1')} stroke={btnStroke('r1')} stroke-width="1.4" />
  <text x="330" y="51" text-anchor="middle" class="lbl-sm" fill="#9ca3af">R1</text>

  <!-- Touchpad (center top) -->
  <rect x={TP.x} y={TP.y} width={TP.w} height={TP.h} rx="6"
    fill={btnFill('touchpad')} stroke={btnStroke('touchpad')} stroke-width="1.4" />
  {#each [0, 1] as i}
    {#if touchDot(i)}
      <circle cx={touchDot(i)!.x} cy={touchDot(i)!.y} r="4" fill="#5eecd9" opacity="0.9" />
    {/if}
  {/each}

  <!-- Create / Options -->
  <rect x="150" y="100" width="14" height="6" rx="3"
    fill={btnFill('create')} stroke={btnStroke('create')} stroke-width="1.2" />
  <text x="157" y="116" text-anchor="middle" class="lbl-sm" fill="#6b7280">Create</text>
  <rect x="256" y="100" width="14" height="6" rx="3"
    fill={btnFill('options')} stroke={btnStroke('options')} stroke-width="1.2" />
  <text x="263" y="116" text-anchor="middle" class="lbl-sm" fill="#6b7280">Options</text>

  <!-- D-pad (left-center) -->
  <g transform="translate(108 150)">
    <!-- up -->
    <rect x="-9" y="-30" width="18" height="18" rx="3"
      fill={btnFill('up')} stroke={btnStroke('up')} stroke-width="1.4" />
    <!-- down -->
    <rect x="-9" y="12" width="18" height="18" rx="3"
      fill={btnFill('down')} stroke={btnStroke('down')} stroke-width="1.4" />
    <!-- left -->
    <rect x="-30" y="-9" width="18" height="18" rx="3"
      fill={btnFill('left')} stroke={btnStroke('left')} stroke-width="1.4" />
    <!-- right -->
    <rect x="12" y="-9" width="18" height="18" rx="3"
      fill={btnFill('right')} stroke={btnStroke('right')} stroke-width="1.4" />
  </g>

  <!-- Face buttons (right-center): triangle(top), circle(right), cross(bottom), square(left) -->
  <g transform="translate(312 150)">
    <circle cx="0" cy="-22" r="11"
      fill={faceFill('triangle')} stroke={faceStroke('triangle')} stroke-width="1.6"
      style={pressed('triangle') ? 'filter:url(#viz-glow)' : ''} />
    <path d="M0,-28 L6,-18 L-6,-18 Z" fill="none"
      stroke={pressed('triangle') ? '#0b1220' : '#4b5563'} stroke-width="1.4" stroke-linejoin="round" />
    <circle cx="22" cy="0" r="11"
      fill={faceFill('circle')} stroke={faceStroke('circle')} stroke-width="1.6"
      style={pressed('circle') ? 'filter:url(#viz-glow)' : ''} />
    <circle cx="22" cy="0" r="5.5" fill="none"
      stroke={pressed('circle') ? '#0b1220' : '#4b5563'} stroke-width="1.4" />
    <circle cx="0" cy="22" r="11"
      fill={faceFill('cross')} stroke={faceStroke('cross')} stroke-width="1.6"
      style={pressed('cross') ? 'filter:url(#viz-glow)' : ''} />
    <path d="M-5,17 L5,27 M5,17 L-5,27" fill="none"
      stroke={pressed('cross') ? '#0b1220' : '#4b5563'} stroke-width="1.4" stroke-linecap="round" />
    <circle cx="-22" cy="0" r="11"
      fill={faceFill('square')} stroke={faceStroke('square')} stroke-width="1.6"
      style={pressed('square') ? 'filter:url(#viz-glow)' : ''} />
    <rect x="-27" y="-5" width="10" height="10" rx="1.5" fill="none"
      stroke={pressed('square') ? '#0b1220' : '#4b5563'} stroke-width="1.4" />
  </g>

  <!-- Analog sticks with live position dots -->
  <g>
    {#each [{ side: 'left', cx: LEFT_CX, cy: LEFT_CY }, { side: 'right', cx: RIGHT_CX, cy: RIGHT_CY }] as s}
      <circle cx={s.cx} cy={s.cy} r={STICK_R}
        fill="#0b1220" stroke={pressed(s.side + '3') ? '#5eecd9' : '#374151'} stroke-width={pressed(s.side + '3') ? 2.4 : 1.4} />
      <circle cx={s.cx} cy={s.cy} r={STICK_R - 3} fill="none" stroke="#1f2937" stroke-width="0.8" />
      {#if s.side === 'left'}
        <circle cx={stickDot('left').cx} cy={stickDot('left').cy} r={DOT_R} fill="#5eecd9" opacity="0.9" />
      {:else}
        <circle cx={stickDot('right').cx} cy={stickDot('right').cy} r={DOT_R} fill="#5eecd9" opacity="0.9" />
      {/if}
    {/each}
  </g>

  <!-- PS button + Mute LED -->
  <circle cx="210" cy="165" r="7"
    fill={btnFill('ps')} stroke={btnStroke('ps')} stroke-width="1.4" />
  <text x="210" y="169" text-anchor="middle" class="ps-glyph" fill={pressed('ps') ? '#0b1220' : '#9ca3af'}>PS</text>
  <circle cx="210" cy="150" r="3.5"
    fill={pressed('mute') ? '#fbbf24' : '#1f2937'} stroke={pressed('mute') ? '#fde68a' : '#374151'} stroke-width="1"
    style={pressed('mute') ? 'filter:url(#viz-glow)' : ''} />
  <text x="210" y="143" text-anchor="middle" class="lbl-sm" fill="#6b7280">Mute</text>
</svg>

<style>
  .controller-viz .lbl {
    font: 600 9px ui-sans-serif, system-ui, sans-serif;
  }
  .controller-viz .lbl-sm {
    font: 500 7px ui-sans-serif, system-ui, sans-serif;
  }
  .controller-viz .ps-glyph {
    font: 700 6px ui-sans-serif, system-ui, sans-serif;
  }
</style>