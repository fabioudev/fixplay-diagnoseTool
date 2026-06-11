<script lang="ts">
  import { onMount } from 'svelte';
  import { flashResult, flashWritePath } from '$lib/stores/flash';
  import { archiveListDumps, archiveDeleteDump, openPath } from '$lib/api/tauri';
  import type { SerialArchive, DumpEntry } from '$lib/api/types';

  let open          = $state(false);
  let archives      = $state<SerialArchive[]>([]);
  let loading       = $state(false);
  let confirmDelete = $state<string | null>(null);
  let loadedPath    = $state<string | null>(null);

  const totalDumps = $derived(archives.reduce((n, a) => n + a.dumps.length, 0));

  async function load() {
    loading = true;
    try {
      archives = await archiveListDumps();
    } catch {
      archives = [];
    } finally {
      loading = false;
    }
  }

  async function handleDelete(binPath: string) {
    if (confirmDelete !== binPath) {
      confirmDelete = binPath;
      return;
    }
    confirmDelete = null;
    await archiveDeleteDump(binPath).catch(console.error);
    await load();
  }

  function handleLoad(entry: DumpEntry) {
    flashWritePath.set(entry.bin_path);
    loadedPath = entry.bin_path;
    setTimeout(() => { if (loadedPath === entry.bin_path) loadedPath = null; }, 2000);
  }

  function folderPath(binPath: string): string {
    return binPath.replace(/[/\\][^/\\]+$/, '');
  }

  onMount(load);

  $effect(() => {
    if ($flashResult !== null) load();
  });
</script>

<div class="bg-gray-900 rounded-lg border border-gray-800">
  <button
    onclick={() => (open = !open)}
    class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium
           text-gray-300 hover:text-gray-100 transition-colors"
  >
    <span>Archiv {loading ? '…' : `(${totalDumps} Dump${totalDumps !== 1 ? 's' : ''})`}</span>
    <span class="text-gray-500 text-xs">{open ? '▲' : '▼'}</span>
  </button>

  {#if open}
    <div class="border-t border-gray-800">
      {#each archives as archive (archive.serial)}
        <div class="p-3 border-b border-gray-800 last:border-0">
          <p class="text-xs font-semibold text-gray-400 mb-2 font-mono">{archive.serial}</p>
          <div class="flex flex-col gap-1.5">
            {#each archive.dumps as dump (dump.bin_path)}
              <div class="flex items-center gap-2 text-xs bg-gray-800 rounded px-2 py-1.5 flex-wrap">
                <span class="font-mono text-gray-500 shrink-0">
                  {new Date(dump.timestamp * 1000).toLocaleString()}
                </span>
                <span class="font-mono text-gray-300 shrink-0">{dump.fw_version ?? '—'}</span>
                <span class="{dump.validation_ok ? 'text-green-400' : 'text-red-400'} shrink-0">
                  {dump.validation_ok ? '✓ OK' : '✗ Korrupt'}
                </span>
                <div class="flex items-center gap-1 ml-auto shrink-0">
                  <button
                    onclick={() => handleLoad(dump)}
                    class="px-2 py-0.5 rounded text-blue-100 {
                      loadedPath === dump.bin_path
                        ? 'bg-green-700'
                        : 'bg-blue-800 hover:bg-blue-700'
                    }"
                  >
                    {loadedPath === dump.bin_path ? 'Geladen ✓' : 'Laden'}
                  </button>
                  <button
                    onclick={() => openPath(folderPath(dump.bin_path))}
                    class="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                  >
                    Ordner
                  </button>
                  {#if confirmDelete === dump.bin_path}
                    <button
                      onclick={() => handleDelete(dump.bin_path)}
                      class="px-2 py-0.5 rounded bg-red-700 hover:bg-red-600 text-white"
                    >
                      Bestätigen
                    </button>
                    <button
                      onclick={() => (confirmDelete = null)}
                      class="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
                    >
                      ✕
                    </button>
                  {:else}
                    <button
                      onclick={() => handleDelete(dump.bin_path)}
                      class="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-red-300"
                    >
                      Löschen
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <p class="text-gray-600 text-xs p-4">Keine Dumps archiviert.</p>
      {/each}
    </div>
  {/if}
</div>
