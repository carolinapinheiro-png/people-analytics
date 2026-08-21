import type { DriverPorRecorte } from '@/lib/survey.functions';
import { ehResidual } from '@/lib/engagement-context';

/**
 * ===========================================================================
 * O MESMO DADO, LIDO NOS DOIS EIXOS
 * ===========================================================================
 * `survey_driver_scores` é uma matriz: pergunta × recorte. A reunião faz duas
 * perguntas sobre ela, e são a mesma matriz lida em direções diferentes:
 *
 *   "Como está Marketing?"          -> uma área, todas as perguntas
 *   "Quem tem problema com salário?" -> uma pergunta, todas as áreas
 *
 * As duas leituras moram aqui, juntas, porque partem do mesmo lugar e usam a
 * mesma régua (a linha da empresa). Separadas, divergiriam no primeiro ajuste
 * -- alguém mudaria o critério de "abaixo" em um lado e não no outro, e as
 * duas telas passariam a discordar sobre a mesma área.
 *
 * ---------------------------------------------------------------------------
 * A RÉGUA É A EMPRESA, E A DIFERENÇA É EM PONTOS DE % FAVORÁVEL
 * ---------------------------------------------------------------------------
 * `favoravel` (% que respondeu 4 ou 5) é a leitura que o deck da diretoria já
 * usa, e é a que as pessoas discutem. `score` (média 1-5) fica disponível como
 * detalhe: a diferença entre 4,04 e 3,88 não significa nada para quem lê, mas
 * "74% contra 62%" significa.
 */

export interface LinhaDrill {
  driver: string;
  question: string;
  /** % favorável do recorte. `null` quando suprimido por n baixo. */
  favoravel: number | null;
  /** % favorável da empresa na mesma pergunta. */
  favoravelEmpresa: number | null;
  /** Diferença em pontos percentuais. `null` se faltar qualquer um dos dois. */
  gap: number | null;
  n: number;
  score: number | null;
}

const chave = (d: { driver: string; question: string }) => `${d.driver}||${d.question}`;

const dif = (a: number | null, b: number | null): number | null =>
  a == null || b == null ? null : Math.round((a - b) * 10) / 10;

/** A linha da empresa, indexada por pergunta. É a régua das duas leituras. */
function reguaEmpresa(linhas: readonly DriverPorRecorte[]): Map<string, DriverPorRecorte> {
  const m = new Map<string, DriverPorRecorte>();
  for (const l of linhas) if (l.cutType === 'company') m.set(chave(l), l);
  return m;
}

/**
 * Uma área, todas as perguntas -- da mais abaixo da empresa para a mais acima.
 *
 * A ordem é por distância da régua, e não pela nota absoluta, porque a
 * pergunta que a área responde pior costuma ser a que a empresa inteira
 * responde pior: ordenar por nota traria o mesmo topo para todas as nove
 * áreas, e a tela não diria nada sobre AQUELA área.
 */
export function perfilDaArea(
  linhas: readonly DriverPorRecorte[],
  area: string,
): LinhaDrill[] {
  const regua = reguaEmpresa(linhas);
  const alvo = (area ?? '').trim().toLowerCase();

  return linhas
    .filter((l) => l.cutType === 'area' && l.cutValue.trim().toLowerCase() === alvo)
    .map((l) => {
      const emp = regua.get(chave(l));
      return {
        driver: l.driver,
        question: l.question,
        favoravel: l.favoravel,
        favoravelEmpresa: emp?.favoravel ?? null,
        gap: dif(l.favoravel, emp?.favoravel ?? null),
        n: l.n,
        score: l.score,
      };
    })
    // Sem gap vai para o fim: não é "igual à empresa", é "não dá para dizer".
    .sort((a, b) =>
      a.gap == null ? 1 : b.gap == null ? -1 : a.gap - b.gap);
}

export interface AreaNaPergunta {
  area: string;
  favoravel: number | null;
  gap: number | null;
  n: number;
}

/**
 * Uma pergunta, todas as áreas -- da mais abaixo da empresa para a mais acima.
 *
 * Inverte o eixo da conversa. "Remuneração tem as piores notas da empresa" é
 * um fato sobre a empresa e não leva a lugar nenhum; "remuneração está 17
 * pontos abaixo em Marketing e no nível da empresa em Technology" indica onde
 * a conversa acontece.
 */
