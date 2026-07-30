

<script lang="ts">
  import { PanelLeftClose, PanelLeftOpen, RefreshCw, Pin, PinOff, Sun, Moon } from 'lucide-svelte';
  import { theme, toggleTheme } from '$lib/stores/theme';

  let pinned = $state(false);

  async function togglePin() {
    pinned = !pinned;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setAlwaysOnTop(pinned);
    } catch { /* not available in mock */ }
  }
  import { checkUpdates, updateAvailable, updateBusy } from '$lib/stores/updater';

  type View = 'home' | 'flash' | 'uart' | 'i2c' | 'archive' | 'controller';

  let {
    view,
    collapsed,
    onToggleSidebar,
  }: {
    view: View;
    collapsed: boolean;
    onToggleSidebar: () => void;
  } = $props();

  const titles: Record<View, string> = {
    home:    'Start',
    flash:   'NOR Flash Diagnose',
    uart:    'UART Diagnostik',
    i2c:     'I2C / Pico Diagnostik',
    archive: 'NOR-Dump Archiv',
    controller: 'Controller-Diagnose',
  };
</script>

<header
  class="flex items-center gap-3 h-14 px-4 bg-gray-900 border-b border-gray-800 shrink-0"
>
  <button
    onclick={onToggleSidebar}
    class="text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg p-1.5 transition-colors shrink-0"
    aria-label={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
    title={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
  >
    {#if collapsed}
      <PanelLeftOpen class="w-5 h-5" />
    {:else}
      <PanelLeftClose class="w-5 h-5" />
    {/if}
  </button>

  <h1 class="text-sm font-semibold text-gray-100 truncate flex-1 min-w-0">
    {titles[view]}
  </h1>

  <button
    onclick={() => checkUpdates()}
    class="relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0
           {$updateAvailable
             ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-600/40'
             : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-transparent'}"
    title={$updateAvailable
      ? `Update verfügbar: v${$updateAvailable.version}`
      : 'Nach Updates suchen'}
    aria-label="Nach Updates suchen"
  >
    <RefreshCw class="w-4 h-4 {$updateBusy ? 'animate-spin' : ''}" />
    {#if $updateAvailable}
      <span class="hidden sm:inline">Update</span>
      <span class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400"></span>
    {/if}
  </button>

  <button
    onclick={togglePin}
    class="text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg p-1.5 transition-colors shrink-0"
    aria-label={pinned ? 'Immer im Vordergrund deaktivieren' : 'Immer im Vordergrund'}
    title={pinned ? 'Immer im Vordergrund: AN' : 'Immer im Vordergrund: AUS'}
  >
    {#if pinned}
      <Pin class="w-4 h-4 text-teal-400" />
    {:else}
      <PinOff class="w-4 h-4" />
    {/if}
  </button>

  <button
    onclick={toggleTheme}
    class="text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg p-1.5 transition-colors shrink-0"
    aria-label={$theme === 'dark' ? 'Helles Design aktivieren' : 'Dunkles Design aktivieren'}
    title={$theme === 'dark' ? 'Helles Design aktivieren' : 'Dunkles Design aktivieren'}
  >
    {#if $theme === 'dark'}
      <Sun class="w-4 h-4" />
    {:else}
      <Moon class="w-4 h-4" />
    {/if}
  </button>
</header>

