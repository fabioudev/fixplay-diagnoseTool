// Lightweight i18n infrastructure (#53). The app ships German (de) as the
// default language; English (en) is provided as a second locale. The active
// locale is a persisted writable store, and `t` is a *derived* store whose
// value is a translation function — so `$t('key')` in a component re-runs
// reactively whenever the locale changes, with no per-component plumbing.
//
// Strings live in `translations.ts` as a flat `de`/`en` record keyed by dotted
// ids (e.g. `nav.home`). `{param}` placeholders in a value are filled from the
// optional params object. Missing keys fall back to German, then to the key
// itself — so the UI never blanks out during incremental migration.
import { writable, derived } from 'svelte/store';
import { translations, type TranslationKey } from './translations';

export type Locale = 'de' | 'en';

export const LOCALE_STORAGE_KEY = 'fixplay-locale';
export const DEFAULT_LOCALE: Locale = 'de';
export const SUPPORTED_LOCALES: Locale[] = ['de', 'en'];

/** Read the persisted locale (or the default) — SSG-safe. */
function initialLocale(): Locale {
  if (typeof localStorage === 'undefined') return DEFAULT_LOCALE;
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === 'de' || stored === 'en') return stored;
  return DEFAULT_LOCALE;
}

/** Active locale. Persisted to localStorage on every change. */
export const locale = writable<Locale>(initialLocale());

if (typeof localStorage !== 'undefined') {
  locale.subscribe((l) => {
    try { localStorage.setItem(LOCALE_STORAGE_KEY, l); } catch { /* ignore quota */ }
  });
}

export function setLocale(l: Locale): void {
  locale.set(l);
}

export function toggleLocale(): void {
  locale.update((l) => (l === 'de' ? 'en' : 'de'));
}

/**
 * Reactive translation function. Use as `$t('nav.home')` in components; it
 * re-evaluates when the locale changes. `{param}` placeholders are filled
 * from the optional params object. Falls back de → key.
 */
export const t = derived(locale, (loc) => {
  return (key: string, params?: Record<string, string | number>): string => {
    const dict = translations[loc] as Record<string, string>;
    const deDict = translations.de as Record<string, string>;
    let s = dict[key] ?? deDict[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.replaceAll(`{${k}}`, String(v));
      }
    }
    return s;
  };
});

/** Non-reactive translation (for use outside components, e.g. in stores). */
export function translate(key: TranslationKey, params?: Record<string, string | number>): string {
  let l: Locale = DEFAULT_LOCALE;
  const unsub = locale.subscribe((v) => (l = v));
  unsub();
  const dict = translations[l] as Record<string, string>;
  let s = dict[key] ?? (translations.de as Record<string, string>)[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}