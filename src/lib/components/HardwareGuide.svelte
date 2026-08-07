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
   * How the CH341A ZIF socket wires an 8-pin 25-series chip (flashrom
   * reference): the socket ties #WP (pin 3) and #HOLD (pin 7) hard to VCC,
   * so write-protect and hold are inactive when reading via the socket.
   */
  export const ZIF_WIRING: { n: number; name: string; sig: string; note: string }[] = [
    { n: 1, name: '#CS', sig: 'CS0', note: '' },
    { n: 2, name: 'DO', sig: 'MISO', note: '' },
    { n: 3, name: '#WP', sig: 'VCC', note: 'tied high → WP inactive' },
    { n: 4, name: 'GND', sig: 'GND', note: '' },
    { n: 5, name: 'DI', sig: 'MOSI', note: '' },
    { n: 6, name: 'CLK', sig: 'SCK', note: '' },
    { n: 7, name: '#HOLD', sig: 'VCC', note: 'tied high → HOLD inactive' },
    { n: 8, name: 'VCC', sig: 'VCC', note: '3.3 V (AMS1117)' },
  ];

  /** PS5 EMC UART pads on the EDM-010 24-pin service header. */
  export const UART_PADS: { n: number; name: string; desc: string }[] = [
    { n: 4, name: 'GND', desc: 'Ground' },
    { n: 6, name: 'RX', desc: 'EMC RX' },
    { n: 7, name: 'TX', desc: 'EMC TX' },
    { n: 8, name: '3V3', desc: '+3.3 V' },
  ];

  // Numbered callouts on the CH341A board top-view (match the legend below).
  // Positions chosen so each circle sits on/clearly beside its target without
  // overlapping silkscreen text (verified via render check).
  export const BOARD_CALLOUTS: { n: number; x: number; y: number }[] = [
    { n: 1, x: 14, y: 99 },   // USB (centered on the metal shell)
    { n: 2, x: 170, y: 22 },  // ZIF lever (above the handle so it stays visible)
    { n: 3, x: 92, y: 52 },   // ZIF socket (top-left corner)
    { n: 4, x: 46, y: 122 },  // CH341A IC (above its silkscreen label)
    { n: 5, x: 46, y: 98 },   // AMS1117 regulator (covers the tiny body)
    { n: 6, x: 73, y: 144 },  // 12 MHz crystal (above body so the 12M label stays visible)
    { n: 7, x: 30, y: 166 },  // power LED
    { n: 8, x: 202, y: 176 }, // ACT# jumper
    { n: 9, x: 160, y: 176 }, // SPI/I2C mode jumper
    { n: 10, x: 276, y: 60 }, // side header
    { n: 11, x: 135, y: 130 },// 8-pin NOR chip (upper-left of body, clear of label)
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
            <svg viewBox="0 0 340 210" class="w-full max-w-md shrink-0" role="img" aria-label="CH341A board top view">
            <defs>
              <!-- Lever Gradient: top-light, bottom-dark -->
              <linearGradient id="leverGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#f3f4f6" />
                <stop offset="100%" stop-color="#9ca3af" />
              </linearGradient>

              <!-- IC Body Gradient: matte charcoal 3D effect -->
              <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#374151" />
                <stop offset="100%" stop-color="#111827" />
              </linearGradient>

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

            <!-- PCB outline: #0b0f1a board with subtle inner glow -->
            <rect x="18" y="26" width="304" height="158" rx="7" fill="#0b0f1a" stroke="#1e293b" stroke-width="1" />

            <!-- USB-A male connector: Silver-grey metallic finish -->
            <rect x="6" y="86" width="16" height="26" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1" />
            <rect x="9" y="91" width="10" height="16" fill="#475569" />

            <!-- 24-pin ZIF socket: Deep Forest Green #14532d -->
            <rect x="96" y="44" width="150" height="120" rx="3" fill="#14532d" stroke="#166534" stroke-width="1.5" />

            <!-- ZIF lever: realistic pull-handle with gradient and shadow -->
            <g filter="url(#shadowFilter)">
              <rect x="110" y="36" width="120" height="7" rx="2" fill="url(#leverGrad)" stroke="#6b7280" stroke-width="0.5" />
              <rect x="158" y="32" width="24" height="13" rx="3" fill="url(#leverGrad)" stroke="#6b7280" stroke-width="0.5" />
            </g>

            <!-- ZIF pin holes -->
            {#each Array(12) as _, row (row)}
              {#each [110, 232] as cx (cx)}
                <circle cx={cx} cy={58 + row * 8.2} r="1.8" fill="#064e3b" stroke="#14532d" stroke-width="0.6" />
              {/each}
            {/each}

            <!-- 8-pin NOR chip -->
            <rect x="120" y="118" width="102" height="34" rx="2" fill="#111827" stroke="#374151" stroke-width="1" />
            <circle cx="128" cy="125" r="1.8" fill="#9ca3af" />
            <text x="171" y="148" text-anchor="middle" class="chip-lbl" fill="#9ca3af">25-series NOR</text>
            {#each [0, 1, 2, 3] as i (i)}
              <rect x="113" y={122 + i * 8} width="7" height="4" rx="0.5" fill="#4b5563" />
              <rect x="222" y={122 + i * 8} width="7" height="4" rx="0.5" fill="#4b5563" />
            {/each}

            <!-- CH341A IC: Matte charcoal with 3D-block highlights -->
            <rect x="34" y="116" width="22" height="48" rx="1" fill="#111827" stroke="#374151" stroke-width="1" />
            <rect x="34" y="116" width="22" height="1" fill="#4b5563" /> <!-- Top edge highlight -->
            <rect x="34" y="116" width="1" height="48" fill="#4b5563" /> <!-- Left edge highlight -->
            <circle cx="38" cy="122" r="1.4" fill="#9ca3af" />
            <text x="45" y="144" text-anchor="middle" class="chip-lbl" fill="#9ca3af">CH341A</text>

            <!-- AMS1117 Regulator: Matte charcoal with highlights -->
            <rect x="34" y="92" width="22" height="12" rx="1" fill="#111827" stroke="#374151" stroke-width="1" />
            <rect x="34" y="92" width="22" height="1" fill="#4b5563" /> <!-- Top edge highlight -->
            <rect x="34" y="92" width="1" height="12" fill="#4b5563" /> <!-- Left edge highlight -->

            <!-- 12 MHz crystal: Metallic cylinder -->
            <rect x="60" y="150" width="26" height="11" rx="5" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1" />
            <text x="73" y="158" text-anchor="middle" class="chip-lbl" fill="#374151">12M</text>

            <!-- Power LED: Bright green with glow -->
            <circle cx="40" cy="164" r="2.6" fill="#4ade80" stroke="#16a34a" stroke-width="0.6" filter="url(#glowFilter)" />

            <!-- Jumpers -->
            <rect x="188" y="170" width="5" height="5" fill="#4b5563" />
            <rect x="196" y="170" width="5" height="5" fill="#4b5563" />
            <rect x="187" y="169" width="15" height="7" fill="#fbbf24" stroke="#f59e0b" stroke-width="0.8" />

            <rect x="146" y="170" width="5" height="5" fill="#4b5563" />
            <rect x="154" y="170" width="5" height="5" fill="#4b5563" />
            <rect x="145" y="169" width="15" height="7" fill="#fbbf24" stroke="#f59e0b" stroke-width="0.8" />

            <!-- Side headers -->
            {#each Array(7) as _, i (i)}
              <rect x="80" y={60 + i * 12} width="6" height="4" rx="0.5" fill="#4b5563" />
              <rect x="258" y={60 + i * 12} width="6" height="4" rx="0.5" fill="#4b5563" />
            {/each}

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
              <li><span class="font-mono text-gray-200">Power-LED</span> — {$LL.hwGuide.ch341a.legLed()}</li>
              <li><span class="font-mono text-gray-200">ACT#-Jumper</span> — {$LL.hwGuide.ch341a.legAct()}</li>
              <li><span class="font-mono text-gray-200">SPI/I2C-Jumper</span> — {$LL.hwGuide.ch341a.legMode()}</li>
              <li><span class="font-mono text-gray-200">Seiten-Header</span> — {$LL.hwGuide.ch341a.legHeader()}</li>
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
              </defs>
              <!-- Chip body with 3D effect -->
              <rect x="40" y="14" width="80" height="100" rx="3" fill="url(#bodyGrad)" stroke="#4b5563" stroke-width="1" filter="url(#chipShadow)" />
              <circle cx="50" cy="24" r="2.5" fill="#6b7280" />
              <text x="80" y="68" text-anchor="middle" class="chip-lbl" fill="#9ca3af">25-series</text>
              {#each L8 as p (p.n)}
                <g>
                  <rect x="28" y={20 + (p.n - 1) * 22} width="14" height="6" rx="1" fill="#6b7280" stroke="#374151" stroke-width="0.5" />
                  <text x="24" y={26 + (p.n - 1) * 22} text-anchor="end" class="pin" fill="#9ca3af">{p.n}</text>
                  <text x="48" y={26 + (p.n - 1) * 22} class="pin" fill="#e5e7eb">{p.name}</text>
                </g>
              {/each}
              {#each R8 as p, i (p.n)}
                <g>
                  <rect x="118" y={20 + i * 22} width="14" height="6" rx="1" fill="#6b7280" stroke="#374151" stroke-width="0.5" />
                  <text x="136" y={26 + i * 22} class="pin" fill="#9ca3af">{p.n}</text>
                  <text x="114" y={26 + i * 22} text-anchor="end" class="pin" fill="#e5e7eb">{p.name}</text>
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
              <rect x="40" y="14" width="80" height="180" rx="3" fill="url(#bodyGrad)" stroke="#4b5563" stroke-width="1" filter="url(#chipShadow)" />
              <circle cx="50" cy="24" r="2.5" fill="#6b7280" />
              <text x="80" y="108" text-anchor="middle" class="chip-lbl" fill="#9ca3af">25-series 16P</text>
              {#each L16 as p (p.n)}
                <g>
                  <rect x="28" y={20 + (p.n - 1) * 20} width="14" height="5" rx="1" fill="#6b7280" stroke="#374151" stroke-width="0.5" />
                  <text x="24" y={25 + (p.n - 1) * 20} text-anchor="end" class="pin" fill="#9ca3af">{p.n}</text>
                  <text x="48" y={25 + (p.n - 1) * 20} class="pin" fill="#e5e7eb">{p.name}</text>
                </g>
              {/each}
              {#each R16 as p, i (p.n)}
                <g>
                  <rect x="118" y={20 + i * 20} width="14" height="5" rx="1" fill="#6b7280" stroke="#374151" stroke-width="0.5" />
                  <text x="136" y={25 + i * 20} class="pin" fill="#9ca3af">{p.n}</text>
                  <text x="114" y={25 + i * 20} text-anchor="end" class="pin" fill="#e5e7eb">{p.name}</text>
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
                <th class="text-left font-medium py-1 px-2 rounded-tr-sm border-b border-gray-700/50">ZIF / CH341A</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-700/30">
              {#each ZIF_WIRING as row (row.n)}
                <tr class="hover:bg-gray-700/20 transition-colors">
                  <td class="py-1 px-2 font-mono text-teal-300">{row.n} {row.name}</td>
                  <td class="py-1 px-2 font-mono text-gray-200">{row.sig}</td>
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
            <li>{$LL.hwGuide.ch341a.jumperMode()} <span class="text-gray-500">(⑨)</span></li>
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
            <svg viewBox="0 0 220 90" class="w-56 shrink-0" role="img" aria-label="PS5 UART wiring">
              <rect x="6" y="14" width="60" height="62" rx="4" fill="#1f2937" stroke="#4b5563" stroke-width="1.2" />
              <text x="36" y="10" text-anchor="middle" class="lbl" fill="#9ca3af">PS5</text>
              <text x="66" y="30" text-anchor="end" class="pin" fill="#e5e7eb">TX</text>
              <text x="66" y="50" text-anchor="end" class="pin" fill="#e5e7eb">RX</text>
              <text x="66" y="70" text-anchor="end" class="pin" fill="#e5e7eb">GND</text>
              <rect x="154" y="14" width="60" height="62" rx="4" fill="#1f2937" stroke="#4b5563" stroke-width="1.2" />
              <text x="184" y="10" text-anchor="middle" class="lbl" fill="#9ca3af">Adapter</text>
              <text x="158" y="30" class="pin" fill="#e5e7eb">RX</text>
              <text x="158" y="50" class="pin" fill="#e5e7eb">TX</text>
              <text x="158" y="70" class="pin" fill="#e5e7eb">GND</text>
              <path d="M70 27 C 110 27, 120 27, 150 27" stroke="#5eecd9" stroke-width="1.4" fill="none" />
              <path d="M70 47 C 110 47, 120 47, 150 47" stroke="#5eecd9" stroke-width="1.4" fill="none" />
              <path d="M70 67 L 150 67" stroke="#6b7280" stroke-width="1.4" fill="none" />
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