import { useCallback, useEffect, useState } from 'react';
import { loadPrefs, savePrefs } from '../sim/storage';
import { applyTheme } from './theme';
import type { ThemeName } from './theme';

/**
 * Light is the default - a white bench with black IC packages and a cream
 * breadboard, which is what the hardware actually looks like. The dark bench is
 * a click away in the toolbar, and whichever one is chosen is remembered.
 */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeName>(() => {
    const saved = loadPrefs<{ theme?: ThemeName }>({}).theme;
    return saved === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    applyTheme(theme);
    savePrefs({ ...loadPrefs<Record<string, unknown>>({}), theme });
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), []);

  return { theme, setTheme, toggle };
}
