// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { theme, toggleTheme, setTheme, applyTheme, type Theme } from './theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('theme store (#52)', () => {
  it('defaults to dark when nothing is stored', () => {
    let current: Theme | undefined;
    const unsub = theme.subscribe((t) => (current = t));
    expect(current).toBe('dark');
    unsub();
  });

  it('toggleTheme flips dark↔light and persists', () => {
    toggleTheme();
    expect(localStorage.getItem('fixplay-theme')).toBe('light');
    let current: Theme | undefined;
    const unsub = theme.subscribe((t) => (current = t));
    expect(current).toBe('light');
    unsub();
    toggleTheme();
    expect(localStorage.getItem('fixplay-theme')).toBe('dark');
  });

  it('setTheme persists the given value', () => {
    setTheme('light');
    expect(localStorage.getItem('fixplay-theme')).toBe('light');
    setTheme('dark');
    expect(localStorage.getItem('fixplay-theme')).toBe('dark');
  });

  it('applyTheme sets <html data-theme>', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('initialTheme reads a stored light preference', async () => {
    localStorage.setItem('fixplay-theme', 'light');
    // Re-import to exercise the initializer path with a stored value.
    vi.resetModules();
    const { theme: freshTheme } = await import('./theme');
    let current: Theme | undefined;
    const unsub = freshTheme.subscribe((t) => (current = t));
    expect(current).toBe('light');
    unsub();
  });
});
