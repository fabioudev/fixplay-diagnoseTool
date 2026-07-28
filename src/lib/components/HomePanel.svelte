<script lang="ts">
  // Start screen / dashboard — entry point for the application.
  // Shows quick-access cards for each diagnostic tool section.
  import { Cpu, Usb, Archive, Gamepad2, CircuitBoard, Home } from 'lucide-svelte';
  import FixplayIcon from './FixplayIcon.svelte';

  type View = 'flash' | 'uart' | 'i2c' | 'archive' | 'controller';

  let { onnavigate }: { onnavigate: (v: View) => void } = $props();

  const cards: { id: View; label: string; desc: string; icon: typeof Cpu; color: string }[] = [
    { id: 'flash', label: 'NOR Flash', desc: 'Flash-Speicher auslesen, validieren & archivieren', icon: Cpu, color: 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20' },
    { id: 'uart', label: 'UART', desc: 'Live-Fehlerdiagnose über serielle Konsole', icon: Usb, color: 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20' },
    { id: 'i2c', label: 'I2C / Pico', desc: 'Xbox-Fehlerdatenbank & I2C-Bridge', icon: CircuitBoard, color: 'bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20' },
    { id: 'controller', label: 'Controller', desc: 'DualSense-Diagnose, Test & Kalibrierung', icon: Gamepad2, color: 'bg-teal-500/10 border-teal-500/30 text-teal-400 hover:bg-teal-500/20' },
    { id: 'archive', label: 'Archiv', desc: 'Gespeicherte Dumps durchsuchen & verwalten', icon: Archive, color: 'bg-gray-500/10 border-gray-500/30 text-gray-400 hover:bg-gray-500/20' },
  ];
</script>

<div class="flex h-full flex-col items-center justify-center p-8">
  <!-- Logo + title -->
  <div class="mb-12 flex flex-col items-center gap-4">
    <FixplayIcon class="w-32 h-32" />
    <h1 class="text-3xl font-bold text-gray-100">fixplay diagnoseTool</h1>
    <p class="text-base text-gray-500">Diagnose-Werkzeuge für Konsolen-Reparatur</p>
  </div>

  <!-- Tool cards grid -->
  <div class="grid w-full max-w-3xl gap-4 sm:grid-cols-2 auto-rows-fr">
    {#each cards as card (card.id)}
      <button
        onclick={() => onnavigate(card.id)}
        class="flex items-start gap-5 rounded-xl border p-6 text-left transition-colors h-full {card.color}"
      >
        <div class="mt-0.5 shrink-0">
          <card.icon class="h-8 w-8" />
        </div>
        <div>
          <div class="text-base font-semibold">{card.label}</div>
          <div class="mt-1 text-sm opacity-70">{card.desc}</div>
        </div>
      </button>
    {/each}
  </div>

  <!-- Footer hint -->
  <p class="mt-10 text-sm text-gray-700">
    Wähle ein Werkzeug oder nutze die Seitenleiste zur Navigation.
  </p>
</div>
