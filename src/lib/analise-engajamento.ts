/**
 * ===========================================================================
 * AS TRÊS PERGUNTAS QUE OS NÚMEROS DA ABA NÃO RESPONDIAM
 * ===========================================================================
 * A aba mostrava eNPS por área, por tempo de casa, por marca, e a lista de
 * perguntas. Tudo da onda atual. Três perguntas ficavam de fora, e as três são
 * das que mudam decisão:
 *
 *   1. ONDE a queda aconteceu -- e ela não é uniforme.
 *   2. Um problema é da empresa ou daquela área?
 *   3. O risco que a pesquisa declara prevê alguma coisa?
 *
 * As contas moram aqui, puras e testadas, e não dentro dos componentes. Cada
 * uma delas é o tipo de conta que alguém refaz na mão para conferir, e refazer
 * na mão dá resultado diferente se a regra estiver espalhada.
 */

// ===========================================================================
// 1. ONDE A QUEDA ACONTECEU
// ===========================================================================

export interface FaixaOnda {
  /** Faixa de tempo de casa: '0-3 meses', '24+ meses'... */
  faixa: string;
  n: number;
  enps: number | null;
}

export interface VariacaoFaixa {
  faixa: string;
  nAntes: number;
  nAgora: number;
  enpsAntes: number | null;
  enpsAgora: number | null;
  /** Em pontos de eNPS. `null` quando falta um dos lados. */
  variacao: number | null;
}

const arred = (v: number) => Math.round(v * 10) / 10;

/**
 * Variação de eNPS faixa a faixa, entre duas ondas.
 *
 * Faixa que só existe de um lado entra com `null` e não com zero: uma faixa
 * nova não "ficou igual", ela não tinha com o que ser comparada.
 */
export function variacaoPorFaixa(
  agora: readonly FaixaOnda[],
  antes: readonly FaixaOnda[],
  ordem?: readonly string[],
): VariacaoFaixa[] {
  const mAntes = new Map(antes.map((f) => [f.faixa, f]));
  const linhas = agora.map((a) => {
    const b = mAntes.get(a.faixa);
    return {
      faixa: a.faixa,
      nAntes: b?.n ?? 0,
      nAgora: a.n,
      enpsAntes: b?.enps ?? null,
      enpsAgora: a.enps,
      variacao: a.enps != null && b?.enps != null ? arred(a.enps - b.enps) : null,
    };
  });
  if (!ordem?.length) return linhas;
  const pos = new Map(ordem.map((f, i) => [f, i]));
  return linhas.sort((x, y) => (pos.get(x.faixa) ?? 99) - (pos.get(y.faixa) ?? 99));
}

export type Trajetoria = 'queda' | 'subida' | 'oscila' | 'indefinida';

export interface FaixaTrajetoria {
  faixa: string;
  /** Uma entrada por onda, na ordem cronológica. `null` onde a faixa faltou. */
  valores: Array<number | null>;
  /** Do primeiro ao último ponto com valor. */
  variacaoTotal: number | null;
  trajetoria: Trajetoria;
}

/**
 * A faixa caiu de forma contínua, subiu, ou apenas oscilou?
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO VALE MAIS QUE A VARIAÇÃO ENTRE DUAS PONTAS
 * ------------------------------------------------------------------
 * Com duas ondas, uma queda de 20 pontos e uma oscilação que por acaso terminou
 * 20 abaixo são o MESMO número. São coisas diferentes: a primeira é um processo
 * em curso, a segunda é ruído com uma ponta infeliz.
 *
 * Com três ondas dá para separar, e a separação muda a conversa. Em 19/08/2026
 * ela mostrou que as três faixas acima de um ano de casa caem sem interrupção
 * desde jul/25, enquanto as quatro faixas iniciais sobem e descem sem
 * tendência. Uma queda contínua em três medições seguidas é um processo; quatro
 * faixas oscilando é a variação normal de amostras pequenas.
 *
 * Exige pelo menos três pontos com valor -- com dois, toda faixa seria
 * "contínua" por definição, e o rótulo não informaria nada.
 */
