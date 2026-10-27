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

  /**
   * Ring colors for the PS5 UART spot diagrams, matching the annotation
   * colors of the consoleservicetool.com pinout photos: GND lime, the PS5's
   * TX pad (goes to the CH341A RX pin) blue, the PS5's RX pad (goes to the
   * CH341A TX pin) orange.
   */
  export const UART_SPOT_COLOR = {
    gnd: '#a3e635',
    tx: '#38bdf8',
    rx: '#fb923c',
  } as const;

  // Numbered callouts on the CH341A board top-view (match the legend below).
  // Geometry mirrors the real black CH341A dongle (research: reverse-engineered
  // Upcycle-Electronics/CH341A-Pro netlist + board photos): landscape stick,
  // USB-A plug left, rounded far end right, 16-pin (2×8) ZIF lengthwise at the
  // far end, two 1×7 headers along the long edges, one jumper only (mode/
  // ACT# on UART header pins 1-2). The guide intentionally keeps only the
  // three callouts that matter for NOR work: jumper, ZIF socket, seated chip.
  export const BOARD_CALLOUTS: { n: number; x: number; y: number }[] = [
    { n: 1, x: 146, y: 20 }, // mode jumper (UART header pins 1-2, above the pin labels)
    { n: 2, x: 240, y: 44 }, // ZIF socket (top-left corner)
    { n: 3, x: 330, y: 26 }, // seated NOR chip (above the "25 SPI" label)
  ];

  /**
   * All 16 ZIF socket positions with their signals (reverse-engineered board
   * netlist, Upcycle-Electronics/CH341A-Pro). The "25 SPI" half (positions
   * 5-12, away from the USB plug) is what a 25-series NOR uses; 13/14 carry
   * the 24-series I²C EEPROM lines; 7/11/12/16 are the hard-wired 3.3 V rails
   * (WP#/HOLD# tied high, socket VCC via the AMS1117).
   */
  export const ZIF_SOCKET: { n: number; sig: string; kind: 'gnd' | 'v33' | 'spi' | 'i2c' }[] = [
    { n: 1, sig: 'GND', kind: 'gnd' },
    { n: 2, sig: 'GND', kind: 'gnd' },
    { n: 3, sig: 'GND', kind: 'gnd' },
    { n: 4, sig: 'GND', kind: 'gnd' },
    { n: 5, sig: 'CS', kind: 'spi' },
    { n: 6, sig: 'MISO', kind: 'spi' },
    { n: 7, sig: '3V3', kind: 'v33' },
    { n: 8, sig: 'GND', kind: 'gnd' },
    { n: 9, sig: 'MOSI', kind: 'spi' },
    { n: 10, sig: 'CLK', kind: 'spi' },
    { n: 11, sig: '3V3', kind: 'v33' },
    { n: 12, sig: '3V3', kind: 'v33' },
    { n: 13, sig: 'SDA', kind: 'i2c' },
    { n: 14, sig: 'SCL', kind: 'i2c' },
    { n: 15, sig: 'GND', kind: 'gnd' },
    { n: 16, sig: '3V3', kind: 'v33' },
  ];

  /** Signal label colors for the ZIF socket pinout SVG. */
  export const ZIF_KIND_COLOR: Record<(typeof ZIF_SOCKET)[number]['kind'], string> = {
    gnd: '#6b7280',
    v33: '#4ade80',
    spi: '#5eead4',
    i2c: '#c4b5fd',
  };

  /**
   * Callouts for the board top-view in USB-TTL mode (uart variant): the shunt
   * sits on UART-header pins 2-3 (serial mode) and the header itself is the
   * point of interest. Geometry matches the shared board SVG below.
   */
  export const UART_CALLOUTS: { n: number; x: number; y: number }[] = [
    { n: 1, x: 198, y: 18 }, // UART header (above the TX/RX pin labels)
    { n: 2, x: 169, y: 20 }, // mode jumper shunted onto pins 2-3
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

  // ZIF socket rows for the pinout SVG: top row = positions 1..8 left→right,
  // bottom row = positions 16..9 left→right (matches the real socket, pin 1
  // at the top-left corner square pad).
  const ZIF_TOP = ZIF_SOCKET.filter((p) => p.n <= 8);
  const ZIF_BOTTOM = [...ZIF_SOCKET.filter((p) => p.n > 8)].reverse();

  // USB-TTL mode of the shared board SVG: jumper shunted onto pins 2-3
  // instead of 1-2, TX/RX/GND header labels highlighted.
  const uartMode = $derived(variant === 'uart');
</script>

<!-- shrink-0: this guide lives in a height-constrained flex column
     (FlashPanel/UartPanel sections). Without it, expanding the guide makes the
     flex parent shrink this box below its content size and overflow-hidden
     cuts the bottom off (half the SOIC-8 chip) instead of the page scrolling. -->
<div class="shrink-0 rounded-lg border border-gray-700/60 bg-gray-800/40 overflow-hidden">
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
    <ChevronDown
      class="h-4 w-4 ml-auto shrink-0 text-gray-400 transition-transform {open ? 'rotate-180' : ''}"
    />
  </button>

  {#if open}
    <div
      class="px-3 pb-3 pt-1 space-y-4 text-xs text-gray-300"
      transition:slide={{ duration: 150 }}
    >
      {#if variant === 'uart'}
        <!-- UART: 3.3V danger callout -->
        <div class="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-1">
          <p class="font-semibold text-amber-300 flex items-center gap-1.5">
            <AlertTriangle class="h-3.5 w-3.5" />{$LL.hwGuide.uart.danger()}
          </p>
          <p class="leading-relaxed">{$LL.hwGuide.uart.dangerText()}</p>
        </div>
      {:else}
        <!-- No 5V danger block here: FlashPanel shows the persistent dangerShort
             strip directly above this guide (visible even when collapsed). -->
      {/if}

      <!-- ===== Board top-view — shared by both variants: the same physical
           CH341A dongle, only the mode jumper position differs (1-2 = SPI
           programmer for NOR, 2-3 = USB-TTL serial for UART) ===== -->
      <div>
        <p class="font-semibold text-gray-200 mb-1.5">
          {variant === 'ch341a' ? $LL.hwGuide.ch341a.boardTitle() : $LL.hwGuide.uart.ch341aTitle()}
        </p>
        <div class="flex flex-wrap items-start gap-4">
          <svg
            viewBox="0 0 400 168"
            class="w-full max-w-lg shrink-0"
            role="img"
            aria-label="CH341A board top view"
          >
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
                <feColorMatrix
                  type="matrix"
                  values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0"
                  result="shadow"
                />
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
            <path
              d="M28 28 H364 C382 28 394 51 394 84 C394 117 382 140 364 140 H28 Z"
              fill="#0a0a0c"
              stroke="#1f1f23"
              stroke-width="1"
            />

            <!-- USB shell rivet holes -->
            <circle cx="40" cy="38" r="1.6" fill="none" stroke="#3f3f46" stroke-width="0.8" />
            <circle cx="40" cy="130" r="1.6" fill="none" stroke="#3f3f46" stroke-width="0.8" />

            <!-- USB-A male connector: metallic shell overhanging the left end -->
            <g>
              <rect
                x="2"
                y="68"
                width="28"
                height="40"
                rx="1.5"
                fill="#cbd5e1"
                stroke="#94a3b8"
                stroke-width="1"
              />
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
            <circle
              cx="56"
              cy="40"
              r="2.6"
              fill="#4ade80"
              stroke="#16a34a"
              stroke-width="0.6"
              filter="url(#glowFilter)"
            />
            <circle
              cx="56"
              cy="134"
              r="2.6"
              fill="#fb923c"
              stroke="#ea580c"
              stroke-width="0.6"
              filter="url(#glowFilter)"
            />

            <!-- AMS1117-3.3 regulator (SOT-223, center of the supply cluster) -->
            <g>
              <rect
                x="62"
                y="76"
                width="14"
                height="22"
                rx="1"
                fill="#111827"
                stroke="#374151"
                stroke-width="1"
              />
              <rect x="62" y="76" width="14" height="4" fill="#4b5563" />
              {#each [86, 92, 98] as py (py)}
                <rect x="64" y={py} width="10" height="2.5" rx="0.5" fill="#6b7280" />
              {/each}
            </g>
            <!-- Decoupling caps -->
            <rect
              x="56"
              y="110"
              width="6"
              height="9"
              rx="0.5"
              fill="#52525b"
              stroke="#71717a"
              stroke-width="0.4"
            />
            <rect
              x="76"
              y="110"
              width="6"
              height="9"
              rx="0.5"
              fill="#52525b"
              stroke="#71717a"
              stroke-width="0.4"
            />

            <!-- CH341A IC: SOIC-28W mounted across the board width -->
            <g>
              {#each [54, 63, 72, 81, 90, 99, 108, 117] as py (py)}
                <rect x="89" y={py} width="6" height="3" rx="0.5" fill="#6b7280" />
                <rect x="119" y={py} width="6" height="3" rx="0.5" fill="#6b7280" />
              {/each}
              <rect
                x="94"
                y="48"
                width="26"
                height="76"
                rx="1"
                fill="#111827"
                stroke="#374151"
                stroke-width="1"
              />
              <circle cx="98" cy="53" r="1.4" fill="#6b7280" />
              <text
                x="107"
                y="88"
                text-anchor="middle"
                class="chip-lbl"
                fill="#9ca3af"
                transform="rotate(-90 107 88)">CH341A</text
              >
            </g>

            <!-- 12 MHz HC-49 crystal standing vertically beside the CH341A -->
            <g>
              <rect
                x="132"
                y="64"
                width="12"
                height="44"
                rx="6"
                fill="#cbd5e1"
                stroke="#94a3b8"
                stroke-width="1"
              />
              <rect x="135" y="68" width="3" height="36" rx="1.5" fill="#e2e8f0" />
              <text x="138" y="116" text-anchor="middle" class="chip-lbl" fill="#4b4b52">12M</text>
            </g>

            <!-- Silkscreen brand (real board: "CH341A MinProgrammer") -->
            <text
              x="196"
              y="60"
              text-anchor="middle"
              fill="#4b4b52"
              font-family="ui-monospace, monospace"
              font-size="5.5"
              font-weight="600">CH341A MinProgrammer</text
            >

            <!-- UART/mode header (top edge, 7-pin, pin 1 toward USB). In USB-TTL
                 mode the TX/RX/GND pins are the ones you actually use — highlight
                 them, and flag 5V red as the "never wire this" pin. -->
            {#each ['1', '2', '3', 'TX', 'RX', 'GND', '5V'] as lbl, i (lbl)}
              <rect x={150 + i * 12 - 2} y="38" width="5" height="5" rx="0.5" fill="#4b5563" />
              <text
                x={150 + i * 12}
                y="33"
                text-anchor="middle"
                fill={uartMode
                  ? i === 6
                    ? '#f87171'
                    : i >= 3 && i <= 5
                      ? '#5eead4'
                      : '#4b4b52'
                  : '#4b4b52'}
                font-family="ui-monospace, monospace"
                font-size="5"
                font-weight="600">{lbl}</text
              >
            {/each}

            <!-- Mode jumper (yellow shunt): pins 1-2 = programmer (NOR),
                 pins 2-3 = USB-TTL serial (UART) -->
            <g>
              <rect
                x={uartMode ? 157 : 145}
                y="34"
                width="24"
                height="9"
                rx="1.5"
                fill="#fbbf24"
                stroke="#f59e0b"
                stroke-width="0.8"
              />
              <rect x={uartMode ? 159 : 147} y="35.5" width="6" height="6" fill="#fde68a" />
            </g>

            <!-- SPI header (bottom edge, 7-pin: CLK CS MOSI MISO GND 3V3 5V) -->
            {#each ['CLK', 'CS', 'MOSI', 'MISO', 'GND', '3V3', '5V'] as lbl, i (lbl)}
              <rect x={150 + i * 12 - 2} y="133" width="5" height="5" rx="0.5" fill="#4b5563" />
              <text
                x={150 + i * 12}
                y="148"
                text-anchor="middle"
                fill="#4b4b52"
                font-family="ui-monospace, monospace"
                font-size="4.6"
                font-weight="600">{lbl}</text
              >
            {/each}

            <!-- 16-pin (2×8) ZIF socket, lengthwise at the far end -->
            <g filter="url(#shadowFilter)">
              <rect
                x="246"
                y="50"
                width="110"
                height="68"
                rx="3"
                fill="#f3f4f6"
                stroke="#d1d5db"
                stroke-width="1.5"
              />
            </g>
            <!-- ZIF pin holes: top row = ZIF 1..8 (left→right), bottom row = ZIF 16..9 -->
            {#each Array(8) as _, i (i)}
              {#if i === 0}
                <!-- ZIF pin 1: square pad (real board marks it with a square + arrow) -->
                <rect
                  x={252 - 2}
                  y={66 - 2}
                  width="4"
                  height="4"
                  fill="#111827"
                  stroke="#d1d5db"
                  stroke-width="0.4"
                />
              {:else}
                <circle
                  cx={252 + i * 13.7}
                  cy="66"
                  r="1.8"
                  fill="#111827"
                  stroke="#d1d5db"
                  stroke-width="0.4"
                />
              {/if}
              <circle
                cx={252 + i * 13.7}
                cy="102"
                r="1.8"
                fill="#111827"
                stroke="#d1d5db"
                stroke-width="0.4"
              />
            {/each}
            <text
              x="243"
              y="68"
              text-anchor="end"
              fill="#6b7280"
              font-family="ui-monospace, monospace"
              font-size="4.5">1</text
            >
            <text
              x="243"
              y="104"
              text-anchor="end"
              fill="#6b7280"
              font-family="ui-monospace, monospace"
              font-size="4.5">16</text
            >
            <!-- Socket group labels (real silk: "24 I2C EEPROM BIOS" / "25 SPI") -->
            <line x1="300" y1="54" x2="300" y2="114" stroke="#d1d5db" stroke-width="0.6" />
            <g
              fill="#6b7280"
              font-family="ui-monospace, monospace"
              font-size="4.6"
              font-weight="600"
            >
              <text x="276" y="60" text-anchor="middle">24 I²C</text>
              <text x="329" y="47" text-anchor="middle">25 SPI</text>
            </g>

            <!-- ZIF lever along the socket's long edge -->
            <g filter="url(#shadowFilter)">
              <rect
                x="252"
                y="120"
                width="88"
                height="5"
                rx="2"
                fill="#ffffff"
                stroke="#d1d5db"
                stroke-width="0.5"
              />
              <rect
                x="340"
                y="116"
                width="20"
                height="12"
                rx="3"
                fill="#ffffff"
                stroke="#d1d5db"
                stroke-width="0.5"
              />
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
              <rect
                x="302"
                y="56"
                width="56"
                height="56"
                rx="2"
                fill="#1f2937"
                stroke="#374151"
                stroke-width="1"
              />
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
            {#each uartMode ? UART_CALLOUTS : BOARD_CALLOUTS as c (c.n)}
              <g filter="url(#glowFilter)">
                <circle
                  cx={c.x}
                  cy={c.y}
                  r="7.5"
                  fill="url(#calloutGrad)"
                  stroke="#fbbf24"
                  stroke-width="1.2"
                />
                <text x={c.x} y={c.y + 2.6} text-anchor="middle" class="callout" fill="#fbbf24"
                  >{c.n}</text
                >
              </g>
            {/each}
          </svg>
          <!-- Legend: NOR-relevant callouts (ch341a) vs UART-relevant ones -->
          <ol
            class="text-[11px] leading-relaxed text-gray-400 space-y-0.5 list-decimal pl-4 marker:text-gray-500"
          >
            {#if variant === 'ch341a'}
              <li>
                <span class="font-mono text-gray-200">Mode-Jumper</span> — {$LL.hwGuide.ch341a.legAct()}
              </li>
              <li>
                <span class="font-mono text-gray-200">ZIF-Sockel</span> — {$LL.hwGuide.ch341a.legZif()}
              </li>
              <li>
                <span class="font-mono text-gray-200">NOR-Chip</span> — {$LL.hwGuide.ch341a.legNor()}
              </li>
            {:else}
              <li>
                <span class="font-mono text-gray-200">UART-Header</span> — {$LL.hwGuide.uart.legHeader()}
              </li>
              <li>
                <span class="font-mono text-gray-200">Mode-Jumper</span> — {$LL.hwGuide.uart.legJumper()}
              </li>
            {/if}
          </ol>
        </div>
        {#if variant === 'ch341a'}
          <p class="mt-1.5 text-gray-500 leading-relaxed">{$LL.hwGuide.ch341a.socketNote()}</p>
        {:else}
          <ul class="mt-1.5 list-disc pl-4 space-y-0.5 text-gray-400">
            <li>{$LL.hwGuide.uart.jumperUart()} <span class="text-gray-500">(②)</span></li>
            <li>{$LL.hwGuide.uart.headerUart()} <span class="text-gray-500">(①)</span></li>
          </ul>
        {/if}
      </div>

      {#if variant === 'ch341a'}
        <!-- ===== 8-pin chip pinout ===== -->
        <div>
          <p class="font-semibold text-gray-200 mb-1.5">{$LL.hwGuide.ch341a.pinout8()}</p>
          <div class="flex flex-wrap items-start gap-4">
            <svg
              viewBox="0 0 160 130"
              class="w-44 shrink-0"
              role="img"
              aria-label="SOIC-8 SPI NOR pinout"
            >
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
              <rect
                x="40"
                y="14"
                width="80"
                height="100"
                rx="2"
                fill="#1f2937"
                stroke="#374151"
                stroke-width="1"
                filter="url(#chipShadow)"
              />
              <!-- Pin 1 Marker: Industrial indentation -->
              <circle cx="46" cy="20" r="2" fill="#111827" />
              <text
                x="80"
                y="68"
                text-anchor="middle"
                class="chip-lbl"
                fill="#9ca3af"
                font-weight="bold">SOIC-8</text
              >
              {#each L8 as p (p.n)}
                <g>
                  <rect
                    x="28"
                    y={20 + (p.n - 1) * 22}
                    width="14"
                    height="6"
                    rx="0.5"
                    fill="url(#pinGrad)"
                    stroke="#4b5563"
                    stroke-width="0.5"
                  />
                  <text x="24" y={26 + (p.n - 1) * 22} text-anchor="end" class="pin" fill="#6b7280"
                    >{p.n}</text
                  >
                  <text x="48" y={26 + (p.n - 1) * 22} class="pin" fill="#f3f4f6" font-weight="bold"
                    >{p.name}</text
                  >
                </g>
              {/each}
              {#each R8 as p, i (p.n)}
                <g>
                  <rect
                    x="118"
                    y={20 + i * 22}
                    width="14"
                    height="6"
                    rx="0.5"
                    fill="url(#pinGrad)"
                    stroke="#4b5563"
                    stroke-width="0.5"
                  />
                  <text x="136" y={26 + i * 22} class="pin" fill="#6b7280">{p.n}</text>
                  <text
                    x="114"
                    y={26 + i * 22}
                    text-anchor="end"
                    class="pin"
                    fill="#f3f4f6"
                    font-weight="bold">{p.name}</text
                  >
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

        <!-- ===== ZIF socket pinout ===== -->
        <div>
          <p class="font-semibold text-gray-200 mb-1.5">{$LL.hwGuide.ch341a.zifTitle()}</p>
          <div class="flex flex-wrap items-start gap-4">
            <!-- All 16 socket positions, color-coded: top row = ZIF 1..8
                 (left→right), bottom row = ZIF 16..9; the amber dashed box is
                 the "25 SPI" half a 25-series NOR goes into (positions 5-12). -->
            <svg
              viewBox="0 0 250 152"
              class="w-full max-w-sm shrink-0"
              role="img"
              aria-label="ZIF socket pinout"
            >
              <rect
                x="25"
                y="32"
                width="210"
                height="90"
                rx="4"
                fill="#f3f4f6"
                stroke="#d1d5db"
                stroke-width="1.5"
              />
              <!-- "25 SPI" half (ZIF 5-12): columns 5-8 in both rows -->
              <rect
                x="130"
                y="36"
                width="88"
                height="82"
                rx="2"
                fill="none"
                stroke="#fbbf24"
                stroke-width="1"
                stroke-dasharray="3 2"
              />
              <text
                x="235"
                y="24"
                text-anchor="end"
                fill="#fbbf24"
                font-size="7"
                font-weight="600"
                font-family="ui-monospace, monospace">25 SPI (NOR)</text
              >
              <text
                x="25"
                y="24"
                fill="#6b7280"
                font-size="7"
                font-weight="600"
                font-family="ui-monospace, monospace">24 I²C</text
              >
              {#each ZIF_TOP as p (p.n)}
                {#if p.n === 1}
                  <!-- ZIF pin 1: square pad (matches the real board mark) -->
                  <rect
                    x={42 + (p.n - 1) * 24 - 3.5}
                    y={58 - 3.5}
                    width="7"
                    height="7"
                    fill="#111827"
                    stroke="#d1d5db"
                    stroke-width="0.5"
                  />
                {:else}
                  <circle
                    cx={42 + (p.n - 1) * 24}
                    cy="58"
                    r="3"
                    fill="#111827"
                    stroke="#d1d5db"
                    stroke-width="0.5"
                  />
                {/if}
                <text
                  x={42 + (p.n - 1) * 24}
                  y="47"
                  text-anchor="middle"
                  fill="#9ca3af"
                  font-size="5.5"
                  font-family="ui-monospace, monospace">{p.n}</text
                >
                <text
                  x={42 + (p.n - 1) * 24}
                  y="54"
                  text-anchor="middle"
                  fill={ZIF_KIND_COLOR[p.kind]}
                  font-size="7"
                  font-weight="600"
                  font-family="ui-monospace, monospace">{p.sig}</text
                >
              {/each}
              {#each ZIF_BOTTOM as p (p.n)}
                <circle
                  cx={42 + (16 - p.n) * 24}
                  cy="96"
                  r="3"
                  fill="#111827"
                  stroke="#d1d5db"
                  stroke-width="0.5"
                />
                <text
                  x={42 + (16 - p.n) * 24}
                  y="110"
                  text-anchor="middle"
                  fill={ZIF_KIND_COLOR[p.kind]}
                  font-size="7"
                  font-weight="600"
                  font-family="ui-monospace, monospace">{p.sig}</text
                >
                <text
                  x={42 + (16 - p.n) * 24}
                  y="117"
                  text-anchor="middle"
                  fill="#9ca3af"
                  font-size="5.5"
                  font-family="ui-monospace, monospace">{p.n}</text
                >
              {/each}
            </svg>
            <div>
              <div class="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-500 mb-2">
                <span class="flex items-center gap-1"
                  ><span class="h-2 w-2 rounded-full inline-block" style="background:#5eead4"
                  ></span>SPI</span
                >
                <span class="flex items-center gap-1"
                  ><span class="h-2 w-2 rounded-full inline-block" style="background:#4ade80"
                  ></span>3,3 V</span
                >
                <span class="flex items-center gap-1"
                  ><span class="h-2 w-2 rounded-full inline-block" style="background:#c4b5fd"
                  ></span>I²C</span
                >
                <span class="flex items-center gap-1"
                  ><span class="h-2 w-2 rounded-full inline-block" style="background:#6b7280"
                  ></span>GND</span
                >
              </div>
              <table class="text-[11px] border-collapse w-full max-w-md">
                <thead class="bg-gray-700/30">
                  <tr class="text-gray-500">
                    <th
                      class="text-left font-medium py-1 px-2 rounded-tl-sm border-b border-gray-700/50"
                      >Chip-Pin</th
                    >
                    <th class="text-left font-medium py-1 px-2 border-b border-gray-700/50"
                      >Signal</th
                    >
                    <th class="text-left font-medium py-1 px-2 border-b border-gray-700/50"
                      >ZIF-Pos.</th
                    >
                    <th
                      class="text-left font-medium py-1 px-2 rounded-tr-sm border-b border-gray-700/50"
                      >CH341A</th
                    >
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-700/30">
                  {#each ZIF_WIRING as row (row.n)}
                    <tr class="hover:bg-gray-700/20 transition-colors">
                      <td class="py-1 px-2 font-mono text-teal-300">{row.n} {row.name}</td>
                      <td class="py-1 px-2 font-mono text-gray-200">{row.sig}</td>
                      <td class="py-1 px-2 font-mono text-gray-300">{row.zif}</td>
                      <td class="py-1 px-2 text-gray-400">
                        {#if row.note}<span class="text-amber-300 font-medium">{row.note}</span
                          >{/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
          <p class="mt-1.5 text-gray-500 leading-relaxed">{$LL.hwGuide.ch341a.wiringNote()}</p>
        </div>

        <!-- ===== Mode jumper (the one that matters for NOR) ===== -->
        <div>
          <p class="font-semibold text-gray-200 mb-1">{$LL.hwGuide.ch341a.jumpers()}</p>
          <ul class="list-disc pl-4 space-y-0.5 text-gray-400">
            <li>{$LL.hwGuide.ch341a.jumperAct()} <span class="text-gray-500">(①)</span></li>
          </ul>
        </div>

        <a
          href="https://github.com/fabioudev/fixplay-diagnoseTool/blob/main/docs/CH341A_GUIDE.md"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-1 text-teal-400 hover:text-teal-300"
        >
          <ExternalLink class="h-3 w-3" />{$LL.hwGuide.ch341a.fullGuide()}
        </a>
      {:else}
        <!-- 5V divider warning: the CH341A TTL header runs at 5 V (the chip is
             a 5 V part — only VCC is regulated down), so its TX output needs a
             divider before it may touch the 3.3 V-only PS5 pads -->
        <p
          class="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 leading-relaxed text-amber-300 flex items-start gap-1.5"
        >
          <AlertTriangle class="h-3.5 w-3.5 shrink-0 mt-0.5" />{$LL.hwGuide.uart.ttlText()}
        </p>

        <!-- ===== Wiring: CH341A USB-TTL ↔ PS5 EMC header (crossed + divider) ===== -->
        <div>
          <p class="font-semibold text-gray-200 mb-1.5">{$LL.hwGuide.uart.wiring()}</p>
          <div class="flex items-center gap-3 flex-wrap">
            <svg
              viewBox="0 0 350 175"
              class="w-full max-w-md shrink-0"
              role="img"
              aria-label="PS5 UART wiring via CH341A USB-TTL"
            >
              <defs>
                <linearGradient id="uartPcbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#064e3b" />
                  <stop offset="100%" stop-color="#022c22" />
                </linearGradient>
              </defs>

              <!-- PS5 motherboard with the three UART spot pads -->
              <g transform="translate(10, 45)">
                <rect
                  x="0"
                  y="0"
                  width="90"
                  height="95"
                  rx="4"
                  fill="url(#uartPcbGrad)"
                  stroke="#065f46"
                  stroke-width="1"
                />
                <text x="45" y="-10" text-anchor="middle" class="lbl" fill="#9ca3af"
                  >PS5 Mainboard</text
                >
                <rect
                  x="20"
                  y="35"
                  width="30"
                  height="30"
                  rx="2"
                  fill="#111827"
                  stroke="#374151"
                  stroke-width="0.5"
                />
                <text x="35" y="53" text-anchor="middle" class="chip-lbl" fill="#6b7280">EMC</text>
                <rect
                  x="76"
                  y="14"
                  width="12"
                  height="10"
                  rx="1"
                  fill="#b45309"
                  stroke="#f59e0b"
                  stroke-width="0.5"
                />
                <text x="72" y="22" text-anchor="end" class="pin" fill="#38bdf8">TX</text>
                <rect
                  x="76"
                  y="52"
                  width="12"
                  height="10"
                  rx="1"
                  fill="#b45309"
                  stroke="#f59e0b"
                  stroke-width="0.5"
                />
                <text x="72" y="60" text-anchor="end" class="pin" fill="#fb923c">RX</text>
                <rect
                  x="76"
                  y="90"
                  width="12"
                  height="10"
                  rx="1"
                  fill="#b45309"
                  stroke="#f59e0b"
                  stroke-width="0.5"
                />
                <text x="72" y="98" text-anchor="end" class="pin" fill="#a3e635">GND</text>
              </g>

              <!-- CH341A dongle in USB-TTL mode (jumper on 2-3) -->
              <g transform="translate(255, 45)">
                <rect
                  x="0"
                  y="0"
                  width="85"
                  height="120"
                  rx="3"
                  fill="#0a0a0c"
                  stroke="#1f1f23"
                  stroke-width="1"
                />
                <rect
                  x="72"
                  y="44"
                  width="20"
                  height="32"
                  rx="1.5"
                  fill="#cbd5e1"
                  stroke="#94a3b8"
                  stroke-width="1"
                />
                <text x="42" y="-10" text-anchor="middle" class="lbl" fill="#9ca3af"
                  >CH341A (USB-TTL)</text
                >
                {#each ['1', '2', '3', 'TX', 'RX', 'GND', '5V'] as lbl, i (lbl)}
                  <rect x="0" y={10 + i * 14} width="10" height="8" rx="1" fill="#4b5563" />
                  <text
                    x="14"
                    y={17 + i * 14}
                    class="pin"
                    fill={i === 6 ? '#f87171' : i >= 3 && i <= 5 ? '#5eead4' : '#6b7280'}
                    >{lbl}</text
                  >
                {/each}
                <rect
                  x="-4"
                  y="22"
                  width="12"
                  height="26"
                  rx="1.5"
                  fill="#fbbf24"
                  stroke="#f59e0b"
                  stroke-width="0.8"
                />
                <text x="42" y="116" text-anchor="middle" class="pin" fill="#fbbf24"
                  >Jumper 2↔3</text
                >
              </g>

              <!-- Wiring paths: crossed TX/RX, divider on the 5 V TX line -->
              <g fill="none" stroke-width="1.5" stroke-linecap="round">
                <!-- PS5 TX (3.3 V) → CH341A RX: harmless direction -->
                <path d="M98 64 C 160 64, 200 115, 255 115" stroke="#4ade80" />
                <!-- CH341A TX (5 V) → 1k → junction → PS5 RX -->
                <path d="M255 101 L 186 101" stroke="#fbbf24" />
                <path d="M170 101 L 98 102" stroke="#fbbf24" />
                <!-- junction → 2k → GND -->
                <path d="M150 101 L 150 108 M150 124 L 150 130" stroke="#fbbf24" />
                <!-- PS5 GND → CH341A GND -->
                <path d="M98 140 C 160 148, 210 138, 255 129" stroke="#6b7280" />
              </g>
              <!-- Spannungsteiler: 1k series + 2k shunt to GND -->
              <rect
                x="170"
                y="97"
                width="16"
                height="8"
                rx="1"
                fill="#1f2937"
                stroke="#fbbf24"
                stroke-width="0.8"
              />
              <text x="178" y="114" text-anchor="middle" class="pin" fill="#fbbf24">1k</text>
              <rect
                x="146"
                y="108"
                width="8"
                height="16"
                rx="1"
                fill="#1f2937"
                stroke="#fbbf24"
                stroke-width="0.8"
              />
              <text x="158" y="118" class="pin" fill="#fbbf24">2k</text>
              <g stroke="#6b7280" stroke-width="1.2">
                <line x1="142" y1="132" x2="158" y2="132" />
                <line x1="145" y1="135" x2="155" y2="135" />
                <line x1="148" y1="138" x2="152" y2="138" />
              </g>
              <circle cx="150" cy="101" r="2" fill="#fbbf24" />
            </svg>
            <p class="text-gray-500 leading-relaxed max-w-[14rem]">{$LL.hwGuide.uart.baud()}</p>
          </div>
        </div>

        <!-- ===== PS5 UART spots (per consoleservicetool.com pinout photos):
             three pads per board revision, next to revision-specific
             landmarks. Ring colors match the photo annotations. ===== -->
        <div>
          <p class="font-semibold text-gray-200 mb-1.5">{$LL.hwGuide.uart.spotsTitle()}</p>
          <div class="space-y-5">
            <!-- EDM-010/020: 3x3 pad cluster below the WiFi/BT shield -->
            <div>
              <p class="text-xs font-medium text-gray-400 mb-1">{$LL.hwGuide.uart.spot010()}</p>
              <svg
                viewBox="0 0 360 205"
                class="w-full max-w-md shrink-0"
                role="img"
                aria-label="PS5 EDM-010/020 UART pads"
              >
                <defs>
                  <radialGradient id="solderGrad" cx="35%" cy="35%" r="75%">
                    <stop offset="0%" stop-color="#f1f5f9" />
                    <stop offset="55%" stop-color="#94a3b8" />
                    <stop offset="100%" stop-color="#475569" />
                  </radialGradient>
                </defs>
                <rect
                  x="6"
                  y="6"
                  width="348"
                  height="193"
                  rx="8"
                  fill="url(#uartPcbGrad)"
                  stroke="#065f46"
                  stroke-width="1.2"
                />
                <!-- WiFi/BT module shield (silver, with QR code) -->
                <rect
                  x="115"
                  y="22"
                  width="160"
                  height="64"
                  rx="3"
                  fill="#6b7280"
                  stroke="#9ca3af"
                  stroke-width="1"
                />
                {#each [[232, 58], [242, 58], [252, 58], [232, 68], [252, 68], [232, 78], [242, 78], [252, 78]] as [qx, qy] (qx + '-' + qy)}
                  <rect x={qx} y={qy} width="7" height="7" fill="#374151" />
                {/each}
                <text x="175" y="58" text-anchor="middle" class="lbl" fill="#e5e7eb"
                  >WiFi/BT-Modul</text
                >
                <!-- blue board-edge connector (left) and white fan connector (right) -->
                <rect
                  x="6"
                  y="120"
                  width="26"
                  height="40"
                  rx="2"
                  fill="#1e3a8a"
                  stroke="#3b82f6"
                  stroke-width="0.8"
                />
                <rect
                  x="306"
                  y="100"
                  width="46"
                  height="44"
                  rx="2"
                  fill="#e5e7eb"
                  stroke="#9ca3af"
                  stroke-width="1"
                />
                {#each [0, 1, 2] as s (s)}
                  <rect x={313 + s * 13} y="108" width="7" height="12" fill="#111827" />
                {/each}
                <!-- decorative traces -->
                <g fill="none" stroke="#0a5c44" stroke-width="1.5">
                  <path d="M 228 128 C 265 128, 285 116, 306 112" />
                  <path d="M 228 152 C 268 152, 288 160, 306 130" />
                  <path d="M 228 176 C 270 176, 290 168, 306 138" />
                  <path d="M 100 188 C 125 192, 142 182, 156 176" />
                </g>
                <!-- solder-pad cluster, photo layout (10 pads incl. the
                     functionless orientation pads): row 1 = 2 plain + GND,
                     row 2 = 3 plain + TX, row 3 = 2 plain + RX. Each pad has
                     its teardrop trace stub pointing south. -->
                {#each [[156, 128], [192, 128], [120, 152], [156, 152], [192, 152], [156, 176], [192, 176]] as const as [px, py] (px + '-' + py)}
                  <line
                    x1={px}
                    y1={py + 5}
                    x2={px}
                    y2={py + 10}
                    stroke="#7b8794"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  />
                  <circle
                    cx={px}
                    cy={py}
                    r="6"
                    fill="url(#solderGrad)"
                    stroke="#475569"
                    stroke-width="0.5"
                  />
                {/each}
                {#each [['gnd', 228, 128], ['tx', 228, 152], ['rx', 228, 176]] as const as [role, px, py] (role)}
                  <line
                    x1={px}
                    y1={py + 5}
                    x2={px}
                    y2={py + 10}
                    stroke="#7b8794"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  />
                  <circle
                    cx={px}
                    cy={py}
                    r="6"
                    fill="url(#solderGrad)"
                    stroke="#475569"
                    stroke-width="0.5"
                  />
                  <circle
                    cx={px}
                    cy={py}
                    r="9.5"
                    fill="none"
                    stroke={UART_SPOT_COLOR[role]}
                    stroke-width="1.8"
                  />
                {/each}
                <text x="243" y="131" class="pin" fill={UART_SPOT_COLOR.gnd}>GND</text>
                <text x="243" y="155" class="pin" fill={UART_SPOT_COLOR.tx}>TX → RX CH341</text>
                <text x="243" y="179" class="pin" fill={UART_SPOT_COLOR.rx}>RX → TX CH341</text>
              </svg>
            </div>

            <!-- EDM-03x: pads next to the black connector, F5402 silkscreen -->
            <div>
              <p class="text-xs font-medium text-gray-400 mb-1">{$LL.hwGuide.uart.spot03x()}</p>
              <svg
                viewBox="0 0 360 205"
                class="w-full max-w-md shrink-0"
                role="img"
                aria-label="PS5 EDM-03x UART pads"
              >
                <rect
                  x="6"
                  y="6"
                  width="348"
                  height="193"
                  rx="8"
                  fill="url(#uartPcbGrad)"
                  stroke="#065f46"
                  stroke-width="1.2"
                />
                <!-- copper pour with mounting hole (right side) -->
                <rect
                  x="250"
                  y="6"
                  width="104"
                  height="193"
                  rx="18"
                  fill="#92400e"
                  opacity="0.45"
                />
                <circle
                  cx="305"
                  cy="95"
                  r="14"
                  fill="#0a0a0c"
                  stroke="#d1d5db"
                  stroke-width="1.5"
                />
                <!-- black two-row connector (top left) -->
                <rect
                  x="26"
                  y="16"
                  width="64"
                  height="58"
                  rx="3"
                  fill="#0a0a0c"
                  stroke="#1f1f23"
                  stroke-width="1"
                />
                {#each [42, 58, 74] as cx (cx)}
                  <circle {cx} cy="34" r="2" fill="#fbbf24" />
                  <circle {cx} cy="50" r="2" fill="#fbbf24" />
                {/each}
                <!-- F5402 silkscreen (vertical, as on the real board) -->
                <text transform="translate(248 190) rotate(-90)" class="lbl" fill="#9ca3af"
                  >F5402</text
                >
                <!-- decorative traces -->
                <g fill="none" stroke="#0a5c44" stroke-width="1.5">
                  <path d="M 205 124 C 226 124, 238 118, 250 112" />
                  <path d="M 205 88 C 226 88, 238 80, 250 74" />
                  <path d="M 120 88 C 98 106, 94 140, 110 160" />
                </g>
                <!-- tiny vias left of the cluster (orientation) -->
                <circle cx="98" cy="60" r="2.5" fill="none" stroke="#f59e0b" stroke-width="1" />
                <circle cx="98" cy="74" r="2.5" fill="none" stroke="#f59e0b" stroke-width="1" />
                <!-- pads, photo layout: 4x2 grid (row 1 = GND, plain, TX,
                     plain; row 2 = plain, plain, RX, plain) plus 2 more plain
                     pads below — the functionless ones are orientation aids. -->
                {#each [[160, 88], [245, 88], [120, 124], [160, 124], [245, 124], [140, 176], [190, 176]] as const as [px, py] (px + '-' + py)}
                  <circle
                    cx={px}
                    cy={py}
                    r="6"
                    fill="url(#solderGrad)"
                    stroke="#475569"
                    stroke-width="0.5"
                  />
                {/each}
                <circle
                  cx="120"
                  cy="88"
                  r="6"
                  fill="url(#solderGrad)"
                  stroke="#475569"
                  stroke-width="0.5"
                />
                <circle
                  cx="120"
                  cy="88"
                  r="9.5"
                  fill="none"
                  stroke={UART_SPOT_COLOR.gnd}
                  stroke-width="1.8"
                />
                <circle
                  cx="205"
                  cy="88"
                  r="6"
                  fill="url(#solderGrad)"
                  stroke="#475569"
                  stroke-width="0.5"
                />
                <circle
                  cx="205"
                  cy="88"
                  r="9.5"
                  fill="none"
                  stroke={UART_SPOT_COLOR.tx}
                  stroke-width="1.8"
                />
                <circle
                  cx="205"
                  cy="124"
                  r="6"
                  fill="url(#solderGrad)"
                  stroke="#475569"
                  stroke-width="0.5"
                />
                <circle
                  cx="205"
                  cy="124"
                  r="9.5"
                  fill="none"
                  stroke={UART_SPOT_COLOR.rx}
                  stroke-width="1.8"
                />
                <text x="106" y="91" text-anchor="end" class="pin" fill={UART_SPOT_COLOR.gnd}
                  >GND</text
                >
                <text x="205" y="70" text-anchor="middle" class="pin" fill={UART_SPOT_COLOR.tx}
                  >TX → RX CH341</text
                >
                <text x="205" y="148" text-anchor="middle" class="pin" fill={UART_SPOT_COLOR.rx}
                  >RX → TX CH341</text
                >
              </svg>
            </div>

            <!-- EDM-04x+: pads at the board edge near the antenna area -->
            <div>
              <p class="text-xs font-medium text-gray-400 mb-1">{$LL.hwGuide.uart.spot04x()}</p>
              <svg
                viewBox="0 0 360 205"
                class="w-full max-w-md shrink-0"
                role="img"
                aria-label="PS5 EDM-04x UART pads"
              >
                <!-- dark backdrop = outside the board (corner shot) -->
                <rect x="0" y="0" width="360" height="205" fill="#0a0a0c" />
                <path
                  d="M 14 199 L 14 118 Q 14 46 86 30 L 148 22 L 354 22 L 354 199 Z"
                  fill="url(#uartPcbGrad)"
                  stroke="#065f46"
                  stroke-width="1.2"
                />
                <!-- shield corner + screw hole (top right) -->
                <rect
                  x="286"
                  y="22"
                  width="68"
                  height="56"
                  fill="#4b5563"
                  opacity="0.55"
                  stroke="#6b7280"
                  stroke-width="1"
                />
                <circle
                  cx="252"
                  cy="52"
                  r="14"
                  fill="#9ca3af"
                  stroke="#e5e7eb"
                  stroke-width="1.5"
                />
                <circle cx="252" cy="52" r="5" fill="#0a0a0c" />
                <!-- antenna pigtails with U.FL connectors -->
                <g fill="none" stroke-width="3">
                  <path d="M 300 132 C 318 108, 334 84, 350 44" stroke="#60a5fa" />
                  <path d="M 322 152 C 338 136, 348 118, 356 96" stroke="#d1d5db" />
                </g>
                <circle cx="300" cy="132" r="6" fill="#b45309" stroke="#fbbf24" stroke-width="1" />
                <circle cx="322" cy="152" r="6" fill="#b45309" stroke="#fbbf24" stroke-width="1" />
                <text x="232" y="164" class="lbl" fill="#9ca3af">SW</text>
                <!-- decorative traces -->
                <g fill="none" stroke="#0a5c44" stroke-width="1.5">
                  <path d="M 240 88 C 262 88, 276 106, 292 122" />
                  <path d="M 120 124 C 112 142, 110 152, 108 162" />
                </g>
                <!-- pads, photo layout: clean 4x2 grid (row 1 = TX, RX, plain,
                     plain; row 2 = plain, plain, GND, plain) plus 1 small
                     plain pad above — the functionless ones are orientation
                     aids, keep them. -->
                <circle
                  cx="200"
                  cy="46"
                  r="5"
                  fill="url(#solderGrad)"
                  stroke="#475569"
                  stroke-width="0.5"
                />
                {#each [[200, 88], [240, 88], [120, 124], [160, 124], [240, 124]] as const as [px, py] (px + '-' + py)}
                  <circle
                    cx={px}
                    cy={py}
                    r="6"
                    fill="url(#solderGrad)"
                    stroke="#475569"
                    stroke-width="0.5"
                  />
                {/each}
                <circle
                  cx="120"
                  cy="88"
                  r="6"
                  fill="url(#solderGrad)"
                  stroke="#475569"
                  stroke-width="0.5"
                />
                <circle
                  cx="120"
                  cy="88"
                  r="9.5"
                  fill="none"
                  stroke={UART_SPOT_COLOR.tx}
                  stroke-width="1.8"
                />
                <circle
                  cx="160"
                  cy="88"
                  r="6"
                  fill="url(#solderGrad)"
                  stroke="#475569"
                  stroke-width="0.5"
                />
                <circle
                  cx="160"
                  cy="88"
                  r="9.5"
                  fill="none"
                  stroke={UART_SPOT_COLOR.rx}
                  stroke-width="1.8"
                />
                <circle
                  cx="200"
                  cy="124"
                  r="6"
                  fill="url(#solderGrad)"
                  stroke="#475569"
                  stroke-width="0.5"
                />
                <circle
                  cx="200"
                  cy="124"
                  r="9.5"
                  fill="none"
                  stroke={UART_SPOT_COLOR.gnd}
                  stroke-width="1.8"
                />
                <text x="104" y="72" text-anchor="end" class="pin" fill={UART_SPOT_COLOR.tx}
                  >TX → RX CH341</text
                >
                <text x="174" y="72" class="pin" fill={UART_SPOT_COLOR.rx}>RX → TX CH341</text>
                <text x="200" y="148" text-anchor="middle" class="pin" fill={UART_SPOT_COLOR.gnd}
                  >GND</text
                >
              </svg>
            </div>
          </div>
          <p class="mt-1.5 text-gray-500 leading-relaxed">{$LL.hwGuide.uart.padLegend()}</p>
          <p class="mt-1 text-gray-500 leading-relaxed">{$LL.hwGuide.uart.spotsNote()}</p>
        </div>

        <p class="leading-relaxed text-gray-400">{$LL.hwGuide.uart.procedure()}</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .pin {
    font:
      600 8px ui-monospace,
      monospace;
  }
  .lbl {
    font:
      600 8px ui-sans-serif,
      system-ui,
      sans-serif;
  }
  .chip-lbl {
    font:
      500 6px ui-sans-serif,
      system-ui,
      sans-serif;
  }
  .callout {
    font:
      700 9px ui-sans-serif,
      system-ui,
      sans-serif;
  }
</style>
