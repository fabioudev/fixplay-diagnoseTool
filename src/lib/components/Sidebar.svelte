
<script lang="ts">

  import { Cpu, Usb, Archive, Settings, Gamepad2, CircuitBoard, Home } from 'lucide-svelte';
  import FixplayIcon from '$lib/components/FixplayIcon.svelte';
  import { flashProgrammers } from '$lib/stores/flash';
  import { appSettings } from '$lib/stores/settings';

  type View = 'home' | 'flash' | 'uart' | 'i2c' | 'archive' | 'controller';

  let {
    active,
    collapsed,
    onnavigate,
    onsettings,
  }: {
    active: View;
    collapsed: boolean;
    onnavigate: (v: View) => void;
    onsettings: () => void;
  } = $props();

  const items: { id: View; label: string; icon: typeof Cpu }[] = [
    { id: 'home',    label: 'Start',      icon: Home },
    { id: 'flash',   label: 'NOR Flash', icon: Cpu },
    { id: 'uart',    label: 'UART',      icon: Usb },
    { id: 'i2c',     label: 'I2C / Pico', icon: CircuitBoard },
    { id: 'controller', label: 'Controller', icon: Gamepad2 },
    { id: 'archive', label: 'Archiv',    icon: Archive },
  ];

  const programmerCount = $derived($flashProgrammers.length);
  const tabletMode      = $derived($appSettings.tablet_mode);
</script>

<aside
  class="flex flex-col bg-gray-900 border-r border-gray-800 h-full transition-[width] duration-200 shrink-0
         {collapsed ? 'w-14' : 'w-56'}"
  data-tablet={tabletMode}
>
  <!-- Brand -->
  <div class="flex items-center justify-center gap-2.5 h-14 border-b border-gray-800 shrink-0 {collapsed ? 'px-2' : 'px-4'}">
    <div class="shrink-0">
      <FixplayIcon class="w-10 h-10" />
    </div>
    {#if !collapsed}
      <div class="flex flex-col items-center leading-tight min-w-0">
        <span class="text-base font-semibold text-gray-100 truncate">Fixplay</span>
        <span class="text-[11px] text-gray-500 truncate">diagnoseTool</span>
      </div>
    {/if}
  </div>

  <!-- Nav -->
  <nav class="flex flex-col gap-1 p-2 flex-1">
    {#each items as item (item.id)}
      <button
        onclick={() => onnavigate(item.id)}
        class="flex items-center rounded-lg font-medium transition-colors text-left
               {collapsed ? 'justify-center px-2 py-3' : 'gap-3 px-3 py-2.5 text-sm'}
               {tabletMode ? 'py-3.5' : ''}
               {active === item.id
                 ? 'bg-blue-600/15 text-blue-300'
                 : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'}"
        aria-current={active === item.id ? 'page' : undefined}
        aria-label={item.label}
        title={collapsed ? item.label : undefined}
      >
        <item.icon class="w-5 h-5 shrink-0" />
        {#if !collapsed}
          <span class="truncate">{item.label}</span>
        {/if}
      </button>
    {/each}
  </nav>

  <!-- Footer: programmer status + settings -->
  <div class="p-2 border-t border-gray-800 shrink-0">
    <div
      class="flex items-center rounded-lg text-xs
             {collapsed ? 'justify-center px-2 py-2' : 'gap-2 px-3 py-2'}
             {programmerCount > 0 ? 'text-green-400' : 'text-gray-500'}"
      title={programmerCount > 0
        ? `${programmerCount} Programmer erkannt`
        : 'Kein Programmer erkannt'}
    >
      <span class="w-2 h-2 rounded-full shrink-0 {programmerCount > 0 ? 'bg-green-400' : 'bg-gray-600'}"></span>
      {#if !collapsed}
        <span class="truncate">{programmerCount > 0 ? `${programmerCount} Programmer` : 'Kein Programmer'}</span>
      {/if}
    </div>
    <button
      onclick={onsettings}
      class="w-full flex items-center rounded-lg font-medium transition-colors text-left
             {collapsed ? 'justify-center px-2 py-3' : 'gap-3 px-3 py-2.5 text-sm'}
             {tabletMode ? 'py-3.5' : ''}
             text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
      aria-label="Einstellungen"
      title={collapsed ? 'Einstellungen' : undefined}
    >
      <Settings class="w-5 h-5 shrink-0" />
      {#if !collapsed}
        <span>Einstellungen</span>
      {/if}
    </button>
  </div>
</aside>
