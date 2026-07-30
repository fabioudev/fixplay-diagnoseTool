<script lang="ts">
  import { Download, X } from 'lucide-svelte';
  import {
    updateAvailable, updateBusy, updateProgress, updateError,
    updateChannel, updateDismissed, installUpdate,
  } from '$lib/stores/updater';
  import LL from '$lib/i18n/i18n-svelte';

  let { onCheck }: { onCheck?: () => void } = $props();

  // A package-manager-managed install must not self-update — the binary is
  // owned by pacman. In that case we only inform and point to the AUR helper.
  let managed = $derived($updateChannel?.managed ?? false);
  let hint    = $derived($updateChannel?.hint ?? '');
</script>

{#if $updateAvailable && !$updateDismissed}
  <div class="flex items-center gap-3 px-4 py-2 bg-emerald-950/70 border-b border-emerald-700/50 text-emerald-100 text-xs">
    <Download class="w-4 h-4 shrink-0 text-emerald-300" />

    <div class="flex-1 min-w-0">
      <span class="font-medium">{$LL.update.available({ version: $updateAvailable.version })}</span>
      <span class="text-emerald-300/70">{$LL.update.currentSuffix({ current: $updateAvailable.currentVersion })}</span>
      {#if $updateError}
        <span class="text-red-300 ml-2">⚠ {$updateError}</span>
      {/if}
    </div>

    {#if $updateProgress !== null}
      <div class="w-40 h-1.5 rounded-full bg-emerald-900 overflow-hidden shrink-0">
        <div class="h-full bg-emerald-400 transition-all" style="width: {Math.round($updateProgress * 100)}%"></div>
      </div>
    {/if}

    {#if managed}
      <span class="text-emerald-200/90 hidden sm:inline">{$LL.update.managedHint({ hint: hint || $LL.update.packageManager() })}</span>
      <a
        href="https://github.com/fabioudev/fixplay-diagnoseTool/releases"
        target="_blank" rel="noopener"
        class="px-2.5 py-1 rounded-md bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 transition-colors shrink-0"
      >{$LL.update.releases()}</a>
    {:else}
      <a
        href="https://github.com/fabioudev/fixplay-diagnoseTool/releases/tag/v{$updateAvailable.version}"
        target="_blank" rel="noopener"
        class="text-emerald-300/80 hover:text-emerald-200 underline shrink-0 hidden sm:inline"
      >{$LL.update.whatsNew()}</a>
      <button
        onclick={() => installUpdate()}
        disabled={$updateBusy}
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors shrink-0"
      >
        {$updateBusy ? $LL.update.downloading() : $LL.update.install()}
      </button>
    {/if}

    <button
      onclick={() => {
        const expiry = Date.now() + 24 * 60 * 60 * 1000;
        try { localStorage.setItem('fixplay-update-remind', String(expiry)); } catch { /* ignored */ }
        updateDismissed.set(true);
      }}
      class="text-emerald-300/70 hover:text-emerald-100 px-2 py-1 rounded shrink-0 text-xs"
      title={$LL.update.laterTitle()}
    >{$LL.update.later()}</button>
    <button
      onclick={() => updateDismissed.set(true)}
      class="text-emerald-300/70 hover:text-emerald-100 p-1 rounded shrink-0"
      title={$LL.update.closeTitle()}
      aria-label={$LL.update.closeAria()}
    >
      <X class="w-4 h-4" />
    </button>
  </div>
{:else if $updateError && onCheck}
  <!-- Manual check failed — surface a slim retry affordance only when wired. -->
  <div class="flex items-center gap-3 px-4 py-1.5 bg-red-950/60 border-b border-red-800/50 text-red-200 text-xs">
    <span class="flex-1">{$LL.update.checkFailed({ error: $updateError })}</span>
    <button onclick={onCheck} class="px-2 py-0.5 rounded bg-red-700/50 hover:bg-red-700 transition-colors">{$LL.update.retry()}</button>
  </div>
{/if}