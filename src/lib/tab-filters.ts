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
  lifecycle: [],
  // Escopo vem do servidor (perfil do usuário), não da barra.
  team: [],
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
  span: [],                 // lê da própria server function
  // Ciclo de vida
  recrutamento: [],         // a aba declara que não responde a filtro
  experiencia: [],          // server functions próprias
  atricao: TODOS,           // LeaversTab e UnwantedTab filtram linha a linha
};

export function filtersForTab(tab: DashboardTab, subTab?: string | null): FilterKey[] {
  if (subTab && subTab in FILTERS_BY_SUBTAB) return FILTERS_BY_SUBTAB[subTab];
  return FILTERS_BY_TAB[tab] ?? ['departamento'];
}