export function areasNaPergunta(
  linhas: readonly DriverPorRecorte[],
  driver: string,
  question: string,
): AreaNaPergunta[] {
  const k = chave({ driver, question });
  const empresa = reguaEmpresa(linhas).get(k)?.favoravel ?? null;

  return linhas
    // "Outros" tem cutType 'area' na carga, mas não é uma área: é o balde de
    // quem não pertence a nenhuma das nomeadas. Ele não tem líder a quem
    // perguntar nem de quem aprender, então liderar um ranking de "quais áreas
    // puxam esta pergunta" não diz nada acionável -- e ele liderava, porque um
    // grupo de 20 pessoas oscila muito mais que um de 149. As pessoas
    // continuam contadas na régua da empresa; o que sai é a comparação.
    .filter((l) => l.cutType === 'area' && !ehResidual(l.cutValue) && chave(l) === k)
    .map((l) => ({
      area: l.cutValue,
      favoravel: l.favoravel,
      gap: dif(l.favoravel, empresa),
      n: l.n,
    }))
    .sort((a, b) => (a.gap == null ? 1 : b.gap == null ? -1 : a.gap - b.gap));
}

// ===========================================================================
// A TERCEIRA LEITURA: A MATRIZ INTEIRA DE UMA VEZ
// ===========================================================================
// As duas de cima respondem uma pergunta por vez -- uma área, ou uma pergunta.
// Cada resposta exige saber ANTES o que perguntar, e é aí que a leitura por
// área falha: para descobrir que Marketing está abaixo em tudo, era preciso
// abrir Marketing; para descobrir que Legal é o oposto (muito abaixo em
// remuneração, muito acima em carga), era preciso abrir Legal. Nove cliques
// para ver um padrão que existe entre as áreas, não dentro delas.
//
// Agregar por DRIVER e não por pergunta é o que torna a grade legível: 34
// perguntas × 9 áreas são 306 células, e ninguém lê 306 números. 11 drivers ×
// 9 áreas são 99, que cabem numa tela.
//
// O preço da agregação está registrado em `DriversDeepDive`: a média de um
// driver esconde a pergunta ruim dentro dele. Por isso a célula guarda quantas
// perguntas a sustentam e qual é a pior -- a grade aponta onde olhar, e o
// detalhe da célula diz o que exatamente está pesando ali.

export interface CelulaAreaDriver {
  area: string;
  driver: string;
  /** % favorável médio das perguntas do driver nesta área. */
  favoravel: number | null;
  /** O mesmo driver na empresa inteira. */
  favoravelEmpresa: number | null;
  /** Pontos percentuais de diferença para a empresa. */
  gap: number | null;
  /** Quantas perguntas entraram na média. */
  perguntas: number;
  /** Menor n entre as perguntas — a célula é tão frágil quanto ele. */
  nMinimo: number;
  /** A pergunta mais abaixo da empresa dentro da célula. */
  pior: { question: string; favoravel: number | null; gap: number | null } | null;
}

export interface MatrizAreaDriver {
  /** Drivers ordenados pela amplitude entre áreas — os que mais separam vêm antes. */
  drivers: string[];
  areas: string[];
  celulas: CelulaAreaDriver[];
  /** Acesso direto: `mapa.get('MARKETING||Gestão')`. */
  mapa: Map<string, CelulaAreaDriver>;
}

const media = (v: number[]): number | null =>
  v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;

/**
 * A matriz área × driver, com a empresa como régua em cada célula.
 *
 * "Outros" fica de fora pela mesma razão de `areasNaPergunta`: é o balde de
 * quem não pertence a área nomeada nenhuma, não tem líder a quem levar a
 * conversa, e sendo pequeno oscila o bastante para liderar qualquer ranking.
 */
