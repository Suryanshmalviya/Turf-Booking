import { create } from 'zustand';

export const THEME_STORAGE_KEY = 'pb_theme';

export const THEMES = ['light', 'dark', 'system'] as const;

export type ThemePreference = (typeof THEMES)[number];

/** What the preference resolves to once the OS setting is taken into account. */
export type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

/**
 * Theme preference. Client-side state with no server equivalent, so it belongs in
 * a store rather than in a query. Persisted by hand — the preference must survive
 * a reload even before React mounts, or the page flashes the wrong theme.
 */
function readStoredTheme(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'system';

  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return THEMES.includes(stored as ThemePreference) ? (stored as ThemePreference) : 'system';
}

function writeStoredTheme(theme: ThemePreference): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export const useThemeStore = create<ThemeState>()(set => ({
  theme: readStoredTheme(),
  setTheme: theme => {
    writeStoredTheme(theme);
    set({ theme });
  },
}));

/** Resolve `system` against the OS preference. */
export function resolveTheme(theme: ThemePreference): ResolvedTheme {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Reflect the theme on `<html>` so CSS can react to it. `data-theme` keeps the
 * markup self-describing for tests; the `dark` class is what Tailwind's class
 * strategy keys off.
 */
export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;

  document.documentElement.dataset.theme = resolved;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}
