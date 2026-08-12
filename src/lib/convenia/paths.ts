/**
 * Lista fechada de caminhos que o código pode chamar no Convenia.
 *
 * ------------------------------------------------------------------
 * POR QUE UMA LISTA FECHADA
 * ------------------------------------------------------------------
 * O token do Convenia dá acesso ao cadastro de pessoas: CPF, endereço, dados
 * bancários, dependentes, documentos. O painel não usa nada disso -- ele
 * precisa de contagem por área e mês.
 *
 * O token tem permissão por campo, escolhida na criação, e essa é a primeira
 * barreira. Mas ela vive fora do repositório: ninguém revisando um diff
 * consegue ver o que foi marcado lá. Esta lista é a barreira que **aparece na
 * revisão**. Ampliá-la é uma linha de diff que alguém lê, em vez de um efeito
 * colateral de uma chamada nova.
 *
 * As duas juntas exigem uma decisão consciente. Cada uma sozinha seria
 * contornável por distração.
 */

export const CONVENIA_BASE = 'https://public-api.convenia.com.br/api/v3';

/** Permissões e campos do próprio token. Diagnóstico -- não traz dado pessoal. */
export const TOKEN_PERMISSIONS = '/tokens/permissions';

export const EMPLOYEES = '/employees';
export const EMPLOYEES_DISMISSED = '/employees/dismissed';
export const DEPARTMENTS = '/departments';
export const POSITIONS = '/positions';
export const COST_CENTERS = '/cost-centers';
export const DISMISSAL_TYPES = '/dismissal-types';

/**
 * Detalhe de UMA pessoa. Traz o cadastro completo -- CPF, RG, endereço, conta
 * bancária -- e por isso ficou fora desta lista até 12/08/2026.
 *
 * Entrou porque não havia alternativa: a listagem de desligados só devolve
 * `id`, `corporate_email` e o bloco `dismissal`. Sem data de admissão, quem
 * saiu não entra no headcount dos meses em que estava lá, e a série histórica
 * fica subestimada -- eram 164 de 802 pessoas, 20% da base.
 *
 * A tela de permissões do Convenia foi conferida: só existem dois campos
 * selecionáveis para aquela listagem. Não é configuração, é limite do produto.
 *
 * Três restrições ficam junto com a permissão:
 *   1. Só é chamado para quem JÁ SAIU -- nunca para quem está na empresa.
 *   2. Só uma vez por pessoa. O resultado vai para `convenia_leavers` com
 *      quatro campos, e a mesma pessoa nunca é buscada de novo.
 *   3. Dos 123 campos que voltam, quatro sobrevivem à primeira linha de código.
 */
export const EMPLOYEE_DETAIL = (id: string) => `/employees/${id}`;

const PERMITIDOS: readonly string[] = [
  TOKEN_PERMISSIONS,
  EMPLOYEES,
  EMPLOYEES_DISMISSED,
  DEPARTMENTS,
  POSITIONS,
  COST_CENTERS,
  DISMISSAL_TYPES,
];

/** `/employees/{uuid}` -- validado por formato para não virar caminho livre. */
const DETALHE = /^\/employees\/[A-Za-z0-9-]{8,}$/;

/**
 * Um caminho é permitido se estiver na lista fixa OU for o detalhe de uma
 * pessoa. Query string não conta -- a comparação é sobre o recurso, não sobre
 * os filtros.
 *
 * O detalhe passa por regex e não por lista porque o id varia. A regex é
 * fechada de propósito (só o formato de uuid): sem ela, `/employees/../algo`
 * viraria caminho livre, e a lista fechada perderia a razão de existir.
 */
export function isPathPermitido(path: string): boolean {
  const semQuery = path.split('?')[0].replace(/\/+$/, '') || '/';
  return PERMITIDOS.includes(semQuery) || DETALHE.test(semQuery);
}

/**
 * O Convenia devolve `{ message, data, success }` nos endpoints simples e um
 * envelope paginado do Laravel (`current_page`, `last_page`, `data`) nos de
 * listagem. Esta função aceita os dois e diz se reconheceu o formato.
 *
 * `reconhecido: false` é informação, não erro: significa que a API mudou de
 * formato e que o silêncio seguinte seria uma lista vazia se passando por
 * "nenhum colaborador".
 */
export function extrairPagina<T>(corpo: unknown): {
  itens: T[];
  ultimaPagina: number | null;
  paginaAtual: number | null;
  total: number | null;
  reconhecido: boolean;
} {
  const c = corpo as Record<string, unknown> | null;
  if (!c || typeof c !== 'object') {
    return { itens: [], ultimaPagina: null, paginaAtual: null, total: null, reconhecido: false };
  }
  const data = c.data;
  if (!Array.isArray(data)) {
    // `data` como objeto acontece em /tokens/permissions -- um recurso único.
    return {
      itens: data ? ([data] as T[]) : [],
      ultimaPagina: null,
      paginaAtual: null,
      total: null,
      reconhecido: data != null,
    };
  }
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : null);
  return {
    itens: data as T[],
    ultimaPagina: num(c.last_page),
    paginaAtual: num(c.current_page),
    /** Total de registros do recurso inteiro, não da página. */
    total: num(c.total),
    reconhecido: true,
  };
}
