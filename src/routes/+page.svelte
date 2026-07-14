<script lang="ts">
  import FlashPanel from '$lib/components/FlashPanel.svelte';
  import ArchiveSection from '$lib/components/ArchiveSection.svelte';
  import UartPanel from '$lib/components/UartPanel.svelte';
  import I2cPanel from '$lib/components/I2cPanel.svelte';
  import ControllerPanel from '$lib/components/ControllerPanel.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import Header from '$lib/components/Header.svelte';
  import UpdateBanner from '$lib/components/UpdateBanner.svelte';
  import { sidebarCollapsed } from '$lib/stores/ui';
  import { appSettings } from '$lib/stores/settings';
  import { refreshUpdateContext, checkUpdates } from '$lib/stores/updater';
  import { onMount } from 'svelte';

  type View = 'flash' | 'uart' | 'i2c' | 'archive' | 'controller';

  let activeView   = $state<View>('flash');
  let settingsOpen = $state(false);

  // On startup: load install channel + current version, then quietly check for
  // an update. Errors are swallowed inside the store so this can never crash
  // the app. Skip in mock/browser mode (no Tauri backend).
  onMount(() => {
    if (!__MOCK_MODE__) {
      refreshUpdateContext().then(() => checkUpdates());
    }
  });
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

    <UpdateBanner onCheck={() => checkUpdates()} />

    <main class="flex-1 min-h-0 overflow-hidden">
      {#if activeView === 'flash'}
        <div class="flex flex-col gap-4 h-full overflow-y-auto p-4">
          <FlashPanel />
        </div>
      {:else if activeView === 'uart'}
        <div class="flex h-full p-4">
          <UartPanel />
        </div>
      {:else if activeView === 'i2c'}
        <div class="flex h-full p-4">
          <I2cPanel />
        </div>
      {:else if activeView === 'archive'}
        <div class="flex flex-col gap-4 h-full overflow-y-auto p-4">
          <ArchiveSection standalone />
        </div>
      {:else if activeView === 'controller'}
        <ControllerPanel />
      {/if}
    </main>

    <StatusBar />
  </div>
</div>

<SettingsPanel open={settingsOpen} onclose={() => (settingsOpen = false)} />

{#if __MOCK_MODE__}
  {#await import('$lib/components/MockPanel.svelte')}
    <!-- MockPanel lädt … -->
  {:then m}
    <m.default />
  {/await}
{/if}
