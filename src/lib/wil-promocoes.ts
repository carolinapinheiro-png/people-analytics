/**
 * Promoções do mês, a partir do histórico de cargos e salários do Convenia.
 *
 * ===========================================================================
 * O MOTIVO É QUE DECIDE, E ELE É EXPLÍCITO
 * ===========================================================================
 * O histórico traz um registro por alteração, com o campo `Motivo`. Medido nos
 * 2.457 registros da base: Admissão 1289, Dissídio 492, Mérito/Reajuste 463,
 * Promoção 74, Acordo coletivo 49, Antecipação de dissídio 39, Alteração de
 * função 21, Reestruturação 9, Enquadramento salarial 8, Mudança de jornada 7,
 * Espontâneo 5, Efetivação de estagiário 1.
 *
 * Só `Promoção` conta. As tentações são duas, e as duas erram:
 *
 * Contar toda alteração de salário daria 1.168 -- dissídio e mérito são
 * aumento, não promoção, e o report do WIL pergunta sobre progressão de
 * carreira.
 *
 * Contar `Alteração de função` junto pareceria razoável: mudou de cargo. Mas
 * mudança lateral não é promoção, e a Convenia já separa as duas coisas -- se
 * quem preenche escolheu "Alteração de função", escolheu dizer que não foi
 * promoção. Respeitar isso é mais confiável do que inferir.
 */
export const MOTIVO_PROMOCAO = 'Promoção';

export interface RegistroHistorico {
  /** Identificador da pessoa. O export traz nome e CPF; a API traz o id. */
  pessoaId: string;
  /** `Motivo` da alteração, como o Convenia escreve. */
  motivo: string | null;
  /** `De`: quando a alteração passou a valer. */
  vigenciaDe: string | null;
}

const mes = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  const iso = /^(\d{4})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}`;
  // O export escreve dd/mm/aaaa; a API, ISO. As duas formas convivem.
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  return br ? `${br[3]}-${br[2]}` : null;
};

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Foi promoção, com a comparação tolerante a acento e caixa. */
export function ehPromocao(motivo: string | null | undefined): boolean {
  return semAcento(motivo ?? '') === semAcento(MOTIVO_PROMOCAO);
}

/**
 * Quem foi promovido no mês. Devolve os ids, e não a contagem: quem chama
 * precisa cruzar com Career Band e gênero para as quatro colunas do report.
 *
 * Uma pessoa promovida duas vezes no mesmo mês conta UMA. O histórico tem um
 * registro por alteração, e duas correções no mesmo mês são um evento de
 * carreira, não dois.
 */
export function promovidosNoMes(
  historico: readonly RegistroHistorico[],
  ref: string,
): Set<string> {
  const ids = new Set<string>();
  for (const r of historico) {
    if (!r.pessoaId || !ehPromocao(r.motivo)) continue;
    if (mes(r.vigenciaDe) === ref) ids.add(r.pessoaId);
  }
  return ids;
}
