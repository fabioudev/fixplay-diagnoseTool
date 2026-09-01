<script lang="ts">
  // Runtime mock control panel — only mounted in MOCK builds (guarded by
  // `__MOCK_MODE__` in +page.svelte). Binds directly to the reactive `mockState`
  // store, so every edit changes what the next backend `invoke()` returns in
  // the hosted web preview. State persists to localStorage (see state.ts).

  import { mockState, resetMockState, DEFAULT_MOCK_STATE, ERROR_INJECTABLE } from '$lib/mock/state';
  import type {
    MockFlashState,
    MockUartState,
    MockHidState,
    MockI2cState,
    MockControllerInput,
  } from '$lib/mock/state';
  import type {
    DeviceInfo,
    NvsData,
    NorValidation,
    UartPortInfo,
    UartEntryEvent,
    ErrorSearchResult,
    DumpEntry,
  } from '$lib/api/types';
  import type { HidDeviceInfo } from '$lib/controllers/tauri-hid-device';
  import { copyToClipboard } from '$lib/utils/clipboard';
  import { Copy } from 'lucide-svelte';
  import { get } from 'svelte/store';
  import LL from '$lib/i18n/i18n-svelte';

  let open = $state(false);
  let tab = $state<'flash' | 'uart' | 'i2c' | 'controller'>('flash');
  let copiedState = $state(false);

  // Local mirrors for multi-line textareas (bind:value) so the cursor stays put.
  let programmersText = $state($mockState.flash.programmers.join('\n'));
  let linesText = $state($mockState.uart.lines.join('\n'));

  const inputCls =
    'w-full bg-gray-800 text-gray-100 text-xs rounded px-2 py-1.5 border border-gray-700 placeholder:text-gray-600 focus:outline-none focus:border-gray-500';
  const lblCls = 'text-xs font-medium text-gray-400';
  const btnCls = 'px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 shrink-0';
  const btnDanger =
    'px-2 py-1.5 text-xs rounded bg-red-900/70 hover:bg-red-800 text-red-200 shrink-0';

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
    mockState.update((s) => ({
      ...s,
      flash: { ...s.flash, validation: { ...s.flash.validation, [key]: val } },
    }));
  }
  function setUart<K extends keyof MockUartState>(key: K, val: MockUartState[K]): void {
    mockState.update((s) => ({ ...s, uart: { ...s.uart, [key]: val } }));
  }
  function setI2c<K extends keyof MockI2cState>(key: K, val: MockI2cState[K]): void {
    mockState.update((s) => ({ ...s, i2c: { ...s.i2c, [key]: val } }));
  }
  function copyState() {
    copyToClipboard(JSON.stringify($mockState, null, 2), (ok) => {
      if (ok) {
        copiedState = true;
        setTimeout(() => (copiedState = false), 1500);
      }
    });
  }
  function setHid<K extends keyof MockHidState>(key: K, val: MockHidState[K]): void {
    mockState.update((s) => ({ ...s, hid: { ...s.hid, [key]: val } }));
  }

  // --- programmers (textarea → string[]) ---
  function onProgrammersInput(e: Event): void {
    const v = (e.target as HTMLTextAreaElement).value;
    setFlash(
      'programmers',
      v
        .split('\n')
        .map((t) => t.trim())
        .filter(Boolean)
    );
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
      flash: {
        ...s.flash,
        devices: s.flash.devices.map((d, idx) => (idx === i ? { ...d, ...patch } : d)),
      },
    }));
  }
  function addDevice(): void {
    const n = $mockState.flash.devices.length;
    mockState.update((s) => ({
      ...s,
      flash: {
        ...s.flash,
        devices: [
          ...s.flash.devices,
          { id: `dev-${n}`, name: get(LL).mock.newProgrammer(), device_type: 'Ch341' },
        ],
      },
    }));
  }
  function removeDevice(i: number): void {
    mockState.update((s) => ({
      ...s,
      flash: { ...s.flash, devices: s.flash.devices.filter((_, idx) => idx !== i) },
    }));
  }

  // --- archive serials / dumps ---
  function setArchiveSerial(a: number, serial: string): void {
    mockState.update((s) => ({
      ...s,
      flash: {
        ...s.flash,
        archive: s.flash.archive.map((grp, idx) =>
          idx === a ? { ...grp, serial, dumps: grp.dumps.map((d) => ({ ...d, serial })) } : grp
        ),
      },
    }));
  }
  function setDump(a: number, d: number, patch: Partial<DumpEntry>): void {
    mockState.update((s) => ({
      ...s,
      flash: {
        ...s.flash,
        archive: s.flash.archive.map((grp, gi) =>
          gi === a
            ? {
                ...grp,
                dumps: grp.dumps.map((dump, di) => (di === d ? { ...dump, ...patch } : dump)),
              }
            : grp
        ),
      },
    }));
  }
  function addDump(a: number): void {
    const serial = $mockState.flash.archive[a]?.serial ?? 'SN-NEW';
    const dump: DumpEntry = {
      bin_path: `/mock/archive/${serial}/new.bin`,
      timestamp: Date.now(),
      size_bytes: 2 * 1024 * 1024,
      validation_ok: true,
      fw_version: '21.01.04.00',
      serial,
    };
    mockState.update((s) => ({
      ...s,
      flash: {
        ...s.flash,
        archive: s.flash.archive.map((grp, gi) =>
          gi === a ? { ...grp, dumps: [...grp.dumps, dump] } : grp
        ),
      },
    }));
  }
  function removeDump(a: number, d: number): void {
    mockState.update((s) => ({
      ...s,
      flash: {
        ...s.flash,
        archive: s.flash.archive.map((grp, gi) =>
          gi === a ? { ...grp, dumps: grp.dumps.filter((_, di) => di !== d) } : grp
        ),
      },
    }));
  }
  function addArchive(): void {
    mockState.update((s) => ({
      ...s,
      flash: { ...s.flash, archive: [...s.flash.archive, { serial: 'SN-NEW', dumps: [] }] },
    }));
  }
  function removeArchive(a: number): void {
    mockState.update((s) => ({
      ...s,
      flash: { ...s.flash, archive: s.flash.archive.filter((_, idx) => idx !== a) },
    }));
  }

  // --- uart ports ---
  function setPort(i: number, patch: Partial<UartPortInfo>): void {
    mockState.update((s) => ({
      ...s,
      uart: {
        ...s.uart,
        ports: s.uart.ports.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
      },
    }));
  }
  function addPort(): void {
    mockState.update((s) => ({
      ...s,
      uart: {
        ...s.uart,
        ports: [
          ...s.uart.ports,
          { name: '/dev/ttyUSB2', is_bridge: false, description: get(LL).mock.newPort() },
        ],
      },
    }));
  }
  function removePort(i: number): void {
    mockState.update((s) => ({
      ...s,
      uart: { ...s.uart, ports: s.uart.ports.filter((_, idx) => idx !== i) },
    }));
  }

  // --- uart entries ---
  function setEntry(
    i: number,
    patch: Partial<UartEntryEvent['entry']>,
    description?: string | null
  ): void {
    mockState.update((s) => ({
      ...s,
      uart: {
        ...s.uart,
        entries: s.uart.entries.map((e, idx) =>
          idx === i
            ? {
                entry: { ...e.entry, ...patch },
                description: description !== undefined ? description : e.description,
              }
            : e
        ),
      },
    }));
  }
  function addEntry(): void {
    const entry: UartEntryEvent = {
      entry: {
        error_code: 0xe0000002,
        timestamp: Date.now(),
        power_states: 1,
        up_cause: 1,
        temp_soc: 40,
        raw_fields: ['E0000002', '0001', '0001', '0031'],
      },
      description: get(LL).mock.newEntry(),
    };
    mockState.update((s) => ({ ...s, uart: { ...s.uart, entries: [...s.uart.entries, entry] } }));
  }
  function removeEntry(i: number): void {
    mockState.update((s) => ({
      ...s,
      uart: { ...s.uart, entries: s.uart.entries.filter((_, idx) => idx !== i) },
    }));
  }

  // --- uart search results ---
  function setSearch(i: number, patch: Partial<ErrorSearchResult>): void {
    mockState.update((s) => ({
      ...s,
      uart: {
        ...s.uart,
        search_results: s.uart.search_results.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
      },
    }));
  }
  function addSearch(): void {
    mockState.update((s) => ({
      ...s,
      uart: {
        ...s.uart,
        search_results: [
          ...s.uart.search_results,
          {
            code: 0xe0000002,
            description: get(LL).mock.searchHit({ query: '{query}' }),
            category: 'generic',
          },
        ],
      },
    }));
  }
  function removeSearch(i: number): void {
    mockState.update((s) => ({
      ...s,
      uart: { ...s.uart, search_results: s.uart.search_results.filter((_, idx) => idx !== i) },
    }));
  }

  // --- hid devices ---
  function setHidDevice(i: number, patch: Partial<HidDeviceInfo>): void {
    mockState.update((s) => ({
      ...s,
      hid: {
        ...s.hid,
        devices: s.hid.devices.map((d, idx) => (idx === i ? { ...d, ...patch } : d)),
      },
    }));
  }
  function addHidDevice(): void {
    mockState.update((s) => ({
      ...s,
      hid: {
        ...s.hid,
        devices: [
          ...s.hid.devices,
          {
            vendor_id: 0x054c,
            product_id: 0x0ce6,
            manufacturer: 'Mock',
            product: 'Mock Controller',
            serial_number: null,
            usage_page: 1,
            usage: 5,
          },
        ],
      },
    }));
  }
  function removeHidDevice(i: number): void {
    mockState.update((s) => ({
      ...s,
      hid: { ...s.hid, devices: s.hid.devices.filter((_, idx) => idx !== i) },
    }));
  }

  // --- simulated controller input (drives the live visualizer in MOCK mode) ---
  const SIM_BUTTONS = [
    'up',
    'down',
    'left',
    'right',
    'triangle',
    'circle',
    'cross',
    'square',
    'l1',
    'r1',
    'l3',
    'r3',
    'create',
    'options',
    'ps',
    'touchpad',
    'mute',
  ] as const;
  function setInput<K extends keyof MockControllerInput>(
    key: K,
    val: MockControllerInput[K]
  ): void {
    mockState.update((s) => ({ ...s, hid: { ...s.hid, input: { ...s.hid.input, [key]: val } } }));
  }
  function toggleButton(name: string): void {
    mockState.update((s) => ({
      ...s,
      hid: {
        ...s.hid,
        input: {
          ...s.hid.input,
          buttons: { ...s.hid.input.buttons, [name]: !s.hid.input.buttons[name] },
        },
      },
    }));
  }
  function clearButtons(): void {
    mockState.update((s) => ({ ...s, hid: { ...s.hid, input: { ...s.hid.input, buttons: {} } } }));
  }
  function resetInput(): void {
    mockState.update((s) => ({
      ...s,
      hid: { ...s.hid, input: { ...DEFAULT_MOCK_STATE.hid.input, buttons: {} } },
    }));
  }
  function signed(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
  }

  // --- touchpad gesture replay (#57): step the mock touch points through a
  // down→move→up sequence so the gesture tracker fires real events in dev. ---
  let replayTimer = $state<ReturnType<typeof setInterval> | null>(null);
  function setTouch(i: number, patch: Partial<{ active: boolean; x: number; y: number }>): void {
    mockState.update((s) => {
      const tp = s.hid.input.touchPoints.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
      return { ...s, hid: { ...s.hid, input: { ...s.hid.input, touchPoints: tp } } };
    });
  }
  function stopReplay(): void {
    if (replayTimer) {
      clearInterval(replayTimer);
      replayTimer = null;
    }
    setTouch(0, { active: false });
    setTouch(1, { active: false });
  }
  /** Play a sequence of touch states (per finger) at a fixed cadence. */
  function replay(steps: { active: boolean; x: number; y: number }[][], stepMs = 60): void {
    stopReplay();
    let i = 0;
    const tick = (): void => {
      if (i >= steps.length) {
        stopReplay();
        return;
      }
      const frame = steps[i++];
      frame.forEach((f, fi) => setTouch(fi, f));
    };
    tick();
    replayTimer = setInterval(tick, stepMs);
  }
  /** Build a swipe: down at (x0,y0), linear travel to (x1,y1), then lift. */
  function swipeSteps(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    n = 8
  ): { active: boolean; x: number; y: number }[][] {
    const steps: { active: boolean; x: number; y: number }[][] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      steps.push([
        { active: true, x: Math.round(x0 + (x1 - x0) * t), y: Math.round(y0 + (y1 - y0) * t) },
        { active: false, x: 0, y: 0 },
      ]);
    }
    steps.push([
      { active: false, x: 0, y: 0 },
      { active: false, x: 0, y: 0 },
    ]);
    return steps;
  }
  function replayTap(): void {
    replay(
      [
        [
          { active: true, x: 960, y: 470 },
          { active: false, x: 0, y: 0 },
        ],
        [
          { active: false, x: 0, y: 0 },
          { active: false, x: 0, y: 0 },
        ],
      ],
      80
    );
  }
  function replaySwipeRight(): void {
    replay(swipeSteps(100, 470, 1800, 470));
  }
  function replaySwipeDown(): void {
    replay(swipeSteps(960, 100, 960, 880));
  }
  function replayHold(): void {
    stopReplay();
    setTouch(0, { active: true, x: 960, y: 470 });
    setTimeout(() => setTouch(0, { active: false }), 700);
  }
  function replayTwoFinger(): void {
    replay(
      [
        [
          { active: true, x: 480, y: 470 },
          { active: false, x: 0, y: 0 },
        ],
        [
          { active: true, x: 480, y: 470 },
          { active: true, x: 1440, y: 470 },
        ],
        [
          { active: false, x: 0, y: 0 },
          { active: false, x: 0, y: 0 },
        ],
      ],
      120
    );
  }

  // --- helpers ---
  function hex(n: number): string {
    return '0x' + n.toString(16);
  }
  function parseHex(v: string): number {
    return parseInt(v.replace(/^0x/i, ''), 16) || 0;
  }
  function num(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function reset(): void {
    resetMockState();
    programmersText = DEFAULT_MOCK_STATE.flash.programmers.join('\n');
    linesText = DEFAULT_MOCK_STATE.uart.lines.join('\n');
  }

  // --- error injection (#72): arm/clear a simulated failure for a command ---
  function setMockError(cmd: string, msg: string): void {
    mockState.update((s) => {
      const errors = { ...s.errors };
      if (msg) errors[cmd] = msg;
      else delete errors[cmd];
      return { ...s, errors };
    });
  }
  function clearAllErrors(): void {
    mockState.update((s) => ({ ...s, errors: {} }));
  }
</script>

<!-- Floating launcher -->
{#if !open}
  <button
    onclick={() => (open = true)}
    class="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3.5 py-2.5 rounded-full
           bg-amber-500/90 hover:bg-amber-400 text-gray-950 text-sm font-semibold shadow-lg
           border border-amber-300/50 transition-colors"
    title={$LL.mock.launcherTitle()}
  >
    <span>🎭</span>
    <span>{$LL.mock.launcher()}</span>
  </button>
{/if}

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/40 z-40"
    role="presentation"
    onclick={() => (open = false)}
  ></div>

  <!-- Panel -->
  <div
    class="fixed top-0 right-0 h-full w-[30rem] max-w-[92vw] bg-gray-900 border-l border-gray-700
              shadow-xl z-50 flex flex-col"
  >
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
      <div class="flex flex-col leading-tight">
        <h2 class="text-sm font-semibold text-amber-300">{$LL.mock.panelTitle()}</h2>
        <span class="text-[10px] text-gray-500">{$LL.mock.panelSubtitle()}</span>
      </div>
      <div class="flex items-center gap-2">
        <button onclick={copyState} class={btnCls} title={$LL.mock.copyStateTitle()}>
          <Copy class="w-3 h-3 inline -mt-0.5 mr-1" />{copiedState
            ? $LL.mock.copied()
            : $LL.mock.copyState()}
        </button>
        <button onclick={reset} class={btnDanger} title={$LL.mock.resetTitle()}
          >{$LL.mock.reset()}</button
        >
        <button
          onclick={() => (open = false)}
          class="text-gray-400 hover:text-gray-200 text-lg leading-none"
          title={$LL.mock.closeTitle()}>✕</button
        >
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-gray-700 shrink-0">
      {#each [{ id: 'flash', label: $LL.mock.flashTab() }, { id: 'uart', label: $LL.mock.uartTab() }, { id: 'i2c', label: $LL.mock.i2cTab() }, { id: 'controller', label: $LL.mock.controllerTab() }] as const as t (t.id)}
        <button
          onclick={() => (tab = t.id)}
          class="flex-1 px-3 py-2.5 text-xs font-medium transition-colors
                 {tab === t.id
            ? 'text-amber-300 border-b-2 border-amber-400 bg-amber-500/5'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'}">{t.label}</button
        >
      {/each}
    </div>

    <div class="flex flex-col gap-5 p-4 overflow-y-auto flex-1">
      <!-- ===================== FLASH ===================== -->
      {#if tab === 'flash'}
        <section class="flex flex-col gap-3">
          <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">
            {$LL.mock.sectionProgrammers()}
          </h3>
          <div class="flex flex-col gap-1">
            <span class={lblCls}>{$LL.mock.programmersLabel()}</span>
            <textarea
              bind:value={programmersText}
              oninput={onProgrammersInput}
              rows="3"
              class={inputCls}></textarea>
          </div>

          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class={lblCls}>{$LL.mock.devicesLabel()}</span>
              <button onclick={addDevice} class={btnCls}>{$LL.mock.addDevice()}</button>
            </div>
            {#each $mockState.flash.devices as dev, i (i)}
              <div class="flex flex-col gap-1 p-2 rounded bg-gray-800/50 border border-gray-700">
                <div class="flex gap-2">
                  <input
                    value={dev.id}
                    oninput={(e) => setDevice(i, { id: (e.target as HTMLInputElement).value })}
                    placeholder="id"
                    class={inputCls}
                  />
                  <select
                    value={dev.device_type}
                    onchange={(e) =>
                      setDevice(i, {
                        device_type: (e.target as HTMLSelectElement)
                          .value as DeviceInfo['device_type'],
                      })}
                    class={inputCls + ' shrink-0 w-24'}
                  >
                    <option value="Ch341">Ch341</option>
                    <option value="Uart">Uart</option>
                  </select>
                  <button
                    onclick={() => removeDevice(i)}
                    class={btnDanger}
                    title={$LL.mock.removeTitle()}>✕</button
                  >
                </div>
                <input
                  value={dev.name}
                  oninput={(e) => setDevice(i, { name: (e.target as HTMLInputElement).value })}
                  placeholder="Name"
                  class={inputCls}
                />
              </div>
            {/each}
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">
            {$LL.mock.sectionNvs()}
          </h3>
          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1">
              <span class={lblCls}>{$LL.mock.serialLabel()}</span><input
                value={$mockState.flash.nvs.serial}
                oninput={(e) => setNvs('serial', (e.target as HTMLInputElement).value)}
                class={inputCls}
              />
            </div>
            <div class="flex flex-col gap-1">
              <span class={lblCls}>{$LL.mock.macLabel()}</span><input
                value={$mockState.flash.nvs.mac_address}
                oninput={(e) => setNvs('mac_address', (e.target as HTMLInputElement).value)}
                class={inputCls}
              />
            </div>
            <div class="flex flex-col gap-1">
              <span class={lblCls}>{$LL.mock.skuLabel()}</span><input
                value={$mockState.flash.nvs.sku}
                oninput={(e) => setNvs('sku', (e.target as HTMLInputElement).value)}
                class={inputCls}
              />
            </div>
            <div class="flex flex-col gap-1">
              <span class={lblCls}>{$LL.mock.boardIdLabel()}</span><input
                value={$mockState.flash.nvs.board_id}
                oninput={(e) => setNvs('board_id', (e.target as HTMLInputElement).value)}
                class={inputCls}
              />
            </div>
            <div class="flex flex-col gap-1">
              <span class={lblCls}>{$LL.mock.consoleTypeLabel()}</span><input
                type="number"
                value={$mockState.flash.nvs.console_type}
                oninput={(e) => setNvs('console_type', num((e.target as HTMLInputElement).value))}
                class={inputCls}
              />
            </div>
            <div class="flex flex-col gap-1">
              <span class={lblCls}>{$LL.mock.fwVersionLabel()}</span><input
                value={$mockState.flash.nvs.fw_version}
                oninput={(e) => setNvs('fw_version', (e.target as HTMLInputElement).value)}
                class={inputCls}
              />
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <span class={lblCls}>{$LL.mock.validationLabel()}</span>
            <div class="grid grid-cols-2 gap-1.5">
              {#each validationKeys as vk (vk.key)}
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={$mockState.flash.validation[vk.key]}
                    onchange={(e) => setValidation(vk.key, (e.target as HTMLInputElement).checked)}
                    class="accent-amber-500 w-4 h-4"
                  />
                  <span class="text-xs text-gray-300">{vk.label}</span>
                </label>
              {/each}
            </div>
          </div>

          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={$mockState.flash.dumps_match}
              onchange={(e) => setFlash('dumps_match', (e.target as HTMLInputElement).checked)}
              class="accent-amber-500 w-4 h-4"
            />
            <span class="text-xs text-gray-300">{$LL.mock.dumpsMatchLabel()}</span>
          </label>

          <div class="grid grid-cols-3 gap-2">
            <div class="flex flex-col gap-1">
              <span class={lblCls}>{$LL.mock.readStepLabel()}</span><input
                type="number"
                value={$mockState.flash.read_step_ms}
                oninput={(e) => setFlash('read_step_ms', num((e.target as HTMLInputElement).value))}
                class={inputCls}
              />
            </div>
            <div class="flex flex-col gap-1">
              <span class={lblCls}>{$LL.mock.writeStepLabel()}</span><input
                type="number"
                value={$mockState.flash.write_step_ms}
                oninput={(e) =>
                  setFlash('write_step_ms', num((e.target as HTMLInputElement).value))}
                class={inputCls}
              />
            </div>
            <div class="flex flex-col gap-1">
              <span class={lblCls}>{$LL.mock.verifyStepLabel()}</span><input
                type="number"
                value={$mockState.flash.verify_step_ms}
                oninput={(e) =>
                  setFlash('verify_step_ms', num((e.target as HTMLInputElement).value))}
                class={inputCls}
              />
            </div>
          </div>
        </section>

        <section class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">
              {$LL.mock.sectionArchive()}
            </h3>
            <button onclick={addArchive} class={btnCls}>{$LL.mock.addArchive()}</button>
          </div>
          {#each $mockState.flash.archive as grp, a (a)}
            <div class="flex flex-col gap-2 p-2 rounded bg-gray-800/50 border border-gray-700">
              <div class="flex gap-2">
                <input
                  value={grp.serial}
                  oninput={(e) => setArchiveSerial(a, (e.target as HTMLInputElement).value)}
                  placeholder={$LL.mock.serialLabel()}
                  class={inputCls}
                />
                <button
                  onclick={() => removeArchive(a)}
                  class={btnDanger}
                  title={$LL.mock.removeGroupTitle()}>✕</button
                >
              </div>
              {#each grp.dumps as dump, d (d)}
                <div class="flex flex-col gap-1 pl-2 border-l border-gray-700">
                  <div class="flex gap-2 items-end">
                    <div class="flex flex-col gap-1 flex-1">
                      <span class={lblCls}>FW</span><input
                        value={dump.fw_version ?? ''}
                        oninput={(e) =>
                          setDump(a, d, {
                            fw_version: (e.target as HTMLInputElement).value || null,
                          })}
                        class={inputCls}
                      />
                    </div>
                    <div class="flex flex-col gap-1 w-28">
                      <span class={lblCls}>{$LL.mock.sizeLabel()}</span><input
                        type="number"
                        value={dump.size_bytes}
                        oninput={(e) =>
                          setDump(a, d, { size_bytes: num((e.target as HTMLInputElement).value) })}
                        class={inputCls}
                      />
                    </div>
                    <label class="flex items-center gap-1.5 cursor-pointer select-none pb-1.5"
                      ><input
                        type="checkbox"
                        checked={dump.validation_ok}
                        onchange={(e) =>
                          setDump(a, d, { validation_ok: (e.target as HTMLInputElement).checked })}
                        class="accent-amber-500 w-4 h-4"
                      /><span class="text-xs text-gray-300">OK</span></label
                    >
                    <button
                      onclick={() => removeDump(a, d)}
                      class={btnDanger}
                      title={$LL.mock.removeDumpTitle()}>✕</button
                    >
                  </div>
                </div>
              {/each}
              <button onclick={() => addDump(a)} class={btnCls + ' self-start'}
                >{$LL.mock.addDump()}</button
              >
            </div>
          {/each}
        </section>

        <!-- ===================== UART ===================== -->
      {:else if tab === 'uart'}
        <section class="flex flex-col gap-3">
          <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">
            {$LL.mock.sectionConn()}
          </h3>
          <div class="flex flex-col gap-2">
            <label class="flex items-center gap-2 cursor-pointer select-none"
              ><input
                type="checkbox"
                checked={$mockState.uart.connected}
                onchange={(e) => setUart('connected', (e.target as HTMLInputElement).checked)}
                class="accent-amber-500 w-4 h-4"
              /><span class="text-xs text-gray-300">{$LL.mock.connectedUart()}</span></label
            >
            <label class="flex items-center gap-2 cursor-pointer select-none"
              ><input
                type="checkbox"
                checked={$mockState.uart.reconnecting}
                onchange={(e) => setUart('reconnecting', (e.target as HTMLInputElement).checked)}
                class="accent-amber-500 w-4 h-4"
              /><span class="text-xs text-gray-300">{$LL.mock.reconnecting()}</span></label
            >
            <label class="flex items-center gap-2 cursor-pointer select-none"
              ><input
                type="checkbox"
                checked={$mockState.uart.loopback_ok}
                onchange={(e) => setUart('loopback_ok', (e.target as HTMLInputElement).checked)}
                class="accent-amber-500 w-4 h-4"
              /><span class="text-xs text-gray-300">{$LL.mock.loopbackOk()}</span></label
            >
            <div class="flex flex-col gap-1">
              <span class={lblCls}>{$LL.mock.dbCountLabel()}</span>
              <input
                type="number"
                value={$mockState.uart.db_count ?? 0}
                oninput={(e) =>
                  setUart('db_count', num((e.target as HTMLInputElement).value) || null)}
                class={inputCls}
              />
            </div>
          </div>
        </section>

        <section class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">
              {$LL.mock.sectionPorts()}
            </h3>
            <button onclick={addPort} class={btnCls}>{$LL.mock.addPort()}</button>
          </div>
          {#each $mockState.uart.ports as port, i (i)}
            <div class="flex flex-col gap-1 p-2 rounded bg-gray-800/50 border border-gray-700">
              <div class="flex gap-2">
                <input
                  value={port.name}
                  oninput={(e) => setPort(i, { name: (e.target as HTMLInputElement).value })}
                  placeholder={$LL.mock.portPlaceholder()}
                  class={inputCls}
                />
                <button
                  onclick={() => removePort(i)}
                  class={btnDanger}
                  title={$LL.mock.removeTitle()}>✕</button
                >
              </div>
              <input
                value={port.description}
                oninput={(e) => setPort(i, { description: (e.target as HTMLInputElement).value })}
                placeholder={$LL.mock.descPlaceholder()}
                class={inputCls}
              />
              <label class="flex items-center gap-2 cursor-pointer select-none"
                ><input
                  type="checkbox"
                  checked={port.is_bridge}
                  onchange={(e) =>
                    setPort(i, { is_bridge: (e.target as HTMLInputElement).checked })}
                  class="accent-amber-500 w-4 h-4"
                /><span class="text-xs text-gray-300">{$LL.mock.bridgeLabel()}</span></label
              >
            </div>
          {/each}
        </section>

        <section class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">
              {$LL.mock.sectionEntries()}
            </h3>
            <button onclick={addEntry} class={btnCls}>{$LL.mock.addEntry()}</button>
          </div>
          {#each $mockState.uart.entries as ent, i (i)}
            <div class="flex flex-col gap-1.5 p-2 rounded bg-gray-800/50 border border-gray-700">
              <div class="flex gap-2">
                <div class="flex flex-col gap-1 w-32">
                  <span class={lblCls}>{$LL.mock.errorCodeLabel()}</span><input
                    value={hex(ent.entry.error_code)}
                    oninput={(e) =>
                      setEntry(i, { error_code: parseHex((e.target as HTMLInputElement).value) })}
                    class={inputCls}
                  />
                </div>
                <div class="flex flex-col gap-1 w-20">
                  <span class={lblCls}>{$LL.mock.powerLabel()}</span><input
                    type="number"
                    value={ent.entry.power_states}
                    oninput={(e) =>
                      setEntry(i, { power_states: num((e.target as HTMLInputElement).value) })}
                    class={inputCls}
                  />
                </div>
                <div class="flex flex-col gap-1 w-20">
                  <span class={lblCls}>{$LL.mock.upCauseLabel()}</span><input
                    type="number"
                    value={ent.entry.up_cause}
                    oninput={(e) =>
                      setEntry(i, { up_cause: num((e.target as HTMLInputElement).value) })}
                    class={inputCls}
                  />
                </div>
                <div class="flex flex-col gap-1 w-20">
                  <span class={lblCls}>{$LL.mock.tempLabel()}</span><input
                    type="number"
                    value={ent.entry.temp_soc}
                    oninput={(e) =>
                      setEntry(i, { temp_soc: num((e.target as HTMLInputElement).value) })}
                    class={inputCls}
                  />
                </div>
                <button
                  onclick={() => removeEntry(i)}
                  class={btnDanger}
                  title={$LL.mock.removeTitle()}>✕</button
                >
              </div>
              <input
                value={ent.description ?? ''}
                oninput={(e) => setEntry(i, {}, (e.target as HTMLInputElement).value || null)}
                placeholder={$LL.mock.descPlaceholder()}
                class={inputCls}
              />
            </div>
          {/each}
        </section>

        <section class="flex flex-col gap-2">
          <div class="flex flex-col gap-1">
            <span class={lblCls}>{$LL.mock.rawLinesLabel()}</span>
            <textarea bind:value={linesText} oninput={onLinesInput} rows="4" class={inputCls}
            ></textarea>
          </div>
        </section>

        <section class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">
              {$LL.mock.sectionSearch()}
            </h3>
            <button onclick={addSearch} class={btnCls}>{$LL.mock.addSearch()}</button>
          </div>
          <p class="text-[11px] text-gray-600">{$LL.mock.searchHint({ query: '{query}' })}</p>
          {#each $mockState.uart.search_results as res, i (i)}
            <div class="flex flex-col gap-1 p-2 rounded bg-gray-800/50 border border-gray-700">
              <div class="flex gap-2">
                <input
                  value={hex(res.code)}
                  oninput={(e) =>
                    setSearch(i, { code: parseHex((e.target as HTMLInputElement).value) })}
                  class={inputCls + ' w-32'}
                  title={$LL.mock.codeTitle()}
                />
                <input
                  value={res.category}
                  oninput={(e) => setSearch(i, { category: (e.target as HTMLInputElement).value })}
                  class={inputCls + ' w-28'}
                  placeholder={$LL.mock.categoryPlaceholder()}
                />
                <button onclick={() => removeSearch(i)} class={btnDanger}>✕</button>
              </div>
              <input
                value={res.description}
                oninput={(e) => setSearch(i, { description: (e.target as HTMLInputElement).value })}
                placeholder={$LL.mock.descPlaceholder()}
                class={inputCls}
              />
            </div>
          {/each}
        </section>

        <!-- ===================== I2C / Pico ===================== -->
      {:else if tab === 'i2c'}
        <section class="flex flex-col gap-3">
          <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">
            {$LL.mock.sectionI2c()}
          </h3>
          <label class="flex items-center gap-2 cursor-pointer select-none"
            ><input
              type="checkbox"
              checked={$mockState.i2c.connected}
              onchange={(e) => setI2c('connected', (e.target as HTMLInputElement).checked)}
              class="accent-amber-500 w-4 h-4"
            /><span class="text-xs text-gray-300">{$LL.mock.connectedI2c()}</span></label
          >

          <div class="flex flex-col gap-1">
            <span class={lblCls}>{$LL.mock.xboxDbLabel()}</span>
            <input
              type="number"
              value={$mockState.i2c.db_count ?? 0}
              oninput={(e) => setI2c('db_count', num((e.target as HTMLInputElement).value) || null)}
              class={inputCls}
            />
          </div>

          <div class="flex flex-col gap-1">
            <span class={lblCls}>{$LL.mock.scanLabel()}</span>
            <input
              value={$mockState.i2c.scan_results.map((a) => '0x' + a.toString(16)).join(', ')}
              oninput={(e) =>
                setI2c(
                  'scan_results',
                  (e.target as HTMLInputElement).value
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .map((t) => parseInt(t, t.startsWith('0x') ? 16 : 10))
                    .filter((n) => !isNaN(n))
                )}
              class={inputCls}
            />
          </div>

          <div class="flex flex-col gap-1">
            <span class={lblCls}>{$LL.mock.errlogLabel()}</span>
            <textarea
              rows="3"
              value={JSON.stringify($mockState.i2c.errlog)}
              oninput={(e) => {
                try {
                  setI2c('errlog', JSON.parse((e.target as HTMLTextAreaElement).value));
                } catch {
                  /* ignored */
                }
              }}
              class={inputCls + ' font-mono'}></textarea>
          </div>

          <div class="flex flex-col gap-1">
            <span class={lblCls}>{$LL.mock.infoLabel()}</span>
            <textarea
              rows="3"
              value={$mockState.i2c.info ? JSON.stringify($mockState.i2c.info) : ''}
              oninput={(e) => {
                try {
                  const v = (e.target as HTMLTextAreaElement).value;
                  setI2c('info', v ? JSON.parse(v) : null);
                } catch {
                  /* ignored */
                }
              }}
              class={inputCls + ' font-mono'}></textarea>
          </div>
        </section>

        <!-- ===================== CONTROLLER ===================== -->
      {:else if tab === 'controller'}
        <section class="flex flex-col gap-3">
          <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">
            {$LL.mock.sectionHid()}
          </h3>
          <label class="flex items-center gap-2 cursor-pointer select-none"
            ><input
              type="checkbox"
              checked={$mockState.hid.connected}
              onchange={(e) => setHid('connected', (e.target as HTMLInputElement).checked)}
              class="accent-amber-500 w-4 h-4"
            /><span class="text-xs text-gray-300">{$LL.mock.connectedHid()}</span></label
          >

          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class={lblCls}>{$LL.mock.devicesLabel()}</span>
              <button onclick={addHidDevice} class={btnCls}>{$LL.mock.addDevice()}</button>
            </div>
            {#each $mockState.hid.devices as dev, i (i)}
              <div class="flex flex-col gap-1 p-2 rounded bg-gray-800/50 border border-gray-700">
                <div class="flex gap-2">
                  <div class="flex flex-col gap-1 w-28">
                    <span class={lblCls}>VID (hex)</span><input
                      value={hex(dev.vendor_id)}
                      oninput={(e) =>
                        setHidDevice(i, {
                          vendor_id: parseHex((e.target as HTMLInputElement).value),
                        })}
                      class={inputCls}
                    />
                  </div>
                  <div class="flex flex-col gap-1 w-28">
                    <span class={lblCls}>PID (hex)</span><input
                      value={hex(dev.product_id)}
                      oninput={(e) =>
                        setHidDevice(i, {
                          product_id: parseHex((e.target as HTMLInputElement).value),
                        })}
                      class={inputCls}
                    />
                  </div>
                  <button
                    onclick={() => removeHidDevice(i)}
                    class={btnDanger}
                    title={$LL.mock.removeTitle()}>✕</button
                  >
                </div>
                <input
                  value={dev.manufacturer ?? ''}
                  oninput={(e) =>
                    setHidDevice(i, { manufacturer: (e.target as HTMLInputElement).value || null })}
                  placeholder={$LL.mock.manufacturerPh()}
                  class={inputCls}
                />
                <input
                  value={dev.product ?? ''}
                  oninput={(e) =>
                    setHidDevice(i, { product: (e.target as HTMLInputElement).value || null })}
                  placeholder={$LL.mock.productPh()}
                  class={inputCls}
                />
              </div>
            {/each}
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold text-gray-300 uppercase tracking-wide">
              {$LL.mock.sectionInput()}
            </h3>
            <button onclick={resetInput} class={btnCls}>{$LL.mock.reset()}</button>
          </div>
          <p class="text-[11px] text-gray-600">{$LL.mock.inputHint()}</p>

          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1">
              <span class={lblCls}>LX (-1…1)</span><input
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={$mockState.hid.input.lx}
                oninput={(e) => setInput('lx', signed((e.target as HTMLInputElement).value))}
                class="accent-teal-500"
              />
            </div>
            <div class="flex flex-col gap-1">
              <span class={lblCls}>LY (-1…1)</span><input
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={$mockState.hid.input.ly}
                oninput={(e) => setInput('ly', signed((e.target as HTMLInputElement).value))}
                class="accent-teal-500"
              />
            </div>
            <div class="flex flex-col gap-1">
              <span class={lblCls}>RX (-1…1)</span><input
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={$mockState.hid.input.rx}
                oninput={(e) => setInput('rx', signed((e.target as HTMLInputElement).value))}
                class="accent-teal-500"
              />
            </div>
            <div class="flex flex-col gap-1">
              <span class={lblCls}>RY (-1…1)</span><input
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={$mockState.hid.input.ry}
                oninput={(e) => setInput('ry', signed((e.target as HTMLInputElement).value))}
                class="accent-teal-500"
              />
            </div>
            <div class="flex flex-col gap-1">
              <span class={lblCls}>L2 (0…255)</span><input
                type="range"
                min="0"
                max="255"
                value={$mockState.hid.input.l2}
                oninput={(e) => setInput('l2', num((e.target as HTMLInputElement).value))}
                class="accent-teal-500"
              />
            </div>
            <div class="flex flex-col gap-1">
              <span class={lblCls}>R2 (0…255)</span><input
                type="range"
                min="0"
                max="255"
                value={$mockState.hid.input.r2}
                oninput={(e) => setInput('r2', num((e.target as HTMLInputElement).value))}
                class="accent-teal-500"
              />
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <span class={lblCls}>{$LL.mock.batteryLabel()}</span>
            <input
              type="range"
              min="0"
              max="100"
              value={$mockState.hid.input.battery}
              oninput={(e) => setInput('battery', num((e.target as HTMLInputElement).value))}
              class="accent-teal-500"
            />
            <label class="flex items-center gap-2 cursor-pointer select-none mt-1"
              ><input
                type="checkbox"
                checked={$mockState.hid.input.charging}
                onchange={(e) => setInput('charging', (e.target as HTMLInputElement).checked)}
                class="accent-amber-500 w-4 h-4"
              /><span class="text-xs text-gray-300">{$LL.mock.charging()}</span></label
            >
          </div>

          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between">
              <span class={lblCls}>{$LL.mock.buttonsLabel()}</span><button
                onclick={clearButtons}
                class={btnCls}>{$LL.mock.clearButtons()}</button
              >
            </div>
            <div class="flex flex-wrap gap-1.5">
              {#each SIM_BUTTONS as name (name)}
                <button
                  onclick={() => toggleButton(name)}
                  class="px-2 py-1 text-xs rounded border {$mockState.hid.input.buttons[name]
                    ? 'bg-teal-500/30 border-teal-400 text-teal-200'
                    : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:bg-gray-700'}"
                  >{name}</button
                >
              {/each}
            </div>
          </div>

          <!-- Touchpad gesture replay (#57) -->
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between">
              <span class={lblCls}>{$LL.mock.gesturesLabel()}</span>
              {#if replayTimer}
                <button onclick={stopReplay} class={btnCls}>{$LL.mock.stop()}</button>
              {/if}
            </div>
            <div class="flex flex-wrap gap-1.5">
              <button
                onclick={replayTap}
                class="px-2 py-1 text-xs rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 hover:bg-amber-500/30"
                >{$LL.mock.gestureTap()}</button
              >
              <button
                onclick={replaySwipeRight}
                class="px-2 py-1 text-xs rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 hover:bg-amber-500/30"
                >{$LL.mock.gestureSwipeRight()}</button
              >
              <button
                onclick={replaySwipeDown}
                class="px-2 py-1 text-xs rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 hover:bg-amber-500/30"
                >{$LL.mock.gestureSwipeDown()}</button
              >
              <button
                onclick={replayHold}
                class="px-2 py-1 text-xs rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 hover:bg-amber-500/30"
                >{$LL.mock.gestureHold()}</button
              >
              <button
                onclick={replayTwoFinger}
                class="px-2 py-1 text-xs rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 hover:bg-amber-500/30"
                >{$LL.mock.gestureTwoFinger()}</button
              >
            </div>
            <p class="text-[11px] text-gray-600">{$LL.mock.gestureHint()}</p>
            {#each [0, 1] as fi (fi)}
              <div class="flex items-center gap-2">
                <label class="flex items-center gap-1.5 cursor-pointer select-none w-16">
                  <input
                    type="checkbox"
                    checked={$mockState.hid.input.touchPoints[fi]?.active}
                    onchange={(e) =>
                      setTouch(fi, { active: (e.target as HTMLInputElement).checked })}
                    class="accent-amber-500 w-3.5 h-3.5"
                  />
                  <span class="text-[11px] text-gray-400">F{fi + 1}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1919"
                  value={$mockState.hid.input.touchPoints[fi]?.x ?? 0}
                  oninput={(e) => setTouch(fi, { x: num((e.target as HTMLInputElement).value) })}
                  class="flex-1 accent-teal-500"
                  title="X"
                />
                <input
                  type="range"
                  min="0"
                  max="941"
                  value={$mockState.hid.input.touchPoints[fi]?.y ?? 0}
                  oninput={(e) => setTouch(fi, { y: num((e.target as HTMLInputElement).value) })}
                  class="flex-1 accent-teal-500"
                  title="Y"
                />
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- ===================== ERROR INJECTION (#72) ===================== -->
      <section class="flex flex-col gap-2 pt-2 border-t border-gray-700">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-semibold text-red-300 uppercase tracking-wide">
            {$LL.mock.sectionErrors()}
          </h3>
          <button onclick={clearAllErrors} class={btnCls}>{$LL.mock.clearErrors()}</button>
        </div>
        <p class="text-[11px] text-gray-600">{$LL.mock.errorInjectHint()}</p>
        {#each ERROR_INJECTABLE as cmd (cmd)}
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-mono text-gray-400 w-44 shrink-0 truncate" title={cmd}
              >{cmd}</span
            >
            <input
              value={$mockState.errors[cmd] ?? ''}
              oninput={(e) => setMockError(cmd, (e.target as HTMLInputElement).value)}
              placeholder={$LL.mock.errorPlaceholder()}
              class={inputCls}
            />
          </div>
        {/each}
      </section>
    </div>

    <div class="px-4 py-3 border-t border-gray-700">
      <p class="text-[11px] text-gray-600">{$LL.mock.footerHint()}</p>
    </div>
  </div>
{/if}
