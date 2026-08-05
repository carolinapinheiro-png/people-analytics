import type { DashboardTab } from '@/lib/permissions';

/**
 * Quais filtros CADA ABA de fato aplica.
 *
 * POR QUE ISTO EXISTE
 * A barra mostrava os sete filtros em todas as abas. Só que seis deles
 * (job family, tempo de casa, tipo de contrato, faixa salarial, tipo de
 * desligamento e level) são lidos APENAS em Atrição & Desligamentos --
 * confirmado no código: nenhum outro componente referencia `filters.*`.
 *
 * O resultado era pior do que poluição visual: a pessoa selecionava "Tempo de
 * casa: 1-2 anos" no Overview, nada mudava, e a tela não dizia nada. Uma
 * interface que afirma filtrar sem filtrar corrói a confiança no número que ela
 * mostra -- e recuperar isso custa muito mais do que uma barra feia.
 *
 * O filtro de DEPARTAMENTO é diferente: ele passa pelo applyDeptFilter do
 * DashboardContext, então vale para toda aba que consome a série do contexto.
 *
 * COMO MANTER
 * Ao criar uma aba, registre-a aqui. Lista vazia = a barra some naquela aba,
 * que é a resposta honesta quando nada é filtrável. Se uma aba passar a ler um
 * filtro novo, acrescente aqui no mesmo commit -- senão o controle existe e não
 * aparece, que é o erro simétrico.
 */

export type FilterKey =
  | 'departamento'
  | 'jobFamily'
  | 'tempoCasa'
  | 'tipoContrato'
  | 'faixaSalarial'
  | 'tipoDesligamento'
  | 'level';

/** Rótulo curto para a etiqueta de filtro ativo. */
export const FILTER_LABELS: Record<FilterKey, string> = {
  departamento: 'Departamento',
  jobFamily: 'Job family',
  tempoCasa: 'Tempo de casa',
  tipoContrato: 'Contrato',
  faixaSalarial: 'Faixa salarial',
  tipoDesligamento: 'Tipo de desligamento',
  level: 'Level',
};

const TODOS: FilterKey[] = [
  'departamento',
  'jobFamily',
  'tempoCasa',
  'tipoContrato',
  'faixaSalarial',
  'tipoDesligamento',
  'level',
];

export const FILTERS_BY_TAB: Record<DashboardTab, FilterKey[]> = {
  // Consomem a série do contexto, que passa pelo applyDeptFilter.
  overview: ['departamento'],
  data: ['departamento'],
  // Compensação responde via a sub-aba de Salários (SalaryTab lê a série).
  comp: ['departamento'],
  // Agrupadores: o que vale é a sub-aba (ver SUBTAB abaixo). O valor aqui é o
  // que se aplica enquanto nenhuma sub-aba foi escolhida.
  quadro: ['departamento'],
  lifecycle: ['departamento'],
  // Meu Time agora aceita estreitar dentro do próprio escopo: um gestor de
  // duas áreas consegue olhar uma de cada vez.
  team: ['departamento'],
  // Tem busca própria por pessoa; filtro de área não acrescenta.
  individual: [],
};

/**
 * Dentro de um agrupador, quem manda é a sub-aba.
 *
 * Sem isto, "Ciclo de vida" herdaria os sete filtros de Atrição e voltaria a
 * exibi-los em Recrutamento e Experiência, onde nenhum funciona -- exatamente
 * o problema que a separação por aba resolveu.
 */
const FILTERS_BY_SUBTAB: Record<string, FilterKey[]> = {
  // Quadro
  demograficos: ['departamento'],
  dei: ['departamento'],
  span: ['departamento'],   // filtrado no servidor, sobre span_snapshot
  // Ciclo de vida
  recrutamento: ['departamento'],
  experiencia: ['departamento'],  // alcança o engajamento; ver nota abaixo
  atricao: TODOS,           // LeaversTab e UnwantedTab filtram linha a linha
};

/**
 * Filtros que existem mas NÃO se aplicam à aba, com o motivo.
 *
 * A barra mostra estes esmaecidos em vez de sumir com eles: some sem
 * explicação faz parecer que o controle nunca existiu, e a pessoa não aprende
 * o limite -- volta a procurar o filtro na próxima vez.
 */
export const FILTER_UNAVAILABLE_REASON: Record<string, string> = {
  serie:
    'A série mensal guarda apenas a quebra por departamento. Para recortar por este critério seria preciso pré-calcular a quebra dele mês a mês.',
  pessoa:
    'Este recorte só existe nas bases por pessoa (comp ratio e desligados), não nesta aba.',
  escopo: 'Esta aba já vem escopada pelo seu perfil de acesso.',
};

/** Para cada aba, o que fica visível-porém-inativo e por quê. */
export function unavailableFilters(
  tab: DashboardTab,
  subTab?: string | null,
): Array<{ key: FilterKey; reason: string }> {
  const ativos = new Set(filtersForTab(tab, subTab));
  const daSerie: FilterKey[] = ['tempoCasa', 'tipoContrato', 'faixaSalarial', 'level', 'jobFamily'];
  const abasDeSerie: DashboardTab[] = ['overview', 'quadro', 'data', 'comp'];
  const out: Array<{ key: FilterKey; reason: string }> = [];
  if (abasDeSerie.includes(tab)) {
    for (const k of daSerie) {
      if (!ativos.has(k)) out.push({ key: k, reason: FILTER_UNAVAILABLE_REASON.serie });
    }
  }
  return out;
}

export function filtersForTab(tab: DashboardTab, subTab?: string | null): FilterKey[] {
  if (subTab && subTab in FILTERS_BY_SUBTAB) return FILTERS_BY_SUBTAB[subTab];
  return FILTERS_BY_TAB[tab] ?? ['departamento'];
}
