
<script lang="ts">

  import { Cpu, Usb, Archive, Settings, Gamepad2, CircuitBoard, Home, Info } from 'lucide-svelte';
  import FixplayIcon from '$lib/components/FixplayIcon.svelte';
  import { flashProgrammers } from '$lib/stores/flash';
  import { appSettings } from '$lib/stores/settings';

  type View = 'home' | 'flash' | 'uart' | 'i2c' | 'archive' | 'controller';

  let {
    active,
    collapsed,
    onnavigate,
    onsettings,
    onabout,
  }: {
    active: View;
    collapsed: boolean;
    onnavigate: (v: View) => void;
    onsettings: () => void;
    onabout?: () => void;
  } = $props();

  const items: { id: View; label: string; icon: typeof Cpu; key: number }[] = [
    { id: 'home',    label: 'Start',      icon: Home,          key: 1 },
    { id: 'flash',   label: 'NOR Flash', icon: Cpu,           key: 2 },
    { id: 'uart',    label: 'UART',      icon: Usb,           key: 3 },
    { id: 'i2c',     label: 'I2C / Pico', icon: CircuitBoard, key: 4 },
    { id: 'controller', label: 'Controller', icon: Gamepad2,  key: 5 },
    { id: 'archive', label: 'Archiv',    icon: Archive,       key: 6 },
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
        title={`${item.label}  (Ctrl+${item.key})`}
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
    {#if onabout}
      <button
        onclick={onabout}
        class="w-full flex items-center rounded-lg font-medium transition-colors text-left
               {collapsed ? 'justify-center px-2 py-3' : 'gap-3 px-3 py-2.5 text-sm'}
               {tabletMode ? 'py-3.5' : ''}
               text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
        aria-label="Über"
        title={collapsed ? 'Über' : undefined}
      >
        <Info class="w-5 h-5 shrink-0" />
        {#if !collapsed}
          <span>Über</span>
        {/if}
      </button>
    {/if}
  </div>
</aside>
