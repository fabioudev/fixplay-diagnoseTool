// @vitest-environment jsdom
// Smoke test for the typesafe-i18n setup: locale loading, persisted-locale
// initialisation, reactive `LL` switching, and toggle persistence. Uses
// `vi.resetModules()` + dynamic imports so the module-level `initialised` guard
// and the svelte adapter stores are fresh for every test.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

describe('i18n (typesafe-i18n, #53)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('initialises with the base locale (de) when nothing is persisted', async () => {
    const { initI18n, locale } = await import('./init');
    const LL = (await import('./i18n-svelte')).default;
    initI18n();
    expect(get(locale)).toBe('de');
    expect(get(LL).nav.home()).toBe('Start');
    expect(get(LL).header.controller()).toBe('Controller-Diagnose');
  });

  it('honours a persisted locale', async () => {
    localStorage.setItem('fixplay-locale', 'en');
    const { initI18n, locale } = await import('./init');
    const LL = (await import('./i18n-svelte')).default;
    initI18n();
    expect(get(locale)).toBe('en');
    expect(get(LL).nav.home()).toBe('Home');
    expect(get(LL).header.controller()).toBe('Controller Diagnostics');
  });

  it('setLocale updates the LL store reactively without a reload', async () => {
    const { initI18n, setLocale } = await import('./init');
    const LL = (await import('./i18n-svelte')).default;
    initI18n();
    expect(get(LL).nav.home()).toBe('Start');
    setLocale('en');
    expect(get(LL).nav.home()).toBe('Home');
    setLocale('de');
    expect(get(LL).nav.home()).toBe('Start');
  });

  it('toggleLocale flips de <-> en and persists to localStorage', async () => {
    const { initI18n, toggleLocale, locale } = await import('./init');
    initI18n();
    toggleLocale();
    expect(get(locale)).toBe('en');
    expect(localStorage.getItem('fixplay-locale')).toBe('en');
    toggleLocale();
    expect(get(locale)).toBe('de');
    expect(localStorage.getItem('fixplay-locale')).toBe('de');
  });

  it('falls back to the base locale for an invalid persisted value', async () => {
    localStorage.setItem('fixplay-locale', 'fr');
    const { initI18n, locale } = await import('./init');
    initI18n();
    expect(get(locale)).toBe('de');
  });

  it('interpolates parameters', async () => {
    const { initI18n } = await import('./init');
    const LL = (await import('./i18n-svelte')).default;
    initI18n();
    expect(get(LL).nav.programmerCount({ count: 3 })).toBe('3 Programmer');
  });
});
