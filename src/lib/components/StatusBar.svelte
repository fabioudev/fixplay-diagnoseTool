
<script lang="ts">
  import { flashBusy, flashProgrammers } from '$lib/stores/flash';
  import { uartConnected, uartReconnecting, dbCodeCount, dbLoading } from '$lib/stores/uart';

  const APP_VERSION = '0.1.5';
</script>

<footer
  class="flex items-center gap-4 h-7 px-4 bg-gray-900 border-t border-gray-800 text-[11px] text-gray-500 shrink-0 select-none"
>
  <!-- UART status -->
  <div class="flex items-center gap-1.5" title={$uartConnected ? 'UART verbunden' : 'UART getrennt'}>
    <span
      class="w-1.5 h-1.5 rounded-full
        {$uartConnected ? 'bg-green-400' : $uartReconnecting ? 'bg-yellow-400 animate-pulse' : 'bg-gray-600'}"
    ></span>
    <span>UART {$uartConnected ? 'verbunden' : $uartReconnecting ? 'reconnecting' : 'getrennt'}</span>
  </div>

  <!-- Programmer status -->
  <div class="flex items-center gap-1.5" title={$flashProgrammers.length > 0 ? 'Programmer erkannt' : 'Kein Programmer'}>
    <span
      class="w-1.5 h-1.5 rounded-full {$flashProgrammers.length > 0 ? 'bg-green-400' : 'bg-gray-600'}"
    ></span>
    <span>{$flashProgrammers.length > 0 ? 'Programmer bereit' : 'Kein Programmer'}</span>
  </div>

  <!-- Flash busy -->
  {#if $flashBusy}
    <div class="flex items-center gap-1.5 text-blue-400">
      <span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
      <span>Flash aktiv</span>
    </div>
  {/if}

  <!-- DB status -->
  <div class="flex items-center gap-1.5" title="Fehlercode-Datenbank Status">
    {#if $dbLoading}
      <span class="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"></span>
      <span>DB lädt…</span>
    {:else if $dbCodeCount !== null}
      <span class="w-1.5 h-1.5 rounded-full bg-green-400"></span>
      <span>DB: {$dbCodeCount.toLocaleString()} Codes</span>
    {:else}
      <span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>
      <span>DB nicht geladen</span>
    {/if}
  </div>

  <span class="ml-auto text-gray-600">v{APP_VERSION}</span>
</footer>