export function trajetoriaPorFaixa(
  ondas: ReadonlyArray<{ faixas: readonly FaixaOnda[] }>,
  ordem?: readonly string[],
): FaixaTrajetoria[] {
  const nomes: string[] = [];
  for (const o of ondas) {
    for (const f of o.faixas) if (!nomes.includes(f.faixa)) nomes.push(f.faixa);
  }

  const linhas = nomes.map((faixa) => {
    const valores = ondas.map((o) => o.faixas.find((f) => f.faixa === faixa)?.enps ?? null);
    const comValor = valores.filter((v): v is number => v != null);

    let trajetoria: Trajetoria = 'indefinida';
    if (comValor.length >= 3) {
      let desce = true, sobe = true;
      for (let i = 1; i < comValor.length; i++) {
        if (comValor[i] > comValor[i - 1]) desce = false;
        if (comValor[i] < comValor[i - 1]) sobe = false;
      }
      // Empate em todas as pontas cai em 'oscila': uma faixa parada não é
      // queda contínua, e chamá-la assim seria alarme sobre nada.
      trajetoria = desce && !sobe ? 'queda' : sobe && !desce ? 'subida' : 'oscila';
    }

    return {
      faixa,
      valores,
      variacaoTotal: comValor.length >= 2
        ? arred(comValor[comValor.length - 1] - comValor[0])
        : null,
      trajetoria,
    };
  });

  if (!ordem?.length) return linhas;
  const pos = new Map(ordem.map((f, i) => [f, i]));
  return linhas.sort((x, y) => (pos.get(x.faixa) ?? 99) - (pos.get(y.faixa) ?? 99));
}

export interface EfeitoComposicao {
  /** eNPS da onda atual, como média ponderada das faixas. */
  atual: number | null;
  /** eNPS da onda anterior, idem. Serve de conferência contra o publicado. */
  anterior: number | null;
  /** Notas de agora aplicadas sobre a distribuição de antes. */
  contrafactual: number | null;
  /** Quanto da variação é mudança de composição, e não de opinião. */
  efeitoMix: number | null;
  /** A variação total, para a frase não precisar refazer a subtração. */
  variacaoTotal: number | null;
}

/**
 * A empresa caiu porque as pessoas mudaram de opinião, ou porque mudou quem
 * são as pessoas?
 *
 * ------------------------------------------------------------------
 * POR QUE ESTA CONTA PRECISA EXISTIR NA TELA
 * ------------------------------------------------------------------
 * É a primeira objeção que aparece numa sala quando o eNPS cai: "mas a empresa
 * dobrou de tamanho". É uma objeção legítima -- e verificável. Sem a conta,
 * ela encerra a conversa por autoridade; com a conta, ou explica a queda ou
 * sai do caminho.
 *
 * Eu mesmo já errei essa leitura neste projeto: afirmei que parte de uma queda
 * era composição, e ao refazer descobri que o efeito ia na direção contrária.
 * Foi o que ensinou que essa conta não pode ficar na cabeça de ninguém.
 *
 * ------------------------------------------------------------------
 * COMO SE LÊ
 * ------------------------------------------------------------------
 * `contrafactual` é "quanto seria o eNPS de hoje se a distribuição de tempo de
 * casa fosse a de antes". Se ele for parecido com o atual, a composição não
 * explica nada e a queda é de opinião. Se for parecido com o anterior, a queda
 * é só mistura diferente das mesmas pessoas.
 *
 * Só faixas presentes nos DOIS lados entram, e os pesos são renormalizados
 * sobre elas -- senão o contrafactual compararia universos diferentes.
 */
export function efeitoComposicao(
  agora: readonly FaixaOnda[],
  antes: readonly FaixaOnda[],
): EfeitoComposicao {
  const util = (f: FaixaOnda) => f.enps != null && f.n > 0;
  const mAntes = new Map(antes.filter(util).map((f) => [f.faixa, f]));
  const pares = agora.filter(util).filter((f) => mAntes.has(f.faixa));

  if (!pares.length) {
    return { atual: null, anterior: null, contrafactual: null, efeitoMix: null, variacaoTotal: null };
  }

  const nAgora = pares.reduce((s, f) => s + f.n, 0);
  const nAntes = pares.reduce((s, f) => s + (mAntes.get(f.faixa)?.n ?? 0), 0);
  if (!nAgora || !nAntes) {
    return { atual: null, anterior: null, contrafactual: null, efeitoMix: null, variacaoTotal: null };
  }

  const atual = pares.reduce((s, f) => s + (f.enps as number) * (f.n / nAgora), 0);
  const anterior = pares.reduce((s, f) => {
    const b = mAntes.get(f.faixa) as FaixaOnda;
    return s + (b.enps as number) * (b.n / nAntes);
  }, 0);
  // As notas de HOJE sobre os pesos de ANTES.
  const contrafactual = pares.reduce((s, f) => {
    const b = mAntes.get(f.faixa) as FaixaOnda;
    return s + (f.enps as number) * (b.n / nAntes);
  }, 0);

  return {
    atual: arred(atual),
    anterior: arred(anterior),
    contrafactual: arred(contrafactual),
    efeitoMix: arred(contrafactual - atual),
    variacaoTotal: arred(atual - anterior),
  };
}

