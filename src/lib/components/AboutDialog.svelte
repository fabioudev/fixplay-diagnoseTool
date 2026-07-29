<script lang="ts">
  import { X, ExternalLink } from 'lucide-svelte';
  import FixplayIcon from './FixplayIcon.svelte';
  import { currentVersion } from '$lib/stores/updater';
  import { trapFocus } from '$lib/utils/focusTrap';

  let { open = $bindable(false) }: { open: boolean } = $props();
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') open = false; }} />

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div class="w-full max-w-sm rounded-2xl bg-gray-800 p-6 shadow-2xl border border-gray-700 text-center" use:trapFocus>
      <button class="absolute top-3 right-3 text-gray-500 hover:text-gray-300" onclick={() => (open = false)}>
        <X class="h-5 w-5" />
      </button>

      <FixplayIcon class="w-16 h-16 mx-auto mb-3" />
      <h2 class="text-lg font-semibold text-gray-100">fixplay diagnoseTool</h2>
      <p class="text-sm text-gray-400">v{$currentVersion || '0.2.1'}</p>
      <p class="mt-2 text-xs text-gray-500">Cross-platform diagnostic tool for gaming console repair.</p>

      <div class="mt-4 space-y-1 text-xs text-gray-500">
        <p>Built with Tauri v2 + Svelte 5</p>
        <p>flashrom integration for NOR flash</p>
        <p>DualSense HID protocol support</p>
      </div>

      <div class="mt-4 flex justify-center gap-3">
        <a href="https://github.com/fabioudev/fixplay-diagnoseTool" target="_blank" rel="noopener"
           class="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300">
          <ExternalLink class="h-3 w-3" /> GitHub
        </a>
        <a href="https://github.com/fabioudev/fixplay-diagnoseTool/releases" target="_blank" rel="noopener"
           class="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300">
          <ExternalLink class="h-3 w-3" /> Releases
        </a>
        <a href="https://github.com/fabioudev/fixplay-diagnoseTool/wiki" target="_blank" rel="noopener"
           class="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300">
          <ExternalLink class="h-3 w-3" /> Wiki
        </a>
      </div>

      <p class="mt-4 text-[10px] text-gray-700">MIT License — Open Source</p>

      <button class="mt-4 rounded-lg bg-gray-700 px-6 py-2 text-sm text-gray-300 hover:bg-gray-600" onclick={() => (open = false)}>
        Schließen
      </button>
    </div>
  </div>
{/if}
