// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { locale, setLocale, toggleLocale, t, translate, LOCALE_STORAGE_KEY, DEFAULT_LOCALE } from './index';
import { translations } from './translations';

beforeEach(() => {
  localStorage.clear();
  // Reset to the default locale between tests.
  setLocale(DEFAULT_LOCALE);
});

describe('i18n store (#53)', () => {
  it('defaults to German', () => {
    let l = DEFAULT_LOCALE;
    const unsub = locale.subscribe((v) => (l = v));
    unsub();
    expect(l).toBe('de');
  });

  it('setLocale switches the active locale and persists it', () => {
    setLocale('en');
    let l = 'de';
    const unsub = locale.subscribe((v) => (l = v));
    unsub();
    expect(l).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('toggleLocale flips de ↔ en', () => {
    setLocale('de');
    toggleLocale();
    let l = 'de';
    const unsub = locale.subscribe((v) => (l = v));
    unsub();
    expect(l).toBe('en');
    toggleLocale();
    const unsub2 = locale.subscribe((v) => (l = v));
    unsub2();
    expect(l).toBe('de');
  });

  it('reads the persisted locale on init', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    vi.resetModules();
    const mod = await import('./index');
    let l = 'de';
    const unsub = mod.locale.subscribe((v) => (l = v));
    unsub();
    expect(l).toBe('en');
  });
});

describe('t / translate (#53)', () => {
  it('translates a key in the active locale', () => {
    setLocale('de');
    expect(translate('nav.home')).toBe('Start');
    setLocale('en');
    expect(translate('nav.home')).toBe('Home');
  });

  it('interpolates {param} placeholders', () => {
    setLocale('de');
    expect(translate('nav.programmerCount', { count: 3 })).toBe('3 Programmer');
    setLocale('en');
    expect(translate('nav.programmerCount', { count: 3 })).toBe('3 programmers');
  });

  it('falls back to German when a key is missing in the active locale', () => {
    // Remove a key from the en dict at runtime to simulate an incomplete locale.
    const en = translations.en as Record<string, string>;
    const saved = en['nav.archive'];
    delete en['nav.archive'];
    setLocale('en');
    expect(translate('nav.archive')).toBe('Archiv'); // de fallback
    en['nav.archive'] = saved; // restore
  });

  it('falls back to the key itself when missing from all locales', () => {
    setLocale('de');
    expect(translate('no.such.key' as never)).toBe('no.such.key');
  });

  it('reactive $t reflects locale changes', () => {
    setLocale('de');
    let rendered = '';
    const unsub = t.subscribe((fn) => (rendered = fn('tester.lights')));
    expect(rendered).toBe('Lichter');
    setLocale('en');
    expect(rendered).toBe('Lights');
    unsub();
  });
});