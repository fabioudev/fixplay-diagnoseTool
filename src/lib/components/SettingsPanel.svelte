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
        title="Einstellungen schließen (werden automatisch gespeichert)"
        class="text-gray-400 hover:text-gray-200 text-lg leading-none"
      >✕</button>
    </div>

    <div class="flex flex-col gap-6 p-4 overflow-y-auto flex-1">

      <!-- Flashrom Binary -->
      <div class="flex flex-col gap-1.5">
        <label for="settings-flashrom" class="text-xs font-medium text-gray-400">
          Flashrom Binary
        </label>
        <div class="flex gap-1">
          <input
            id="settings-flashrom"
            type="text"
            placeholder="(gebundelt)"
            value={$appSettings.flashrom_path ?? ''}
            oninput={(e) => appSettings.update(s => ({ ...s, flashrom_path: (e.target as HTMLInputElement).value || null }))}
            onblur={save}
            title="Pfad zur flashrom-Binary. Leer lassen, um die mitgelieferte Version zu verwenden. Eigene Binary nötig, wenn das gebundelte flashrom deinen Programmer nicht unterstützt."
            class="flex-1 bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5
                   border border-gray-700 placeholder:text-gray-600
                   focus:outline-none focus:border-gray-500"
          />
          <button
            onclick={browseFlashrom}
            title="Datei auswählen"
            class="px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 shrink-0"
          >…</button>
        </div>
        <p class="text-xs text-gray-600">
          Leer lassen für die mitgelieferte Binary. Eigene Version nur nötig wenn der gebundelte flashrom deinen Programmer nicht erkennt.
        </p>
      </div>

      <!-- Archive Directory -->
      <div class="flex flex-col gap-1.5">
        <label for="settings-archive-dir" class="text-xs font-medium text-gray-400">
          Archiv-Verzeichnis
        </label>
        <div class="flex gap-1">
          <input
            id="settings-archive-dir"
            type="text"
            placeholder="(Standard-App-Datenordner)"
            value={$appSettings.archive_dir ?? ''}
            oninput={(e) => appSettings.update(s => ({ ...s, archive_dir: (e.target as HTMLInputElement).value || null }))}
            onblur={save}
            title="Ordner, in dem NOR-Dumps gespeichert werden. Leer lassen für den Standard-App-Datenordner des Betriebssystems."
            class="flex-1 bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5
                   border border-gray-700 placeholder:text-gray-600
                   focus:outline-none focus:border-gray-500"
          />
          <button
            onclick={browseArchiveDir}
            title="Ordner auswählen"
            class="px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 shrink-0"
          >…</button>
        </div>
        <p class="text-xs text-gray-600">
          Leer lassen für den Standard-Speicherort des OS. Dumps werden nach Seriennummer in Unterordnern abgelegt.
        </p>
      </div>

      <!-- UART Baud Rate -->
      <div class="flex flex-col gap-1.5">
        <label for="settings-baud-rate" class="text-xs font-medium text-gray-400">
          UART Baudrate
        </label>
        <div class="relative">
          <select
            id="settings-baud-rate"
            value={$appSettings.baud_rate}
            onchange={async (e) => {
              appSettings.update(s => ({ ...s, baud_rate: Number((e.target as HTMLSelectElement).value) }));
              await save();
            }}
            title="Übertragungsgeschwindigkeit der UART-Verbindung. PS5-Diagnosebrücken verwenden typischerweise 115200 Baud. Nur ändern, wenn du weißt, was du tust."
            class="appearance-none w-full bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5 pr-6
                   border border-gray-700 focus:outline-none focus:border-gray-500"
          >
            {#each BAUD_RATES as rate (rate)}
              <option value={rate}>{rate}{rate === 115200 ? ' (Standard PS5)' : ''}</option>
            {/each}
          </select>
          <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
        </div>
        <p class="text-xs text-gray-600">
          Wirkt beim nächsten UART-Verbindungsaufbau. PS5-Standard ist 115200.
        </p>
      </div>

      <!-- I2C / Pico Baud Rate -->
      <div class="flex flex-col gap-1.5">
        <label for="settings-i2c-baud-rate" class="text-xs font-medium text-gray-400">
          I2C / Pico Baudrate
        </label>
        <div class="relative">
          <select
            id="settings-i2c-baud-rate"
            value={$appSettings.i2c_baud_rate}
            onchange={async (e) => {
              appSettings.update(s => ({ ...s, i2c_baud_rate: Number((e.target as HTMLSelectElement).value) }));
              await save();
            }}
            title="Baudrate des USB-CDC-Ports des Pico. USB CDC ignoriert den Wert in der Regel, aber der serielle Port benötigt einen. Standard 115200."
            class="appearance-none w-full bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5 pr-6
                   border border-gray-700 focus:outline-none focus:border-gray-500"
          >
            {#each BAUD_RATES as rate (rate)}
              <option value={rate}>{rate}{rate === 115200 ? ' (Standard Pico)' : ''}</option>
            {/each}
          </select>
          <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
        </div>
        <p class="text-xs text-gray-600">
          USB CDC ignoriert die Baudrate meist — Standard 115200 beibehalten.
        </p>
      </div>

      <!-- Tablet Mode -->
      <div class="flex flex-col gap-1.5">
        <label class="text-xs font-medium text-gray-400">
          Tablet-Modus
        </label>
        <label
          class="flex items-center gap-2.5 cursor-pointer select-none"
          title="Vergrößert Touch-Targets und Schaltflächen für Touch-Bedienung auf Tablets und Touchscreen-Geräten."
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
          <span class="text-xs text-gray-300">Größere Touch-Targets für Touch-Bedienung</span>
        </label>
        <p class="text-xs text-gray-600">
          Aktiviert vergrößerte Schaltflächen und Abstände für Touchscreens.
        </p>
      </div>

    </div>

    <!-- Footer hint -->
    <div class="px-4 py-3 border-t border-gray-700">
      <p class="text-xs text-gray-600">Alle Einstellungen werden sofort beim Verlassen des Feldes gespeichert.</p>
    </div>
  </div>
{/if}
