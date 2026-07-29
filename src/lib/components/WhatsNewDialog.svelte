<script lang="ts">
  // Shown once when the running version differs from the last one the user saw
  // (tracked in localStorage). Points to the release notes rather than inline
  // changelog text, so it never goes stale.
  import { ExternalLink, Sparkles } from 'lucide-svelte';
  import { trapFocus } from '$lib/utils/focusTrap';
  import { fade, scale } from 'svelte/transition';
  import { currentVersion } from '$lib/stores/updater';

  let { open = $bindable(false) }: { open: boolean } = $props();
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') open = false; }} />

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" transition:fade={{ duration: 150 }}>
    <div class="w-full max-w-sm rounded-2xl bg-gray-800 p-6 shadow-2xl border border-gray-700 text-center" use:trapFocus transition:scale={{ duration: 150, start: 0.96 }}>
      <Sparkles class="h-8 w-8 mx-auto text-teal-400" />
      <h2 class="mt-2 text-lg font-semibold text-gray-100">Update auf v{$currentVersion}</h2>
      <p class="mt-1 text-sm text-gray-400">
        fixplay diagnoseTool wurde aktualisiert. Lies, was neu ist:
      </p>
      <a
        href="https://github.com/fabioudev/fixplay-diagnoseTool/releases/tag/v{$currentVersion}"
        target="_blank" rel="noopener"
        class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 px-4 py-2 text-sm text-gray-200 transition-colors"
      >
        <ExternalLink class="h-4 w-4" /> Release-Notes öffnen
      </a>
      <div class="mt-4">
        <button
          class="rounded-lg bg-teal-600 hover:bg-teal-700 px-6 py-2 text-sm text-white transition-colors"
          onclick={() => (open = false)}
        >
          Weiter
        </button>
      </div>
    </div>
  </div>
{/if}