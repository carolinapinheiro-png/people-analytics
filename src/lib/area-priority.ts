import { median } from "@/lib/stats";

/**
 * Classificação das áreas em fila de prioridade.
 *
 * ------------------------------------------------------------------
 * O CORTE É A MEDIANA -- E A MARGEM VIROU AVISO, NÃO FILTRO
 * ------------------------------------------------------------------
 * Houve uma versão com margem (desvio absoluto mediano): a área só era chamada
 * de "abaixo" se estivesse abaixo da mediana por mais que o afastamento típico
 * do grupo. O motivo era real -- em jan/2026, Technology ficou 2,5 pontos de
 * eNPS abaixo da mediana e 0,55 p.p. de risco acima, e isso bastava para a tela
 * dizer "AGIR PRIMEIRO" ao lado de Marketing, que estava 19,5 pontos abaixo.
 *
 * Só que essa regra vivia AQUI e a matriz de ação cortava pela mediana pura, no
 * código dela. As duas telas classificavam as mesmas oito áreas e discordavam:
 * Product aparecia como "agir primeiro" numa e "sem sinal de alerta" na outra,
 * na mesma rolagem. Duas réguas certas que se contradizem valem menos que uma
 * régua só, e a liderança lê as duas.
 *
 * Decisão (21/08/2026, com a Carolina): uma régua só, a mediana -- que é a que
 * já estava na matriz e a que dá para explicar em uma frase.
 *
 * A proteção não foi jogada fora, mudou de forma. Em vez de ESCONDER o veredito
 * frágil, o classificador agora o MARCA: `noLimite` é true quando a distância
 * até a linha é menor do que uma única resposta moveria. A tela mostra o rótulo
 * e mostra que ele é frágil, em vez de decidir isso pela pessoa.
 *
 * O caso que motivou: Product, ago/26. eNPS 66 contra mediana 67,5 e risco
 * 14,6% contra 14,3% -- vira "agir primeiro" por 1,5 ponto e 0,3 p.p., com 41
 * respondentes, onde UMA pessoa vale 2,4 pontos de eNPS.
 *
 * ------------------------------------------------------------------
 * "MANTER" É O PADRÃO, NÃO UM PRÊMIO
 * ------------------------------------------------------------------
 * Área que não dispara nenhum sinal cai em "manter". Não significa que está
 * ótima -- significa que nada nela se destaca do grupo o suficiente para pedir
 * ação. Exigir sinal positivo claro para entrar aqui criaria uma quinta
 * categoria de "meio termo" que ninguém saberia usar.
 */

export type Veredito = "agir" | "vigiar" | "ouvir" | "manter";

export interface AreaEntrada {
  scope: string;
  /** null = não é departamento (marca, total). Não entra na fila. */
  dept: string | null;
  enps: number | null;
  retentionRisk: number | null;
  headcountMedio: number | null;
  /**
   * Quantas pessoas responderam na área. Não entra na classificação -- serve
   * para saber quanto UMA resposta move o índice, que é a régua do `noLimite`.
   */
  respostas?: number | null;
}

export interface AreaClassificada {
  scope: string;
  enps: number;
  risco: number | null;
  headcount: number | null;
  veredito: Veredito;
  /**
   * O veredito foi decidido por uma margem menor do que uma única resposta
   * moveria. Continua sendo o veredito -- mas quem lê precisa saber que ele
   * pode virar sozinho na próxima onda, sem nada ter mudado de verdade.
   */
  noLimite: boolean;
  /** Distância até a linha que decidiu, em pontos de eNPS. Para o texto. */
  distanciaEnps: number;
  /** Distância até a linha de risco, em p.p. */
  distanciaRisco: number | null;
  /** Quanto uma resposta move o eNPS da área: 100/n. null sem n. */
  pesoDeUmaResposta: number | null;
  /** Só para ordenar dentro do grupo. Não é para exibir: não tem unidade. */
  peso: number;
}

export interface Classificacao {
  itens: AreaClassificada[];
  medianaEnps: number;
  medianaRisco: number;
}

export function classifyAreas(areas: AreaEntrada[]): Classificacao {
  // Só departamentos de verdade. A pesquisa traz uma linha "Betfair" ao lado
  // das áreas, mas Betfair é MARCA -- entra dentro de todas elas. Deixá-la aqui
  // colocaria uma marca disputando prioridade com Marketing, comparando
  // populações que se sobrepõem.
  const validas = areas.filter(
    (a): a is AreaEntrada & { enps: number } => a.dept != null && a.enps != null,
  );

  const enpsVals = validas.map((a) => a.enps);
  const riscoVals = validas.map((a) => a.retentionRisk).filter((r): r is number => r != null);

  const medianaEnps = median(enpsVals) ?? 0;
  const medianaRisco = median(riscoVals) ?? 0;

  const itens: AreaClassificada[] = validas.map((a) => {
    const risco = a.retentionRisk;
    const engBaixo = a.enps < medianaEnps;
    const riscoAlto = risco != null && risco > medianaRisco;

    const veredito: Veredito =
      engBaixo && riscoAlto ? "agir" : riscoAlto ? "vigiar" : engBaixo ? "ouvir" : "manter";

    // ------------------------------------------------------------------
    // O VEREDITO FOI DECIDIDO POR QUANTO?
    // ------------------------------------------------------------------
    // Uma resposta a mais ou a menos move o eNPS da área em 100/n pontos --
    // numa área de 41 pessoas, 2,4 pontos. Se a distância até a linha for
    // MENOR que isso, o rótulo não descreve a área: descreve quem por acaso
    // respondeu. Continua sendo o rótulo certo pela regra; só não é estável.
    //
    // No risco a régua é a mesma em p.p.: uma pessoa entra ou sai do grupo
    // "não ficaria" e mexe 100/n pontos percentuais.
    const distanciaEnps = Math.abs(a.enps - medianaEnps);
    const distanciaRisco = risco == null ? null : Math.abs(risco - medianaRisco);
    const n = a.respostas ?? null;
    const pesoDeUmaResposta = n && n > 0 ? Math.round((100 / n) * 10) / 10 : null;

    const noLimite =
      pesoDeUmaResposta != null &&
      (distanciaEnps < pesoDeUmaResposta ||
        (distanciaRisco != null && distanciaRisco < pesoDeUmaResposta));

    // Distância da mediana: quem está muito longe vem primeiro dentro do grupo.
    const gapEng = Math.max(0, medianaEnps - a.enps);
    const gapRisco = Math.max(0, (risco ?? 0) - medianaRisco);
    const tamanho = Math.log10((a.headcountMedio ?? 10) + 1);

    return {
      scope: a.scope,
      enps: a.enps,
      risco,
      headcount: a.headcountMedio,
      veredito,
      noLimite,
      distanciaEnps: Math.round(distanciaEnps * 10) / 10,
      distanciaRisco: distanciaRisco == null ? null : Math.round(distanciaRisco * 10) / 10,
      pesoDeUmaResposta,
      // Risco pesa o dobro: é o que vira saída. Engajamento baixo sem intenção
      // de sair aparece na entrega, e mais devagar.
      peso: (gapEng + gapRisco * 2) * tamanho,
    };
  });

  const ordem: Record<Veredito, number> = { agir: 0, vigiar: 1, ouvir: 2, manter: 3 };
  itens.sort(
    (a, b) =>
      ordem[a.veredito] - ordem[b.veredito] || b.peso - a.peso || a.scope.localeCompare(b.scope),
  );

  return { itens, medianaEnps, medianaRisco };
}
