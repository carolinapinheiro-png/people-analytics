import { median } from '@/lib/stats';

/**
 * Classificação das áreas em fila de prioridade.
 *
 * ------------------------------------------------------------------
 * POR QUE NÃO É UM CORTE NA MEDIANA
 * ------------------------------------------------------------------
 * A primeira versão dividia as áreas na mediana de engajamento e na de risco.
 * Simples e defensável -- e errado na prática, porque quem cai na fronteira
 * recebe um rótulo categórico que o dado não sustenta.
 *
 * Caso real de jan/2026: Technology ficou 2,5 pontos de eNPS abaixo da mediana
 * e 0,55 ponto percentual de risco acima. Isso bastava para a tela dizer
 * "AGIR PRIMEIRO" -- ao lado de Marketing, que estava 19,5 pontos abaixo em
 * engajamento e 10,85 acima em risco. As duas coisas recebiam o mesmo nome e
 * pediam a mesma reação, com uma ordem de grandeza de diferença entre elas.
 *
 * Rótulo forte em cima de diferença de ruído é pior que rótulo nenhum: manda
 * um gestor arrumar um problema que talvez não exista, e queima a credibilidade
 * do painel quando ele vai olhar e não acha nada.
 *
 * ------------------------------------------------------------------
 * A MARGEM SAI DOS PRÓPRIOS DADOS
 * ------------------------------------------------------------------
 * Uma área só é chamada de "abaixo" se estiver abaixo da mediana por mais que o
 * desvio absoluto mediano (MAD) do grupo -- ou seja, mais que o afastamento
 * típico daquele conjunto de áreas. Dentro disso, ela está onde as outras
 * estão.
 *
 * MAD e não desvio padrão porque a distribuição tem extremos reais (Legal com
 * eNPS 47 contra uma mediana de 81) e desvio padrão é puxado por eles: o
 * próprio outlier alargaria a margem e esconderia os problemas médios.
 *
 * A margem se ajusta sozinha. Se as áreas convergirem numa onda futura, ela
 * encolhe e diferenças menores voltam a contar.
 *
 * ------------------------------------------------------------------
 * "MANTER" É O PADRÃO, NÃO UM PRÊMIO
 * ------------------------------------------------------------------
 * Área que não dispara nenhum sinal cai em "manter". Não significa que está
 * ótima -- significa que nada nela se destaca do grupo o suficiente para pedir
 * ação. Exigir sinal positivo claro para entrar aqui criaria uma quinta
 * categoria de "meio termo" que ninguém saberia usar.
 */

export type Veredito = 'agir' | 'vigiar' | 'ouvir' | 'manter';

export interface AreaEntrada {
  scope: string;
  /** null = não é departamento (marca, total). Não entra na fila. */
  dept: string | null;
  enps: number | null;
  retentionRisk: number | null;
  headcountMedio: number | null;
}

export interface AreaClassificada {
  scope: string;
  enps: number;
  risco: number | null;
  headcount: number | null;
  veredito: Veredito;
  /** Só para ordenar dentro do grupo. Não é para exibir: não tem unidade. */
  peso: number;
}

export interface Classificacao {
  itens: AreaClassificada[];
  medianaEnps: number;
  medianaRisco: number;
  margemEnps: number;
  margemRisco: number;
}

/** Desvio absoluto mediano: o afastamento típico em relação à mediana. */
function mad(valores: number[], centro: number): number {
  const desvios = valores.map((v) => Math.abs(v - centro));
  return median(desvios) ?? 0;
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
  const margemEnps = mad(enpsVals, medianaEnps);
  const margemRisco = mad(riscoVals, medianaRisco);

  const itens: AreaClassificada[] = validas.map((a) => {
    const risco = a.retentionRisk;
    const engBaixo = a.enps < medianaEnps - margemEnps;
    const riscoAlto = risco != null && risco > medianaRisco + margemRisco;

    const veredito: Veredito =
      engBaixo && riscoAlto ? 'agir'
      : riscoAlto ? 'vigiar'
      : engBaixo ? 'ouvir'
      : 'manter';

    // Distância além da margem, não da mediana: uma área que mal ultrapassou o
    // limite não deve competir em posição com uma que o ultrapassou muito.
    const gapEng = Math.max(0, medianaEnps - margemEnps - a.enps);
    const gapRisco = Math.max(0, (risco ?? 0) - medianaRisco - margemRisco);
    const tamanho = Math.log10((a.headcountMedio ?? 10) + 1);

    return {
      scope: a.scope,
      enps: a.enps,
      risco,
      headcount: a.headcountMedio,
      veredito,
      // Risco pesa o dobro: é o que vira saída. Engajamento baixo sem intenção
      // de sair aparece na entrega, e mais devagar.
      peso: (gapEng + gapRisco * 2) * tamanho,
    };
  });

  const ordem: Record<Veredito, number> = { agir: 0, vigiar: 1, ouvir: 2, manter: 3 };
  itens.sort((a, b) => ordem[a.veredito] - ordem[b.veredito] || b.peso - a.peso || a.scope.localeCompare(b.scope));

  return { itens, medianaEnps, medianaRisco, margemEnps, margemRisco };
}
