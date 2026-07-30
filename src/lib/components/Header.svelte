

<script lang="ts">
  import { PanelLeftClose, PanelLeftOpen, RefreshCw, Pin, PinOff, Sun, Moon, Languages } from 'lucide-svelte';
  import { theme, toggleTheme } from '$lib/stores/theme';
  import LL, { locale } from '$lib/i18n/i18n-svelte';
  import { toggleLocale } from '$lib/i18n/init';
  import type { TranslationFunctions } from '$lib/i18n/i18n-types';
  import type { LocalizedString } from 'typesafe-i18n';

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

  const titleKey: Record<View, (ll: TranslationFunctions) => LocalizedString> = {
    home:        (ll) => ll.header.home(),
    flash:       (ll) => ll.header.flash(),
    uart:        (ll) => ll.header.uart(),
    i2c:         (ll) => ll.header.i2c(),
    archive:     (ll) => ll.header.archive(),
    controller:  (ll) => ll.header.controller(),
  };
</script>

<header
  class="flex items-center gap-3 h-14 px-4 bg-gray-900 border-b border-gray-800 shrink-0"
>
  <button
    onclick={onToggleSidebar}
    class="text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg p-1.5 transition-colors shrink-0"
    aria-label={collapsed ? $LL.header.sidebarExpand() : $LL.header.sidebarCollapse()}
    title={collapsed ? $LL.header.sidebarExpand() : $LL.header.sidebarCollapse()}
  >
    {#if collapsed}
      <PanelLeftOpen class="w-5 h-5" />
    {:else}
      <PanelLeftClose class="w-5 h-5" />
    {/if}
  </button>

  <h1 class="text-sm font-semibold text-gray-100 truncate flex-1 min-w-0">
    {titleKey[view]($LL)}
  </h1>

  <button
    onclick={() => checkUpdates()}
    class="relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0
           {$updateAvailable
             ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-600/40'
             : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-transparent'}"
    title={$updateAvailable
      ? $LL.header.updateAvailable({ version: $updateAvailable.version })
      : $LL.header.checkUpdates()}
    aria-label={$LL.header.checkUpdates()}
  >
    <RefreshCw class="w-4 h-4 {$updateBusy ? 'animate-spin' : ''}" />
    {#if $updateAvailable}
      <span class="hidden sm:inline">{$LL.header.updateBadge()}</span>
      <span class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400"></span>
    {/if}
  </button>

  <button
    onclick={togglePin}
    class="text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg p-1.5 transition-colors shrink-0"
    aria-label={pinned ? $LL.header.pinOff() : $LL.header.pinOn()}
    title={pinned ? $LL.header.pinTitleOn() : $LL.header.pinTitleOff()}
  >
    {#if pinned}
      <Pin class="w-4 h-4 text-teal-400" />
    {:else}
      <PinOff class="w-4 h-4" />
    {/if}
  </button>

  <!-- Language toggle -->
  <button
    onclick={toggleLocale}
    class="flex items-center gap-1 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors shrink-0"
    aria-label={$LL.header.language()}
    title={$LL.header.language()}
  >
    <Languages class="w-4 h-4" />
    <span class="uppercase">{$locale}</span>
  </button>

  <button
    onclick={toggleTheme}
    class="text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg p-1.5 transition-colors shrink-0"
    aria-label={$theme === 'dark' ? $LL.header.themeLight() : $LL.header.themeDark()}
    title={$theme === 'dark' ? $LL.header.themeLight() : $LL.header.themeDark()}
  >
    {#if $theme === 'dark'}
      <Sun class="w-4 h-4" />
    {:else}
      <Moon class="w-4 h-4" />
    {/if}
  </button>
</header>

