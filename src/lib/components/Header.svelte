

<script lang="ts">
  import { PanelLeftClose, PanelLeftOpen, RefreshCw, Pin, PinOff, Sun, Moon, Languages } from 'lucide-svelte';
  import { theme, toggleTheme } from '$lib/stores/theme';
  import { t, locale, toggleLocale } from '$lib/i18n';

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

  const titleKey: Record<View, string> = {
    home:    'header.home',
    flash:   'header.flash',
    uart:    'header.uart',
    i2c:     'header.i2c',
    archive: 'header.archive',
    controller: 'header.controller',
  };
</script>

<header
  class="flex items-center gap-3 h-14 px-4 bg-gray-900 border-b border-gray-800 shrink-0"
>
  <button
    onclick={onToggleSidebar}
    class="text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg p-1.5 transition-colors shrink-0"
    aria-label={collapsed ? $t('header.sidebarExpand') : $t('header.sidebarCollapse')}
    title={collapsed ? $t('header.sidebarExpand') : $t('header.sidebarCollapse')}
  >
    {#if collapsed}
      <PanelLeftOpen class="w-5 h-5" />
    {:else}
      <PanelLeftClose class="w-5 h-5" />
    {/if}
  </button>

  <h1 class="text-sm font-semibold text-gray-100 truncate flex-1 min-w-0">
    {$t(titleKey[view])}
  </h1>

  <button
    onclick={() => checkUpdates()}
    class="relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0
           {$updateAvailable
             ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-600/40'
             : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-transparent'}"
    title={$updateAvailable
      ? $t('header.updateAvailable', { version: $updateAvailable.version })
      : $t('header.checkUpdates')}
    aria-label={$t('header.checkUpdates')}
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
    aria-label={pinned ? $t('header.pinOff') : $t('header.pinOn')}
    title={pinned ? $t('header.pinTitleOn') : $t('header.pinTitleOff')}
  >
    {#if pinned}
      <Pin class="w-4 h-4 text-teal-400" />
    {:else}
      <PinOff class="w-4 h-4" />
    {/if}
  </button>

  <!-- Language toggle (#53) -->
  <button
    onclick={toggleLocale}
    class="flex items-center gap-1 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors shrink-0"
    aria-label={$t('header.language')}
    title={$t('header.language')}
  >
    <Languages class="w-4 h-4" />
    <span class="uppercase">{$locale}</span>
  </button>

  <button
    onclick={toggleTheme}
    class="text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg p-1.5 transition-colors shrink-0"
    aria-label={$theme === 'dark' ? $t('header.themeLight') : $t('header.themeDark')}
    title={$theme === 'dark' ? $t('header.themeLight') : $t('header.themeDark')}
  >
    {#if $theme === 'dark'}
      <Sun class="w-4 h-4" />
    {:else}
      <Moon class="w-4 h-4" />
    {/if}
  </button>
</header>

