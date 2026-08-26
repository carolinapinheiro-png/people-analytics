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
/**
 * O perfil de UM recorte qualquer contra a régua da empresa.
 *
 * ------------------------------------------------------------------
 * ERA SÓ PARA ÁREA, E A PERGUNTA NÃO É SÓ SOBRE ÁREA
 * ------------------------------------------------------------------
 * "Em que esta gente está mais longe da empresa?" vale para uma área, para
 * quem tem 24+ meses de casa e para quem trabalha remoto -- é a mesma conta
 * sobre outra chave. O `cutType` fixo em 'area' era o que impedia.
 *
 * `perfilDaArea` continua existindo como o caso comum, chamando este.
 */
export function perfilDoRecorte(
  linhas: readonly DriverPorRecorte[],
  cutType: string,
  valor: string,
): LinhaDrill[] {
  const regua = reguaEmpresa(linhas);
  const alvo = (valor ?? '').trim().toLowerCase();

  return linhas
    .filter((l) => l.cutType === cutType && l.cutValue.trim().toLowerCase() === alvo)
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

export function perfilDaArea(
  linhas: readonly DriverPorRecorte[],
  area: string,
): LinhaDrill[] {
  return perfilDoRecorte(linhas, 'area', area);
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

// ===========================================================================
// A NOTA DA ÁREA, NA PERGUNTA — PARA CRUZAR COM A ASSOCIAÇÃO DA EMPRESA
// ===========================================================================
// O gráfico de quadrantes cruza dois eixos com origens diferentes, e essa
// assimetria estava sendo escondida em vez de explicada:
//
//   eixo X   associação com o eNPS   SÓ existe na empresa (uma linha por
//                                    pergunta, sem recorte no banco)
//   eixo Y   % que concorda          existe POR ÁREA (survey_driver_scores,
//                                    306 linhas em ago/26 = 9 × 34)
//
// Com o filtro ligado, o cartão exibia um aviso dizendo que "os números abaixo
// são da empresa inteira". Metade era verdade. O eixo Y podia seguir o filtro e
// não seguia -- o aviso informava que o dado não existe quando o certo era que
// o cartão não o usava.
//
// Cruzar os dois é a leitura mais útil que a aba consegue produzir para um
// gestor: "entre as perguntas que movem engajamento NA EMPRESA, quais a MINHA
// área responde pior". A alavanca vem da empresa (é a única medida disponível);
// o alvo vem da área.
//
// O que isso NÃO autoriza dizer: que a alavanca é a mesma dentro da área. Pode
// ser que em Marketing remuneração puxe mais que comunicação -- ninguém mediu.
// A tela precisa dizer isso, e diz.

/** As linhas da área, indexadas por driver||pergunta. Só as que têm nota. */
export function linhasDaArea(
  linhas: readonly DriverPorRecorte[],
  area: string,
): Map<string, DriverPorRecorte> {
  const alvo = (area ?? '').trim().toLowerCase();
  const m = new Map<string, DriverPorRecorte>();
  for (const l of linhas) {
    if (l.cutType !== 'area') continue;
    if (l.cutValue.trim().toLowerCase() !== alvo) continue;
    // `favoravel` vem null quando a supressão por n baixo apagou a nota. A
    // pergunta simplesmente não entra -- plotar a da empresa no lugar seria
    // devolver o número que a supressão negou, com o rótulo da área.
    if (l.favoravel == null) continue;
    m.set(chave(l), l);
  }
  return m;
}

/**
 * Troca o % da empresa pelo da área, em cada pergunta.
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO É UMA FUNÇÃO E NÃO DUAS CÓPIAS
 * ------------------------------------------------------------------
 * Dois cartões mostram as mesmas perguntas classificadas nos mesmos quadrantes:
 * o gráfico de dispersão e a lista "Por onde começar". Quando só o gráfico
 * passou a usar a nota da área, os dois voltaram a discordar sob filtro -- a
 * mesma pergunta podia sair "Prioridade" num e não no outro.
 *
 * Já havia acontecido: era exatamente o problema que `pergunta-priority.ts`
 * resolveu, e reapareceu porque a correção foi aplicada num cartão só. É a
 * terceira vez que a mesma forma de erro aparece nesta aba (a régua das áreas,
 * a das perguntas, e agora o escopo delas), então a regra mora aqui e os dois
 * cartões a consomem.
 *
 * TUDO que descreve a resposta vem junto: `favoravel`, `n` e `score`. Trocar
 * uns e não outros é pior que não trocar nenhum, porque a linha passa a
 * misturar populações sem nada avisando. Aconteceu duas vezes seguidas aqui:
 * primeiro o subtítulo publicava "485 respostas" ao lado da nota de 81
 * pessoas; depois, corrigido o `n`, a linha ficou mostrando "53%" (Marketing)
 * encostado em "4,06" (a média da empresa) -- dois números vizinhos, duas
 * populações, nenhum rótulo.
 *
 * ---------------------------------------------------------------------------
 * O `r` TAMBÉM PASSOU A TER VERSÃO POR ÁREA
 * ---------------------------------------------------------------------------
 * Esta função dizia, aqui mesmo, que a associação com o eNPS "não tem versão
 * por área e não terá". Era falso -- e foi a quarta vez que o mesmo erro
 * apareceu neste painel: uma dimensão que nunca tinha sido agregada anunciada
 * como impossível.
 *
 * A correlação exige eNPS e nota da pergunta na MESMA pessoa, e o export traz
 * as duas na mesma linha, junto com a área. Bastava agrupar antes de
 * correlacionar (ver `computeDriverImportance`).
 *
 * O limite verdadeiro é o TAMANHO: abaixo de 30 respostas o `r` oscila tanto
 * entre amostras que a ordem das perguntas -- que é o produto do cálculo --
 * vira sorteio. Em ago/26 cinco áreas passam desse corte e quatro não. As que
 * não passam caem na associação da empresa, e `assocDaEmpresa` diz isso para a
 * tela poder explicar com o número na mão.
 */
export function perguntasNoRecorte<
  T extends {
    driver: string;
    question: string;
    favoravel: number | null;
    n: number;
    score: number;
    r: number;
    cutType?: string;
    cutValue?: string;
  },
>(
  perguntas: readonly T[],
  porRecorte: readonly DriverPorRecorte[],
  area: string | null | undefined,
): { linhas: T[]; suprimidas: number; assocDaEmpresa: boolean } {
  const daEmpresa = perguntas.filter((p) => (p.cutType ?? 'company') === 'company');
  if (!area) {
    return { linhas: [...daEmpresa], suprimidas: 0, assocDaEmpresa: true };
  }

  // A associação DA ÁREA, quando ela passou do mínimo de respostas.
  const alvo = (area ?? '').trim().toLowerCase();
  const assocArea = new Map<string, T>();
  for (const p of perguntas) {
    if ((p.cutType ?? 'company') !== 'area') continue;
    if ((p.cutValue ?? '').trim().toLowerCase() !== alvo) continue;
    assocArea.set(chave(p), p);
  }
  const assocDaEmpresa = assocArea.size === 0;

  // A NOTA da área -- essa existe para qualquer área, e vem de outra tabela.
  const notas = linhasDaArea(porRecorte, area);

  const base = assocDaEmpresa ? daEmpresa : [...assocArea.values()];
  const linhas = base.flatMap((p) => {
    const l = notas.get(chave(p));
    // Sem nota da área a pergunta SAI. Cair na da empresa misturaria as duas
    // populações na mesma lista, sem nada distinguindo as linhas.
    if (l == null) return [];
    // `score` da área pode vir null mesmo com `favoravel` preenchido; nesse
    // caso o da empresa fica, porque some da tela é pior que um detalhe
    // aproximado -- e ele é detalhe: a leitura principal é o %.
    return [{ ...p, favoravel: l.favoravel, n: l.n, score: l.score ?? p.score }];
  });
  return { linhas, suprimidas: base.length - linhas.length, assocDaEmpresa };
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

// ======================================================================
// A AFIRMAÇÃO QUE ESTAVA NA TELA SEM NÚMERO
// ======================================================================
// O painel de área diz, embaixo da lista, que ordena por DISTÂNCIA e não por
// nota "porque a pergunta que esta área responde pior costuma ser a que a
// empresa inteira responde pior". A Marilia leu isso, olhou a lista acima, viu
// perguntas bem diferentes entre as áreas e desconfiou.
//
// Ela tinha razão sobre o que via, e a frase também estava certa -- as duas
// falam de coisas diferentes. A LISTA mostra as maiores distâncias, que variam
// muito (em ago/26, sete perguntas distintas no topo de nove áreas). A FRASE
// fala das piores NOTAS, que quase não variam.
//
// O desencontro era de redação, mas a lição é outra: "costuma ser" é do tipo
// de afirmação que ninguém consegue conferir na tela, e este painel já
// carregou várias delas que envelheceram para mentira. Então vira número, e
// número calculado da onda que está sendo mostrada -- não escrito à mão.

export interface AderenciaDasPiores {
  /** Áreas com nota comparável nesta onda. */
  areas: number;
  /** Em quantas delas a pergunta de pior nota está entre as 3 piores da empresa. */
  seguemAEmpresa: number;
  /** Quantas perguntas DISTINTAS aparecem no topo da lista de distância. */
  distanciasDistintas: number;
}

const TOP_EMPRESA = 3;

export function aderenciaDasPiores(
  linhas: readonly DriverPorRecorte[],
): AderenciaDasPiores | null {
  const regua = reguaEmpresa(linhas);
  if (regua.size === 0) return null;

  // O ranking da empresa pela NOTA, do pior para o melhor.
  const piores = [...regua.entries()]
    .filter(([, v]) => v.score != null)
    .sort((a, b) => (a[1].score as number) - (b[1].score as number))
    .slice(0, TOP_EMPRESA)
    .map(([k]) => k);
  if (!piores.length) return null;

  const porArea = new Map<string, DriverPorRecorte[]>();
  for (const l of linhas) {
    if (l.cutType !== 'area' || l.score == null) continue;
    const k = l.cutValue.trim().toLowerCase();
    if (!porArea.has(k)) porArea.set(k, []);
    porArea.get(k)!.push(l);
  }

  let seguemAEmpresa = 0;
  const noTopoDaDistancia = new Set<string>();
  for (const linhasDaArea of porArea.values()) {
    const pior = [...linhasDaArea].sort(
      (a, b) => (a.score as number) - (b.score as number),
    )[0];
    if (pior && piores.includes(chave(pior))) seguemAEmpresa++;

    const maisDistante = linhasDaArea
      .map((l) => ({ l, gap: dif(l.favoravel, regua.get(chave(l))?.favoravel ?? null) }))
      .filter((x) => x.gap != null)
      .sort((a, b) => (a.gap as number) - (b.gap as number))[0];
    if (maisDistante) noTopoDaDistancia.add(maisDistante.l.question);
  }

  return {
    areas: porArea.size,
    seguemAEmpresa,
    distanciasDistintas: noTopoDaDistancia.size,
  };
}

// ======================================================================
// DE QUAIS ÁREAS VEM UM GRUPO QUE NÃO É ÁREA
// ======================================================================
// A Marilia pediu, sobre o Cross Brand: "uma descrição, sei lá, teoricamente
// financeiro, todo mundo, legal, RH e algumas pessoas de marketing. Só para as
// pessoas poderem começar a dimensionar quem são esses cross brands ENQUANTO A
// GENTE AINDA NÃO TEM ESSES DADOS CERTINHO."
//
// A última frase é a parte importante, e ela está enganada -- de novo por culpa
// da tela, não dela. O dado existe e é exato: o cruzamento `area+marca` diz
// quantas pessoas de cada área responderam Cross Brand. Em ago/26 são 122, e a
// maior fatia é Marketing com 48, não o financeiro.
//
// Então em vez de uma descrição aproximada de memória, a composição real. É a
// sétima vez nesta semana que alguém supõe ausência de um dado que estava
// gravado -- e a primeira em que a suposição é da pessoa que pediu.

export interface FatiaDoGrupo {
  area: string;
  n: number;
}

export function composicaoDoGrupo(
  cuts: ReadonlyArray<{ cutType: string; cutValue: string; n: number }>,
  cutTypeCruzado: string,
  valor: string,
  separador = ' || ',
): FatiaDoGrupo[] {
  const alvo = valor.trim().toLowerCase();
  return cuts
    .filter((c) => c.cutType === cutTypeCruzado)
    .flatMap((c) => {
      const i = c.cutValue.indexOf(separador);
      if (i < 0) return [];
      const area = c.cutValue.slice(0, i);
      const parte = c.cutValue.slice(i + separador.length);
      return parte.trim().toLowerCase() === alvo ? [{ area, n: c.n }] : [];
    })
    .sort((a, b) => b.n - a.n);
}
