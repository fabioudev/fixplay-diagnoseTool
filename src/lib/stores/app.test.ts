// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { initI18n } from '$lib/i18n/init';
import { appState, navigate } from './app';
import { flashBusy } from './flash';

// The navigate() guard protects the most destructive workflow: leaving the
// flash panel while a flashrom operation runs would hide its live progress.
// The window-close handler in +page.svelte asks the same question via the
// native confirm() — here we pin the panel-switch side of that contract.

beforeEach(() => {
  initI18n();
  flashBusy.set(false);
  appState.update((s) => ({ ...s, view: 'home' }));
  // jsdom's default confirm() is a no-op; route it through a stub so we can
  // script the technician's answer.
  vi.stubGlobal('confirm', vi.fn(() => false));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function setView(view: 'flash' | 'archive' | 'home') {
  appState.update((s) => ({ ...s, view }));
}

describe('navigate flashBusy guard', () => {
  it('blocks leaving flash while busy when the confirm is dismissed', () => {
    setView('flash');
    flashBusy.set(true);

    navigate('archive');

    expect(confirm).toHaveBeenCalledOnce();
    expect(get(appState).view).toBe('flash');
  });

  it('allows leaving flash while busy when the confirm is accepted', () => {
    setView('flash');
    flashBusy.set(true);
    vi.stubGlobal('confirm', vi.fn(() => true));

    navigate('archive');

    expect(get(appState).view).toBe('archive');
  });

  it('never asks when switching TO the flash panel, even while busy', () => {
    setView('home');
    flashBusy.set(true);

    navigate('flash');

    expect(confirm).not.toHaveBeenCalled();
    expect(get(appState).view).toBe('flash');
  });

  it('never asks when the panel is idle', () => {
    setView('flash');
    flashBusy.set(false);

    navigate('archive');

    expect(confirm).not.toHaveBeenCalled();
    expect(get(appState).view).toBe('archive');
  });
});