export function matrizAreaDriver(
  linhas: readonly DriverPorRecorte[],
  nMinimo = 5,
): MatrizAreaDriver {
  const regua = reguaEmpresa(linhas);

  // Empresa: um % por driver, média das perguntas dele.
  const porDriverEmpresa = new Map<string, number[]>();
  for (const l of regua.values()) {
    if (l.favoravel == null) continue;
    if (!porDriverEmpresa.has(l.driver)) porDriverEmpresa.set(l.driver, []);
    porDriverEmpresa.get(l.driver)!.push(l.favoravel);
  }
  const empresaPorDriver = new Map<string, number | null>(
    [...porDriverEmpresa].map(([d, v]) => [d, media(v)]),
  );

  // Área × driver.
  const balde = new Map<string, DriverPorRecorte[]>();
  for (const l of linhas) {
    if (l.cutType !== 'area' || ehResidual(l.cutValue)) continue;
    const k = `${l.cutValue}||${l.driver}`;
    if (!balde.has(k)) balde.set(k, []);
    balde.get(k)!.push(l);
  }

  const celulas: CelulaAreaDriver[] = [];
  for (const [k, ls] of balde) {
    const [area, driver] = k.split('||');
    // Suprime a célula inteira quando qualquer pergunta dela vem de um grupo
    // pequeno demais. Média de um n=3 com um n=40 tem cara de número sólido e
    // não é -- e aqui a média some no meio da grade, sem o `n` do lado.
    const nMin = Math.min(...ls.map((l) => l.n));
    const validas = ls.filter((l) => l.favoravel != null);
    const fav = nMin < nMinimo ? null : media(validas.map((l) => l.favoravel!));
    const emp = empresaPorDriver.get(driver) ?? null;

    const comGap = validas
      .map((l) => ({
        question: l.question,
        favoravel: l.favoravel,
        gap: dif(l.favoravel, regua.get(chave(l))?.favoravel ?? null),
      }))
      .filter((x) => x.gap != null)
      .sort((a, b) => a.gap! - b.gap!);

    celulas.push({
      area, driver,
      favoravel: fav,
      favoravelEmpresa: emp,
      gap: dif(fav, emp),
      perguntas: validas.length,
      nMinimo: Number.isFinite(nMin) ? nMin : 0,
      pior: fav == null ? null : (comGap[0] ?? null),
    });
  }

  const areas = [...new Set(celulas.map((c) => c.area))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  // ------------------------------------------------------------------
  // A ORDEM DAS LINHAS É A AMPLITUDE, NÃO A NOTA
  // ------------------------------------------------------------------
  // Ordenar por nota põe remuneração no topo em toda leitura do painel -- e a
  // grade existe justamente para mostrar o que a leitura por nota não mostra.
  // Um driver com nota boa na empresa e 25 pontos de distância entre a melhor e
  // a pior área é uma conversa; um driver com nota baixa e igual em todo lugar
  // é uma decisão de empresa, não de área. A amplitude separa os dois casos, e
  // é a mesma escolha já feita em `DriversDeepDive`.
  const amplitude = new Map<string, number>();
  for (const d of new Set(celulas.map((c) => c.driver))) {
    const vs = celulas.filter((c) => c.driver === d && c.favoravel != null).map((c) => c.favoravel!);
    amplitude.set(d, vs.length >= 2 ? Math.max(...vs) - Math.min(...vs) : -1);
  }
  const drivers = [...amplitude.keys()].sort(
    (a, b) => (amplitude.get(b) ?? 0) - (amplitude.get(a) ?? 0) || a.localeCompare(b, 'pt-BR'),
  );

  return {
    drivers, areas, celulas,
    mapa: new Map(celulas.map((c) => [`${c.area}||${c.driver}`, c])),
  };
}

/**
 * As áreas cujo perfil é uniforme — abaixo (ou acima) da empresa em quase tudo.
 *
 * Distingue os dois casos que a grade revela e a leitura por área não: quem
 * está abaixo em TUDO tem provavelmente um problema de gestão ou de momento do
 * time, e não 11 problemas temáticos independentes. Quem está abaixo em dois
 * drivers e acima em outros dois tem uma conversa específica.
 */
export function perfilUniforme(
  m: MatrizAreaDriver,
  limiar = 0.8,
): Array<{ area: string; direcao: 'abaixo' | 'acima'; proporcao: number; drivers: number }> {
  const out: Array<{ area: string; direcao: 'abaixo' | 'acima'; proporcao: number; drivers: number }> = [];
  for (const area of m.areas) {
    const cs = m.celulas.filter((c) => c.area === area && c.gap != null);
    if (cs.length < 5) continue;
    const abaixo = cs.filter((c) => c.gap! < 0).length;
    const p = abaixo / cs.length;
    if (p >= limiar) out.push({ area, direcao: 'abaixo', proporcao: p, drivers: cs.length });
    else if (1 - p >= limiar) out.push({ area, direcao: 'acima', proporcao: 1 - p, drivers: cs.length });
  }
  return out.sort((a, b) => b.proporcao - a.proporcao);
}

/**
 * A onda mediu por área?
 *
 * jan/26 foi carregada só no nível da empresa. Sem esta pergunta, clicar numa
 * área naquela onda abriria um painel vazio -- e vazio se lê como "esta área
 * não tem problema", que é o oposto do que significa. É a mesma distinção já
 * feita em Salários (camada não importada) e na linha do tempo (onda sem
 * dado); a terceira vez que ela aparece, e a razão de virar função com nome.
 */
export function temQuebraPorArea(linhas: readonly DriverPorRecorte[]): boolean {
  return linhas.some((l) => l.cutType === 'area');
}