// ===========================================================================
// 2. PROBLEMA DA EMPRESA OU DE ALGUÉM?
// ===========================================================================

export interface NotaPorArea {
  driver: string;
  question: string;
  area: string;
  favoravel: number | null;
  n: number;
}

export interface Dispersao {
  driver: string;
  question: string;
  /** % favorável da empresa, a régua. */
  empresa: number | null;
  /** Diferença entre a melhor e a pior área, em pontos. */
  amplitude: number;
  melhor: { area: string; favoravel: number };
  pior: { area: string; favoravel: number };
  areas: number;
}

/**
 * Quanto cada pergunta varia ENTRE as áreas.
 *
 * ------------------------------------------------------------------
 * A DISTINÇÃO QUE ISTO PRODUZ
 * ------------------------------------------------------------------
 * Duas perguntas com a mesma nota baixa na empresa pedem ações opostas:
 *
 *   Amplitude pequena -> todo mundo responde igual. É política, processo,
 *   estrutura. Não adianta chamar o líder da área com a pior nota: ele não
 *   tem alavanca, e a nota dele é a nota de todos.
 *
 *   Amplitude grande -> a mesma empresa produz experiências diferentes
 *   dependendo de onde a pessoa está. Aí existe algo local a fazer, e existe
 *   de quem aprender: alguém já resolveu.
 *
 * O painel mostrava a nota da empresa e a nota por área, e nunca a diferença
 * entre elas -- que é justamente onde essa distinção mora.
 */
export function dispersaoEntreAreas(
  notas: readonly NotaPorArea[],
  empresaPorPergunta: ReadonlyMap<string, number | null>,
  minAreas = 3,
): Dispersao[] {
  const chave = (d: { driver: string; question: string }) => `${d.driver}||${d.question}`;
  const grupos = new Map<string, NotaPorArea[]>();
  for (const nota of notas) {
    if (nota.favoravel == null) continue;
    const k = chave(nota);
    grupos.set(k, [...(grupos.get(k) ?? []), nota]);
  }

  const out: Dispersao[] = [];
  for (const [k, lista] of grupos) {
    // Com uma ou duas áreas, "amplitude" é ruído com nome de métrica.
    if (lista.length < minAreas) continue;
    const ord = [...lista].sort((a, b) => (a.favoravel as number) - (b.favoravel as number));
    const pior = ord[0], melhor = ord[ord.length - 1];
    out.push({
      driver: lista[0].driver,
      question: lista[0].question,
      empresa: empresaPorPergunta.get(k) ?? null,
      amplitude: arred((melhor.favoravel as number) - (pior.favoravel as number)),
      melhor: { area: melhor.area, favoravel: melhor.favoravel as number },
      pior: { area: pior.area, favoravel: pior.favoravel as number },
      areas: lista.length,
    });
  }
  return out.sort((a, b) => b.amplitude - a.amplitude);
}

// ===========================================================================
// 3. O RISCO DECLARADO PREVIU AS SAÍDAS?
// ===========================================================================

export interface RiscoObservado {
  area: string;
  /** % que disse que não ficaria diante de oferta igual, na onda. */
  riscoDeclarado: number;
  /** Respostas daquela área na onda -- o peso da declaração. */
  respostas: number;
  /** Quem pediu demissão na janela seguinte à onda. */
  pediramDemissao: number;
  /** Headcount médio da área na mesma janela. */
  headcount: number | null;
  /** Saída voluntária observada, em % do headcount. */
  saidaObservada: number | null;
}

