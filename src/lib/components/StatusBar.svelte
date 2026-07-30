
<script lang="ts">
  import { flashBusy, flashProgrammers } from '$lib/stores/flash';
  import { uartConnected, uartReconnecting, dbCodeCount, dbLoading } from '$lib/stores/uart';
  import { i2cConnected, xboxDbCount, xboxDbLoading } from '$lib/stores/i2c';
  import { currentVersion } from '$lib/stores/updater';
  import { WifiOff } from 'lucide-svelte';
  import LL from '$lib/i18n/i18n-svelte';

  type View = 'home' | 'flash' | 'uart' | 'i2c' | 'archive' | 'controller';

  let { onnavigate }: { onnavigate?: (v: View) => void } = $props();

  const btnCls = 'flex items-center gap-1.5 hover:text-gray-300 transition-colors cursor-pointer';

  // Online/offline detection — DB updates and update checks need network.
  // navigator.onLine is reliable for "definitely offline" (cable unplugged /
  // Wi-Fi off) but can false-positive "online" behind a captive portal; we only
  // use it to warn, never to gate functionality.
  let online = $state(typeof navigator !== 'undefined' ? navigator.onLine : true);
</script>

<svelte:window
  ononline={() => (online = true)}
  onoffline={() => (online = false)}
/>

<footer
  class="flex items-center gap-4 h-7 px-4 bg-gray-900 border-t border-gray-800 text-[11px] text-gray-500 shrink-0 select-none"
>
  <!-- UART status -->
  <button class={btnCls} onclick={() => onnavigate?.('uart')} title={$LL.statusBar.uartTitle()}>
    <span
      class="w-1.5 h-1.5 rounded-full
        {$uartConnected ? 'bg-green-400' : $uartReconnecting ? 'bg-yellow-400 animate-pulse' : 'bg-gray-600'}"
    ></span>
    <span>UART {$uartConnected ? $LL.statusBar.connected() : $uartReconnecting ? $LL.statusBar.reconnecting() : $LL.statusBar.disconnected()}</span>
  </button>

  <!-- I2C / Pico status -->
  <button class={btnCls} onclick={() => onnavigate?.('i2c')} title={$LL.statusBar.i2cTitle()}>
    <span class="w-1.5 h-1.5 rounded-full {$i2cConnected ? 'bg-green-400' : 'bg-gray-600'}"></span>
    <span>I2C {$i2cConnected ? $LL.statusBar.connected() : $LL.statusBar.disconnected()}</span>
  </button>

  <!-- Xbox DB status -->
  {#if $xboxDbLoading}
    <button class={btnCls} onclick={() => onnavigate?.('i2c')} title={$LL.statusBar.i2cTitle()}>
      <span class="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"></span>
      <span>{$LL.statusBar.xboxDbLoading()}</span>
    </button>
  {:else if $xboxDbCount != null}
    <button class={btnCls} onclick={() => onnavigate?.('i2c')} title={$LL.statusBar.i2cTitle()}>
      <span class="w-1.5 h-1.5 rounded-full bg-green-400"></span>
      <span>{$LL.statusBar.xboxDb({ count: $xboxDbCount.toLocaleString() })}</span>
    </button>
  {/if}

  <!-- Programmer status -->
  <button class={btnCls} onclick={() => onnavigate?.('flash')} title={$LL.statusBar.flashTitle()}>
    <span
      class="w-1.5 h-1.5 rounded-full {$flashProgrammers.length > 0 ? 'bg-green-400' : 'bg-gray-600'}"
    ></span>
    <span>{$flashProgrammers.length > 0 ? $LL.statusBar.programmerReady() : $LL.statusBar.noProgrammer()}</span>
  </button>

  <!-- Flash busy -->
  {#if $flashBusy}
    <button class={btnCls} onclick={() => onnavigate?.('flash')} title={$LL.statusBar.flashTitle()}>
      <span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
      <span class="text-blue-400">{$LL.statusBar.flashActive()}</span>
    </button>
  {/if}

  <!-- DB status -->
  <button class={btnCls} onclick={() => onnavigate?.('uart')} title={$LL.statusBar.uartTitle()}>
    {#if $dbLoading}
      <span class="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"></span>
      <span>{$LL.statusBar.dbLoading()}</span>
    {:else if $dbCodeCount != null}
      <span class="w-1.5 h-1.5 rounded-full bg-green-400"></span>
      <span>{$LL.statusBar.dbCodes({ count: $dbCodeCount.toLocaleString() })}</span>
    {:else}
      <span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>
      <span>{$LL.statusBar.dbNotLoaded()}</span>
    {/if}
  </button>

  {#if !online}
    <span class="flex items-center gap-1 text-amber-400" title={$LL.statusBar.offlineTitle()}>
      <WifiOff class="w-3 h-3" /> {$LL.statusBar.offline()}
    </span>
  {/if}

  <span class="ml-auto text-gray-600">v{$currentVersion || '?'}</span>
</footer>
