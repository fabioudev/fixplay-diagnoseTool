<script lang="ts" module>
  // Language-neutral technical tokens (per i18n convention: protocol/pin names
  // stay literal across locales). Only surrounding prose is localized.
  export type HardwareGuideVariant = 'ch341a' | 'uart';

  /** Standard 25-series 8-pin SPI NOR pinout (W25Q / MX25L / EN25Q …). */
  export const SOIC8: { n: number; name: string; desc: string }[] = [
    { n: 1, name: '#CS', desc: 'Chip Select (active low)' },
    { n: 2, name: 'DO', desc: 'Data Out (MISO)' },
    { n: 3, name: '#WP', desc: 'Write Protect (active low)' },
    { n: 4, name: 'GND', desc: 'Ground' },
    { n: 5, name: 'DI', desc: 'Data In (MOSI)' },
    { n: 6, name: 'CLK', desc: 'Serial Clock' },
    { n: 7, name: '#HOLD', desc: 'Hold (active low)' },
    { n: 8, name: 'VCC', desc: '+3.3 V supply' },
  ];

  /**
   * 16-pin 25-series SPI NOR (MX25L256 / W25Q256 SOP-16 …). Functional pins
   * 1-7 mirror the 8-pin part; pin 8 = #RESET (or NC); 9-15 NC (some quad-SPI
   * variants repurpose 8/15 for IO2/IO3); 16 = VCC.
   */
  export const SOIC16: { n: number; name: string; desc: string }[] = [
    { n: 1, name: '#CS', desc: 'Chip Select' },
    { n: 2, name: 'DO', desc: 'MISO / IO1' },
    { n: 3, name: '#WP', desc: 'Write Protect / IO2' },
    { n: 4, name: 'GND', desc: 'Ground' },
    { n: 5, name: 'DI', desc: 'MOSI / IO0' },
    { n: 6, name: 'CLK', desc: 'Serial Clock' },
    { n: 7, name: '#HOLD', desc: 'Hold / IO3' },
    { n: 8, name: '#RESET', desc: 'Reset (active low) / NC' },
    { n: 9, name: 'NC', desc: 'No Connect' },
    { n: 10, name: 'NC', desc: 'No Connect' },
    { n: 11, name: 'NC', desc: 'No Connect' },
    { n: 12, name: 'NC', desc: 'No Connect' },
    { n: 13, name: 'NC', desc: 'No Connect' },
    { n: 14, name: 'NC', desc: 'No Connect' },
    { n: 15, name: 'NC', desc: 'No Connect' },
    { n: 16, name: 'VCC', desc: '+3.3 V supply' },
  ];

  /**
   * How the CH341A ZIF socket wires an 8-pin 25-series chip: the chip's pins
   * 1-8 land on ZIF positions 5-12 (the half of the 16-pin socket away from
   * the USB plug, silkscreen "25 SPI"), pin 1 at the marked corner. The socket
   * ties #WP (pin 3 → ZIF 7) and #HOLD (pin 7 → ZIF 11) hard to VCC (3.3 V via
   * the AMS1117), so write-protect and hold are inactive when reading via the
   * socket. ZIF positions verified against the reverse-engineered board
   * netlist (Upcycle-Electronics/CH341A-Pro) + flashrom's 25-series table.
   */
  export const ZIF_WIRING: { n: number; name: string; sig: string; zif: number; note: string }[] = [
    { n: 1, name: '#CS', sig: 'CS0', zif: 5, note: '' },
    { n: 2, name: 'DO', sig: 'MISO', zif: 6, note: '' },
    { n: 3, name: '#WP', sig: 'VCC', zif: 7, note: 'tied high → WP inactive' },
    { n: 4, name: 'GND', sig: 'GND', zif: 8, note: '' },
    { n: 5, name: 'DI', sig: 'MOSI', zif: 9, note: '' },
    { n: 6, name: 'CLK', sig: 'SCK', zif: 10, note: '' },
    { n: 7, name: '#HOLD', sig: 'VCC', zif: 11, note: 'tied high → HOLD inactive' },
    { n: 8, name: 'VCC', sig: 'VCC', zif: 12, note: '3.3 V (AMS1117)' },
  ];

  /** PS5 EMC UART pads on the EDM-010 24-pin service header. */
  export const UART_PADS: { n: number; name: string; desc: string }[] = [
    { n: 4, name: 'GND', desc: 'Ground' },
    { n: 6, name: 'RX', desc: 'EMC RX' },
    { n: 7, name: 'TX', desc: 'EMC TX' },
    { n: 8, name: '3V3', desc: '+3.3 V' },
  ];

  // Numbered callouts on the CH341A board top-view (match the legend below).
  // Geometry mirrors the real black CH341A dongle (research: reverse-engineered
  // Upcycle-Electronics/CH341A-Pro netlist + board photos): landscape stick,
  // USB-A plug left, rounded far end right, 16-pin (2×8) ZIF lengthwise at the
  // far end, two 1×7 headers along the long edges, one jumper only (mode/
  // ACT# on UART header pins 1-2). Positions chosen so each circle sits
  // on/clearly beside its target without overlapping silkscreen text.
  export const BOARD_CALLOUTS: { n: number; x: number; y: number }[] = [
    { n: 1, x: 15, y: 88 },   // USB (centered on the metal shell)
    { n: 2, x: 362, y: 128 }, // ZIF lever (right end of the lever bar)
    { n: 3, x: 240, y: 44 },  // ZIF socket (top-left corner)
    { n: 4, x: 107, y: 40 },  // CH341A IC (above its body)
    { n: 5, x: 69, y: 62 },   // AMS1117 regulator (above the SOT-223 body)
    { n: 6, x: 138, y: 54 },  // 12 MHz crystal (above body)
    { n: 7, x: 46, y: 26 },   // POWER/RUN LEDs (beside the top LED, clear of the rivet)
    { n: 8, x: 146, y: 20 },  // mode jumper (UART header pins 1-2, above the pin labels)
    { n: 9, x: 186, y: 158 }, // SPI header (below the bottom edge)
    { n: 10, x: 240, y: 24 }, // UART header (above the top edge, right of jumper)
    { n: 11, x: 330, y: 26 }, // seated NOR chip (above the "25 SPI" label)
  ];
