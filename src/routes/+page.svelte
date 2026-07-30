<script lang="ts">
  import FlashPanel from '$lib/components/FlashPanel.svelte';
  import ArchiveSection from '$lib/components/ArchiveSection.svelte';
  import UartPanel from '$lib/components/UartPanel.svelte';
  import I2cPanel from '$lib/components/I2cPanel.svelte';
  import ControllerPanel from '$lib/components/ControllerPanel.svelte';
  import HomePanel from '$lib/components/HomePanel.svelte';
  import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';
  import AboutDialog from '$lib/components/AboutDialog.svelte';
  import OnboardingModal from '$lib/components/OnboardingModal.svelte';
  import WhatsNewDialog from '$lib/components/WhatsNewDialog.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import Header from '$lib/components/Header.svelte';
  import UpdateBanner from '$lib/components/UpdateBanner.svelte';
  import Toaster from '$lib/components/Toaster.svelte';
  import { sidebarCollapsed } from '$lib/stores/ui';
  import { appSettings } from '$lib/stores/settings';
  import { flashBusy } from '$lib/stores/flash';
  import { refreshUpdateContext, checkUpdates, currentVersion } from '$lib/stores/updater';
  import { activeView, navigate, SHORTCUT_VIEWS } from '$lib/stores/app';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import LL from '$lib/i18n/i18n-svelte';

  let settingsOpen = $state(false);
  let aboutOpen    = $state(false);
  let onboardingOpen = $state(false);
  let whatsNewOpen    = $state(false);

  // Global keyboard shortcuts: Ctrl/Cmd+1..6 jump between panels, Ctrl/Cmd+, opens
  // settings. Skipped when focus is in a text/input/textarea field so we don't
  // swallow typing (e.g. user pressing Cmd+1 inside the flashrom path field).
  function isTypingTarget(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }
  function onKeydown(e: KeyboardEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    if (e.key === ',') { e.preventDefault(); settingsOpen = true; return; }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= SHORTCUT_VIEWS.length && !isTypingTarget(e.target)) {
      e.preventDefault();
      navigate(SHORTCUT_VIEWS[n - 1]);
    }
  }

  onMount(() => {
    // First-run onboarding — show once per install.
    try { if (!localStorage.getItem('fixplay-onboarding-done')) onboardingOpen = true; } catch { /* ignored */ }

    if (!__MOCK_MODE__) {
      refreshUpdateContext().then(() => checkUpdates());

      // Prevent accidental window close during flash operations — closing the
      // app mid-write can brick the target chip.
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().onCloseRequested(async (e) => {
          if ($flashBusy) {
            // Tauri v2: prevent close by not calling e.preventDefault()? Actually
            // we need to use the confirm dialog approach since onCloseRequested
            // in Tauri v2 uses async prevention via the event.
            if (!confirm(get(LL).common.confirmCloseFlash())) {
              e.preventDefault();
            }
          }
        });
      }).catch(() => {}); // not available in mock mode
    }
  });

  // "What's new" dialog — show once when the running version differs from the
  // last one the user saw. Fires after currentVersion is populated.
  $effect(() => {
    const v = $currentVersion;
    if (!v) return;
    try {
      const last = localStorage.getItem('fixplay-last-version');
      if (last !== v) {
        // Don't pop on the very first install (onboarding covers that) — only
        // when there's a previous version recorded.
        if (last !== null) whatsNewOpen = true;
        localStorage.setItem('fixplay-last-version', v);
      }
    } catch { /* ignored */ }
  });
</script>

<svelte:head>
  <title>fixplay diagnoseTool</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<div class="flex h-screen bg-gray-950 text-gray-100 overflow-hidden" data-tablet={$appSettings.tablet_mode}>
  <Sidebar
    active={$activeView}
    collapsed={$sidebarCollapsed}
    onnavigate={navigate}
    onsettings={() => (settingsOpen = true)}
    onabout={() => (aboutOpen = true)}
  />

  <div class="flex flex-col flex-1 min-w-0">
    <Header
      view={$activeView}
      collapsed={$sidebarCollapsed}
      onToggleSidebar={() => sidebarCollapsed.update(v => !v)}
    />

    <UpdateBanner onCheck={() => checkUpdates()} />

    <main class="flex-1 min-h-0 overflow-hidden">
      {#if $activeView === 'home'}
        <ErrorBoundary panel={$LL.nav.home()}>
          <HomePanel onnavigate={navigate} />
        </ErrorBoundary>
      {:else if $activeView === 'flash'}
        <ErrorBoundary panel={$LL.nav.flash()}>
          <div class="flex flex-col gap-4 h-full overflow-y-auto p-4">
            <FlashPanel />
          </div>
        </ErrorBoundary>
      {:else if $activeView === 'uart'}
        <ErrorBoundary panel={$LL.nav.uart()}>
          <div class="flex h-full p-4">
            <UartPanel />
          </div>
        </ErrorBoundary>
      {:else if $activeView === 'i2c'}
        <ErrorBoundary panel={$LL.nav.i2c()}>
          <div class="flex h-full p-4">
            <I2cPanel />
          </div>
        </ErrorBoundary>
      {:else if $activeView === 'archive'}
        <ErrorBoundary panel={$LL.nav.archive()}>
          <div class="flex flex-col gap-4 h-full overflow-y-auto p-4">
            <ArchiveSection standalone />
          </div>
        </ErrorBoundary>
      {:else if $activeView === 'controller'}
        <ErrorBoundary panel={$LL.nav.controller()}>
          <ControllerPanel />
        </ErrorBoundary>
      {/if}
    </main>

    <StatusBar onnavigate={navigate} />
  </div>
</div>

<SettingsPanel open={settingsOpen} onclose={() => (settingsOpen = false)} />
<AboutDialog bind:open={aboutOpen} />
<OnboardingModal bind:open={onboardingOpen} />
<WhatsNewDialog bind:open={whatsNewOpen} />

<Toaster />

{#if __MOCK_MODE__}
  {#await import('$lib/components/MockPanel.svelte')}
    <!-- MockPanel lädt … -->
  {:then m}
    <m.default />
  {/await}
{/if}
