<script lang="ts">
  import FlashPanel from '$lib/components/FlashPanel.svelte';
  import ArchiveSection from '$lib/components/ArchiveSection.svelte';
  import UartPanel from '$lib/components/UartPanel.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import Header from '$lib/components/Header.svelte';
  import { sidebarCollapsed } from '$lib/stores/ui';
  import { appSettings } from '$lib/stores/settings';

  type View = 'flash' | 'uart' | 'archive';

  let activeView   = $state<View>('flash');
  let settingsOpen = $state(false);
</script>

<svelte:head>
  <title>fixplay diagnoseTool</title>
</svelte:head>

<div class="flex h-screen bg-gray-950 text-gray-100 overflow-hidden" data-tablet={$appSettings.tablet_mode}>
  <Sidebar
    active={activeView}
    collapsed={$sidebarCollapsed}
    onnavigate={(v) => (activeView = v)}
    onsettings={() => (settingsOpen = true)}
  />

  <div class="flex flex-col flex-1 min-w-0">
    <Header
      view={activeView}
      collapsed={$sidebarCollapsed}
      onToggleSidebar={() => sidebarCollapsed.update(v => !v)}
    />

    <main class="flex-1 min-h-0 overflow-hidden">
      {#if activeView === 'flash'}
        <div class="flex flex-col gap-4 h-full overflow-y-auto p-4">
          <FlashPanel />
        </div>
      {:else if activeView === 'uart'}
        <div class="flex h-full p-4">
          <UartPanel />
        </div>
      {:else if activeView === 'archive'}
        <div class="flex flex-col gap-4 h-full overflow-y-auto p-4">
          <ArchiveSection standalone />
        </div>
      {/if}
    </main>

    <StatusBar />
  </div>
</div>

<SettingsPanel open={settingsOpen} onclose={() => (settingsOpen = false)} />
