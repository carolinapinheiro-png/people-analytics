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
  const rho = pares.length >= 4
    ? pearson(
        postos(pares.map((p) => p.riscoDeclarado)),
        postos(pares.map((p) => p.saidaObservada as number)),
      )
    : null;
  return {
    linhas: [...linhas].sort((a, b) => b.riscoDeclarado - a.riscoDeclarado),
    rho: rho == null ? null : arred(rho * 100) / 100,
    pares: pares.length,
    mesesObservados,
  };
}
