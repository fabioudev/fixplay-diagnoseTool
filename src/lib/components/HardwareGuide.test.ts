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
  it('ch341a variant: expands and shows the 8-pin SPI pinout + 5V warning', async () => {
    render(HardwareGuide, { props: { variant: 'ch341a' } });

    // Collapsed by default — title is the toggle button.
    const toggle = screen.getByRole('button', { name: /CH341A/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // Localized heading.
    expect(screen.getByText('8-Pin SPI-NOR Pinout (25-Series)')).toBeTruthy();
    // Language-neutral pin tokens appear in BOTH the SVG diagram and the table.
    expect(screen.getAllByText('#CS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('#HOLD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('VCC').length).toBeGreaterThan(0);
    // MISO is the description of pin 2 (DO) — table only.
    expect(screen.getByText('MISO')).toBeTruthy();
    // 5V danger callout prose.
    expect(screen.getByText('5V-Warnung')).toBeTruthy();
  });

  it('uart variant: expands and shows the crossed TX/RX wiring + pads', async () => {
    render(HardwareGuide, { props: { variant: 'uart' } });

    const toggle = screen.getByRole('button', { name: /UART/ });
    await fireEvent.click(toggle);

    expect(screen.getByText('Verkabelung (TX/RX gekreuzt)')).toBeTruthy();
    expect(screen.getByText('Baudrate: 115200 (EMC-UART)')).toBeTruthy();
    // EDM-010 pad labels.
    expect(screen.getByText('Pin 4')).toBeTruthy();
    expect(screen.getByText('Pin 7')).toBeTruthy();
    // 3.3V TTL warning.
    expect(screen.getByText('3,3V TTL — niemals 5V')).toBeTruthy();
  });
});