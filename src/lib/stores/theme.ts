import { writable } from 'svelte/store';

// App color theme (#52). The app is dark-first; a light theme is provided by
// inverting the Tailwind gray ramp via CSS variables (see app.css), so every
// `bg-gray-*` / `text-gray-*` / `border-gray-*` utility re-themes app-wide
// without per-component changes. The choice is persisted in localStorage and
// applied to `<html data-theme="…">` from the root layout.

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'fixplay-theme';

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

export const theme = writable<Theme>(initialTheme());

/** Apply the theme to `<html data-theme="…">` (call from a subscriber). */
export function applyTheme(t: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = t;
  }
}

export function setTheme(t: Theme): void {
  if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, t);
  theme.set(t);
}

export function toggleTheme(): void {
  theme.update((t) => {
    const next: Theme = t === 'dark' ? 'light' : 'dark';
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
    return next;
  });
}