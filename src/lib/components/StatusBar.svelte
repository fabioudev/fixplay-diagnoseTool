
<script lang="ts">
  import { flashBusy, flashProgrammers } from '$lib/stores/flash';
  import { uartConnected, uartReconnecting, dbCodeCount, dbLoading } from '$lib/stores/uart';
  import { i2cConnected, xboxDbCount, xboxDbLoading } from '$lib/stores/i2c';
  import { currentVersion } from '$lib/stores/updater';

  type View = 'home' | 'flash' | 'uart' | 'i2c' | 'archive' | 'controller';

  let { onnavigate }: { onnavigate?: (v: View) => void } = $props();

  const btnCls = 'flex items-center gap-1.5 hover:text-gray-300 transition-colors cursor-pointer';
</script>

<footer
  class="flex items-center gap-4 h-7 px-4 bg-gray-900 border-t border-gray-800 text-[11px] text-gray-500 shrink-0 select-none"
>
  <!-- UART status -->
  <button class={btnCls} onclick={() => onnavigate?.('uart')} title="Zum UART-Panel">
    <span
      class="w-1.5 h-1.5 rounded-full
        {$uartConnected ? 'bg-green-400' : $uartReconnecting ? 'bg-yellow-400 animate-pulse' : 'bg-gray-600'}"
    ></span>
    <span>UART {$uartConnected ? 'verbunden' : $uartReconnecting ? 'reconnecting' : 'getrennt'}</span>
  </button>

  <!-- I2C / Pico status -->
  <button class={btnCls} onclick={() => onnavigate?.('i2c')} title="Zum I2C/Pico-Panel">
    <span class="w-1.5 h-1.5 rounded-full {$i2cConnected ? 'bg-green-400' : 'bg-gray-600'}"></span>
    <span>I2C {$i2cConnected ? 'verbunden' : 'getrennt'}</span>
  </button>

  <!-- Xbox DB status -->
  {#if $xboxDbLoading}
    <button class={btnCls} onclick={() => onnavigate?.('i2c')} title="Zum I2C/Pico-Panel">
      <span class="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"></span>
      <span>Xbox-DB lädt…</span>
    </button>
  {:else if $xboxDbCount != null}
    <button class={btnCls} onclick={() => onnavigate?.('i2c')} title="Zum I2C/Pico-Panel">
      <span class="w-1.5 h-1.5 rounded-full bg-green-400"></span>
      <span>Xbox-DB: {$xboxDbCount.toLocaleString()}</span>
    </button>
  {/if}

  <!-- Programmer status -->
  <button class={btnCls} onclick={() => onnavigate?.('flash')} title="Zum NOR-Flash-Panel">
    <span
      class="w-1.5 h-1.5 rounded-full {$flashProgrammers.length > 0 ? 'bg-green-400' : 'bg-gray-600'}"
    ></span>
    <span>{$flashProgrammers.length > 0 ? 'Programmer bereit' : 'Kein Programmer'}</span>
  </button>

  <!-- Flash busy -->
  {#if $flashBusy}
    <button class={btnCls} onclick={() => onnavigate?.('flash')} title="Zum NOR-Flash-Panel">
      <span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
      <span class="text-blue-400">Flash aktiv</span>
    </button>
  {/if}

  <!-- DB status -->
  <button class={btnCls} onclick={() => onnavigate?.('uart')} title="Zum UART-Panel">
    {#if $dbLoading}
      <span class="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"></span>
      <span>DB lädt…</span>
    {:else if $dbCodeCount != null}
      <span class="w-1.5 h-1.5 rounded-full bg-green-400"></span>
      <span>DB: {$dbCodeCount.toLocaleString()} Codes</span>
    {:else}
      <span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>
      <span>DB nicht geladen</span>
    {/if}
  </button>

  <span class="ml-auto text-gray-600">v{$currentVersion || '?'}</span>
</footer>
