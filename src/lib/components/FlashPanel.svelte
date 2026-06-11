<script lang="ts">
  import { scanDevices } from '$lib/api/tauri';
  import { flashDevices, flashBusy } from '$lib/stores/flash';

  async function handleScan() {
    flashBusy.set(true);
    try {
      const devices = await scanDevices();
      flashDevices.set(devices);
    } catch (err) {
      console.error('scan failed:', err);
    } finally {
      flashBusy.set(false);
    }
  }
</script>

<section class="flex flex-col gap-4 flex-1 bg-gray-900 rounded-lg p-4">
  <h2 class="text-lg font-semibold text-gray-100">Flash</h2>

  <button
    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded text-sm font-medium
           disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    onclick={handleScan}
    disabled={$flashBusy}
  >
    {$flashBusy ? 'Scanning…' : 'Scan Devices'}
  </button>

  {#if $flashDevices.length > 0}
    <ul class="flex flex-col gap-1">
      {#each $flashDevices as device (device.id)}
        <li class="text-sm text-gray-300 bg-gray-800 rounded px-3 py-2">
          {device.name}
        </li>
      {/each}
    </ul>
  {:else if !$flashBusy}
    <p class="text-sm text-gray-500">No devices found. Connect a CH341B and scan.</p>
  {/if}
</section>
