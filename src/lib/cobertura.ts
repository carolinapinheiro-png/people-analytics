/**
 * ===========================================================================
 * ATÉ ONDE CADA BASE ALCANÇA
 * ===========================================================================
 * O painel passou a ter 14 anos de série de quadro (março/2013 em diante,
 * quando a série do Convenia deixou de ser descartada na leitura). As outras
 * bases não acompanham nem de longe: desligados começam em 2024, pesquisa e
 * recrutamento em 2025.
 *
 * Isso não é defeito -- é a história da empresa. O defeito seria a tela não
 * dizer. Escolher 2017 hoje devolve a aba Quadro cheia e todas as outras
 * vazias, e vazio se lê como "não aconteceu nada", não como "não foi
 * coletado". É o mesmo par de leituras que já foi separado em Salários (camada
 * não importada x ninguém na área) e na linha do tempo das pesquisas (onda
 * registrada x onda sem dado).
 *
 * Tudo aqui é função pura sobre a cobertura que o servidor mediu. Nenhum ano
 * escrito à mão: a lista de bases é fixa, os limites vêm do banco. Uma base
 * que passar a cobrir 2013 amanhã some deste aviso sozinha.
 */

export type BaseDados = 'quadro' | 'desligados' | 'pesquisa' | 'recrutamento';

export interface CoberturaBase {
  base: BaseDados;
  /** Como a base é chamada na conversa, não o nome da tabela. */
  label: string;
  /** As abas que ficam vazias sem ela. */
  abas: string[];
  /** Ano do primeiro e do último registro, AAAA. `null` = base vazia. */
  primeiroAno: string | null;
  ultimoAno: string | null;
}

/** A base alcança este ano? Base vazia não alcança ano nenhum. */
export function alcanca(c: CoberturaBase, ano: string): boolean {
  if (!c.primeiroAno || !c.ultimoAno) return false;
  return ano >= c.primeiroAno && ano <= c.ultimoAno;
}

/**
 * As bases que NÃO chegam ao ano escolhido.
 *
 * Vazio significa "este ano tem tudo" -- e é o caso da maioria dos anos que
 * alguém escolhe de verdade. O aviso só aparece quando há o que avisar.
 */
export function basesSemDado(
  ano: string | null,
  cobertura: readonly CoberturaBase[],
): CoberturaBase[] {
  if (!ano) return [];                       // 'Todos': não há um ano a julgar
  return cobertura.filter((c) => !alcanca(c, ano));
}

/**
 * Rótulo do ano na lista, já dizendo o que ele tem.
 *
 * "2017 · só quadro" é mais honesto que "2017" e mais curto que uma legenda.
 * Quem lê a lista decide antes de clicar, em vez de clicar e interpretar uma
 * tela vazia.
 */
export function rotuloAno(ano: string, cobertura: readonly CoberturaBase[]): string {
  const faltando = basesSemDado(ano, cobertura);
  if (!faltando.length) return ano;
  const tem = cobertura.filter((c) => alcanca(c, ano));
  if (!tem.length) return `${ano} · sem dado`;
  return `${ano} · só ${tem.map((c) => c.label.toLowerCase()).join(' e ')}`;
}
