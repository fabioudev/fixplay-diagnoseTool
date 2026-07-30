import type { BaseTranslation } from '../i18n-types'

// German source locale (base). This is the single source of truth — the
// typesafe-i18n generator derives all types from this file. Add a key here,
// run `npm run i18n`, then mirror it in `../en/index.ts`. Missing keys in `en`
// are a TypeScript compile error (build fails) — the guarantee we want.
//
// Structure is grouped by UI surface (nav, header, tester, …). Leaf strings
// become typed functions on `$LL`, e.g. `$LL.nav.home()` or
// `$LL.nav.programmerCount({ count: 5 })` for `{name}` placeholders.
const de: BaseTranslation = {
	nav: {
		home: 'Start',
		flash: 'NOR Flash',
		uart: 'UART',
		i2c: 'I2C / Pico',
		controller: 'Controller',
		archive: 'Archiv',
		recents: 'Zuletzt genutzt',
		settings: 'Einstellungen',
		about: 'Über',
		programmerCount: '{count} Programmer',
		programmerNone: 'Kein Programmer',
		programmerCountTitle: '{count} Programmer erkannt',
		programmerNoneTitle: 'Kein Programmer erkannt',
	},
	header: {
		home: 'Start',
		flash: 'NOR Flash Diagnose',
		uart: 'UART Diagnostik',
		i2c: 'I2C / Pico Diagnostik',
		archive: 'NOR-Dump Archiv',
		controller: 'Controller-Diagnose',
		sidebarExpand: 'Seitenleiste ausklappen',
		sidebarCollapse: 'Seitenleiste einklappen',
		checkUpdates: 'Nach Updates suchen',
		updateAvailable: 'Update verfügbar: v{version}',
		pinOn: 'Immer im Vordergrund',
		pinOff: 'Immer im Vordergrund deaktivieren',
		pinTitleOn: 'Immer im Vordergrund: AN',
		pinTitleOff: 'Immer im Vordergrund: AUS',
		themeLight: 'Helles Design aktivieren',
		themeDark: 'Dunkles Design aktivieren',
		language: 'Sprache',
		updateBadge: 'Update',
	},
	tester: {
		lights: 'Lichter',
		vibration: 'Vibration',
		trigger: 'Trigger',
		audio: 'Audio',
		imu: 'IMU',
		touchpad: 'Touchpad',
	},
}

export default de