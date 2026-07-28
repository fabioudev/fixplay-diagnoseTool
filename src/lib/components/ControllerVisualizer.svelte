<script lang="ts">
  // Live graphical DualSense: every button/stick/trigger the manager reports is
  // mirrored onto an SVG controller so you can SEE what is pressed. Reads the
  // same stores ControllerPanel has always used (buttonState / stickState /
  // triggerState / touchPoints) plus the lightbarColor the tester drives.
  //
  // Visual language matches the app brand: idle = muted slate, pressed = teal
  // (#009688) with a soft glow. The face buttons keep a faint classic-color hint
  // (△ green / ○ red / ✕ blue / □ pink) so the layout is instantly readable.
  //
  // Layout mirrors a real DualSense: dpad upper-left, face buttons upper-right,
  // sticks lower + inboard (left stick right of dpad, right stick left of face
  // buttons), PS button between the sticks. No overlap between any elements.
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

  // ── Geometry — derived from reference DualSense SVG (daidr/dualsense-tester) ─
  // Transform: translate(44, -24) scale(0.30) maps reference coords → our viewBox.
  const STICK_R = 26;
  const LEFT_CX = 150;
  const LEFT_CY = 135;
  const RIGHT_CX = 273;
  const RIGHT_CY = 135;
  const DOT_R = 7;

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
  const TP = { x: 165, y: 20, w: 90, h: 24 };
  function touchDot(i: number): { x: number; y: number; active: boolean } | null {
    const p = $touchPoints[i];
    if (!p || !p.active) return null;
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

  <!-- Body shell — actual DualSense outline paths from daidr/dualsense-tester reference SVG,
       scaled to our viewBox. The reference defines the body as three wireframe strokes
       (left-hat, border1, right-hat); filled together they form the complete silhouette. -->
  <g transform="translate(44, -24) scale(0.30)" fill="url(#shell)" stroke="#1f2937" stroke-width="5">
    <!-- Top shoulder area (not in reference wireframe — added to close the shape) -->
    <path d="M 90,160 L 1017,160 L 1017,95 Q 553,70 90,95 Z" />
    <!-- Left grip + side (from reference left-hat) -->
    <path d="M296.668,193.129c-5.479,-25.983 -25.743,-37.755 -62.282,-33.901c-40.742,4.297 -79.814,11.918 -115.424,22.309c-11.905,3.474 -23.487,8.273 -28.39,18.67c-91.01,192.963 -106.846,408.796 -55.913,643.084c2.947,13.555 9.046,24.221 21.05,32.104c5.843,3.836 12.587,7.06 21.886,9.445c21.562,5.529 31.041,-9.866 33.636,-23.758c33.416,-178.821 88.679,-342.348 191.663,-450.233c9.318,-9.761 18.181,-31.681 20.635,-51.733c0.969,-7.926 0.451,-15.333 -0.463,-22.036c-6.051,-44.414 -16.477,-96.901 -26.398,-143.951Z" />
    <!-- Bottom edge (from reference border1) -->
    <path d="M100.97,881.749c8.551,1.607 62.356,4.094 68.38,-3.153c33.93,-40.827 69.521,-154.237 85.416,-196.14c9.791,-25.813 35.4,-37.881 67.491,-40.687c30.597,13.569 45.149,13.982 96.708,3.594l280.228,-0c51.559,10.388 66.111,9.975 96.708,-3.594c32.091,2.806 57.701,14.874 67.492,40.687c15.894,41.903 51.486,155.313 85.416,196.14c6.023,7.247 59.828,4.76 68.38,3.153" />
    <!-- Right grip + side (from reference right-hat) -->
    <path d="M820.718,193.129c5.479,-25.983 25.744,-37.755 62.283,-33.901c40.742,4.297 79.814,11.918 115.424,22.309c11.905,3.474 23.486,8.273 28.39,18.67c91.01,192.963 106.846,408.796 55.912,643.084c-2.947,13.555 -9.046,24.221 -21.05,32.104c-5.842,3.836 -12.586,7.06 -21.885,9.445c-21.563,5.529 -31.041,-9.866 -33.637,-23.758c-33.415,-178.821 -88.678,-342.348 -191.662,-450.233c-9.318,-9.761 -18.181,-31.681 -20.635,-51.733c-0.97,-7.926 -0.451,-15.333 0.462,-22.036c6.052,-44.414 16.477,-96.901 26.398,-143.951Z" />
  </g>

  <!-- Lightbar strip (top edge, glows with current color) -->
  <rect x="150" y="2" width="120" height="4" rx="2"
    fill={lightCss} style="filter: {lightGlow}" />

  <!-- L2 / R2 trigger wells (analog fill) — pushed outward -->
  <g>
    <rect x="85" y="11" width="54" height="12" rx="6" fill="#0b1220" stroke="#374151" />
    <rect x="85" y="11" width={54 * l2Frac} height="12" rx="6" fill="#009688" opacity="0.85" />
    <text x="112" y="8" text-anchor="middle" class="lbl" fill="#6b7280">L2</text>

    <rect x="281" y="11" width="54" height="12" rx="6" fill="#0b1220" stroke="#374151" />
    <rect x="281" y="11" width={54 * r2Frac} height="12" rx="6" fill="#009688" opacity="0.85" />
    <text x="308" y="8" text-anchor="middle" class="lbl" fill="#6b7280">R2</text>
  </g>

  <!-- L1 / R1 bumpers -->
  <rect x="65" y="30" width="54" height="9" rx="4.5"
    fill={btnFill('l1')} stroke={btnStroke('l1')} stroke-width="1.2" />
  <text x="92" y="27" text-anchor="middle" class="lbl-sm" fill="#9ca3af">L1</text>
  <rect x="301" y="30" width="54" height="9" rx="4.5"
    fill={btnFill('r1')} stroke={btnStroke('r1')} stroke-width="1.2" />
  <text x="328" y="27" text-anchor="middle" class="lbl-sm" fill="#9ca3af">R1</text>

  <!-- Touchpad — ref: center(559,143) size ~227×50 -->
  <rect x={TP.x} y={TP.y} width={TP.w} height={TP.h} rx="4"
    fill={btnFill('touchpad')} stroke={btnStroke('touchpad')} stroke-width="1.2" />
  {#each [0, 1] as i}
    {#if touchDot(i)}
      <circle cx={touchDot(i)!.x} cy={touchDot(i)!.y} r="3" fill="#5eecd9" opacity="0.9" />
    {/if}
  {/each}

  <!-- Create / Options — pulled inward -->
  <rect x="135" y="38" width="12" height="5" rx="2.5"
    fill={btnFill('create')} stroke={btnStroke('create')} stroke-width="1" />
  <text x="141" y="50" text-anchor="middle" class="lbl-sm" fill="#6b7280">Create</text>
  <rect x="273" y="38" width="12" height="5" rx="2.5"
    fill={btnFill('options')} stroke={btnStroke('options')} stroke-width="1" />
  <text x="279" y="50" text-anchor="middle" class="lbl-sm" fill="#6b7280">Options</text>

  <!-- D-pad — ref: center(~179,357) -->
  <g transform="translate(98 83)">
    <rect x="-7" y="-24" width="14" height="14" rx="2.5"
      fill={btnFill('up')} stroke={btnStroke('up')} stroke-width="1.2" />
    <rect x="-7" y="10" width="14" height="14" rx="2.5"
      fill={btnFill('down')} stroke={btnStroke('down')} stroke-width="1.2" />
    <rect x="-24" y="-7" width="14" height="14" rx="2.5"
      fill={btnFill('left')} stroke={btnStroke('left')} stroke-width="1.2" />
    <rect x="10" y="-7" width="14" height="14" rx="2.5"
      fill={btnFill('right')} stroke={btnStroke('right')} stroke-width="1.2" />
  </g>

  <!-- Face buttons — ref: center(~934,358), radius 35 → r=10 -->
  <g transform="translate(324 83)">
    <circle cx="0" cy="-18" r="10"
      fill={faceFill('triangle')} stroke={faceStroke('triangle')} stroke-width="1.4"
      style={pressed('triangle') ? 'filter:url(#viz-glow)' : ''} />
    <path d="M0,-24 L5,-15 L-5,-15 Z" fill="none"
      stroke={pressed('triangle') ? '#0b1220' : '#4b5563'} stroke-width="1.2" stroke-linejoin="round" />
    <circle cx="18" cy="0" r="10"
      fill={faceFill('circle')} stroke={faceStroke('circle')} stroke-width="1.4"
      style={pressed('circle') ? 'filter:url(#viz-glow)' : ''} />
    <circle cx="18" cy="0" r="4.5" fill="none"
      stroke={pressed('circle') ? '#0b1220' : '#4b5563'} stroke-width="1.2" />
    <circle cx="0" cy="18" r="10"
      fill={faceFill('cross')} stroke={faceStroke('cross')} stroke-width="1.4"
      style={pressed('cross') ? 'filter:url(#viz-glow)' : ''} />
    <path d="M-4,14 L4,22 M4,14 L-4,22" fill="none"
      stroke={pressed('cross') ? '#0b1220' : '#4b5563'} stroke-width="1.2" stroke-linecap="round" />
    <circle cx="-18" cy="0" r="10"
      fill={faceFill('square')} stroke={faceStroke('square')} stroke-width="1.4"
      style={pressed('square') ? 'filter:url(#viz-glow)' : ''} />
    <rect x="-22" y="-4" width="8" height="8" rx="1.5" fill="none"
      stroke={pressed('square') ? '#0b1220' : '#4b5563'} stroke-width="1.2" />
  </g>

  <!-- Analog sticks — ref: L3(352,529) R3(763,529), radius 87 → 26 -->
  <g>
    {#each [{ side: 'left' as const, cx: LEFT_CX, cy: LEFT_CY }, { side: 'right' as const, cx: RIGHT_CX, cy: RIGHT_CY }] as s}
      {@const l3r3 = s.side === 'left' ? 'l3' : 'r3'}
      <circle cx={s.cx} cy={s.cy} r={STICK_R}
        fill="#0b1220" stroke={pressed(l3r3) ? '#5eecd9' : '#374151'}
        stroke-width={pressed(l3r3) ? 2 : 1.2} />
      <circle cx={s.cx} cy={s.cy} r={STICK_R - 2} fill="none" stroke="#1f2937" stroke-width="0.6" />
      <text x={s.cx} y={s.cy + STICK_R + 11} text-anchor="middle" class="lbl-sm"
        fill={pressed(l3r3) ? '#5eecd9' : '#374151'}>{s.side === 'left' ? 'L3' : 'R3'}</text>
      <circle cx={stickDot(s.side).cx} cy={stickDot(s.side).cy} r={DOT_R} fill="#5eecd9" opacity="0.9" />
    {/each}
  </g>

  <!-- PS button + Mute LED — centered between sticks -->
  <circle cx="210" cy="137" r="6"
    fill={btnFill('ps')} stroke={btnStroke('ps')} stroke-width="1.2" />
  <text x="210" y="140" text-anchor="middle" class="ps-glyph" fill={pressed('ps') ? '#0b1220' : '#9ca3af'}>PS</text>
  <circle cx="210" cy="153" r="3"
    fill={pressed('mute') ? '#fbbf24' : '#1f2937'} stroke={pressed('mute') ? '#fde68a' : '#374151'} stroke-width="0.8"
    style={pressed('mute') ? 'filter:url(#viz-glow)' : ''} />
  <text x="210" y="148" text-anchor="middle" class="lbl-sm" fill="#6b7280">Mute</text>
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