export interface AderenciaRisco {
  linhas: RiscoObservado[];
  /** Spearman entre risco declarado e saída observada. `null` com menos de 4 áreas. */
  rho: number | null;
  /** Áreas com os dois números. É o n da correlação, e ele é pequeno. */
  pares: number;
  mesesObservados: number;
  /**
   * O rho recalculado tirando UMA área de cada vez.
   *
   * ------------------------------------------------------------------
   * POR QUE ISTO É MAIS IMPORTANTE QUE O PRÓPRIO RHO
   * ------------------------------------------------------------------
   * Com oito áreas e a maioria delas registrando zero ou uma saída no período,
   * uma pessoa que pede demissão numa área de dezesseis move o índice inteiro.
   * O rho publicado pode ser um artefato de quem estava naquela linha.
   *
   * O teste é barato: refaz a conta oito vezes, cada uma sem uma área. Se o
   * resultado ficar mais ou menos no lugar, ele descreve alguma coisa. Se
   * balançar de ponta a ponta, ele descreve o acaso -- e a resposta honesta
   * passa a ser "não dá para dizer", que NÃO é a mesma coisa que "não prevê".
   *
   * No dado de 19/08/2026 ele balança: 0,02 com as oito, -0,32 sem Marketing,
   * +0,29 sem Product ou sem Legal. Foi um comentário do Caio no guia --
   * "Legal é a menor área e uma saída ali representa muito" -- que fez esta
   * verificação existir. Ele estava certo, e por uma razão ainda maior do que
   * a que apontou.
   */
  jackknife: { min: number; max: number; amplitude: number } | null;
  /** Áreas com menos de duas saídas observadas. São as que mais desestabilizam. */
  areasComPoucaSaida: number;
}

/**
 * O resultado se sustenta, ou depende de quem está na amostra?
 *
 * `amplitude` acima de 0,4 numa escala que vai de -1 a 1 significa que trocar
 * uma linha muda a conclusão. Aí o número não é leitura, é ruído com casas
 * decimais.
 */
export function instavel(j: AderenciaRisco['jackknife']): boolean {
  return j != null && j.amplitude > 0.4;
}

/** Posto médio, para empate não distorcer o Spearman. */
function postos(v: number[]): number[] {
  const idx = v.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const r = new Array<number>(v.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].x === idx[i].x) j++;
    const medio = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k].i] = medio;
    i = j + 1;
  }
  return r;
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : null;
}

/**
 * O painel avaliando a si mesmo.
 *
 * ------------------------------------------------------------------
 * POR QUE ESTA É A PERGUNTA MAIS IMPORTANTE DA ABA
 * ------------------------------------------------------------------
 * A coluna "risco de saída" ocupa espaço em toda visão de engajamento e
 * carrega uma promessa implícita: que ela antecipa quem vai embora. Ninguém
 * nunca conferiu.
 *
 * Se antecipar, a coluna ganha o espaço e vira insumo de retenção. Se não
 * antecipar, ela continua sendo uma coisa legítima -- intenção declarada é um
 * fato sobre como as pessoas se sentem -- mas precisa ser chamada por outro
 * nome, e ninguém deveria planejar backup de posição com base nela.
 *
 * As duas respostas são úteis. A que não serve é não perguntar.
 *
 * ------------------------------------------------------------------
 * SPEARMAN, E NÃO PEARSON
 * ------------------------------------------------------------------
 * O que interessa é a ORDEM: as áreas que declararam mais risco são as que
 * mais perderam gente? A relação não precisa ser linear para ser útil, e com
 * oito ou nove pontos uma área extrema puxaria o Pearson sozinha.
 *
 * E o n é pequeno -- oito ou nove áreas. `rho` aqui é indício, não prova, e a
 * tela precisa dizer isso junto do número.
 */
export function aderenciaDoRisco(
  linhas: readonly RiscoObservado[],
  mesesObservados: number,
): AderenciaRisco {
  const pares = linhas.filter((l) => l.saidaObservada != null);

  const calcular = (rows: RiscoObservado[]): number | null =>
    rows.length >= 4
      ? pearson(
          postos(rows.map((p) => p.riscoDeclarado)),
          postos(rows.map((p) => p.saidaObservada as number)),
        )
      : null;

  const rho = calcular(pares);

  // O rho refeito sem cada uma das áreas. Precisa sobrar pelo menos quatro
  // pontos depois de tirar uma -- ou seja, cinco áreas para o teste existir.
  const semCada = pares.length >= 5
    ? pares
        .map((_, i) => calcular(pares.filter((__, k) => k !== i)))
        .filter((v): v is number => v != null)
    : [];

  const jackknife = semCada.length
    ? {
        min: arred(Math.min(...semCada) * 100) / 100,
        max: arred(Math.max(...semCada) * 100) / 100,
        amplitude: arred((Math.max(...semCada) - Math.min(...semCada)) * 100) / 100,
      }
    : null;

  return {
    linhas: [...linhas].sort((a, b) => b.riscoDeclarado - a.riscoDeclarado),
    rho: rho == null ? null : arred(rho * 100) / 100,
    pares: pares.length,
    mesesObservados,
    jackknife,
    areasComPoucaSaida: pares.filter((p) => p.pediramDemissao < 2).length,
  };
}
