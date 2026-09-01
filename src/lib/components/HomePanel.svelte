<script lang="ts">
  // Start screen / dashboard — entry point for the application.
  // Shows quick-access cards for each diagnostic tool section.
  import { Cpu, Usb, Archive, Gamepad2, CircuitBoard } from 'lucide-svelte';
  import FixplayIcon from './FixplayIcon.svelte';
  import LL from '$lib/i18n/i18n-svelte';
  import type { TranslationFunctions } from '$lib/i18n/i18n-types';
  import type { LocalizedString } from 'typesafe-i18n';

  type View = 'flash' | 'uart' | 'i2c' | 'archive' | 'controller';

  let { onnavigate }: { onnavigate: (v: View) => void } = $props();

  // Labels reuse the nav keys (same wording as the sidebar); descriptions are
  // home-specific. Both are typed accessors so renames surface as compile errors.
  const cards: {
    id: View;
    label: (ll: TranslationFunctions) => LocalizedString;
    desc: (ll: TranslationFunctions) => LocalizedString;
    icon: typeof Cpu;
    color: string;
  }[] = [
    {
      id: 'flash',
      label: (ll) => ll.nav.flash(),
      desc: (ll) => ll.home.flashDesc(),
      icon: Cpu,
      color: 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20',
    },
    {
      id: 'uart',
      label: (ll) => ll.nav.uart(),
      desc: (ll) => ll.home.uartDesc(),
      icon: Usb,
      color: 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20',
    },
    {
      id: 'i2c',
      label: (ll) => ll.nav.i2c(),
      desc: (ll) => ll.home.i2cDesc(),
      icon: CircuitBoard,
      color: 'bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20',
    },
    {
      id: 'controller',
      label: (ll) => ll.nav.controller(),
      desc: (ll) => ll.home.controllerDesc(),
      icon: Gamepad2,
      color: 'bg-teal-500/10 border-teal-500/30 text-teal-400 hover:bg-teal-500/20',
    },
    {
      id: 'archive',
      label: (ll) => ll.nav.archive(),
      desc: (ll) => ll.home.archiveDesc(),
      icon: Archive,
      color: 'bg-gray-500/10 border-gray-500/30 text-gray-400 hover:bg-gray-500/20',
    },
  ];
</script>

<div class="flex h-full flex-col items-center justify-center p-8">
  <!-- Logo + title -->
  <div class="mb-12 flex flex-col items-center gap-4">
    <FixplayIcon class="w-32 h-32" />
    <h1 class="text-3xl font-bold text-gray-100">fixplay diagnoseTool</h1>
    <p class="text-base text-gray-500">{$LL.home.subtitle()}</p>
  </div>

  <!-- Tool cards grid -->
  <div class="grid w-full max-w-3xl gap-4 sm:grid-cols-2 auto-rows-fr">
    {#each cards as card (card.id)}
      <button
        onclick={() => onnavigate(card.id)}
        class="flex items-start gap-5 rounded-xl border p-6 text-left transition-colors h-full {card.color}"
      >
        <div class="mt-0.5 shrink-0">
          <card.icon class="h-8 w-8" />
        </div>
        <div>
          <div class="text-base font-semibold">{card.label($LL)}</div>
          <div class="mt-1 text-sm opacity-70">{card.desc($LL)}</div>
        </div>
      </button>
    {/each}
  </div>

  <!-- Footer hint -->
  <p class="mt-10 text-sm text-gray-700">
    {$LL.home.footerHint()}
  </p>
</div>
