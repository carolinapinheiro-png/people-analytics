import { useCallback, useEffect, useState } from 'react';

/**
 * Tema claro/escuro escolhido pelo usuario. A escolha aplica/remove a classe
 * `.dark` no <html> (que aciona os tokens do styles.css) e persiste em
 * localStorage. O tema inicial e aplicado por um script inline no __root, antes
 * da pintura, para nao "piscar".
 */
export type Theme = 'light' | 'dark';

export function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.classList.toggle('dark', t === 'dark');
  el.style.colorScheme = t;
  try {
    localStorage.setItem('theme', t);
  } catch {
    /* ambiente sem storage: ignora */
  }
}

export function getInitialTheme(): Theme {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'dark';
  }
  try {
    const t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* ignora */
  }
  return 'dark';
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme());
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const toggle = useCallback(() => setThemeState((p) => (p === 'dark' ? 'light' : 'dark')), []);
  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  return { theme, toggle, setTheme };
}
