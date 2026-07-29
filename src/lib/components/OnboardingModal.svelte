<script lang="ts">
  // First-run overlay shown once per install (guarded by a localStorage flag).
  // Gives a 30-second tour of the four tools so a new user knows what's where
  // without reading the wiki. Re-openable from the About dialog via `open`.
  import { Cpu, Usb, CircuitBoard, Gamepad2, ArrowRight } from 'lucide-svelte';
  import { trapFocus } from '$lib/utils/focusTrap';
  import { fade, scale } from 'svelte/transition';

  let { open = $bindable(false) }: { open: boolean } = $props();

  const STORAGE_KEY = 'fixplay-onboarding-done';

  const tools = [
    { icon: Cpu,         title: 'NOR Flash',  desc: 'Liest, validiert und archiviert NOR-Dumps einer Konsole über flashrom (CH341A, RT809H …).' },
    { icon: Usb,         title: 'UART',        desc: 'Live-Fehlersuche: Errlog lesen, Fehlercode-Datenbank, Loopback-Test.' },
    { icon: CircuitBoard, title: 'I2C / Pico', desc: 'Xbox-I2C-Diagnose über eine Pico-USB-CDC-Bridge — EEPROM, Errlog, Scan.' },
    { icon: Gamepad2,    title: 'Controller',  desc: 'DualSense-Kalibrierung, Tester für Licht/Vibration/Trigger, Schnelltest.' },
  ];

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    open = false;
  }

  function skip() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    open = false;
  }
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') dismiss(); }} />

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" transition:fade={{ duration: 150 }}>
    <div class="w-full max-w-md rounded-2xl bg-gray-800 p-6 shadow-2xl border border-gray-700" use:trapFocus transition:scale={{ duration: 150, start: 0.96 }}>
      <h2 class="text-lg font-semibold text-gray-100">Willkommen beim fixplay diagnoseTool</h2>
      <p class="mt-1 text-sm text-gray-400">
        Vier Werkzeuge für die Konsolen-Reparatur. Kurz erklärt, was wo zu finden ist:
      </p>

      <div class="mt-4 flex flex-col gap-3">
        {#each tools as t (t.title)}
          <div class="flex items-start gap-3">
            <div class="shrink-0 rounded-lg bg-gray-700 p-2">
              <t.icon class="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <p class="text-sm font-medium text-gray-200">{t.title}</p>
              <p class="text-xs text-gray-500">{t.desc}</p>
            </div>
          </div>
        {/each}
      </div>

      <p class="mt-4 text-xs text-gray-600">
        Tipp: Wechsle Panels per <kbd class="px-1 rounded bg-gray-700">Ctrl</kbd>+<kbd class="px-1 rounded bg-gray-700">1</kbd>–<kbd class="px-1 rounded bg-gray-700">6</kbd>. Details im Wiki.
      </p>

      <div class="mt-5 flex justify-between items-center gap-2">
        <button class="text-xs text-gray-500 hover:text-gray-300" onclick={skip}>Nicht mehr zeigen</button>
        <button
          class="flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 px-4 py-2 text-sm text-white"
          onclick={dismiss}
        >
          Los geht's <ArrowRight class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
{/if}