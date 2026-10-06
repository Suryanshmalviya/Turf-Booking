import { createContext, useContext } from 'react';

import type { ResolvedTheme, ThemePreference } from '../store/theme.store';

export interface ThemeContextValue {
  /** What the visitor picked. */
  theme: ThemePreference;
  /** What is actually rendered once `system` is resolved. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

// Separate from the provider component so fast-refresh stays reliable and the
// hook can be imported without pulling in the implementation.
export const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Read or change the theme. Must be used inside a `<ThemeProvider>`. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}
