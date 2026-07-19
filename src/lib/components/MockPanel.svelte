<script lang="ts">
  // Runtime mock control panel — only mounted in MOCK builds (guarded by
  // `__MOCK_MODE__` in +page.svelte). Binds directly to the reactive `mockState`
  // store, so every edit changes what the next backend `invoke()` returns in
  // the hosted web preview. State persists to localStorage (see state.ts).

  import { mockState, resetMockState, DEFAULT_MOCK_STATE } from '$lib/mock/state';
  import type { MockFlashState, MockUartState, MockHidState, MockControllerInput } from '$lib/mock/state';
  import type { DeviceInfo, NvsData, NorValidation, UartPortInfo, UartEntryEvent, ErrorSearchResult, DumpEntry } from '$lib/api/types';
  import type { HidDeviceInfo } from '$lib/controllers/tauri-hid-device';

  let open = $state(false);
  let tab = $state<'flash' | 'uart' | 'controller'>('flash');

  // Local mirrors for multi-line textareas (bind:value) so the cursor stays put.
  let programmersText = $state(($mockState.flash.programmers.join('\n')));
  let linesText = $state($mockState.uart.lines.join('\n'));

  const inputCls =
    'w-full bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5 border border-gray-700 placeholder:text-gray-600 focus:outline-none focus:border-gray-500';
  const lblCls = 'text-xs font-medium text-gray-400';
  const btnCls = 'px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 shrink-0';
  const btnDanger = 'px-2 py-1.5 text-xs rounded bg-red-900/70 hover:bg-red-800 text-red-200 shrink-0';

  const validationKeys: { key: keyof NorValidation; label: string }[] = [
    { key: 'size_ok', label: 'Size' },
    { key: 'header_ok', label: 'Header' },
    { key: 'mbr1_ok', label: 'MBR 1' },
    { key: 'mbr2_ok', label: 'MBR 2' },
    { key: 'emc_ipl_a_ok', label: 'EMC IPL A' },
    { key: 'emc_ipl_b_ok', label: 'EMC IPL B' },
    { key: 'usb_pdc_a_ok', label: 'USB PDC A' },
    { key: 'usb_pdc_b_ok', label: 'USB PDC B' },
  ];

  // --- generic section setters ---
  function setFlash<K extends keyof MockFlashState>(key: K, val: MockFlashState[K]): void {
    mockState.update((s) => ({ ...s, flash: { ...s.flash, [key]: val } }));
  }
  function setNvs<K extends keyof NvsData>(key: K, val: NvsData[K]): void {
    mockState.update((s) => ({ ...s, flash: { ...s.flash, nvs: { ...s.flash.nvs, [key]: val } } }));
  }
  function setValidation(key: keyof NorValidation, val: boolean): void {
    mockState.update((s) => ({ ...s, flash: { ...s.flash, validation: { ...s.flash.validation, [key]: val } } }));
  }
  function setUart<K extends keyof MockUartState>(key: K, val: MockUartState[K]): void {
    mockState.update((s) => ({ ...s, uart: { ...s.uart, [key]: val } }));
  }
  function setHid<K extends keyof MockHidState>(key: K, val: MockHidState[K]): void {
    mockState.update((s) => ({ ...s, hid: { ...s.hid, [key]: val } }));
  }

  // --- programmers (textarea → string[]) ---
  function onProgrammersInput(e: Event): void {
    const v = (e.target as HTMLTextAreaElement).value;
    setFlash('programmers', v.split('\n').map((t) => t.trim()).filter(Boolean));
  }

  // --- uart lines (textarea → string[]) ---
  function onLinesInput(e: Event): void {
    const v = (e.target as HTMLTextAreaElement).value;
    setUart('lines', v.split('\n'));
  }

  // --- flash devices ---
  function setDevice(i: number, patch: Partial<DeviceInfo>): void {
    mockState.update((s) => ({
      ...s,
      flash: { ...s.flash, devices: s.flash.devices.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) },
    }));
  }
  function addDevice(): void {
    const n = $mockState.flash.devices.length;
    mockState.update((s) => ({ ...s, flash: { ...s.flash, devices: [...s.flash.devices, { id: `dev-${n}`, name: 'Neuer Programmer', device_type: 'Ch341' }] } }));
  }
  function removeDevice(i: number): void {
    mockState.update((s) => ({ ...s, flash: { ...s.flash, devices: s.flash.devices.filter((_, idx) => idx !== i) } }));
  }

  // --- archive serials / dumps ---
  function setArchiveSerial(a: number, serial: string): void {
    mockState.update((s) => ({
      ...s,
      flash: { ...s.flash, archive: s.flash.archive.map((grp, idx) => (idx === a ? { ...grp, serial, dumps: grp.dumps.map((d) => ({ ...d, serial })) } : grp)) },
    }));
  }
  function setDump(a: number, d: number, patch: Partial<DumpEntry>): void {
    mockState.update((s) => ({
      ...s,
      flash: {
        ...s.flash,
        archive: s.flash.archive.map((grp, gi) =>
          gi === a ? { ...grp, dumps: grp.dumps.map((dump, di) => (di === d ? { ...dump, ...patch } : dump)) } : grp,
        ),
      },
    }));
  }
  function addDump(a: number): void {
    const serial = $mockState.flash.archive[a]?.serial ?? 'SN-NEW';
    const dump: DumpEntry = { bin_path: `/mock/archive/${serial}/new.bin`, timestamp: Date.now(), size_bytes: 2 * 1024 * 1024, validation_ok: true, fw_version: '21.01.04.00', serial };
    mockState.update((s) => ({
      ...s,
      flash: { ...s.flash, archive: s.flash.archive.map((grp, gi) => (gi === a ? { ...grp, dumps: [...grp.dumps, dump] } : grp)) },
    }));
  }
  function removeDump(a: number, d: number): void {
    mockState.update((s) => ({
      ...s,
      flash: { ...s.flash, archive: s.flash.archive.map((grp, gi) => (gi === a ? { ...grp, dumps: grp.dumps.filter((_, di) => di !== d) } : grp)) },
    }));
  }
  function addArchive(): void {
    mockState.update((s) => ({ ...s, flash: { ...s.flash, archive: [...s.flash.archive, { serial: 'SN-NEW', dumps: [] }] } }));
  }
  function removeArchive(a: number): void {
    mockState.update((s) => ({ ...s, flash: { ...s.flash, archive: s.flash.archive.filter((_, idx) => idx !== a) } }));
  }

  // --- uart ports ---
  function setPort(i: number, patch: Partial<UartPortInfo>): void {
    mockState.update((s) => ({ ...s, uart: { ...s.uart, ports: s.uart.ports.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) } }));
  }
  function addPort(): void {
    mockState.update((s) => ({ ...s, uart: { ...s.uart, ports: [...s.uart.ports, { name: '/dev/ttyUSB2', is_bridge: false, description: 'Neuer Port (Mock)' }] } }));
  }
  function removePort(i: number): void {
    mockState.update((s) => ({ ...s, uart: { ...s.uart, ports: s.uart.ports.filter((_, idx) => idx !== i) } }));
  }

  // --- uart entries ---
  function setEntry(i: number, patch: Partial<UartEntryEvent['entry']>, description?: string | null): void {
    mockState.update((s) => ({
      ...s,
      uart: {
        ...s.uart,
        entries: s.uart.entries.map((e, idx) =>
          idx === i ? { entry: { ...e.entry, ...patch }, description: description !== undefined ? description : e.description } : e,
        ),
      },
    }));
  }
  function addEntry(): void {
    const entry: UartEntryEvent = { entry: { error_code: 0xe0000002, timestamp: Date.now(), power_states: 1, up_cause: 1, temp_soc: 40, raw_fields: ['E0000002', '0001', '0001', '0031'] }, description: 'Neuer Fehlereintrag (Mock)' };
    mockState.update((s) => ({ ...s, uart: { ...s.uart, entries: [...s.uart.entries, entry] } }));
  }
  function removeEntry(i: number): void {
    mockState.update((s) => ({ ...s, uart: { ...s.uart, entries: s.uart.entries.filter((_, idx) => idx !== i) } }));
  }

  // --- uart search results ---
  function setSearch(i: number, patch: Partial<ErrorSearchResult>): void {
    mockState.update((s) => ({ ...s, uart: { ...s.uart, search_results: s.uart.search_results.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) } }));
  }
  function addSearch(): void {
    mockState.update((s) => ({ ...s, uart: { ...s.uart, search_results: [...s.uart.search_results, { code: 0xe0000002, description: 'Mock-Treffer für "{query}"', category: 'generic' }] } }));
  }
  function removeSearch(i: number): void {
    mockState.update((s) => ({ ...s, uart: { ...s.uart, search_results: s.uart.search_results.filter((_, idx) => idx !== i) } }));
  }

  // --- hid devices ---
  function setHidDevice(i: number, patch: Partial<HidDeviceInfo>): void {
    mockState.update((s) => ({ ...s, hid: { ...s.hid, devices: s.hid.devices.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) } }));
  }
  function addHidDevice(): void {
    mockState.update((s) => ({ ...s, hid: { ...s.hid, devices: [...s.hid.devices, { vendor_id: 0x054c, product_id: 0x0ce6, manufacturer: 'Mock', product: 'Mock Controller', serial_number: null, usage_page: 1, usage: 5 }] } }));
  }
  function removeHidDevice(i: number): void {
    mockState.update((s) => ({ ...s, hid: { ...s.hid, devices: s.hid.devices.filter((_, idx) => idx !== i) } }));
  }

  // --- simulated controller input (drives the live visualizer in MOCK mode) ---
  const SIM_BUTTONS = [
    'up', 'down', 'left', 'right',
    'triangle', 'circle', 'cross', 'square',
    'l1', 'r1', 'l3', 'r3',
    'create', 'options', 'ps', 'touchpad', 'mute',
  ] as const;
  function setInput<K extends keyof MockControllerInput>(key: K, val: MockControllerInput[K]): void {
    mockState.update((s) => ({ ...s, hid: { ...s.hid, input: { ...s.hid.input, [key]: val } } }));
  }
  function toggleButton(name: string): void {
    mockState.update((s) => ({ ...s, hid: { ...s.hid, input: { ...s.hid.input, buttons: { ...s.hid.input.buttons, [name]: !s.hid.input.buttons[name] } } } }));
  }
  function clearButtons(): void {
    mockState.update((s) => ({ ...s, hid: { ...s.hid, input: { ...s.hid.input, buttons: {} } } }));
  }
  function resetInput(): void {
    mockState.update((s) => ({ ...s, hid: { ...s.hid, input: { ...DEFAULT_MOCK_STATE.hid.input, buttons: {} } } }));
  }
  function signed(v: string): number { const n = Number(v); return Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0; }

  // --- helpers ---
  function hex(n: number): string { return '0x' + n.toString(16); }
  function parseHex(v: string): number { return parseInt(v.replace(/^0x/i, ''), 16) || 0; }
  function num(v: string): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  function reset(): void {
    resetMockState();
    programmersText = DEFAULT_MOCK_STATE.flash.programmers.join('\n');
    linesText = DEFAULT_MOCK_STATE.uart.lines.join('\n');
  }
