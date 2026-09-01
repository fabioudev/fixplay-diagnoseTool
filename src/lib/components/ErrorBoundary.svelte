<script lang="ts">
  // Wraps a panel so a render crash in one panel doesn't whitescreen the
  // entire app. Uses a remount-on-error strategy: when the window error
  // handler fires, we show a fallback with a retry button that remounts
  // the child content via a fresh key.
  import { AlertTriangle, RefreshCw } from 'lucide-svelte';
  import { get } from 'svelte/store';
  import type { Snippet } from 'svelte';
  import LL from '$lib/i18n/i18n-svelte';

  let { panel = 'Panel', children }: { panel?: string; children?: Snippet } = $props();

  let error = $state<string | null>(null);
  let key = $state(0);

  function onWindowError(e: Event) {
    const msg = e instanceof ErrorEvent ? e.message : get(LL).common.unknownError();
    error = msg;
  }

  function retry() {
    error = null;
    key++;
  }
</script>

<svelte:window onerror={onWindowError} />

{#if error}
  <div class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
    <AlertTriangle class="h-10 w-10 text-amber-400" />
    <p class="text-sm font-medium text-gray-300">{$LL.common.renderError({ panel })}</p>
    <p class="text-xs text-gray-500 max-w-md">{error}</p>
    <button
      class="flex items-center gap-1.5 rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-600"
      onclick={retry}><RefreshCw class="h-4 w-4" /> {$LL.common.reload()}</button
    >
  </div>
{:else}
  {#key key}
    {@render children?.()}
  {/key}
{/if}
