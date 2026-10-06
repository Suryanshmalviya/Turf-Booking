import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { applyTheme, type ResolvedTheme, resolveTheme, useThemeStore } from '../store/theme.store';
import { ThemeContext, type ThemeContextValue } from './themeContext';

/**
 * Applies the theme preference to the document and repaints when the OS setting
 * changes while the preference is `system`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemeStore(state => state.theme);
  const setTheme = useThemeStore(state => state.setTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => resolveTheme('system'));

  useEffect(() => {
    if (!window.matchMedia) return undefined;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemTheme(query.matches ? 'dark' : 'light');

    // Safari < 14 only exposes the deprecated listener API.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }

    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);

  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}