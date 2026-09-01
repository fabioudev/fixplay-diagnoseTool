import { get, writable } from 'svelte/store';
import { pushRecent } from './recents';
import { flashBusy } from './flash';
import LL from '$lib/i18n/i18n-svelte';

/**
 * The top-level panels the app can show. The union is shared (instead of being
 * redeclared in `+page.svelte`) so the sidebar, header, status bar and keyboard
 * shortcuts all agree on the legal destinations.
 */
export type View = 'home' | 'flash' | 'uart' | 'i2c' | 'archive' | 'controller';

/**
 * App-wide state that more than one component needs to read or write. Today
 * that's just the active panel, but lifting it into a store (rather than local
 * `$state` in `+page.svelte`) lets the sidebar / status bar / header observe
 * navigation without prop-drilling, and lets keyboard shortcuts live anywhere.
 */
export interface AppState {
  /** Currently visible panel. */
  view: View;
  /** True once first-run onboarding has been dismissed / skipped. */
  onboardingDone: boolean;
}

const ONBOARDING_KEY = 'fixplay-onboarding-done';

function readOnboarding(): boolean {
  try {
    return typeof localStorage !== 'undefined' && !!localStorage.getItem(ONBOARDING_KEY);
  } catch {
    return false;
  }
}

export const appState = writable<AppState>({ view: 'home', onboardingDone: readOnboarding() });

/** Derived convenience store: just the active view. */
export const activeView = {
  subscribe: (run: (v: View) => void) => {
    let last: View | undefined;
    return appState.subscribe((s) => {
      if (s.view !== last) {
        last = s.view;
        run(s.view);
      }
    });
  },
  set: (v: View) => appState.update((s) => ({ ...s, view: v })),
};

/**
 * Navigate to a panel. Centralizing this guarantees every switch records the
 * visit for the sidebar's "zuletzt genutzt" quick-row (see {@link pushRecent}).
 *
 * Safety gate: leaving the flash panel while a flashrom operation runs would
 * hide (not stop!) the live progress of the app's most destructive workflow.
 * The window-close handler in `+page.svelte` asks the same native confirm();
 * here it also covers sidebar clicks, keyboard shortcuts and status-bar jumps.
 */
export function navigate(v: View): void {
  const current = get(appState).view;
  if (
    current === 'flash' &&
    v !== 'flash' &&
    get(flashBusy) &&
    !confirm(get(LL).flash.leavePanelConfirm())
  ) {
    return;
  }
  appState.update((s) => ({ ...s, view: v }));
  pushRecent(v);
}

/** Mark first-run onboarding as done (persists across restarts). */
export function completeOnboarding(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    /* ignored */
  }
  appState.update((s) => ({ ...s, onboardingDone: true }));
}

/** Order of panels for the Ctrl/Cmd+1..6 keyboard shortcuts. */
export const SHORTCUT_VIEWS: View[] = ['home', 'flash', 'uart', 'i2c', 'controller', 'archive'];
