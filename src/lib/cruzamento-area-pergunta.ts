import { ehResidual } from "@/lib/engagement-context";

/**
 * O que ligar a matriz de ação ao gráfico de perguntas.
 *
 * ------------------------------------------------------------------
 * A PERGUNTA QUE NENHUM DOS DOIS RESPONDIA
 * ------------------------------------------------------------------
 * A aba tem duas leituras do mesmo problema, e cada uma responde metade:
 *
 *   A matriz diz ONDE agir  -- "Marketing e Finance" -- e não diz o quê.
 *   O gráfico de perguntas diz O QUÊ -- "comunicação rende mais" -- e não diz
 *   onde.
 *
 * Quem precisa agir fica com as duas metades e monta o cruzamento de cabeça.
 * Este módulo faz a conta: para cada área que a régua marcou como prioritária,
 * quais das perguntas que mais rendem estão especialmente mal ALI.
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO NÃO É UM GRÁFICO NOVO
 * ------------------------------------------------------------------
 * A aba já tem três recortes do mesmo cubo (área × pergunta). O que faltava
 * era ligação, não visualização -- um quarto gráfico só adicionaria mais uma
 * coisa para a pessoa cruzar sozinha. O resultado aqui é FRASE, do mesmo tipo
 * das outras leituras automáticas da aba: sai do dado e muda quando ele muda.
 */

export interface PerguntaPrioritaria {
  question: string;
  driver: string;
}

export interface NotaDeArea {
  question: string;
  area: string;
  favoravel: number | null;
  n: number;
}

export interface AchadoDaArea {
  area: string;
  /** Perguntas prioritárias onde a área está pior que a empresa, a pior antes. */
  perguntas: Array<{
    question: string;
    driver: string;
    area: number;
    empresa: number;
    gap: number;
  }>;
}

/** Recorte pequeno demais para a diferença significar algo sobre a área. */
const N_MINIMO = 5;

/**
 * Diferença mínima, em pontos percentuais, para a pergunta entrar na frase.
 *
 * Sem um piso, qualquer área acaba tendo "a pior das dez" mesmo quando está
 * colada na empresa em todas -- e a frase viraria ruído com cara de achado.
 */
const GAP_MINIMO = 8;

export function cruzarAreasComPerguntas(
  areasPrioritarias: readonly string[],
  prioritarias: readonly PerguntaPrioritaria[],
  notasPorArea: readonly NotaDeArea[],
  notaDaEmpresa: ReadonlyMap<string, number | null>,
  limite = 3,
): AchadoDaArea[] {
  const doInteresse = new Set(prioritarias.map((p) => p.question));
  const driverDe = new Map(prioritarias.map((p) => [p.question, p.driver]));

  return (
    areasPrioritarias
      // O balde residual não tem líder a quem levar a conversa; a frase existe
      // para dizer a alguém o que fazer.
      .filter((a) => !ehResidual(a))
      .map((area) => {
        const perguntas = notasPorArea
          .filter(
            (l) =>
              l.area === area &&
              doInteresse.has(l.question) &&
              l.favoravel != null &&
              l.n >= N_MINIMO,
          )
          .map((l) => {
            const emp = notaDaEmpresa.get(l.question) ?? null;
            return emp == null
              ? null
              : {
                  question: l.question,
                  driver: driverDe.get(l.question) ?? "",
                  area: Math.round(l.favoravel as number),
                  empresa: Math.round(emp),
                  gap: Math.round(((l.favoravel as number) - emp) * 10) / 10,
                };
          })
          .filter((x): x is NonNullable<typeof x> => x != null && x.gap <= -GAP_MINIMO)
          .sort((a, b) => a.gap - b.gap)
          .slice(0, limite);

        return { area, perguntas };
      })
      .filter((a) => a.perguntas.length > 0)
  );
}
