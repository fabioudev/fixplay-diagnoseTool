// Translation dictionary for the i18n infrastructure (#53). German (de) is the
// source/default; English (en) mirrors it. Keys are dotted ids grouped by UI
// surface. The record is the single source of truth — add a key here, then use
// `$t('group.key')` in a component. Fallback order is: active locale → de → key.
//
// This covers the navigation chrome (sidebar, header, tester tabs) so the
// language toggle visibly switches the app's primary labels. Domain panels
// (flash/uart/i2c/controller forms) keep their German strings for now and can
// be migrated key-by-key without touching this file's structure.

export const translations = {
  de: {
    // Sidebar / navigation
    'nav.home': 'Start',
    'nav.flash': 'NOR Flash',
    'nav.uart': 'UART',
    'nav.i2c': 'I2C / Pico',
    'nav.controller': 'Controller',
    'nav.archive': 'Archiv',
    'nav.recents': 'Zuletzt genutzt',
    'nav.settings': 'Einstellungen',
    'nav.about': 'Über',
    'nav.programmerCount': '{count} Programmer',
    'nav.programmerNone': 'Kein Programmer',
    'nav.programmerCountTitle': '{count} Programmer erkannt',
    'nav.programmerNoneTitle': 'Kein Programmer erkannt',

    // Header view titles
    'header.home': 'Start',
    'header.flash': 'NOR Flash Diagnose',
    'header.uart': 'UART Diagnostik',
    'header.i2c': 'I2C / Pico Diagnostik',
    'header.archive': 'NOR-Dump Archiv',
    'header.controller': 'Controller-Diagnose',
    'header.sidebarExpand': 'Seitenleiste ausklappen',
    'header.sidebarCollapse': 'Seitenleiste einklappen',
    'header.checkUpdates': 'Nach Updates suchen',
    'header.updateAvailable': 'Update verfügbar: v{version}',
    'header.pinOn': 'Immer im Vordergrund',
    'header.pinOff': 'Immer im Vordergrund deaktivieren',
    'header.pinTitleOn': 'Immer im Vordergrund: AN',
    'header.pinTitleOff': 'Immer im Vordergrund: AUS',
    'header.themeLight': 'Helles Design aktivieren',
    'header.themeDark': 'Dunkles Design aktivieren',
    'header.language': 'Sprache',

    // Tester panel tabs
    'tester.lights': 'Lichter',
    'tester.vibration': 'Vibration',
    'tester.trigger': 'Trigger',
    'tester.audio': 'Audio',
    'tester.imu': 'IMU',
    'tester.touchpad': 'Touchpad',
  },
  en: {
    // Sidebar / navigation
    'nav.home': 'Home',
    'nav.flash': 'NOR Flash',
    'nav.uart': 'UART',
    'nav.i2c': 'I2C / Pico',
    'nav.controller': 'Controller',
    'nav.archive': 'Archive',
    'nav.recents': 'Recently used',
    'nav.settings': 'Settings',
    'nav.about': 'About',
    'nav.programmerCount': '{count} programmers',
    'nav.programmerNone': 'No programmer',
    'nav.programmerCountTitle': '{count} programmers detected',
    'nav.programmerNoneTitle': 'No programmer detected',

    // Header view titles
    'header.home': 'Home',
    'header.flash': 'NOR Flash Diagnostics',
    'header.uart': 'UART Diagnostics',
    'header.i2c': 'I2C / Pico Diagnostics',
    'header.archive': 'NOR Dump Archive',
    'header.controller': 'Controller Diagnostics',
    'header.sidebarExpand': 'Expand sidebar',
    'header.sidebarCollapse': 'Collapse sidebar',
    'header.checkUpdates': 'Check for updates',
    'header.updateAvailable': 'Update available: v{version}',
    'header.pinOn': 'Always on top',
    'header.pinOff': 'Disable always on top',
    'header.pinTitleOn': 'Always on top: ON',
    'header.pinTitleOff': 'Always on top: OFF',
    'header.themeLight': 'Switch to light theme',
    'header.themeDark': 'Switch to dark theme',
    'header.language': 'Language',

    // Tester panel tabs
    'tester.lights': 'Lights',
    'tester.vibration': 'Vibration',
    'tester.trigger': 'Trigger',
    'tester.audio': 'Audio',
    'tester.imu': 'IMU',
    'tester.touchpad': 'Touchpad',
  },
} as const;

/** Union of all known translation keys (for typed non-reactive lookups). */
export type TranslationKey = keyof (typeof translations)['de'];