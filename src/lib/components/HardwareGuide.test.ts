// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, beforeEach } from 'vitest';
import HardwareGuide from './HardwareGuide.svelte';
import { initI18n } from '$lib/i18n/init';

// The hardware guide renders language-neutral pin tokens (#CS, MISO, GND, …)
// and localized prose from $LL.hwGuide. LL is only initialized in +layout.svelte
// at runtime, so init it here and assert both the pinout data and the localized
// headings appear when the collapsible is expanded.

beforeEach(() => {
  initI18n();
  document.body.innerHTML = '';
});

describe('HardwareGuide', () => {
  it('ch341a variant: expands and shows the board, ZIF socket pinout, jumper + 8-pin pinout', async () => {
    render(HardwareGuide, { props: { variant: 'ch341a' } });

    // Collapsed by default — title is the toggle button.
    const toggle = screen.getByRole('button', { name: /CH341A/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // Board overview + the reduced 3-entry legend (jumper / socket / chip).
    expect(screen.getByText('CH341A-Board (schwarz, klassisch) — Draufsicht')).toBeTruthy();
    expect(screen.getByText('Mode-Jumper')).toBeTruthy(); // legend span
    expect(screen.getByText('ZIF-Sockel')).toBeTruthy(); // legend span
    expect(screen.getByText('NOR-Chip')).toBeTruthy(); // legend span
    // No 5V danger block inside the guide anymore — FlashPanel owns the
    // persistent dangerShort strip above it.
    expect(screen.queryByText(/3,3-V-NOR kann zerstört werden/)).toBeNull();

    // ZIF socket pinout heading + all 16 socket positions with their signals.
    expect(screen.getByText('ZIF-Steckplätze — Pinout (NOR-Modus)')).toBeTruthy();
    expect(screen.getByText('25 SPI (NOR)')).toBeTruthy();
    expect(screen.getAllByText('MISO').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SDA').length).toBeGreaterThan(0);

    // 8-pin pinout heading + language-neutral pin tokens (SVG + table).
    expect(screen.getByText('8-Pin SPI-NOR Pinout (25-Series)')).toBeTruthy();
    expect(screen.getAllByText('#CS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('#HOLD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('VCC').length).toBeGreaterThan(0);
    // Pin 2 description (table only) — "Data Out (MISO)".
    expect(screen.getByText('Data Out (MISO)')).toBeTruthy();

    // ZIF → chip wiring table: the real ZIF position column (chip pins 1-8
    // land on ZIF 5-12 on the actual black board).
    expect(screen.getByText('ZIF-Pos.')).toBeTruthy();

    // Mode jumper explanation for NOR mode.
    expect(screen.getByText('Jumper (NOR-Modus)')).toBeTruthy();
    expect(screen.getAllByText(/gesteckt = Programmer-Modus/).length).toBeGreaterThanOrEqual(1);
  });

  it('uart variant: expands and shows board, wiring, locations + header pinout', async () => {
    render(HardwareGuide, { props: { variant: 'uart' } });

    const toggle = screen.getByRole('button', { name: /UART/ });
    await fireEvent.click(toggle);

    // 3.3V TTL warning (own danger block inside the guide).
    expect(screen.getByText('3,3V TTL — niemals 5V')).toBeTruthy();
    // Shared CH341A board top-view in USB-TTL mode + the 2-entry legend.
    expect(screen.getByText('CH341A als UART-Adapter (USB-TTL)')).toBeTruthy();
    expect(screen.getByText('UART-Header')).toBeTruthy();
    expect(screen.getByText('Jumper auf 2↔3 stecken (USB-TTL-Modus, NICHT 1↔2 = Programmer)')).toBeTruthy();
    // 5V divider warning (Spannungsteiler 1k/2k on the CH341A TX line).
    expect(screen.getAllByText(/Spannungsteiler setzen/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Verkabelung (TX/RX gekreuzt + Spannungsteiler)')).toBeTruthy();
    expect(screen.getByText('Baudrate: 115200 (EMC-UART)')).toBeTruthy();
    // EDM-010 pad labels.
    expect(screen.getByText('Pin 4')).toBeTruthy();
    expect(screen.getByText('Pin 7')).toBeTruthy();
    // Motherboard locations + 24-pin header pinout sections.
    expect(screen.getByText('PS5-Mainboard — UART-Locations (EDM-010)')).toBeTruthy();
    expect(screen.getByText('24-Pin EMC-Header — Pinout')).toBeTruthy();
    expect(screen.getAllByText('T0-TX').length).toBeGreaterThan(0); // Titania pins in the header SVG
    expect(screen.getByText('24-Pin Header')).toBeTruthy(); // location SVG label (in SVG)
    // Procedure with the USB-TTL jumper step + fuse.
    expect(screen.getByText(/Jumper auf 2↔3, Adapter per USB/)).toBeTruthy();
    expect(screen.getByText(/Fuse F7003/)).toBeTruthy();
  });
});
