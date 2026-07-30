<script lang="ts">
  import { onMount } from 'svelte';
  import { open as openDialog } from '@tauri-apps/plugin-dialog';
  import { appSettings } from '$lib/stores/settings';
  import { settingsGet, settingsSave, flashGetBinaryStatus, appDataDirPath, openPath } from '$lib/api/tauri';
  import type { FlashBinaryStatus } from '$lib/api/types';
  import { checkUpdates, updateAvailable, updateError } from '$lib/stores/updater';
  import { CheckCircle2, XCircle, RefreshCw, RotateCcw, FolderOpen } from 'lucide-svelte';
  import { get } from 'svelte/store';
  import LL from '$lib/i18n/i18n-svelte';

  let { open, onclose }: { open: boolean; onclose: () => void } = $props();

  const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400];

  let flashromStatus = $state<FlashBinaryStatus | null>(null);
  let updateChecking = $state(false);
  let updateCheckMsg = $state<string | null>(null);
  // Drives the colour of updateCheckMsg: emerald for available/current, amber for errors.
  let updateCheckOk = $state(false);

  onMount(async () => {
    const s = await settingsGet().catch(() => null);
    if (s) appSettings.set(s);
    flashromStatus = await flashGetBinaryStatus().catch(() => null);
  });

  async function refreshFlashrom() {
    flashromStatus = await flashGetBinaryStatus().catch(() => null);
  }

  async function save() {
    await settingsSave($appSettings).catch(console.error);
    flashromStatus = await flashGetBinaryStatus().catch(() => null);
  }

  async function browseFlashrom() {
    const result = await openDialog({ title: get(LL).settings.flashromBrowseTitle() });
    if (result && typeof result === 'string') {
      appSettings.update(s => ({ ...s, flashrom_path: result }));
      await save();
    }
  }

  async function browseArchiveDir() {
    const result = await openDialog({ title: get(LL).settings.archiveBrowseTitle(), directory: true });
    if (result && typeof result === 'string') {
      appSettings.update(s => ({ ...s, archive_dir: result }));
      await save();
    }
  }

  async function checkForUpdates() {
    updateChecking = true;
    updateCheckMsg = null;
    updateCheckOk = false;
    try {
      await checkUpdates();
      if ($updateAvailable) {
        updateCheckMsg = get(LL).settings.updateAvailableMsg({ version: $updateAvailable.version });
        updateCheckOk = true;
      } else if ($updateError) {
        updateCheckMsg = get(LL).settings.updateCheckFailedMsg({ error: $updateError });
      } else {
        updateCheckMsg = get(LL).settings.updateCurrentMsg();
        updateCheckOk = true;
      }
    } catch (e) {
      updateCheckMsg = get(LL).settings.updateCheckFailedMsg({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      updateChecking = false;
    }
  }

  async function resetSettings() {
    if (!confirm(get(LL).settings.resetConfirm())) return;
    appSettings.set({
      flashrom_path:  null,
      archive_dir:    null,
      baud_rate:      115200,
      i2c_baud_rate:  115200,
      auto_reconnect: false,
      tablet_mode:    false,
    });
    await settingsSave($appSettings).catch(console.error);
    refreshFlashrom();
  }

  async function openConfigDir() {
    const dir = await appDataDirPath().catch(() => null);
    if (dir) openPath(dir).catch(console.error);
  }

  async function openArchiveDir() {
    const dir = $appSettings.archive_dir ?? await appDataDirPath().catch(() => null);
    if (dir) openPath(dir).catch(console.error);
  }
</script>

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/50 z-40"
    role="presentation"
    onclick={onclose}
  ></div>

  <!-- Panel -->
  <div class="fixed top-0 right-0 h-full w-80 bg-gray-900 border-l border-gray-700
              shadow-xl z-50 flex flex-col">
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
      <h2 class="text-sm font-semibold text-gray-100">{$LL.settings.title()}</h2>
      <button
        onclick={onclose}
        title={$LL.settings.closeTitle()}
        class="text-gray-400 hover:text-gray-200 text-lg leading-none"
      >✕</button>
    </div>

    <div class="flex flex-col gap-6 p-4 overflow-y-auto flex-1">

      <!-- Flashrom Binary -->
      <div class="flex flex-col gap-1.5">
        <label for="settings-flashrom" class="text-xs font-medium text-gray-400">
          {$LL.settings.flashromLabel()}
        </label>
        <div class="flex gap-1">
          <input
            id="settings-flashrom"
            type="text"
            placeholder={$LL.settings.flashromPlaceholder()}
            value={$appSettings.flashrom_path ?? ''}
            oninput={(e) => appSettings.update(s => ({ ...s, flashrom_path: (e.target as HTMLInputElement).value || null }))}
            onblur={save}
            title={$LL.settings.flashromTitle()}
            class="flex-1 bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5
                   border border-gray-700 placeholder:text-gray-600
                   focus:outline-none focus:border-gray-500"
          />
          <button
            onclick={browseFlashrom}
            title={$LL.settings.browseFile()}
            class="px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 shrink-0"
          >…</button>
        </div>
        <p class="text-xs text-gray-600">
          {$LL.settings.flashromHint()}
        </p>
        {#if flashromStatus}
          <div class="flex items-center gap-1.5 text-xs {flashromStatus.ok ? 'text-emerald-400' : 'text-amber-400'}" title={flashromStatus.path}>
            {#if flashromStatus.ok}
              <CheckCircle2 class="w-3.5 h-3.5 shrink-0" />
              <span class="truncate">{$LL.settings.flashromFound()}</span>
            {:else}
              <XCircle class="w-3.5 h-3.5 shrink-0" />
              <span class="truncate" title={flashromStatus.reason ?? ''}>{flashromStatus.reason ?? $LL.settings.flashromNotFound()}</span>
            {/if}
            <button onclick={refreshFlashrom} class="ml-auto text-gray-500 hover:text-gray-300 shrink-0" title={$LL.settings.recheck()}>
              <RefreshCw class="w-3 h-3" />
            </button>
          </div>
        {/if}
      </div>

      <!-- Archive Directory -->
      <div class="flex flex-col gap-1.5">
        <label for="settings-archive-dir" class="text-xs font-medium text-gray-400">
          {$LL.settings.archiveLabel()}
        </label>
        <div class="flex gap-1">
          <input
            id="settings-archive-dir"
            type="text"
            placeholder={$LL.settings.archivePlaceholder()}
            value={$appSettings.archive_dir ?? ''}
            oninput={(e) => appSettings.update(s => ({ ...s, archive_dir: (e.target as HTMLInputElement).value || null }))}
            onblur={save}
            title={$LL.settings.archiveTitle()}
            class="flex-1 bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5
                   border border-gray-700 placeholder:text-gray-600
                   focus:outline-none focus:border-gray-500"
          />
          <button
            onclick={browseArchiveDir}
            title={$LL.settings.browseFolder()}
            class="px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 shrink-0"
          >…</button>
        </div>
        <p class="text-xs text-gray-600">
          {$LL.settings.archiveHint()}
        </p>
      </div>

      <!-- UART Baud Rate -->
      <div class="flex flex-col gap-1.5">
        <label for="settings-baud-rate" class="text-xs font-medium text-gray-400">
          {$LL.settings.baudLabel()}
        </label>
        <div class="relative">
          <select
            id="settings-baud-rate"
            value={$appSettings.baud_rate}
            onchange={async (e) => {
              appSettings.update(s => ({ ...s, baud_rate: Number((e.target as HTMLSelectElement).value) }));
              await save();
            }}
            title={$LL.settings.baudTitle()}
            class="appearance-none w-full bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5 pr-6
                   border border-gray-700 focus:outline-none focus:border-gray-500"
          >
            {#each BAUD_RATES as rate (rate)}
              <option value={rate}>{rate}{rate === 115200 ? $LL.settings.baudStandardPs5() : ''}</option>
            {/each}
          </select>
          <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
        </div>
        <p class="text-xs text-gray-600">
          {$LL.settings.baudHint()}
        </p>
      </div>

      <!-- I2C / Pico Baud Rate -->
      <div class="flex flex-col gap-1.5">
        <label for="settings-i2c-baud-rate" class="text-xs font-medium text-gray-400">
          {$LL.settings.i2cBaudLabel()}
        </label>
        <div class="relative">
          <select
            id="settings-i2c-baud-rate"
            value={$appSettings.i2c_baud_rate}
            onchange={async (e) => {
              appSettings.update(s => ({ ...s, i2c_baud_rate: Number((e.target as HTMLSelectElement).value) }));
              await save();
            }}
            title={$LL.settings.i2cBaudTitle()}
            class="appearance-none w-full bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5 pr-6
                   border border-gray-700 focus:outline-none focus:border-gray-500"
          >
            {#each BAUD_RATES as rate (rate)}
              <option value={rate}>{rate}{rate === 115200 ? $LL.settings.baudStandardPico() : ''}</option>
            {/each}
          </select>
          <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
        </div>
        <p class="text-xs text-gray-600">
          {$LL.settings.i2cBaudHint()}
        </p>
      </div>

      <!-- Tablet Mode -->
      <div class="flex flex-col gap-1.5">
        <label class="text-xs font-medium text-gray-400">
          {$LL.settings.tabletLabel()}
        </label>
        <label
          class="flex items-center gap-2.5 cursor-pointer select-none"
          title={$LL.settings.tabletTitle()}
        >
          <input
            type="checkbox"
            checked={$appSettings.tablet_mode}
            onchange={async (e) => {
              appSettings.update(s => ({ ...s, tablet_mode: (e.target as HTMLInputElement).checked }));
              await save();
            }}
            class="accent-blue-500 w-4 h-4"
          />
          <span class="text-xs text-gray-300">{$LL.settings.tabletInline()}</span>
        </label>
        <p class="text-xs text-gray-600">
          {$LL.settings.tabletHint()}
        </p>
      </div>

      <!-- Open folders -->
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-gray-400">{$LL.settings.openFolders()}</span>
        <div class="flex gap-2">
          <button
            onclick={openArchiveDir}
            class="flex items-center gap-1.5 flex-1 px-2.5 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
            title={$LL.settings.archiveBtnTitle()}
          >
            <FolderOpen class="w-3.5 h-3.5" /> {$LL.settings.archiveBtn()}
          </button>
          <button
            onclick={openConfigDir}
            class="flex items-center gap-1.5 flex-1 px-2.5 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
            title={$LL.settings.configBtnTitle()}
          >
            <FolderOpen class="w-3.5 h-3.5" /> {$LL.settings.configBtn()}
          </button>
        </div>
      </div>

      <!-- Updates -->
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-gray-400">{$LL.settings.updates()}</span>
        <button
          onclick={checkForUpdates}
          disabled={updateChecking}
          class="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 transition-colors"
        >
          <RefreshCw class="w-3.5 h-3.5 {updateChecking ? 'animate-spin' : ''}" />
          {updateChecking ? $LL.settings.checking() : $LL.settings.checkBtn()}
        </button>
        {#if updateCheckMsg}
          <p class="text-xs {updateCheckOk ? 'text-emerald-400' : 'text-amber-400'}">
            {updateCheckMsg}
          </p>
        {/if}
        <p class="text-xs text-gray-600">
          {$LL.settings.updateHint()}
        </p>
      </div>

    </div>

    <!-- Footer hint -->
    <div class="px-4 py-3 border-t border-gray-700 flex items-center justify-between gap-2">
      <p class="text-xs text-gray-600">{$LL.settings.autosaveHint()}</p>
      <button
        onclick={resetSettings}
        class="flex items-center gap-1.5 text-xs text-gray-500 hover:text-amber-400 transition-colors"
        title={$LL.settings.resetTitle()}
      >
        <RotateCcw class="w-3.5 h-3.5" /> {$LL.settings.reset()}
      </button>
    </div>
  </div>
{/if}
