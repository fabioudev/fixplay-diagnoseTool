<script lang="ts">
  import { onMount } from 'svelte';
  import { open as openDialog } from '@tauri-apps/plugin-dialog';
  import { appSettings } from '$lib/stores/settings';
  import { settingsGet, settingsSave } from '$lib/api/tauri';

  let { open, onclose }: { open: boolean; onclose: () => void } = $props();

  const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400];

  onMount(async () => {
    const s = await settingsGet().catch(() => null);
    if (s) appSettings.set(s);
  });

  async function save() {
    await settingsSave($appSettings).catch(console.error);
  }

  async function browseFlashrom() {
    const result = await openDialog({ title: 'Flashrom Binary wählen' });
    if (result && typeof result === 'string') {
      appSettings.update(s => ({ ...s, flashrom_path: result }));
      await save();
    }
  }

  async function browseArchiveDir() {
    const result = await openDialog({ title: 'Archiv-Verzeichnis wählen', directory: true });
    if (result && typeof result === 'string') {
      appSettings.update(s => ({ ...s, archive_dir: result }));
      await save();
    }
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
      <h2 class="text-sm font-semibold text-gray-100">Einstellungen</h2>
      <button
        onclick={onclose}
        class="text-gray-400 hover:text-gray-200 text-lg leading-none"
      >✕</button>
    </div>

    <div class="flex flex-col gap-6 p-4 overflow-y-auto flex-1">

      <!-- Flashrom Binary -->
      <div class="flex flex-col gap-1.5">
        <label for="settings-flashrom" class="text-xs font-medium text-gray-400">Flashrom Binary</label>
        <div class="flex gap-1">
          <input
            id="settings-flashrom"
            type="text"
            placeholder="(gebundelt)"
            value={$appSettings.flashrom_path ?? ''}
            oninput={(e) => appSettings.update(s => ({ ...s, flashrom_path: (e.target as HTMLInputElement).value || null }))}
            onblur={save}
            class="flex-1 bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5
                   border border-gray-700 placeholder:text-gray-600
                   focus:outline-none focus:border-gray-500"
          />
          <button
            onclick={browseFlashrom}
            class="px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 shrink-0"
          >…</button>
        </div>
        <p class="text-xs text-gray-600">Leer lassen für die mitgelieferte Binary.</p>
      </div>

      <!-- Archive Directory -->
      <div class="flex flex-col gap-1.5">
        <label for="settings-archive-dir" class="text-xs font-medium text-gray-400">Archiv-Verzeichnis</label>
        <div class="flex gap-1">
          <input
            id="settings-archive-dir"
            type="text"
            placeholder="(Standard-App-Datenordner)"
            value={$appSettings.archive_dir ?? ''}
            oninput={(e) => appSettings.update(s => ({ ...s, archive_dir: (e.target as HTMLInputElement).value || null }))}
            onblur={save}
            class="flex-1 bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5
                   border border-gray-700 placeholder:text-gray-600
                   focus:outline-none focus:border-gray-500"
          />
          <button
            onclick={browseArchiveDir}
            class="px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 shrink-0"
          >…</button>
        </div>
        <p class="text-xs text-gray-600">Leer lassen für den Standard-Speicherort des OS.</p>
      </div>

      <!-- UART Baud Rate -->
      <div class="flex flex-col gap-1.5">
        <label for="settings-baud-rate" class="text-xs font-medium text-gray-400">UART Baudrate</label>
        <select
          id="settings-baud-rate"
          value={$appSettings.baud_rate}
          onchange={async (e) => {
            appSettings.update(s => ({ ...s, baud_rate: Number((e.target as HTMLSelectElement).value) }));
            await save();
          }}
          class="bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5
                 border border-gray-700 focus:outline-none focus:border-gray-500"
        >
          {#each BAUD_RATES as rate (rate)}
            <option value={rate}>{rate}</option>
          {/each}
        </select>
        <p class="text-xs text-gray-600">Wirkt beim nächsten UART-Verbindungsaufbau.</p>
      </div>

    </div>
  </div>
{/if}
