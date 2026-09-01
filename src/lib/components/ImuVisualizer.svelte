<script lang="ts">
  // Gyro / accelerometer visualizer (#56). Renders the live DualSense IMU
  // sample (gyro in °/s, accel in g) as centered per-axis bars plus a 2-D tilt
  // dot driven by the accelerometer's X/Y. No canvas — pure CSS bars so it
  // stays crisp at any DPR and is trivially testable.
  import { imuState } from '$lib/stores/controller';

  // Full-scale ranges for the bars. The DualSense gyro covers ±2048 °/s and the
  // accel ±4 g; we display ±2000 °/s and ±2 g so typical hand motion fills the
  // bars instead of barely moving them.
  const GYRO_FS = 2000; // °/s
  const ACC_FS = 2; // g

  function barPct(v: number, fs: number): number {
    return Math.max(-100, Math.min(100, (v / fs) * 100));
  }

  const axes = ['x', 'y', 'z'] as const;
</script>

<div class="flex flex-col gap-3">
  <!-- Gyro -->
  <div>
    <div class="flex items-center justify-between mb-1">
      <span class="text-xs text-gray-400">Gyroskop</span>
      <span class="text-[10px] text-gray-600">°/s</span>
    </div>
    <div class="flex flex-col gap-1">
      {#each axes as a (a)}
        {@const v = $imuState.gyro[a]}
        {@const pct = barPct(v, GYRO_FS)}
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-mono text-gray-500 w-3">{a.toUpperCase()}</span>
          <div class="relative flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
            <!-- center origin line -->
            <div class="absolute top-0 bottom-0 left-1/2 w-px bg-gray-600"></div>
            <div
              class="absolute top-0 bottom-0 rounded-full {pct >= 0
                ? 'bg-teal-500'
                : 'bg-amber-500'}"
              style={pct >= 0
                ? `left: 50%; width: ${pct / 2}%;`
                : `right: 50%; width: ${-pct / 2}%;`}
            ></div>
          </div>
          <span class="text-[10px] font-mono text-gray-400 w-14 text-right tabular-nums"
            >{v.toFixed(0)}</span
          >
        </div>
      {/each}
    </div>
  </div>

  <!-- Accel -->
  <div>
    <div class="flex items-center justify-between mb-1">
      <span class="text-xs text-gray-400">Beschleunigung</span>
      <span class="text-[10px] text-gray-600">g</span>
    </div>
    <div class="flex flex-col gap-1">
      {#each axes as a (a)}
        {@const v = $imuState.accel[a]}
        {@const pct = barPct(v, ACC_FS)}
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-mono text-gray-500 w-3">{a.toUpperCase()}</span>
          <div class="relative flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div class="absolute top-0 bottom-0 left-1/2 w-px bg-gray-600"></div>
            <div
              class="absolute top-0 bottom-0 rounded-full {pct >= 0
                ? 'bg-blue-500'
                : 'bg-purple-500'}"
              style={pct >= 0
                ? `left: 50%; width: ${pct / 2}%;`
                : `right: 50%; width: ${-pct / 2}%;`}
            ></div>
          </div>
          <span class="text-[10px] font-mono text-gray-400 w-14 text-right tabular-nums"
            >{v.toFixed(2)}</span
          >
        </div>
      {/each}
    </div>
  </div>

  <!-- Tilt dot: accel X/Y mapped to a 2-D pad. At rest (1 g on Z) the dot sits
       centered; tilting the controller moves it toward the tilted edge. -->
  <div>
    <div class="flex items-center justify-between mb-1">
      <span class="text-xs text-gray-400">Neigung (X/Y)</span>
    </div>
    <div
      class="relative mx-auto w-24 h-24 rounded-full border border-gray-700 bg-gray-800 overflow-hidden"
    >
      <div class="absolute top-1/2 left-0 right-0 h-px bg-gray-700"></div>
      <div class="absolute left-1/2 top-0 bottom-0 w-px bg-gray-700"></div>
      <div
        class="absolute w-2.5 h-2.5 rounded-full bg-teal-400 -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-75"
        style="left: {50 +
          Math.max(-50, Math.min(50, ($imuState.accel.x / ACC_FS) * 50))}%; top: {50 -
          Math.max(-50, Math.min(50, ($imuState.accel.y / ACC_FS) * 50))}%;"
      ></div>
    </div>
  </div>
</div>
