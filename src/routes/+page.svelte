<script lang="ts">
  import FlashPanel from '$lib/components/FlashPanel.svelte';
  import UartPanel from '$lib/components/UartPanel.svelte';
</script>

<svelte:head>
  <title>fixplay diagnoseTool</title>
</svelte:head>

<main class="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
  <div class="flex flex-1 gap-4 p-4">
    <FlashPanel />
    <UartPanel />
  </div>
</main>
