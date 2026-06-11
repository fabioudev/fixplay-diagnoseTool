<script lang="ts">
  import { uartLog, uartConnected } from '$lib/stores/uart';
</script>

<section class="flex flex-col gap-4 flex-1 bg-gray-900 rounded-lg p-4">
  <h2 class="text-lg font-semibold text-gray-100">UART</h2>

  <div class="flex items-center gap-2">
    <span class="w-2 h-2 rounded-full {$uartConnected ? 'bg-green-400' : 'bg-gray-600'}"></span>
    <span class="text-sm text-gray-400">
      {$uartConnected ? 'Connected' : 'Disconnected'}
    </span>
  </div>

  <div
    class="flex-1 min-h-48 bg-gray-950 rounded p-3 font-mono text-xs text-green-400
           overflow-y-auto leading-relaxed"
  >
    {#each $uartLog as line}
      <div>{line}</div>
    {:else}
      <span class="text-gray-600">No output yet…</span>
    {/each}
  </div>
</section>
