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

/**
 * A mesma persistência para pares de abas fora do dashboard.
 *
 * ===========================================================================
 * A TELA DE ADMIN NÃO GUARDAVA NADA
 * ===========================================================================
 * Lá as abas usam `defaultValue`, que é estado NÃO CONTROLADO do Radix: ele
 * vive dentro do componente e morre no recarregamento. Quem estava em
 * "Dados > Convenia" e apertava F5 voltava para a primeira aba e a primeira
 * sub-aba, toda vez.
 *
 * Isso pesa mais nesta tela do que no dashboard, porque a aba de Dados é onde
 * se roda carga e se confere resultado -- e cada conferência é um
 * recarregamento. Perder o lugar a cada F5 transforma uma tarefa de dois
 * cliques numa de quatro.
 *
 * Chave própria por tela: o estado do dashboard e o do admin não se
 * atrapalham, e limpar um não apaga o outro.
 */
export function lerAba(tela: string): { tab?: string; sub?: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${KEY}:${tela}`);
    return raw ? (JSON.parse(raw) as { tab?: string; sub?: string }) : null;
  } catch {
    return null;
  }
}

export function gravarAba(tela: string, patch: { tab?: string; sub?: string }) {
  if (typeof window === 'undefined') return;
  try {
    const next = { ...(lerAba(tela) ?? {}), ...patch };
    window.localStorage.setItem(`${KEY}:${tela}`, JSON.stringify(next));
  } catch {
    // Mesmo raciocínio de `writeNavState`.
  }
}
