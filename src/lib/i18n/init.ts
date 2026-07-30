// i18n bootstrap (typesafe-i18n, Svelte adapter). Both locales are tiny, so we
// load them synchronously upfront via `loadAllLocales` (static imports — both
// are bundled; no async flicker, no network). The active locale is persisted to
// localStorage under `fixplay-locale` (same key the previous hand-rolled i18n
// used, so existing user prefs carry over). `setLocale` is synchronous and does
// NOT reload the page — critical for a Tauri desktop app where a reload would
// drop live hardware state (active controller poll loop, flash progress, …).
import { get } from 'svelte/store'
import { loadAllLocales } from './i18n-util.sync'
import { locale, setLocale } from './i18n-svelte'
import { baseLocale, isLocale, locales } from './i18n-util'
import type { Locales } from './i18n-types'

export const LOCALE_STORAGE_KEY = 'fixplay-locale'

export { locale, setLocale } from './i18n-svelte'
export { locales, baseLocale, isLocale } from './i18n-util'
export type { Locales } from './i18n-types'

/** Read the persisted locale (or the base locale) — SSR/prerender-safe. */
export function initialLocale(): Locales {
	if (typeof localStorage === 'undefined') return baseLocale
	const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
	return stored && isLocale(stored) ? stored : baseLocale
}

let initialised = false

/**
 * Load all locales and activate the persisted one. Call once from the root
 * layout. Idempotent — safe under HMR / repeated invocation.
 */
export function initI18n(): void {
	if (initialised) return
	initialised = true
	loadAllLocales()
	setLocale(initialLocale())
	if (typeof localStorage !== 'undefined') {
		locale.subscribe((l) => {
			try {
				localStorage.setItem(LOCALE_STORAGE_KEY, l)
			} catch {
				/* ignore quota / privacy-mode errors */
			}
		})
	}
}

/** Switch to the other locale (cycles through `locales`). */
export function toggleLocale(): void {
	const current = get(locale)
	const next = locales.find((l) => l !== current) ?? baseLocale
	setLocale(next)
}