<script lang="ts">
  import { AlertTriangle } from 'lucide-svelte';
  import { trapFocus } from '$lib/utils/focusTrap';
  import { fade, scale } from 'svelte/transition';

  let {
    open = $bindable(false),
    title = 'Bestätigen',
    message = 'Bist du sicher?',
    confirmLabel = 'Bestätigen',
    confirmDanger = false,
    typeToConfirm = '',
    onconfirm,
  }: {
    open: boolean;
    title?: string;
    message?: string;
    confirmLabel?: string;
    confirmDanger?: boolean;
    /** If set, user must type this exact text to enable the confirm button. */
    typeToConfirm?: string;
    onconfirm?: () => void;
  } = $props();

  let typed = $state('');

  function handleConfirm() {
    if (typeToConfirm && typed !== typeToConfirm) return;
    onconfirm?.();
    open = false;
    typed = '';
  }

  function close() {
    open = false;
    typed = '';
  }
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') close(); }} />

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" transition:fade={{ duration: 150 }}>
    <div class="w-full max-w-sm rounded-2xl bg-gray-800 p-6 shadow-2xl border border-gray-700" use:trapFocus transition:scale={{ duration: 150, start: 0.96 }}>
      <div class="mb-4 flex items-start gap-3">
        <AlertTriangle class="h-6 w-6 shrink-0 mt-0.5 {confirmDanger ? 'text-red-400' : 'text-amber-400'}" />
        <div>
          <h3 class="text-base font-semibold text-gray-100">{title}</h3>
          <p class="mt-1 text-sm text-gray-400">{message}</p>
        </div>
      </div>

      {#if typeToConfirm}
        <div class="mb-4">
          <p class="text-xs text-gray-500 mb-1.5">
            Tippe <code class="text-amber-400 bg-gray-700 px-1 rounded">{typeToConfirm}</code> zum Bestätigen:
          </p>
          <input
            type="text"
            bind:value={typed}
            placeholder={typeToConfirm}
            class="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-teal-500 focus:outline-none"
          />
        </div>
      {/if}

      <div class="flex justify-end gap-2">
        <button class="rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-600" onclick={close}>
          Abbrechen
        </button>
        <button
          class="rounded-lg px-4 py-2 text-sm text-white disabled:opacity-40 {confirmDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'}"
          onclick={handleConfirm}
          disabled={typeToConfirm ? typed !== typeToConfirm : false}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