</script>

<!-- Floating launcher -->
{#if !open}
  <button
    onclick={() => (open = true)}
    class="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3.5 py-2.5 rounded-full
           bg-amber-500/90 hover:bg-amber-400 text-gray-950 text-sm font-semibold shadow-lg
           border border-amber-300/50 transition-colors"
    title="Mock-Daten der Vorschau live ändern"
  >
    <span>🎭</span>
    <span>Mock</span>
  </button>
{/if}

{#if open}
  <!-- Backdrop -->
  <div class="fixed inset-0 bg-black/40 z-40" role="presentation" onclick={() => (open = false)}></div>

  <!-- Panel -->
  <div class="fixed top-0 right-0 h-full w-[30rem] max-w-[92vw] bg-gray-900 border-l border-gray-700
              shadow-xl z-50 flex flex-col">
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
      <div class="flex flex-col leading-tight">
        <h2 class="text-sm font-semibold text-amber-300">Mock-Steuerung</h2>
        <span class="text-[10px] text-gray-500">Nur Vorschau — Änderungen gelten live</span>
      </div>
      <div class="flex items-center gap-2">
        <button onclick={reset} class={btnDanger} title="Alle Mock-Werte auf Standard zurücksetzen">Zurücksetzen</button>
        <button onclick={() => (open = false)} class="text-gray-400 hover:text-gray-200 text-lg leading-none" title="Schließen">✕</button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-gray-700 shrink-0">
      {#each ([{ id: 'flash', label: 'Flash' }, { id: 'uart', label: 'UART' }, { id: 'controller', label: 'Controller' }] as const) as t (t.id)}
        <button
          onclick={() => (tab = t.id)}
          class="flex-1 px-3 py-2.5 text-xs font-medium transition-colors
                 {tab === t.id ? 'text-amber-300 border-b-2 border-amber-400 bg-amber-500/5' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'}"
        >{t.label}</button>
      {/each}
    </div>

    <div class="flex flex-col gap-5 p-4 overflow-y-auto flex-1">

      <!-- ===================== FLASH ===================== -->
      {#if tab === 'flash'}
        <section class="flex flex-col gap-3">
          <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Programmer &amp; Geräte</h3>
          <div class="flex flex-col gap-1">
            <label class={lblCls}>Programmer (eine pro Zeile)</label>
            <textarea bind:value={programmersText} oninput={onProgrammersInput} rows="3" class={inputCls}></textarea>
          </div>

          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <label class={lblCls}>Gefundene Geräte</label>
              <button onclick={addDevice} class={btnCls}>+ Gerät</button>
            </div>
            {#each $mockState.flash.devices as dev, i (i)}
              <div class="flex flex-col gap-1 p-2 rounded bg-gray-800/50 border border-gray-700">
                <div class="flex gap-2">
                  <input value={dev.id} oninput={(e) => setDevice(i, { id: (e.target as HTMLInputElement).value })} placeholder="id" class={inputCls} />
                  <select value={dev.device_type} onchange={(e) => setDevice(i, { device_type: (e.target as HTMLSelectElement).value as DeviceInfo['device_type'] })} class={inputCls + ' shrink-0 w-24'}>
                    <option value="Ch341">Ch341</option>
                    <option value="Uart">Uart</option>
                  </select>
                  <button onclick={() => removeDevice(i)} class={btnDanger} title="Entfernen">✕</button>
                </div>
                <input value={dev.name} oninput={(e) => setDevice(i, { name: (e.target as HTMLInputElement).value })} placeholder="Name" class={inputCls} />
              </div>
            {/each}
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">NOR-Dump (NVS &amp; Validierung)</h3>
          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1"><label class={lblCls}>Seriennummer</label><input value={$mockState.flash.nvs.serial} oninput={(e) => setNvs('serial', (e.target as HTMLInputElement).value)} class={inputCls} /></div>
            <div class="flex flex-col gap-1"><label class={lblCls}>MAC-Adresse</label><input value={$mockState.flash.nvs.mac_address} oninput={(e) => setNvs('mac_address', (e.target as HTMLInputElement).value)} class={inputCls} /></div>
            <div class="flex flex-col gap-1"><label class={lblCls}>SKU</label><input value={$mockState.flash.nvs.sku} oninput={(e) => setNvs('sku', (e.target as HTMLInputElement).value)} class={inputCls} /></div>
            <div class="flex flex-col gap-1"><label class={lblCls}>Board-ID</label><input value={$mockState.flash.nvs.board_id} oninput={(e) => setNvs('board_id', (e.target as HTMLInputElement).value)} class={inputCls} /></div>
            <div class="flex flex-col gap-1"><label class={lblCls}>Console-Type</label><input type="number" value={$mockState.flash.nvs.console_type} oninput={(e) => setNvs('console_type', num((e.target as HTMLInputElement).value))} class={inputCls} /></div>
            <div class="flex flex-col gap-1"><label class={lblCls}>FW-Version</label><input value={$mockState.flash.nvs.fw_version} oninput={(e) => setNvs('fw_version', (e.target as HTMLInputElement).value)} class={inputCls} /></div>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class={lblCls}>Validierung</label>
            <div class="grid grid-cols-2 gap-1.5">
              {#each validationKeys as vk (vk.key)}
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={$mockState.flash.validation[vk.key]} onchange={(e) => setValidation(vk.key, (e.target as HTMLInputElement).checked)} class="accent-amber-500 w-4 h-4" />
                  <span class="text-xs text-gray-300">{vk.label}</span>
                </label>
              {/each}
            </div>
          </div>

          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={$mockState.flash.dumps_match} onchange={(e) => setFlash('dumps_match', (e.target as HTMLInputElement).checked)} class="accent-amber-500 w-4 h-4" />
            <span class="text-xs text-gray-300">zwei Lese-Durchläufe stimmen überein (dumps_match)</span>
          </label>

          <div class="grid grid-cols-3 gap-2">
            <div class="flex flex-col gap-1"><label class={lblCls}>Read ms/Schritt</label><input type="number" value={$mockState.flash.read_step_ms} oninput={(e) => setFlash('read_step_ms', num((e.target as HTMLInputElement).value))} class={inputCls} /></div>
            <div class="flex flex-col gap-1"><label class={lblCls}>Write ms/Schritt</label><input type="number" value={$mockState.flash.write_step_ms} oninput={(e) => setFlash('write_step_ms', num((e.target as HTMLInputElement).value))} class={inputCls} /></div>
            <div class="flex flex-col gap-1"><label class={lblCls}>Verify ms/Schritt</label><input type="number" value={$mockState.flash.verify_step_ms} oninput={(e) => setFlash('verify_step_ms', num((e.target as HTMLInputElement).value))} class={inputCls} /></div>
          </div>
        </section>

        <section class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Archiv</h3>
            <button onclick={addArchive} class={btnCls}>+ Seriennummer</button>
          </div>
          {#each $mockState.flash.archive as grp, a (a)}
            <div class="flex flex-col gap-2 p-2 rounded bg-gray-800/50 border border-gray-700">
              <div class="flex gap-2">
                <input value={grp.serial} oninput={(e) => setArchiveSerial(a, (e.target as HTMLInputElement).value)} placeholder="Seriennummer" class={inputCls} />
                <button onclick={() => removeArchive(a)} class={btnDanger} title="Gruppe entfernen">✕</button>
              </div>
              {#each grp.dumps as dump, d (d)}
                <div class="flex flex-col gap-1 pl-2 border-l border-gray-700">
                  <div class="flex gap-2 items-end">
                    <div class="flex flex-col gap-1 flex-1"><label class={lblCls}>FW</label><input value={dump.fw_version ?? ''} oninput={(e) => setDump(a, d, { fw_version: (e.target as HTMLInputElement).value || null })} class={inputCls} /></div>
                    <div class="flex flex-col gap-1 w-28"><label class={lblCls}>Größe (Bytes)</label><input type="number" value={dump.size_bytes} oninput={(e) => setDump(a, d, { size_bytes: num((e.target as HTMLInputElement).value) })} class={inputCls} /></div>
                    <label class="flex items-center gap-1.5 cursor-pointer select-none pb-1.5"><input type="checkbox" checked={dump.validation_ok} onchange={(e) => setDump(a, d, { validation_ok: (e.target as HTMLInputElement).checked })} class="accent-amber-500 w-4 h-4" /><span class="text-xs text-gray-300">OK</span></label>
                    <button onclick={() => removeDump(a, d)} class={btnDanger} title="Dump entfernen">✕</button>
                  </div>
                </div>
              {/each}
              <button onclick={() => addDump(a)} class={btnCls + ' self-start'}>+ Dump</button>
            </div>
          {/each}
        </section>

      <!-- ===================== UART ===================== -->
      {:else if tab === 'uart'}
        <section class="flex flex-col gap-3">
          <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Verbindung</h3>
          <div class="flex flex-col gap-2">
            <label class="flex items-center gap-2 cursor-pointer select-none"><input type="checkbox" checked={$mockState.uart.connected} onchange={(e) => setUart('connected', (e.target as HTMLInputElement).checked)} class="accent-amber-500 w-4 h-4" /><span class="text-xs text-gray-300">verbunden (uart_poll)</span></label>
            <label class="flex items-center gap-2 cursor-pointer select-none"><input type="checkbox" checked={$mockState.uart.reconnecting} onchange={(e) => setUart('reconnecting', (e.target as HTMLInputElement).checked)} class="accent-amber-500 w-4 h-4" /><span class="text-xs text-gray-300">reconnecting</span></label>
            <label class="flex items-center gap-2 cursor-pointer select-none"><input type="checkbox" checked={$mockState.uart.loopback_ok} onchange={(e) => setUart('loopback_ok', (e.target as HTMLInputElement).checked)} class="accent-amber-500 w-4 h-4" /><span class="text-xs text-gray-300">Loopback-Test OK</span></label>
            <div class="flex flex-col gap-1">
              <label class={lblCls}>Error-DB Einträge (0 = keine DB)</label>
              <input type="number" value={$mockState.uart.db_count ?? 0} oninput={(e) => setUart('db_count', num((e.target as HTMLInputElement).value) || null)} class={inputCls} />
            </div>
          </div>
        </section>

        <section class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Ports</h3>
            <button onclick={addPort} class={btnCls}>+ Port</button>
          </div>
          {#each $mockState.uart.ports as port, i (i)}
            <div class="flex flex-col gap-1 p-2 rounded bg-gray-800/50 border border-gray-700">
              <div class="flex gap-2">
                <input value={port.name} oninput={(e) => setPort(i, { name: (e.target as HTMLInputElement).value })} placeholder="Port" class={inputCls} />
                <button onclick={() => removePort(i)} class={btnDanger} title="Entfernen">✕</button>
              </div>
              <input value={port.description} oninput={(e) => setPort(i, { description: (e.target as HTMLInputElement).value })} placeholder="Beschreibung" class={inputCls} />
              <label class="flex items-center gap-2 cursor-pointer select-none"><input type="checkbox" checked={port.is_bridge} onchange={(e) => setPort(i, { is_bridge: (e.target as HTMLInputElement).checked })} class="accent-amber-500 w-4 h-4" /><span class="text-xs text-gray-300">UART-Bridge (PS5-Diagnose)</span></label>
            </div>
          {/each}
        </section>

        <section class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Fehlereinträge (errlog)</h3>
            <button onclick={addEntry} class={btnCls}>+ Eintrag</button>
          </div>
          {#each $mockState.uart.entries as ent, i (i)}
            <div class="flex flex-col gap-1.5 p-2 rounded bg-gray-800/50 border border-gray-700">
              <div class="flex gap-2">
                <div class="flex flex-col gap-1 w-32"><label class={lblCls}>Error-Code (hex)</label><input value={hex(ent.entry.error_code)} oninput={(e) => setEntry(i, { error_code: parseHex((e.target as HTMLInputElement).value) })} class={inputCls} /></div>
                <div class="flex flex-col gap-1 w-20"><label class={lblCls}>Power</label><input type="number" value={ent.entry.power_states} oninput={(e) => setEntry(i, { power_states: num((e.target as HTMLInputElement).value) })} class={inputCls} /></div>
                <div class="flex flex-col gap-1 w-20"><label class={lblCls}>Up-Cause</label><input type="number" value={ent.entry.up_cause} oninput={(e) => setEntry(i, { up_cause: num((e.target as HTMLInputElement).value) })} class={inputCls} /></div>
                <div class="flex flex-col gap-1 w-20"><label class={lblCls}>Temp °C</label><input type="number" value={ent.entry.temp_soc} oninput={(e) => setEntry(i, { temp_soc: num((e.target as HTMLInputElement).value) })} class={inputCls} /></div>
                <button onclick={() => removeEntry(i)} class={btnDanger} title="Entfernen">✕</button>
              </div>
              <input value={ent.description ?? ''} oninput={(e) => setEntry(i, {}, (e.target as HTMLInputElement).value || null)} placeholder="Beschreibung" class={inputCls} />
            </div>
          {/each}
        </section>

        <section class="flex flex-col gap-2">
          <div class="flex flex-col gap-1">
            <label class={lblCls}>Rohe UART-Zeilen (eine pro Zeile)</label>
            <textarea bind:value={linesText} oninput={onLinesInput} rows="4" class={inputCls}></textarea>
          </div>
        </section>

        <section class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Error-DB Suche (Treffer)</h3>
            <button onclick={addSearch} class={btnCls}>+ Treffer</button>
          </div>
          <p class="text-[11px] text-gray-600">Beschreibung darf „&#123;query&#125;" enthalten — wird durch den Suchbegriff ersetzt.</p>
          {#each $mockState.uart.search_results as res, i (i)}
            <div class="flex flex-col gap-1 p-2 rounded bg-gray-800/50 border border-gray-700">
              <div class="flex gap-2">
                <input value={hex(res.code)} oninput={(e) => setSearch(i, { code: parseHex((e.target as HTMLInputElement).value) })} class={inputCls + ' w-32'} title="Code (hex)" />
                <input value={res.category} oninput={(e) => setSearch(i, { category: (e.target as HTMLInputElement).value })} class={inputCls + ' w-28'} placeholder="Kategorie" />
                <button onclick={() => removeSearch(i)} class={btnDanger}>✕</button>
              </div>
              <input value={res.description} oninput={(e) => setSearch(i, { description: (e.target as HTMLInputElement).value })} placeholder="Beschreibung" class={inputCls} />
            </div>
          {/each}
        </section>

      <!-- ===================== CONTROLLER ===================== -->
      {:else if tab === 'controller'}
        <section class="flex flex-col gap-3">
          <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">HID / Controller</h3>
          <label class="flex items-center gap-2 cursor-pointer select-none"><input type="checkbox" checked={$mockState.hid.connected} onchange={(e) => setHid('connected', (e.target as HTMLInputElement).checked)} class="accent-amber-500 w-4 h-4" /><span class="text-xs text-gray-300">verbunden (hid_poll)</span></label>

          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <label class={lblCls}>Geräte</label>
              <button onclick={addHidDevice} class={btnCls}>+ Gerät</button>
            </div>
            {#each $mockState.hid.devices as dev, i (i)}
              <div class="flex flex-col gap-1 p-2 rounded bg-gray-800/50 border border-gray-700">
                <div class="flex gap-2">
                  <div class="flex flex-col gap-1 w-28"><label class={lblCls}>VID (hex)</label><input value={hex(dev.vendor_id)} oninput={(e) => setHidDevice(i, { vendor_id: parseHex((e.target as HTMLInputElement).value) })} class={inputCls} /></div>
                  <div class="flex flex-col gap-1 w-28"><label class={lblCls}>PID (hex)</label><input value={hex(dev.product_id)} oninput={(e) => setHidDevice(i, { product_id: parseHex((e.target as HTMLInputElement).value) })} class={inputCls} /></div>
                  <button onclick={() => removeHidDevice(i)} class={btnDanger} title="Entfernen">✕</button>
                </div>
                <input value={dev.manufacturer ?? ''} oninput={(e) => setHidDevice(i, { manufacturer: (e.target as HTMLInputElement).value || null })} placeholder="Hersteller" class={inputCls} />
                <input value={dev.product ?? ''} oninput={(e) => setHidDevice(i, { product: (e.target as HTMLInputElement).value || null })} placeholder="Produkt" class={inputCls} />
              </div>
            {/each}
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">Simulierter Input</h3>
            <button onclick={resetInput} class={btnCls}>Reset</button>
          </div>
          <p class="text-[11px] text-gray-600">Steuerung für die Live-Visualisierung. Tasten klicken zum Umschalten, Sticks/Trigger per Slider.</p>

          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1"><label class={lblCls}>LX (-1…1)</label><input type="range" min="-1" max="1" step="0.01" value={$mockState.hid.input.lx} oninput={(e) => setInput('lx', signed((e.target as HTMLInputElement).value))} class="accent-teal-500" /></div>
            <div class="flex flex-col gap-1"><label class={lblCls}>LY (-1…1)</label><input type="range" min="-1" max="1" step="0.01" value={$mockState.hid.input.ly} oninput={(e) => setInput('ly', signed((e.target as HTMLInputElement).value))} class="accent-teal-500" /></div>
            <div class="flex flex-col gap-1"><label class={lblCls}>RX (-1…1)</label><input type="range" min="-1" max="1" step="0.01" value={$mockState.hid.input.rx} oninput={(e) => setInput('rx', signed((e.target as HTMLInputElement).value))} class="accent-teal-500" /></div>
            <div class="flex flex-col gap-1"><label class={lblCls}>RY (-1…1)</label><input type="range" min="-1" max="1" step="0.01" value={$mockState.hid.input.ry} oninput={(e) => setInput('ry', signed((e.target as HTMLInputElement).value))} class="accent-teal-500" /></div>
            <div class="flex flex-col gap-1"><label class={lblCls}>L2 (0…255)</label><input type="range" min="0" max="255" value={$mockState.hid.input.l2} oninput={(e) => setInput('l2', num((e.target as HTMLInputElement).value))} class="accent-teal-500" /></div>
            <div class="flex flex-col gap-1"><label class={lblCls}>R2 (0…255)</label><input type="range" min="0" max="255" value={$mockState.hid.input.r2} oninput={(e) => setInput('r2', num((e.target as HTMLInputElement).value))} class="accent-teal-500" /></div>
          </div>

          <div class="flex flex-col gap-1">
            <label class={lblCls}>Batterie (0…100)</label>
            <input type="range" min="0" max="100" value={$mockState.hid.input.battery} oninput={(e) => setInput('battery', num((e.target as HTMLInputElement).value))} class="accent-teal-500" />
            <label class="flex items-center gap-2 cursor-pointer select-none mt-1"><input type="checkbox" checked={$mockState.hid.input.charging} onchange={(e) => setInput('charging', (e.target as HTMLInputElement).checked)} class="accent-amber-500 w-4 h-4" /><span class="text-xs text-gray-300">lädt</span></label>
          </div>

          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between"><label class={lblCls}>Buttons</label><button onclick={clearButtons} class={btnCls}>alle lösen</button></div>
            <div class="flex flex-wrap gap-1.5">
              {#each SIM_BUTTONS as name (name)}
                <button
                  onclick={() => toggleButton(name)}
                  class="px-2 py-1 text-xs rounded border {$mockState.hid.input.buttons[name] ? 'bg-teal-500/30 border-teal-400 text-teal-200' : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:bg-gray-700'}"
                >{name}</button>
              {/each}
            </div>
          </div>
        </section>
      {/if}

    </div>

    <div class="px-4 py-3 border-t border-gray-700">
      <p class="text-[11px] text-gray-600">Werte werden im Browser gespeichert. Klick „Zurücksetzen” für die Defaults.</p>
    </div>
  </div>
{/if}