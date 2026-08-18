/**
 * ===========================================================================
 * QUAL ONDA A TELA MOSTRA, E DE ONDE SAI O DELTA
 * ===========================================================================
 * Enquanto existia UMA onda com dados em `engagement_scores`, ler a tabela
 * inteira dava o resultado certo por acidente. Na segunda onda o mesmo código
 * devolve as duas juntas -- e a tela não quebra, ela repete: "Marketing 48" e
 * "Marketing 62" na mesma lista, uma de agosto e outra de janeiro, sem nada
 * dizendo qual é qual.
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO VIROU MÓDULO PRÓPRIO
 * ------------------------------------------------------------------
 * Em 18/08/2026 eu corrigi exatamente isso -- em `getExperienceData`. E deixei
 * `getEngagementCross`, que lê a MESMA tabela para alimentar a fila por área,
 * o slope chart e a frase "onde agir primeiro", sem tocar. Resultado: a aba
 * ficou metade certa. Os drivers vieram de agosto; a lista por área veio com
 * as duas ondas empilhadas.
 *
 * Foi a mesma lição dos treze `authorize()` divergentes, na mesma semana: uma
 * regra escrita em dois lugares não é uma regra escrita em dois lugares por
 * muito tempo -- vira duas regras. O jeito de não repetir é não ter onde
 * repetir.
 *
 * Tudo aqui é função pura: entra lista, sai lista. O acesso ao banco fica nos
 * chamadores, e o que decide fica testável.
 */

export interface OndaLinha {
  wave: string;
  label: string;
  reference_date: string;
  respondents?: number | null;
  eligible?: number | null;
}

/** O mínimo que uma linha de `engagement_scores` precisa ter para entrar aqui. */
export interface LinhaComEscopo {
  scope: string;
  enps: number | null;
  retention_risk: number | null;
  satisfaction: number | null;
  enps_delta?: number | null;
  rr_delta?: number | null;
  sat_delta?: number | null;
}

export interface Ondas {
  /** A mais recente por data de referência. `null` se não há onda nenhuma. */
  atual: OndaLinha | null;
  /** A anterior a ela. `null` quando só existe uma. */
  anterior: OndaLinha | null;
  /** Todas, da mais recente para a mais antiga. */
  ordenadas: OndaLinha[];
}

/**
 * Ordena por data de referência, mais recente primeiro.
 *
 * A ordenação acontece AQUI e não no `order by` do banco de propósito: assim
 * o chamador não pode escolher uma ordem diferente sem que este módulo saiba.
 * Quando a ordem vem de fora, "a mais recente" passa a depender de quem
 * chamou -- e foi assim que a lista por área acabou com duas ondas.
 */
export function escolherOndas(linhas: readonly OndaLinha[]): Ondas {
  const ordenadas = [...linhas].sort((a, b) =>
    a.reference_date < b.reference_date ? 1 : a.reference_date > b.reference_date ? -1 : 0,
  );
  return {
    atual: ordenadas[0] ?? null,
    anterior: ordenadas[1] ?? null,
    ordenadas,
  };
}

const chave = (scope: string | null | undefined) => (scope ?? '').trim().toLowerCase();

const dif = (agora: number | null, antes: number | null | undefined): number | null =>
  agora == null || antes == null ? null : Math.round((agora - antes) * 10) / 10;

/**
 * Calcula o delta entre duas ondas, área por área.
 *
 * ------------------------------------------------------------------
 * POR QUE CALCULAR EM VEZ DE LER O QUE VEIO NA CARGA
 * ------------------------------------------------------------------
 * `enps_delta` veio pronto do deck do CEO na carga de jan/26. Com uma onda só
 * era a única forma possível -- e também uma promessa que ninguém podia
 * conferir: o número na coluna não tinha relação nenhuma com os outros dois
 * números da mesma tela. Um delta calculado não consegue discordar dos valores
 * que ele compara; um delta digitado consegue, e o desacordo passa despercebido
 * porque ninguém refaz a conta de cabeça ao olhar um painel.
 *
 * ------------------------------------------------------------------
 * SEM ONDA ANTERIOR, O DELTA É NULO -- NÃO ZERO
 * ------------------------------------------------------------------
 * Área nova, ou área que não respondeu antes, fica com `null`, que a tela
 * mostra como "—". Zero seria mentira: diria "não mudou" quando a verdade é
 * "não havia com o que comparar".
 *
 * Quando NÃO existe onda anterior nenhuma (`anterior` vazio), as linhas voltam
 * intactas -- é o caso de jan/26 sozinha, que continua funcionando como antes.
 */
export function comDeltaCalculado<T extends LinhaComEscopo>(
  atual: readonly T[],
  anterior: readonly LinhaComEscopo[],
): T[] {
  if (!anterior.length) return [...atual];

  const antes = new Map<string, LinhaComEscopo>();
  for (const r of anterior) antes.set(chave(r.scope), r);

  return atual.map((r) => {
    const a = antes.get(chave(r.scope));
    return {
      ...r,
      enps_delta: dif(r.enps, a?.enps),
      rr_delta: dif(r.retention_risk, a?.retention_risk),
      sat_delta: dif(r.satisfaction, a?.satisfaction),
    };
  });
}
