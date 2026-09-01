<script lang="ts">
  // Central toast renderer. Reads the shared `notifications` store and shows
  // one card per entry (newest on top). Sticky toasts (timeout_ms === 0, used
  // for errors) stay until dismissed; the rest auto-dismiss after their timeout.
  import { fly, fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { SvelteSet } from 'svelte/reactivity';
  import { notifications, dismissNotification } from '$lib/stores/notifications';
  import { X } from 'lucide-svelte';
  import LL from '$lib/i18n/i18n-svelte';

  // Auto-dismiss each non-sticky toast once its timeout elapses. Scheduled in a
  // $effect so the timers are cleaned up when the component tears down.
  let timers: Record<number, ReturnType<typeof setTimeout>> = {};
  $effect(() => {
    // Re-run whenever the queue changes: clear stale timers, arm new ones for
    // any non-sticky toast that doesn't already have one.
    const seen = new SvelteSet<number>();
    for (const n of $notifications) {
      seen.add(n.id);
      if (n.timeout_ms > 0 && !(n.id in timers)) {
        timers[n.id] = setTimeout(() => dismissNotification(n.id), n.timeout_ms);
      }
    }
    // Drop timers for toasts that have left the queue.
    for (const id of Object.keys(timers).map(Number)) {
      if (!seen.has(id)) {
        clearTimeout(timers[id]);
        delete timers[id];
      }
    }
  });

  const accent: Record<string, string> = {
    info: 'border-l-blue-500',
    success: 'border-l-green-500',
    warn: 'border-l-amber-500',
    error: 'border-l-red-500',
  };
  const iconColor: Record<string, string> = {
    info: 'text-blue-400',
    success: 'text-green-400',
    warn: 'text-amber-400',
    error: 'text-red-400',
  };
</script>

<div class="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
  {#each $notifications as n (n.id)}
    <div
      class="pointer-events-auto flex items-start gap-3 rounded-lg border border-gray-700 border-l-4 bg-gray-800 p-3 shadow-2xl {accent[
        n.level
      ]}"
      in:fly={{ y: 12, duration: 150 }}
      out:fade={{ duration: 120 }}
      animate:flip={{ duration: 120 }}
    >
      <span class="mt-0.5 text-xs font-bold uppercase {iconColor[n.level]}">{n.level}</span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-gray-100">{n.title}</p>
        {#if n.message}
          <p class="mt-0.5 text-xs text-gray-400 break-words">{n.message}</p>
        {/if}
      </div>
      <button
        class="shrink-0 text-gray-500 hover:text-gray-200"
        aria-label={$LL.common.closeNotificationAria()}
        onclick={() => dismissNotification(n.id)}
      >
        <X size={14} />
      </button>
    </div>
  {/each}
</div>
