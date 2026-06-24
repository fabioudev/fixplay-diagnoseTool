

<script lang="ts">
  import { PanelLeftClose, PanelLeftOpen, Tablet } from 'lucide-svelte';
  import { appSettings } from '$lib/stores/settings';
  import { settingsGet, settingsSave } from '$lib/api/tauri';

  type View = 'flash' | 'uart' | 'archive';

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
    flash:   'NOR Flash Diagnose',
    uart:    'UART Diagnostik',
    archive: 'NOR-Dump Archiv',
  };

  async function toggleTabletMode() {
    const newVal = !$appSettings.tablet_mode;
    appSettings.update(s => ({ ...s, tablet_mode: newVal }));
    await settingsSave($appSettings).catch(console.error);
  }
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
    onclick={toggleTabletMode}
    class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0
           {$appSettings.tablet_mode
             ? 'bg-blue-600/20 text-blue-300 border border-blue-600/40'
             : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-transparent'}"
    aria-pressed={$appSettings.tablet_mode}
    title={$appSettings.tablet_mode
      ? 'Tablet-Modus aktiv — größere Touch-Targets. Klicken zum Deaktivieren.'
      : 'Tablet-Modus aktivieren — größere Touch-Targets für Touch-Bedienung.'}
  >
    <Tablet class="w-4 h-4" />
    <span class="hidden sm:inline">Tablet</span>
  </button>
</header>

