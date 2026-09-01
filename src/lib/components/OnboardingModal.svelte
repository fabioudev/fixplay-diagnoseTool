<script lang="ts">
  // First-run overlay shown once per install (guarded by a localStorage flag).
  // Gives a 30-second tour of the four tools so a new user knows what's where
  // without reading the wiki. Re-openable from the About dialog via `open`.
  import { Cpu, Usb, CircuitBoard, Gamepad2, ArrowRight } from 'lucide-svelte';
  import { trapFocus } from '$lib/utils/focusTrap';
  import { fade, scale } from 'svelte/transition';
  import { completeOnboarding } from '$lib/stores/app';
  import LL from '$lib/i18n/i18n-svelte';
  import type { TranslationFunctions } from '$lib/i18n/i18n-types';
  import type { LocalizedString } from 'typesafe-i18n';

  let { open = $bindable(false) }: { open: boolean } = $props();

  const STORAGE_KEY = 'fixplay-onboarding-done';

  const tools: {
    icon: typeof Cpu;
    title: string;
    desc: (ll: TranslationFunctions) => LocalizedString;
  }[] = [
    { icon: Cpu, title: 'NOR Flash', desc: (ll) => ll.onboarding.toolFlashDesc() },
    { icon: Usb, title: 'UART', desc: (ll) => ll.onboarding.toolUartDesc() },
    { icon: CircuitBoard, title: 'I2C / Pico', desc: (ll) => ll.onboarding.toolI2cDesc() },
    { icon: Gamepad2, title: 'Controller', desc: (ll) => ll.onboarding.toolControllerDesc() },
  ];

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignored */
    }
    completeOnboarding();
    open = false;
  }

  function skip() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignored */
    }
    completeOnboarding();
    open = false;
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (open && e.key === 'Escape') dismiss();
  }}
/>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    transition:fade={{ duration: 150 }}
  >
    <div
      class="w-full max-w-md rounded-2xl bg-gray-800 p-6 shadow-2xl border border-gray-700"
      use:trapFocus
      transition:scale={{ duration: 150, start: 0.96 }}
    >
      <h2 class="text-lg font-semibold text-gray-100">{$LL.onboarding.title()}</h2>
      <p class="mt-1 text-sm text-gray-400">
        {$LL.onboarding.intro()}
      </p>

      <div class="mt-4 flex flex-col gap-3">
        {#each tools as t (t.title)}
          <div class="flex items-start gap-3">
            <div class="shrink-0 rounded-lg bg-gray-700 p-2">
              <t.icon class="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <p class="text-sm font-medium text-gray-200">{t.title}</p>
              <p class="text-xs text-gray-500">{t.desc($LL)}</p>
            </div>
          </div>
        {/each}
      </div>

      <p class="mt-4 text-xs text-gray-600">
        {$LL.onboarding.shortcutPrefix()} <kbd class="px-1 rounded bg-gray-700">Ctrl</kbd>+<kbd
          class="px-1 rounded bg-gray-700">1</kbd
        >–<kbd class="px-1 rounded bg-gray-700">6</kbd>. {$LL.onboarding.shortcutSuffix()}
      </p>

      <div class="mt-5 flex justify-between items-center gap-2">
        <button class="text-xs text-gray-500 hover:text-gray-300" onclick={skip}
          >{$LL.onboarding.skip()}</button
        >
        <button
          class="flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 px-4 py-2 text-sm text-white"
          onclick={dismiss}
        >
          {$LL.onboarding.start()}
          <ArrowRight class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
{/if}
