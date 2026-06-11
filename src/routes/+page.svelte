<script lang="ts">
  import FlashPanel from '$lib/components/FlashPanel.svelte';
  import UartPanel from '$lib/components/UartPanel.svelte';

  let activeTab = $state<'flash' | 'uart'>('flash');

  const tabs = [
    { id: 'flash' as const, label: 'NOR Flash' },
    { id: 'uart'  as const, label: 'UART' },
  ];
</script>

<svelte:head>
  <title>fixplay diagnoseTool</title>
</svelte:head>

<main class="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
  <nav class="flex border-b border-gray-800 px-4 pt-2 gap-1 shrink-0 bg-gray-900">
    {#each tabs as tab}
      <button
        onclick={() => (activeTab = tab.id)}
        class="px-4 py-2 text-sm font-medium rounded-t transition-colors {
          activeTab === tab.id
            ? 'border-b-2 border-blue-500 text-white bg-gray-950'
            : 'text-gray-400 hover:text-gray-200'
        }"
      >
        {tab.label}
      </button>
    {/each}
  </nav>

  <div class="flex-1 min-h-0 overflow-hidden">
    {#if activeTab === 'flash'}
      <div class="flex flex-col gap-4 h-full overflow-y-auto p-4">
        <FlashPanel />
      </div>
    {/if}
    <div class="{activeTab === 'uart' ? 'flex h-full p-4' : 'hidden'}">
      <UartPanel />
    </div>
  </div>
</main>
