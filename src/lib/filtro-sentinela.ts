/**
 * "Todos" — o valor que os seletores usam para dizer "não filtre nada".
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO PRECISA DE UM LUGAR SÓ
 * ------------------------------------------------------------------
 * A string 'Todos' aparecia comparada à mão em 20 pontos do código, em quatro
 * versões diferentes da mesma ideia:
 *
 *   dept-filter.ts     !d || d === 'Todos'          trata vazio, nulo e espaços
 *   comp.functions.ts  !t || t === 'Todos'          idem
 *   team.functions.ts  !t || t === 'Todos'          idem
 *   LeaversTab.tsx     f.departamento !== 'Todos'   NÃO trata vazio nem espaço
 *   UnwantedTab.tsx    idem, 7 linhas
 *   series-filter.ts   !key || !value || …          mistura duas checagens
 *
 * Já custou caro uma vez: `survey.functions.ts` fazia a comparação por conta
 * própria, não reconhecia o sentinela, e a coluna de respostas por área ficou
 * vazia na tela. O diagnóstico inicial foi outro -- mexi em normalização de
 * nome antes de descobrir que o problema era o 'Todos' chegando como se fosse
 * o nome de um departamento.
 *
 * Uma constante exportada também deixa o dia de renomear o rótulo (para "Todas
 * as áreas", digamos) ser uma edição em vez de uma caça.
 *
 * ------------------------------------------------------------------
 * A DIFERENÇA DE COMPORTAMENTO QUE ISTO INTRODUZ, DE PROPÓSITO
 * ------------------------------------------------------------------
 * As abas de desligamento comparavam sem `trim` e sem tratar string vazia. Com
 * `''` guardado no filtro, o código antigo filtrava as linhas cujo campo também
 * era vazio; o novo entende `''` como "sem filtro". A segunda leitura é a certa
 * -- ninguém escolhe "vazio" num seletor --, mas é mudança, e fica registrada
 * aqui em vez de passar despercebida.
 */

export const SEM_FILTRO = 'Todos';

/** Nulo, vazio, só espaços ou o sentinela: nenhuma seleção foi feita. */
export function semFiltro(v: string | null | undefined): boolean {
  const t = v?.trim();
  return !t || t === SEM_FILTRO;
}

/** O valor escolhido, já sem espaços — ou null quando não há escolha. */
export function valorFiltro(v: string | null | undefined): string | null {
  return semFiltro(v) ? null : v!.trim();
}

/**
 * A linha passa pelo filtro?
 *
 * Sem seleção, tudo passa. Com seleção, compara sem espaços nas pontas dos dois
 * lados — o dado vem de planilha, e " Marketing" não deveria sumir da tela por
 * causa de um espaço.
 */
export function passaFiltro(
  escolhido: string | null | undefined,
  valorDaLinha: string | null | undefined,
): boolean {
  const alvo = valorFiltro(escolhido);
  if (alvo == null) return true;
  return (valorDaLinha ?? '').trim() === alvo;
}
