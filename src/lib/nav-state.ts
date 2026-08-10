/**
 * Estado de navegação do índice lateral guardado no navegador: a pessoa recarrega
 * a página e volta exatamente para a aba/sub-aba onde estava. Leitura só acontece
 * depois da hidratação (nunca no init do useState), senão o HTML do servidor e o
 * do cliente divergem.
 */
export interface NavState {
  tab?: string;
  sub?: string | null;
  collapsed?: boolean;
  open?: Record<string, boolean>;
}

const KEY = 'dashboard:nav-state';

export function readNavState(): NavState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NavState;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeNavState(patch: NavState) {
  if (typeof window === 'undefined') return;
  try {
    const next = { ...(readNavState() ?? {}), ...patch };
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage indisponível (modo privado, cota) — perder a preferência
    // é aceitável; quebrar a navegação não é.
  }
}