</script>

<script lang="ts">
  import { ChevronDown, AlertTriangle, ExternalLink, Cable } from 'lucide-svelte';
  import { slide } from 'svelte/transition';
  import LL from '$lib/i18n/i18n-svelte';

  let { variant }: { variant: HardwareGuideVariant } = $props();

  let open = $state(false);

  // SOIC pin layout helpers: pins 1..n down the left, n+1..2n up the right.
  const L8 = SOIC8.slice(0, 4); // 1..4 top-to-bottom left
  const R8 = [...SOIC8.slice(4)].reverse(); // 8,7,6,5 top-to-bottom right
  const L16 = SOIC16.slice(0, 8); // 1..8 left
  const R16 = [...SOIC16.slice(8)].reverse(); // 16..9 right
</script>

<div class="rounded-lg border border-gray-700/60 bg-gray-800/40 overflow-hidden">
  <button
    class="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium text-gray-200 hover:bg-gray-700/40 transition-colors"
    onclick={() => (open = !open)}
    aria-expanded={open}
  >
    {#if variant === 'ch341a'}
      <AlertTriangle class="h-4 w-4 shrink-0 text-amber-400" />
      <span>{$LL.hwGuide.ch341a.title()}</span>
    {:else}
      <Cable class="h-4 w-4 shrink-0 text-teal-400" />
      <span>{$LL.hwGuide.uart.title()}</span>
    {/if}
    <ChevronDown class="h-4 w-4 ml-auto shrink-0 text-gray-400 transition-transform {open ? 'rotate-180' : ''}" />
  </button>

  {#if open}
    <div class="px-3 pb-3 pt-1 space-y-4 text-xs text-gray-300" transition:slide={{ duration: 150 }}>

      {#if variant === 'ch341a'}
        <!-- 5V danger callout -->
        <div class="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-1">
          <p class="font-semibold text-amber-300 flex items-center gap-1.5">
            <AlertTriangle class="h-3.5 w-3.5" />{$LL.hwGuide.ch341a.danger()}
          </p>
          <p class="leading-relaxed">{$LL.hwGuide.ch341a.dangerText()}</p>
        </div>

        <!-- ===== Board top-view ===== -->
        <div>
          <p class="font-semibold text-gray-200 mb-1.5">{$LL.hwGuide.ch341a.boardTitle()}</p>
          <div class="flex flex-wrap items-start gap-4">
            <svg viewBox="0 0 400 168" class="w-full max-w-lg shrink-0" role="img" aria-label="CH341A board top view">
            <defs>
              <!-- Callout Radial Gradient: white to transparent -->
              <radialGradient id="calloutGrad" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="0.4" />
                <stop offset="100%" stop-color="#fbbf24" stop-opacity="0" />
              </radialGradient>

              <!-- Glow Filter for LED and Callouts -->
              <filter id="glowFilter" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>

              <!-- Shadow Filter for Lever -->
              <filter id="shadowFilter" x="-20%" y="-20%" width="140%" height="140%">
                <feOffset dx="0" dy="2" />
                <feGaussianBlur stdDeviation="1" result="blur" />
                <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0" result="shadow" />
                <feComposite in="shadow" in2="SourceGraphic" operator="over" />
              </filter>
            </defs>

            <!--
              Geometry mirrors the real black CH341A "Mini Programmer" dongle
              (researched from the reverse-engineered Upcycle-Electronics/
              CH341A-Pro netlist + board photos): ~69 × 27.5 mm landscape stick,
              USB-A male plug overhanging the left end, fully rounded far end,
              16-pin (2×8) ZIF socket mounted lengthwise at the far end, two
              1×7 headers along the long edges, ONE jumper only (mode/ACT# on
              UART header pins 1-2), POWER + RUN LEDs at opposite edges behind
              the plug, AMS1117-3.3 + CH341A SOIC-28W + 12 MHz crystal between.
            -->

            <!-- PCB outline: deep matte black, straight USB end, rounded far end -->
            <path d="M28 28 H364 C382 28 394 51 394 84 C394 117 382 140 364 140 H28 Z"
              fill="#0a0a0c" stroke="#1f1f23" stroke-width="1" />

            <!-- USB shell rivet holes -->
            <circle cx="40" cy="38" r="1.6" fill="none" stroke="#3f3f46" stroke-width="0.8" />
            <circle cx="40" cy="130" r="1.6" fill="none" stroke="#3f3f46" stroke-width="0.8" />

            <!-- USB-A male connector: metallic shell overhanging the left end -->
            <g>
              <rect x="2" y="68" width="28" height="40" rx="1.5" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1" />
              <rect x="5" y="72" width="22" height="32" rx="1" fill="#f1f5f9" />
              <rect x="6" y="80" width="20" height="2" fill="#94a3b8" />
              <rect x="6" y="94" width="20" height="2" fill="#94a3b8" />
              <rect x="2" y="76" width="28" height="1.2" fill="#e2e8f0" />
              <rect x="2" y="99" width="28" height="1.2" fill="#e2e8f0" />
            </g>

            <!-- LEDs: D1 POWER (top edge) + D2 RUN (bottom edge) -->
            <g fill="#4b4b52" font-family="ui-monospace, monospace" font-size="5" font-weight="600">
              <text x="63" y="34">POWER</text>
              <text x="63" y="139">RUN</text>
            </g>
            <circle cx="56" cy="40" r="2.6" fill="#4ade80" stroke="#16a34a" stroke-width="0.6" filter="url(#glowFilter)" />
            <circle cx="56" cy="134" r="2.6" fill="#fb923c" stroke="#ea580c" stroke-width="0.6" filter="url(#glowFilter)" />

            <!-- AMS1117-3.3 regulator (SOT-223, center of the supply cluster) -->
            <g>
              <rect x="62" y="76" width="14" height="22" rx="1" fill="#111827" stroke="#374151" stroke-width="1" />
              <rect x="62" y="76" width="14" height="4" fill="#4b5563" />
              {#each [86, 92, 98] as py (py)}
                <rect x="64" y={py} width="10" height="2.5" rx="0.5" fill="#6b7280" />
              {/each}
            </g>
            <!-- Decoupling caps -->
            <rect x="56" y="110" width="6" height="9" rx="0.5" fill="#52525b" stroke="#71717a" stroke-width="0.4" />
            <rect x="76" y="110" width="6" height="9" rx="0.5" fill="#52525b" stroke="#71717a" stroke-width="0.4" />

            <!-- CH341A IC: SOIC-28W mounted across the board width -->
            <g>
              {#each [54, 63, 72, 81, 90, 99, 108, 117] as py (py)}
                <rect x="89" y={py} width="6" height="3" rx="0.5" fill="#6b7280" />
                <rect x="119" y={py} width="6" height="3" rx="0.5" fill="#6b7280" />
              {/each}
              <rect x="94" y="48" width="26" height="76" rx="1" fill="#111827" stroke="#374151" stroke-width="1" />
              <circle cx="98" cy="53" r="1.4" fill="#6b7280" />
              <text x="107" y="88" text-anchor="middle" class="chip-lbl" fill="#9ca3af" transform="rotate(-90 107 88)">CH341A</text>
            </g>

            <!-- 12 MHz HC-49 crystal standing vertically beside the CH341A -->
            <g>
              <rect x="132" y="64" width="12" height="44" rx="6" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1" />
              <rect x="135" y="68" width="3" height="36" rx="1.5" fill="#e2e8f0" />
              <text x="138" y="116" text-anchor="middle" class="chip-lbl" fill="#4b4b52">12M</text>
            </g>

            <!-- Silkscreen brand (real board: "CH341A MinProgrammer") -->
            <text x="196" y="60" text-anchor="middle" fill="#4b4b52" font-family="ui-monospace, monospace" font-size="5.5" font-weight="600">CH341A MinProgrammer</text>

            <!-- UART/mode header (top edge, 7-pin, pin 1 toward USB) -->
            {#each ['1', '2', '3', 'TX', 'RX', 'GND', '5V'] as lbl, i (lbl)}
              <rect x={150 + i * 12 - 2} y="38" width="5" height="5" rx="0.5" fill="#4b5563" />
              <text x={150 + i * 12} y="33" text-anchor="middle" fill="#4b4b52" font-family="ui-monospace, monospace" font-size="5" font-weight="600">{lbl}</text>
            {/each}

            <!-- Mode jumper (yellow shunt) across UART pins 1-2 -->
            <g>
              <rect x="145" y="34" width="24" height="9" rx="1.5" fill="#fbbf24" stroke="#f59e0b" stroke-width="0.8" />
              <rect x="147" y="35.5" width="6" height="6" fill="#fde68a" />
            </g>

            <!-- SPI header (bottom edge, 7-pin: CLK CS MOSI MISO GND 3V3 5V) -->
            {#each ['CLK', 'CS', 'MOSI', 'MISO', 'GND', '3V3', '5V'] as lbl, i (lbl)}
              <rect x={150 + i * 12 - 2} y="133" width="5" height="5" rx="0.5" fill="#4b5563" />
              <text x={150 + i * 12} y="148" text-anchor="middle" fill="#4b4b52" font-family="ui-monospace, monospace" font-size="4.6" font-weight="600">{lbl}</text>
            {/each}

            <!-- 16-pin (2×8) ZIF socket, lengthwise at the far end -->
            <g filter="url(#shadowFilter)">
              <rect x="246" y="50" width="110" height="68" rx="3" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1.5" />
            </g>
            <!-- ZIF pin holes: top row = ZIF 1..8 (left→right), bottom row = ZIF 16..9 -->
            {#each Array(8) as _, i (i)}
              {#if i === 0}
                <!-- ZIF pin 1: square pad (real board marks it with a square + arrow) -->
                <rect x={252 - 2} y={66 - 2} width="4" height="4" fill="#111827" stroke="#d1d5db" stroke-width="0.4" />
              {:else}
                <circle cx={252 + i * 13.7} cy="66" r="1.8" fill="#111827" stroke="#d1d5db" stroke-width="0.4" />
              {/if}
              <circle cx={252 + i * 13.7} cy="102" r="1.8" fill="#111827" stroke="#d1d5db" stroke-width="0.4" />
            {/each}
            <text x="243" y="68" text-anchor="end" fill="#6b7280" font-family="ui-monospace, monospace" font-size="4.5">1</text>
            <text x="243" y="104" text-anchor="end" fill="#6b7280" font-family="ui-monospace, monospace" font-size="4.5">16</text>
            <!-- Socket group labels (real silk: "24 I2C EEPROM BIOS" / "25 SPI") -->
            <line x1="300" y1="54" x2="300" y2="114" stroke="#d1d5db" stroke-width="0.6" />
            <g fill="#6b7280" font-family="ui-monospace, monospace" font-size="4.6" font-weight="600">
              <text x="276" y="60" text-anchor="middle">24 I²C</text>
              <text x="329" y="47" text-anchor="middle">25 SPI</text>
            </g>

            <!-- ZIF lever along the socket's long edge -->
            <g filter="url(#shadowFilter)">
              <rect x="252" y="120" width="88" height="5" rx="2" fill="#ffffff" stroke="#d1d5db" stroke-width="0.5" />
              <rect x="340" y="116" width="20" height="12" rx="3" fill="#ffffff" stroke="#d1d5db" stroke-width="0.5" />
              {#each [344, 348, 352, 356] as lx (lx)}
                <line x1={lx} y1="118" x2={lx} y2="126" stroke="#9ca3af" stroke-width="0.5" />
              {/each}
            </g>

            <!-- 8-pin NOR chip seated in ZIF 5-12 (the "25 SPI" half away from USB) -->
            <g>
              {#each [308, 322, 336, 350] as px (px)}
                <rect x={px - 3} y="50" width="6" height="7" rx="0.5" fill="#6b7280" />
                <rect x={px - 3} y="111" width="6" height="7" rx="0.5" fill="#6b7280" />
              {/each}
              <rect x="302" y="56" width="56" height="56" rx="2" fill="#1f2937" stroke="#374151" stroke-width="1" />
              <circle cx="308" cy="62" r="1.8" fill="#9ca3af" />
              <text x="330" y="87" text-anchor="middle" class="chip-lbl" fill="#9ca3af">W25Q…</text>
            </g>

            <!-- Unpopulated SOIC pads at the rounded far end (real board) -->
            <g stroke="#4b4b52" stroke-width="0.7" fill="none">
              <rect x="366" y="58" width="12" height="46" rx="1" stroke-dasharray="2 1.5" />
              <rect x="380" y="66" width="12" height="30" rx="1" stroke-dasharray="2 1.5" />
            </g>
            <g fill="#4b4b52" font-family="ui-monospace, monospace" font-size="4" font-weight="600">
              <text x="372" y="110" text-anchor="middle">25XXX</text>
              <text x="386" y="102" text-anchor="middle">24XXX</text>
            </g>

            <!-- Numbered callouts: Orange circles with radial gradient and glow -->
            {#each BOARD_CALLOUTS as c (c.n)}
              <g filter="url(#glowFilter)">
                <circle cx={c.x} cy={c.y} r="7.5" fill="url(#calloutGrad)" stroke="#fbbf24" stroke-width="1.2" />
                <text x={c.x} y={c.y + 2.6} text-anchor="middle" class="callout" fill="#fbbf24">{c.n}</text>
              </g>
            {/each}
          </svg>
            <!-- Legend -->
            <ol class="text-[11px] leading-relaxed text-gray-400 space-y-0.5 list-decimal pl-4 marker:text-gray-500">
              <li><span class="font-mono text-gray-200">USB</span> — {$LL.hwGuide.ch341a.legUsb()}</li>
              <li><span class="font-mono text-gray-200">ZIF-Hebel</span> — {$LL.hwGuide.ch341a.legLever()}</li>
              <li><span class="font-mono text-gray-200">ZIF-Sockel</span> — {$LL.hwGuide.ch341a.legZif()}</li>
              <li><span class="font-mono text-gray-200">CH341A-IC</span> — {$LL.hwGuide.ch341a.legIc()}</li>
              <li><span class="font-mono text-gray-200">AMS1117</span> — {$LL.hwGuide.ch341a.legReg()}</li>
              <li><span class="font-mono text-gray-200">12-MHz-Quarz</span> — {$LL.hwGuide.ch341a.legXtal()}</li>
              <li><span class="font-mono text-gray-200">POWER/RUN-LED</span> — {$LL.hwGuide.ch341a.legLed()}</li>
              <li><span class="font-mono text-gray-200">Mode-Jumper</span> — {$LL.hwGuide.ch341a.legAct()}</li>
              <li><span class="font-mono text-gray-200">SPI-Header</span> — {$LL.hwGuide.ch341a.legSpi()}</li>
              <li><span class="font-mono text-gray-200">UART-Header</span> — {$LL.hwGuide.ch341a.legUart()}</li>
              <li><span class="font-mono text-gray-200">NOR-Chip</span> — {$LL.hwGuide.ch341a.legNor()}</li>
            </ol>
          </div>
          <p class="mt-1.5 text-gray-500 leading-relaxed">{$LL.hwGuide.ch341a.socketNote()}</p>
        </div>

        <!-- ===== 8-pin chip pinout ===== -->
        <div>
          <p class="font-semibold text-gray-200 mb-1.5">{$LL.hwGuide.ch341a.pinout8()}</p>
          <div class="flex flex-wrap items-start gap-4">
            <svg viewBox="0 0 160 130" class="w-44 shrink-0" role="img" aria-label="SOIC-8 SPI NOR pinout">
              <defs>
                <filter id="chipShadow" x="-10%" y="-10%" width="120%" height="120%">
                  <feOffset dx="1" dy="1" />
                  <feGaussianBlur stdDeviation="1" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <linearGradient id="pinGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#9ca3af" />
                  <stop offset="50%" stop-color="#f3f4f6" />
                  <stop offset="100%" stop-color="#9ca3af" />
                </linearGradient>
              </defs>
              <!-- Chip body with industrial matte finish -->
              <rect x="40" y="14" width="80" height="100" rx="2" fill="#1f2937" stroke="#374151" stroke-width="1" filter="url(#chipShadow)" />
              <!-- Pin 1 Marker: Industrial indentation -->
              <circle cx="46" cy="20" r="2" fill="#111827" />
              <text x="80" y="68" text-anchor="middle" class="chip-lbl" fill="#9ca3af" font-weight="bold">SOIC-8</text>
              {#each L8 as p (p.n)}
                <g>
                  <rect x="28" y={20 + (p.n - 1) * 22} width="14" height="6" rx="0.5" fill="url(#pinGrad)" stroke="#4b5563" stroke-width="0.5" />
                  <text x="24" y={26 + (p.n - 1) * 22} text-anchor="end" class="pin" fill="#6b7280">{p.n}</text>
                  <text x="48" y={26 + (p.n - 1) * 22} class="pin" fill="#f3f4f6" font-weight="bold">{p.name}</text>
                </g>
              {/each}
              {#each R8 as p, i (p.n)}
                <g>
                  <rect x="118" y={20 + i * 22} width="14" height="6" rx="0.5" fill="url(#pinGrad)" stroke="#4b5563" stroke-width="0.5" />
                  <text x="136" y={26 + i * 22} class="pin" fill="#6b7280">{p.n}</text>
                  <text x="114" y={26 + i * 22} text-anchor="end" class="pin" fill="#f3f4f6" font-weight="bold">{p.name}</text>
                </g>
              {/each}
            </svg>
            <table class="text-[11px] border-collapse">
              <tbody class="divide-y divide-gray-700/30">
                {#each SOIC8 as p (p.n)}
                  <tr class="hover:bg-gray-700/20 transition-colors">
                    <td class="pr-2 py-1 text-gray-500 font-mono">{p.n}</td>
                    <td class="pr-2 py-1 font-mono text-teal-300">{p.name}</td>
                    <td class="py-1 text-gray-400">{p.desc}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <!-- ===== 16-pin chip pinout ===== -->
        <div>
          <p class="font-semibold text-gray-200 mb-1.5">{$LL.hwGuide.ch341a.pinout16()}</p>
          <div class="flex flex-wrap items-start gap-4">
            <svg viewBox="0 0 160 210" class="w-44 shrink-to-fit shrink-0" role="img" aria-label="SOIC-16 SPI NOR pinout">
              <!-- Use existing defs from SOIC-8 for pinGrad and chipShadow -->
              <rect x="40" y="14" width="80" height="180" rx="2" fill="#1f2937" stroke="#374151" stroke-width="1" filter="url(#chipShadow)" />
              <!-- Pin 1 Marker -->
              <circle cx="46" cy="20" r="2" fill="#111827" />
              <text x="80" y="108" text-anchor="middle" class="chip-lbl" fill="#9ca3af" font-weight="bold">SOIC-16</text>
              {#each L16 as p (p.n)}
                <g>
                  <rect x="28" y={20 + (p.n - 1) * 20} width="14" height="5" rx="0.5" fill="url(#pinGrad)" stroke="#4b5563" stroke-width="0.5" />
                  <text x="24" y={25 + (p.n - 1) * 20} text-anchor="end" class="pin" fill="#6b7280">{p.n}</text>
                  <text x="48" y={25 + (p.n - 1) * 20} class="pin" fill="#f3f4f6" font-weight="bold">{p.name}</text>
                </g>
              {/each}
              {#each R16 as p, i (p.n)}
                <g>
                  <rect x="118" y={20 + i * 20} width="14" height="5" rx="0.5" fill="url(#pinGrad)" stroke="#4b5563" stroke-width="0.5" />
                  <text x="136" y={25 + i * 20} class="pin" fill="#6b7280">{p.n}</text>
                  <text x="114" y={25 + i * 20} text-anchor="end" class="pin" fill="#f3f4f6" font-weight="bold">{p.name}</text>
                </g>
              {/each}
            </svg>
            <table class="text-[11px] border-collapse">
              <tbody class="divide-y divide-gray-700/30">
                {#each SOIC16 as p (p.n)}
                  <tr class="hover:bg-gray-700/20 transition-colors">
                    <td class="pr-2 py-1 text-gray-500 font-mono">{p.n}</td>
                    <td class="pr-2 py-1 font-mono text-teal-300">{p.name}</td>
                    <td class="py-1 text-gray-400">{p.desc}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <p class="mt-1.5 text-gray-500 leading-relaxed">{$LL.hwGuide.ch341a.pinout16Note()}</p>
        </div>

        <!-- ===== ZIF → chip wiring ===== -->
        <div>
          <p class="font-semibold text-gray-200 mb-1.5">{$LL.hwGuide.ch341a.wiringTitle()}</p>
          <table class="text-[11px] border-collapse w-full max-w-md">
            <thead class="bg-gray-700/30">
              <tr class="text-gray-500">
                <th class="text-left font-medium py-1 px-2 rounded-tl-sm border-b border-gray-700/50">Chip-Pin</th>
                <th class="text-left font-medium py-1 px-2 border-b border-gray-700/50">Signal</th>
                <th class="text-left font-medium py-1 px-2 border-b border-gray-700/50">ZIF-Pos.</th>
                <th class="text-left font-medium py-1 px-2 rounded-tr-sm border-b border-gray-700/50">CH341A</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-700/30">
              {#each ZIF_WIRING as row (row.n)}
                <tr class="hover:bg-gray-700/20 transition-colors">
                  <td class="py-1 px-2 font-mono text-teal-300">{row.n} {row.name}</td>
                  <td class="py-1 px-2 font-mono text-gray-200">{row.sig}</td>
                  <td class="py-1 px-2 font-mono text-gray-300">{row.zif}</td>
                  <td class="py-1 px-2 text-gray-400">
                    {#if row.note}<span class="text-amber-300 font-medium">{row.note}</span>{/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
          <p class="mt-1.5 text-gray-500 leading-relaxed">{$LL.hwGuide.ch341a.wiringNote()}</p>
        </div>

        <!-- ===== Jumpers ===== -->
        <div>
          <p class="font-semibold text-gray-200 mb-1">{$LL.hwGuide.ch341a.jumpers()}</p>
          <ul class="list-disc pl-4 space-y-0.5 text-gray-400">
            <li>{$LL.hwGuide.ch341a.jumperAct()} <span class="text-gray-500">(⑧)</span></li>
            <li>{$LL.hwGuide.ch341a.jumperVolt()}</li>
          </ul>
        </div>

        <!-- ===== 3.3V fix ===== -->
        <div>
          <p class="font-semibold text-gray-200 mb-1">{$LL.hwGuide.ch341a.fix()}</p>
          <p class="leading-relaxed text-gray-400">{$LL.hwGuide.ch341a.fixText()}</p>
        </div>

        <p class="leading-relaxed text-gray-400">{$LL.hwGuide.ch341a.incircuit()}</p>

        <a
          href="https://github.com/fabioudev/fixplay-diagnoseTool/blob/main/docs/CH341A_GUIDE.md"
          target="_blank" rel="noopener"
          class="inline-flex items-center gap-1 text-teal-400 hover:text-teal-300"
        >
          <ExternalLink class="h-3 w-3" />{$LL.hwGuide.ch341a.fullGuide()}
        </a>
      {:else}
        <!-- UART: 3.3V danger callout -->
        <div class="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-1">
          <p class="font-semibold text-amber-300 flex items-center gap-1.5">
            <AlertTriangle class="h-3.5 w-3.5" />{$LL.hwGuide.uart.danger()}
          </p>
          <p class="leading-relaxed">{$LL.hwGuide.uart.dangerText()}</p>
        </div>

        <!-- Wiring (crossed TX/RX) -->
        <div>
          <p class="font-semibold text-gray-200 mb-1.5">{$LL.hwGuide.uart.wiring()}</p>
          <div class="flex items-center gap-3 flex-wrap">
            <svg viewBox="0 0 260 110" class="w-64 shrink-0" role="img" aria-label="PS5 UART wiring">
              <defs>
                <linearGradient id="pcbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#064e3b" />
                  <stop offset="100%" stop-color="#022c22" />
                </linearGradient>
              </defs>
              <!-- PS5 Motherboard Section -->
              <g transform="translate(10, 20)">
                <rect x="0" y="0" width="80" height="70" rx="4" fill="url(#pcbGrad)" stroke="#065f46" stroke-width="1" />
                <text x="40" y="-10" text-anchor="middle" class="lbl" fill="#9ca3af">PS5 MB</text>
                <!-- Solder pads -->
                <rect x="65" y="15" width="12" height="12" rx="1" fill="#b45309" stroke="#f59e0b" stroke-width="0.5" />
                <text x="62" y="22" text-anchor="end" class="pin" fill="#e5e7eb">TX</text>
                <rect x="65" y="35" width="12" height="12" rx="1" fill="#b45309" stroke="#f59e0b" stroke-width="0.5" />
                <text x="62" y="42" text-anchor="end" class="pin" fill="#e5e7eb">RX</text>
                <rect x="65" y="55" width="12" height="12" rx="1" fill="#b45309" stroke="#f59e0b" stroke-width="0.5" />
                <text x="62" y="62" text-anchor="end" class="pin" fill="#e5e7eb">GND</text>
              </g>

              <!-- UART Adapter -->
              <g transform="translate(170, 20)">
                <rect x="0" y="0" width="70" height="70" rx="4" fill="#111827" stroke="#374151" stroke-width="1" />
                <text x="35" y="-10" text-anchor="middle" class="lbl" fill="#9ca3af">UART Adapter</text>
                <!-- Chip -->
                <rect x="20" y="20" width="30" height="30" rx="2" fill="#1f2937" stroke="#4b5563" stroke-width="0.5" />
                <text x="35" y="38" text-anchor="middle" class="chip-lbl" fill="#6b7280">CP2102</text>
                <!-- Pins -->
                <rect x="0" y="15" width="10" height="12" rx="1" fill="#4b5563" />
                <text x="15" y="22" class="pin" fill="#e5e7eb">RX</text>
                <rect x="0" y="35" width="10" height="12" rx="1" fill="#4b5563" />
                <text x="15" y="42" class="pin" fill="#e5e7eb">TX</text>
                <rect x="0" y="55" width="10" height="12" rx="1" fill="#4b5563" />
                <text x="15" y="62" class="pin" fill="#e5e7eb">GND</text>
              </g>

              <!-- Wiring paths (crossed TX/RX) -->
              <g fill="none" stroke-width="1.5" stroke-linecap="round">
                <!-- PS5 TX (75, 31) -> Adapter RX (170, 31) -->
                <path d="M87 31 C 120 31, 130 31, 170 31" stroke="#4ade80" />
                <!-- PS5 RX (75, 41) -> Adapter TX (170, 41) -->
                <path d="M87 41 C 120 41, 130 41, 170 41" stroke="#4ade80" />
                <!-- GND (75, 51) -> Adapter GND (170, 51) -->
                <path d="M87 51 L 170 51" stroke="#6b7280" />
              </g>
            </svg>
            <p class="text-gray-500 leading-relaxed max-w-[14rem]">{$LL.hwGuide.uart.baud()}</p>
          </div>
        </div>

        <!-- EDM-010 pads -->
        <div>
          <p class="font-semibold text-gray-200 mb-1.5">{$LL.hwGuide.uart.pads()}</p>
          <div class="flex flex-wrap gap-x-6 gap-y-1">
            {#each UART_PADS as p (p.n)}
              <div class="flex items-center gap-1.5">
                <span class="font-mono text-gray-500">Pin {p.n}</span>
                <span class="font-mono text-teal-300">{p.name}</span>
                <span class="text-gray-400">{p.desc}</span>
              </div>
            {/each}
          </div>
        </div>

        <p class="leading-relaxed text-gray-400">{$LL.hwGuide.uart.procedure()}</p>
        <p class="leading-relaxed text-gray-500">{$LL.hwGuide.uart.titania()}</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .pin { font: 600 8px ui-monospace, monospace; }
  .lbl { font: 600 8px ui-sans-serif, system-ui, sans-serif; }
  .chip-lbl { font: 500 6px ui-sans-serif, system-ui, sans-serif; }
  .callout { font: 700 9px ui-sans-serif, system-ui, sans-serif; }
</style>