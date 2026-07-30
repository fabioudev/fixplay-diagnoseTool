import type { Translation } from '../i18n-types'

// English locale. Must mirror the structure of the German base (`../de`).
// A missing or extra key here is a TypeScript compile error — that is the
// build-fails-on-missing-translation guarantee.
const en: Translation = {
	nav: {
		home: 'Home',
		flash: 'NOR Flash',
		uart: 'UART',
		i2c: 'I2C / Pico',
		controller: 'Controller',
		archive: 'Archive',
		recents: 'Recently used',
		settings: 'Settings',
		about: 'About',
		programmerCount: '{count} programmers',
		programmerNone: 'No programmer',
		programmerCountTitle: '{count} programmers detected',
		programmerNoneTitle: 'No programmer detected',
	},
	header: {
		home: 'Home',
		flash: 'NOR Flash Diagnostics',
		uart: 'UART Diagnostics',
		i2c: 'I2C / Pico Diagnostics',
		archive: 'NOR Dump Archive',
		controller: 'Controller Diagnostics',
		sidebarExpand: 'Expand sidebar',
		sidebarCollapse: 'Collapse sidebar',
		checkUpdates: 'Check for updates',
		updateAvailable: 'Update available: v{version}',
		pinOn: 'Always on top',
		pinOff: 'Disable always on top',
		pinTitleOn: 'Always on top: ON',
		pinTitleOff: 'Always on top: OFF',
		themeLight: 'Switch to light theme',
		themeDark: 'Switch to dark theme',
		language: 'Language',
		updateBadge: 'Update',
	},
	tester: {
		lights: 'Lights',
		vibration: 'Vibration',
		trigger: 'Trigger',
		audio: 'Audio',
		imu: 'IMU',
		touchpad: 'Touchpad',
	},
}

export default en