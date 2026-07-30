<script lang="ts" module>
  // Language-neutral technical tokens (per i18n convention: protocol/pin names
  // stay literal across locales). Only surrounding prose is localized.
  export type HardwareGuideVariant = 'ch341a' | 'uart';

  /** Standard 25-series 8-pin SPI NOR pinout (W25Q / MX25L / EN25Q …). */
  export const SPI_PINS: { n: number; name: string; desc: string }[] = [
    { n: 1, name: '#CS',   desc: 'Chip Select' },
    { n: 2, name: 'DO',    desc: 'MISO' },
    { n: 3, name: '#WP',   desc: 'Write Protect' },
    { n: 4, name: 'GND',   desc: 'Ground' },
    { n: 5, name: 'DI',    desc: 'MOSI' },
    { n: 6, name: 'CLK',   desc: 'Serial Clock' },
    { n: 7, name: '#HOLD', desc: 'Hold' },
    { n: 8, name: 'VCC',   desc: '+3.3 V' },
  ];

  /** PS5 EMC UART pads on the EDM-010 24-pin service header. */
  export const UART_PADS: { n: number; name: string; desc: string }[] = [
    { n: 4, name: 'GND',  desc: 'Ground' },
    { n: 6, name: 'RX',   desc: 'EMC RX' },
    { n: 7, name: 'TX',   desc: 'EMC TX' },
    { n: 8, name: '3V3',  desc: '+3.3 V' },
  ];
</script>

<script lang="ts">
  import { ChevronDown, AlertTriangle, ExternalLink, Cable } from 'lucide-svelte';
  import { slide } from 'svelte/transition';
  import LL from '$lib/i18n/i18n-svelte';

  let { variant }: { variant: HardwareGuideVariant } = $props();

  let open = $state(false);

  // SOIC-8 pin layout: pins 1-4 down the left, 5-8 up the right (pin 1 top-left).
  const LEFT = SPI_PINS.slice(0, 4);
  const RIGHT = [...SPI_PINS.slice(4)].reverse(); // 8,7,6,5 top-to-bottom on the right
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
    <div class="px-3 pb-3 pt-1 space-y-3 text-xs text-gray-300" transition:slide={{ duration: 150 }}>

      {#if variant === 'ch341a'}
        <!-- 5V danger callout -->
        <div class="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-1">
          <p class="font-semibold text-amber-300 flex items-center gap-1.5">
            <AlertTriangle class="h-3.5 w-3.5" />{$LL.hwGuide.ch341a.danger()}
          </p>
          <p class="leading-relaxed">{$LL.hwGuide.ch341a.dangerText()}</p>
        </div>

        <!-- 8-pin SPI NOR pinout -->
        <div>
          <p class="font-semibold text-gray-200 mb-1.5">{$LL.hwGuide.ch341a.pinout8()}</p>
          <div class="flex flex-wrap items-start gap-4">
            <!-- SOIC-8 diagram -->
            <svg viewBox="0 0 160 120" class="w-40 shrink-0" role="img" aria-label="SOIC-8 SPI NOR pinout">
              <!-- body -->
              <rect x="40" y="14" width="80" height="92" rx="4" fill="#1f2937" stroke="#4b5563" stroke-width="1.5" />
              <!-- pin 1 dot -->
              <circle cx="50" cy="24" r="2.5" fill="#6b7280" />
              <!-- left pins 1..4 -->
              {#each LEFT as p (p.n)}
                <rect x="28" y={22 + (p.n - 1) * 22} width="14" height="6" rx="1" fill="#6b7280" />
                <text x="24" y={28 + (p.n - 1) * 22} text-anchor="end" class="pin" fill="#9ca3af">{p.n}</text>
                <text x="48" y={28 + (p.n - 1) * 22} class="pin" fill="#e5e7eb">{p.name}</text>
              {/each}
              <!-- right pins 8..5 -->
              {#each RIGHT as p, i (p.n)}
                <rect x="118" y={22 + i * 22} width="14" height="6" rx="1" fill="#6b7280" />
                <text x="136" y={28 + i * 22} class="pin" fill="#9ca3af">{p.n}</text>
                <text x="114" y={28 + i * 22} text-anchor="end" class="pin" fill="#e5e7eb">{p.name}</text>
              {/each}
            </svg>
            <!-- pin table -->
            <table class="text-[11px] border-collapse">
              <tbody>
                {#each SPI_PINS as p (p.n)}
                  <tr>
                    <td class="pr-2 py-0.5 text-gray-500 font-mono">{p.n}</td>
                    <td class="pr-2 py-0.5 font-mono text-teal-300">{p.name}</td>
                    <td class="py-0.5 text-gray-400">{p.desc}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <p class="mt-1.5 text-gray-500 leading-relaxed">{$LL.hwGuide.ch341a.socketNote()}</p>
        </div>

        <!-- Jumpers -->
        <div>
          <p class="font-semibold text-gray-200 mb-1">{$LL.hwGuide.ch341a.jumpers()}</p>
          <ul class="list-disc pl-4 space-y-0.5 text-gray-400">
            <li>{$LL.hwGuide.ch341a.jumperMode()}</li>
            <li>{$LL.hwGuide.ch341a.jumperAct()}</li>
            <li>{$LL.hwGuide.ch341a.jumperVolt()}</li>
          </ul>
        </div>

        <!-- 3.3V fix -->
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
              <!-- PS5 box -->
              <rect x="6" y="14" width="60" height="62" rx="4" fill="#1f2937" stroke="#4b5563" stroke-width="1.2" />
              <text x="36" y="10" text-anchor="middle" class="lbl" fill="#9ca3af">PS5</text>
              <text x="66" y="30" text-anchor="end" class="pin" fill="#e5e7eb">TX</text>
              <text x="66" y="50" text-anchor="end" class="pin" fill="#e5e7eb">RX</text>
              <text x="66" y="70" text-anchor="end" class="pin" fill="#e5e7eb">GND</text>
              <!-- adapter box -->
              <rect x="154" y="14" width="60" height="62" rx="4" fill="#1f2937" stroke="#4b5563" stroke-width="1.2" />
              <text x="184" y="10" text-anchor="middle" class="lbl" fill="#9ca3af">Adapter</text>
              <text x="158" y="30" class="pin" fill="#e5e7eb">RX</text>
              <text x="158" y="50" class="pin" fill="#e5e7eb">TX</text>
              <text x="158" y="70" class="pin" fill="#e5e7eb">GND</text>
              <!-- crossed wires: TX->RX (top), RX->TX (mid), GND straight -->
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
</style>