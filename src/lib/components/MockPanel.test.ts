// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, beforeEach } from 'vitest';
import MockPanel from './MockPanel.svelte';
import { initI18n } from '$lib/i18n/init';

// MockPanel is dev-only (MOCK builds) but it holds every {#each} block that
// drives the live preview, and a prior HMR run surfaced a runtime
// "Cannot read properties of undefined (reading '0')" inside one of them.
// This smoke test opens the drawer and switches through all four tabs so every
// each block (programmers/devices, archive+dumps, UART ports/entries/search,
// HID devices/buttons/touchpoints, error-injection list) mounts against the
// default mockState — if any iterator is undefined, the render throws here
// instead of only in a corrupted HMR session.
//
// LL is only initialized in +layout.svelte at runtime, so init it here.
beforeEach(() => {
  initI18n();
  document.body.innerHTML = '';
});

describe('MockPanel', () => {
  it('opens and renders every tab without throwing', async () => {
    const { container } = render(MockPanel);

    // Launcher button (visible while closed) opens the drawer.
    const launcher = screen.getByRole('button', { name: /Mock/ });
    await fireEvent.click(launcher);

    // FLASH tab is active first — its Programmers & Devices section renders.
    expect(screen.getByText('Programmer & Geräte')).toBeInTheDocument();

    // Switch through the remaining tabs; each renders its own heading, which
    // only happens if that tab's {#each} blocks mount cleanly.
    await fireEvent.click(screen.getByRole('button', { name: 'UART' }));
    expect(screen.getByText('Verbindung')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'I2C' }));
    expect(screen.getByText('I2C / Pico Bridge')).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: 'Controller' }));
    expect(screen.getByText('HID / Controller')).toBeInTheDocument();
    expect(screen.getByText('Simulierter Input')).toBeInTheDocument();

    // No Svelte render error escapes as a thrown exception here; reaching this
    // point means the full panel mounted across all tabs.
    expect(container).toBeInTheDocument();
  });
});
