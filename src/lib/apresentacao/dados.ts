/**
 * ===========================================================================
 * A APRESENTAÇÃO DE ENGAJAMENTO, MONTADA A PARTIR DO QUE A ABA JÁ RECEBE
 * ===========================================================================
 * Os HRBPs levam para cada área um deck com roteiro fixo (template "[PT]
 * Pesquisa Engajamento Departamento"). Até aqui os números eram copiados à
 * mão do painel, slide por slide.
 *
 * Esta função NÃO consulta nada. Ela recebe as respostas de `getSurveyWave`
 * -- uma por onda, já escopadas pelo servidor -- e só reorganiza o que chegou
 * na ordem dos slides. Isso é de propósito:
 *
 *   - A permissão continua morando num lugar só. Um segundo endpoint para a
 *     apresentação seria uma segunda implementação de "quem vê qual área", e
 *     este painel já aprendeu o que acontece quando duas regras de permissão
 *     divergem.
 *   - Quem não pode ver uma área não consegue montar a apresentação dela: o
 *     dado simplesmente não está na resposta.
 *
 * O QUE FICA DE FORA, TAMBÉM DE PROPÓSITO: leituras, âncoras, fricções e
 * classificações (PROTEGER / TRATAR / APROFUNDAR). São do HRBP. O template diz
 * isso com todas as letras ("hipóteses da liderança não devem aparecer como
 * achados"), e um texto gerado aqui chegaria à reunião com cara de achado. A
 * aba mostra CANDIDATOS (maiores quedas, maiores distâncias da empresa,
 * perguntas mais ligadas ao eNPS); a escolha continua humana.
 */

// ---------------------------------------------------------------- entrada

/** O pedaço de `SurveyWaveData` que a apresentação lê. Estrutural: a resposta inteira serve. */
export interface CutEntrada {
  cutType: string;
  cutValue: string;
  n: number;
  enps: number | null;
  risco: number | null;
  satisfacao: number | null;
  promotores: number | null;
  passivos: number | null;
  detratores: number | null;
}
export interface DriverEntrada {
  driver: string;
  question: string;
  cutType: string;
  cutValue: string;
  n: number;
  score: number | null;
  favoravel: number | null;
}
export interface ImportanciaEntrada {
  cutType: string;
  cutValue: string;
  question: string;
  r: number;
}
export interface OndaEntrada {
  wave: string;
  label: string;
  respondentes: number;
  elegiveis: number | null;
  participacao: number | null;
  elegiveisPorArea?: Record<string, number>;
  elegiveisSaoDaEntidade?: boolean;
  cuts: CutEntrada[];
  importancia: ImportanciaEntrada[];
  driversPorArea: DriverEntrada[];
  driversAnteriores: DriverEntrada[];
  ondaAnteriorLabel: string | null;
}

// ---------------------------------------------------------------- saída

export interface Indicadores {
  n: number | null;
  enps: number | null;
  satisfacao: number | null;
  risco: number | null;
}
export interface LinhaHistorico {
  wave: string;
  label: string;
  curto: string;
  area: Indicadores;
  bench: Indicadores;
}
export interface Populacao {
  grupo: 'Escopo de função' | 'Tempo de casa' | 'Marca' | 'Modelo de trabalho';
  segmento: string;
  n: number | null;
  enps: number | null;
  risco: number | null;
  satisfacao: number | null;
  enpsBench: number | null;
  riscoBench: number | null;
  /** eNPS do mesmo segmento na onda anterior (só função tem esse cruzamento). */
  enpsAnterior: number | null;
}
export interface Pergunta {
  driver: string;
  pergunta: string;
  fav: number | null;
  favAnt: number | null;
  favBench: number | null;
  media: number | null;
  mediaBench: number | null;
  /** Associação com o eNPS dentro da área. Só existe com 30+ respostas. */
  r: number | null;
}
export interface Driver {
  nome: string;
  descricao: string;
  perguntas: Pergunta[];
  fav: number | null;
  favAnt: number | null;
  favBench: number | null;
  favBenchAnt: number | null;
  media: number | null;
}
export interface DadosApresentacao {
  area: string;
  onda: { wave: string; label: string; curto: string };
  ondaAnterior: { label: string; curto: string } | null;
  /** "Flutter Brasil", ou o nome da entidade quando o seletor do topo recorta. */
  bench: string;
  participacao: {
    elegiveis: number | null;
    respostas: number | null;
    taxa: number | null;
    taxaBench: number | null;
    /** Sem taxa com entidade: o Cross Brand responde nas duas. */
    semTaxa: boolean;
  };
  historico: LinhaHistorico[];
  atual: {
    area: Indicadores & { promotores: number | null; passivos: number | null; detratores: number | null };
    anterior: (Indicadores & { promotores: number | null; passivos: number | null; detratores: number | null }) | null;
    bench: Indicadores;
  };
  populacoes: Populacao[];
  drivers: Driver[];
  perguntas: Pergunta[];
  evento: { nome: string; perguntas: Pergunta[] } | null;
}

// ---------------------------------------------------------------- constantes

/** Ordem do template: gestão e comunicação primeiro, como no deck do CEO. */
export const ORDEM_DRIVERS = [
  'Gestão',
  'Comunicação e Transparência Organizacional',
  'Propósito, Clareza de Papel e Alinhamento',
  'Desempenho, Responsabilidade e Autonomia',
  'Diversidade & Inclusão',
  'Remuneração',
  'Colaboração e Organização de Trabalho',
  'Apoio de RH e Processos de Gestão de Pessoas',
  'Crescimento de Carreira e Desenvolvimento',
  'Carga de Trabalho e Bem-Estar',
];

export const DESCRICAO_DRIVER: Record<string, string> = {
  'Gestão': 'Qualidade da relação com o gestor direto: comunicação, escuta, feedback, desenvolvimento e conversas sobre remuneração.',
  'Comunicação e Transparência Organizacional': 'Clareza, volume e tempestividade das informações sobre estratégia e decisões da Flutter Brazil.',
  'Propósito, Clareza de Papel e Alinhamento': 'Quanto as pessoas entendem o que se espera delas, como contribuem e se o trabalho tem sentido.',
  'Desempenho, Responsabilidade e Autonomia': 'Autonomia para decidir, clareza dos critérios de avaliação e tratamento do baixo desempenho.',
  'Diversidade & Inclusão': 'Pertencimento, igualdade de oportunidades e confiança na resposta da empresa a discriminação.',
  'Remuneração': 'Percepção de justiça em salário, benefícios e nos processos de definição de remuneração.',
  'Colaboração e Organização de Trabalho': 'Apoio entre colegas e eficiência na divisão do trabalho entre times.',
  'Apoio de RH e Processos de Gestão de Pessoas': 'Clareza sobre como acessar o RH e qualidade das orientações recebidas.',
  'Crescimento de Carreira e Desenvolvimento': 'Percepção de possibilidades de crescimento dentro da organização.',
  'Carga de Trabalho e Bem-Estar': 'Sustentabilidade da carga de trabalho e equilíbrio entre vida pessoal e profissional.',
};

export const ORDEM_TEMPO = ['0-3 meses', '3-6 meses', '6-9 meses', '9-12 meses', '12-18 meses', '18-24 meses', '24+ meses'];
const SEGMENTOS: Array<{ grupo: Populacao['grupo']; tipo: string; valores: string[] }> = [
  { grupo: 'Escopo de função', tipo: 'funcao', valores: ['Gestores', 'Contribuidores individuais'] },
  { grupo: 'Tempo de casa', tipo: 'tempo', valores: ORDEM_TEMPO },
  { grupo: 'Marca', tipo: 'marca', valores: ['Betnacional', 'Betfair', 'Cross Brand'] },
  { grupo: 'Modelo de trabalho', tipo: 'modelo', valores: ['Remoto', 'Híbrido', 'Presencial'] },
];

/** O separador que o agregador usa nos recortes cruzados ("Product || Gestores"). */
const SEP = ' || ';

// ---------------------------------------------------------------- utilidades

/**
 * O hífen "não separável" (U+2011) aparece em alguns enunciados do Polly
 * ("Bem‑Estar") e não em outros. Comparar nomes sem normalizar faz o mesmo
 * driver virar dois.
 */
export const normalizarNome = (s: string): string => s.replace(/\u2011/g, '-').trim();

/** "Agosto/26" -> "Ago/26". */
export const rotuloCurto = (label: string): string =>
  label.replace(/^(\p{L})(\p{L}{2})\p{L}*\//u, (_m, a: string, b: string) => `${a.toUpperCase()}${b.toLowerCase()}/`);

const media = (xs: Array<number | null>): number | null => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Qual área esta resposta descreve. Só existe resposta quando há exatamente uma. */
export function areaDaResposta(onda: Pick<OndaEntrada, 'cuts'>): string | null {
  const areas = [...new Set(onda.cuts.filter((c) => c.cutType === 'area').map((c) => c.cutValue))];
  return areas.length === 1 ? areas[0] : null;
}

function indicadores(c: CutEntrada | undefined): Indicadores {
  return {
    n: c?.n ?? null,
    enps: c?.enps ?? null,
    satisfacao: c?.satisfacao ?? null,
    risco: c?.risco ?? null,
  };
}

// ---------------------------------------------------------------- montagem

/**
 * @param ondas todas as ondas já carregadas, em QUALQUER ordem; a atual é
 *              `atual`. Cada uma veio de `getSurveyWave` com o mesmo filtro.
 */
export function montarApresentacao(
  atual: OndaEntrada,
  ondas: OndaEntrada[],
  opcoes: { bench?: string; ordemOndas?: string[] } = {},
): DadosApresentacao | null {
  const area = areaDaResposta(atual);
  if (!area) return null;
  const bench = opcoes.bench ?? 'Flutter Brasil';

  const cut = (o: OndaEntrada, tipo: string, valor: string) =>
    o.cuts.find((c) => c.cutType === tipo && c.cutValue === valor);
  const areaAtual = cut(atual, 'area', area);
  const empresaAtual = cut(atual, 'company', 'company');

  // ---- histórico: da mais antiga para a mais recente
  const ordem = opcoes.ordemOndas;
  const ordenadas = [...ondas].sort((a, b) =>
    ordem ? ordem.indexOf(a.wave) - ordem.indexOf(b.wave) : 0);
  const historico: LinhaHistorico[] = ordenadas
    .map((o) => ({
      wave: o.wave,
      label: o.label,
      curto: rotuloCurto(o.label),
      area: indicadores(cut(o, 'area', area)),
      bench: indicadores(cut(o, 'company', 'company')),
    }))
    // Uma onda sem a área (jul/25 não perguntou algumas áreas) não é zero:
    // é ausência. Fica fora em vez de desenhar uma barra no chão.
    .filter((h) => h.area.n != null || h.area.enps != null);

  const idx = historico.findIndex((h) => h.wave === atual.wave);
  const anteriorHist = idx > 0 ? historico[idx - 1] : null;
  const ondaAnterior = ordenadas.find((o) => o.wave === anteriorHist?.wave) ?? null;
  const areaAnt = ondaAnterior ? cut(ondaAnterior, 'area', area) : undefined;

  // ---- participação
  const elegiveis = atual.elegiveisPorArea?.[area] ?? null;
  const semTaxa = !!atual.elegiveisSaoDaEntidade;
  const participacao = {
    elegiveis,
    respostas: areaAtual?.n ?? null,
    taxa: !semTaxa && elegiveis && areaAtual?.n != null ? (areaAtual.n / elegiveis) * 100 : null,
    taxaBench: semTaxa ? null : atual.participacao,
    semTaxa,
  };

  // ---- populações
  const populacoes: Populacao[] = [];
  for (const s of SEGMENTOS) {
    for (const v of s.valores) {
      const c = cut(atual, `area+${s.tipo}`, `${area}${SEP}${v}`);
      if (!c) continue;
      const b = cut(atual, s.tipo, v);
      const ant = ondaAnterior ? cut(ondaAnterior, `area+${s.tipo}`, `${area}${SEP}${v}`) : undefined;
      populacoes.push({
        grupo: s.grupo, segmento: v, n: c.n, enps: c.enps, risco: c.risco, satisfacao: c.satisfacao,
        enpsBench: b?.enps ?? null, riscoBench: b?.risco ?? null,
        enpsAnterior: ant?.enps ?? null,
      });
    }
  }

  // ---- perguntas
  const chave = (d: string, q: string) => `${normalizarNome(d)}\u0000${q}`;
  const mapa = (linhas: DriverEntrada[], tipo: string, valor: string) => {
    const m = new Map<string, DriverEntrada>();
    for (const l of linhas) if (l.cutType === tipo && l.cutValue === valor) m.set(chave(l.driver, l.question), l);
    return m;
  };
  const daArea = mapa(atual.driversPorArea, 'area', area);
  const daEmpresa = mapa(atual.driversPorArea, 'company', 'company');
  const antArea = mapa(atual.driversAnteriores, 'area', area);
  const antEmpresa = mapa(atual.driversAnteriores, 'company', 'company');
  const imp = new Map<string, number>();
  for (const i of atual.importancia) if (i.cutType === 'area' && i.cutValue === area) imp.set(i.question, i.r);

  const todas: Pergunta[] = [...daArea.values()].map((l) => {
    const k = chave(l.driver, l.question);
    return {
      driver: normalizarNome(l.driver),
      pergunta: l.question,
      fav: l.favoravel,
      favAnt: antArea.get(k)?.favoravel ?? null,
      favBench: daEmpresa.get(k)?.favoravel ?? null,
      media: l.score,
      mediaBench: daEmpresa.get(k)?.score ?? null,
      r: imp.get(l.question) ?? null,
    };
  });
  const pos = (d: string) => {
    const i = ORDEM_DRIVERS.indexOf(d);
    return i < 0 ? ORDEM_DRIVERS.length : i;
  };
  const ehEvento = (d: string) => /^evento/i.test(d);
  todas.sort((a, b) => pos(a.driver) - pos(b.driver) || a.driver.localeCompare(b.driver) || a.pergunta.localeCompare(b.pergunta));

  const nomes = [...new Set(todas.filter((p) => !ehEvento(p.driver)).map((p) => p.driver))];
  const drivers: Driver[] = nomes.map((nome) => {
    const ps = todas.filter((p) => p.driver === nome);
    const favBenchAnt = media(ps.map((p) => antEmpresa.get(chave(p.driver, p.pergunta))?.favoravel ?? null));
    return {
      nome,
      descricao: DESCRICAO_DRIVER[nome] ?? '',
      perguntas: ps,
      fav: media(ps.map((p) => p.fav)),
      favAnt: media(ps.map((p) => p.favAnt)),
      favBench: media(ps.map((p) => p.favBench)),
      favBenchAnt,
      media: media(ps.map((p) => p.media)),
    };
  });
  const perguntasEvento = todas.filter((p) => ehEvento(p.driver));
  const evento = perguntasEvento.length
    ? { nome: perguntasEvento[0].driver.replace(/^evento espec[ií]fico\s*-\s*/i, ''), perguntas: perguntasEvento }
    : null;

  const comp = (c: CutEntrada | undefined) => ({
    ...indicadores(c),
    promotores: c?.promotores ?? null,
    passivos: c?.passivos ?? null,
    detratores: c?.detratores ?? null,
  });

  return {
    area,
    onda: { wave: atual.wave, label: atual.label, curto: rotuloCurto(atual.label) },
    ondaAnterior: anteriorHist ? { label: anteriorHist.label, curto: anteriorHist.curto } : null,
    bench,
    participacao,
    historico,
    atual: {
      area: comp(areaAtual),
      anterior: areaAnt ? comp(areaAnt) : null,
      bench: indicadores(empresaAtual),
    },
    populacoes,
    drivers,
    perguntas: todas,
    evento,
  };
}

// ---------------------------------------------------------------- candidatos

/**
 * Pistas para o HRBP escolher âncoras e fricções. NÃO são a escolha.
 *
 * Três réguas, porque o template pede as três ("pontuação · comparação ·
 * tendência / associação") e nenhuma sozinha define prioridade.
 */
export function candidatos(d: DadosApresentacao, limite = 5) {
  const ps = d.perguntas.filter((p) => !/^evento/i.test(p.driver) && p.fav != null);
  const dif = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);
  const ordenar = (f: (p: Pergunta) => number | null, asc: boolean) =>
    ps.map((p) => ({ p, v: f(p) }))
      .filter((x): x is { p: Pergunta; v: number } => x.v != null)
      .sort((a, b) => (asc ? a.v - b.v : b.v - a.v))
      .slice(0, limite);
  return {
    maioresQuedas: ordenar((p) => dif(p.fav, p.favAnt), true).filter((x) => x.v < 0),
    abaixoDaEmpresa: ordenar((p) => dif(p.fav, p.favBench), true).filter((x) => x.v < 0),
    acimaDaEmpresa: ordenar((p) => dif(p.fav, p.favBench), false).filter((x) => x.v > 0),
    maisLigadasAoEnps: ordenar((p) => p.r, false),
    populacoesAcimaDoRisco: d.populacoes
      .filter((x) => x.risco != null && x.riscoBench != null && x.risco > x.riscoBench && (x.n ?? 0) >= 5)
      .sort((a, b) => (b.risco! - b.riscoBench!) - (a.risco! - a.riscoBench!))
      .slice(0, limite),
  };
}


// ---------------------------------------------------------------- sugestões (slides 7, 8 e 9)

/**
 * Sugestão de partida para âncoras, fricções e populações -- pedido da
 * Carolina (25/09), depois de ver os slides 7, 8 e 9 saírem em branco.
 *
 * O deck MARCA que é sugestão (no campo de síntese do HRBP) e deixa "Leitura"
 * e "Por que importa" em aberto: a regra abaixo escolhe por número, não por
 * contexto, e só o HRBP sabe o contexto.
 *
 * As regras, para poderem ser explicadas na sessão:
 *   - Âncora: favorável >= 75% e no nível ou acima da empresa; as mais acima
 *     primeiro. Uma por driver.
 *   - Fricção: a maior entre queda vs onda anterior e distância abaixo da
 *     empresa. Uma por driver. TRATAR quando a pergunta é ligada ao eNPS da
 *     área (r >= 0,35) -- ou quando a área não tem r (menos de 30 respostas);
 *     APROFUNDAR quando não é. O template tem as etiquetas na ordem TRATAR,
 *     APROFUNDAR, TRATAR, e a sugestão preenche nessa ordem.
 *   - População: n >= 5, maior risco acima do mesmo grupo na empresa primeiro.
 */
export const LIMIAR_R = 0.35;
export interface Sugerida { p: Pergunta; etiqueta: 'PROTEGER' | 'TRATAR' | 'APROFUNDAR' }
export interface PopulacaoDestacada { pop: Populacao; qualificacao: 'Tratar' | 'Aprofundar' | 'Monitorar' }

export function sugestoes(d: DadosApresentacao) {
  const ps = d.perguntas.filter((p) => !/^evento/i.test(p.driver) && p.fav != null);
  const dif = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);

  const umaPorDriver = (xs: Array<{ p: Pergunta; v: number }>) => {
    const vistos = new Set<string>();
    return xs.filter(({ p }) => (vistos.has(p.driver) ? false : (vistos.add(p.driver), true)));
  };

  const ancoras: Sugerida[] = umaPorDriver(
    ps.map((p) => ({ p, v: dif(p.fav, p.favBench) }))
      .filter((x): x is { p: Pergunta; v: number } => x.v != null && x.v >= 0 && (x.p.fav ?? 0) >= 75)
      .sort((a, b) => b.v - a.v || (b.p.r ?? 0) - (a.p.r ?? 0)),
  ).slice(0, 3).map(({ p }) => ({ p, etiqueta: 'PROTEGER' }));

  const gravidade = (p: Pergunta) => {
    const quedas = [dif(p.favAnt, p.fav), dif(p.favBench, p.fav)].filter((x): x is number => x != null);
    return quedas.length ? Math.max(...quedas) : null;
  };
  const friccoesOrdenadas = umaPorDriver(
    ps.map((p) => ({ p, v: gravidade(p) }))
      .filter((x): x is { p: Pergunta; v: number } => x.v != null && x.v > 0)
      .sort((a, b) => b.v - a.v),
  ).map(({ p }) => p);
  const ligada = (p: Pergunta) => p.r == null || p.r >= LIMIAR_R;
  const usadas = new Set<Pergunta>();
  const pegar = (f: (p: Pergunta) => boolean) => {
    const p = friccoesOrdenadas.find((x) => !usadas.has(x) && f(x))
      ?? friccoesOrdenadas.find((x) => !usadas.has(x));
    if (p) usadas.add(p);
    return p;
  };
  const t1 = pegar(ligada);
  const ap = pegar((p) => !ligada(p));
  const t2 = pegar(ligada);
  const friccoes: Array<Sugerida | null> = [
    t1 ? { p: t1, etiqueta: 'TRATAR' } : null,
    ap ? { p: ap, etiqueta: 'APROFUNDAR' } : null,
    t2 ? { p: t2, etiqueta: 'TRATAR' } : null,
  ];

  const populacoes: PopulacaoDestacada[] = d.populacoes
    .filter((x) => (x.n ?? 0) >= 5 && x.risco != null && x.riscoBench != null)
    .sort((a, b) => (b.risco! - b.riscoBench!) - (a.risco! - a.riscoBench!))
    .slice(0, 4)
    .map((pop) => {
      const df = pop.risco! - pop.riscoBench!;
      const qualificacao = df >= 5 ? ((pop.n ?? 0) >= 10 ? 'Tratar' : 'Aprofundar') : 'Monitorar';
      return { pop, qualificacao };
    });

  return { ancoras, friccoes, populacoes };
}

const encurtar = (s: string, max: number) =>
  s.length <= max ? s : `${s.slice(0, max).replace(/\s+\S*$/, '')}…`;
const rotuloSegmento = (s: string) =>
  s === 'Contribuidores individuais' ? 'Individuais' : s.replace(/(\d+)-(\d+)/, '$1–$2');

// ---------------------------------------------------------------- formatação

const MENOS = '\u2212';
export const fmtNum = (x: number | null | undefined, casas = 0): string =>
  x == null || !Number.isFinite(x) ? '—' : x.toFixed(casas).replace('.', ',').replace('-', MENOS);
export const fmtPct = (x: number | null | undefined, casas = 1): string =>
  x == null ? '—' : `${fmtNum(x, casas)}%`;
export const fmtDelta = (x: number | null | undefined, casas = 0, sufixo = ''): string => {
  if (x == null || !Number.isFinite(x)) return '—';
  const r = Number(x.toFixed(casas));
  const sinal = r > 0 ? '+' : r < 0 ? MENOS : '±';
  return `${sinal}${Math.abs(r).toFixed(casas).replace('.', ',')}${sufixo}`;
};
const sub = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? null : a - b;

// ---------------------------------------------------------------- deck

/** Rótulos curtos de driver para a biblioteca de perguntas (coluna estreita). */
const DRIVER_CURTO: Record<string, string> = {
  'Apoio de RH e Processos de Gestão de Pessoas': 'Apoio de RH',
  'Carga de Trabalho e Bem-Estar': 'Carga e Bem-Estar',
  'Colaboração e Organização de Trabalho': 'Colaboração',
  'Comunicação e Transparência Organizacional': 'Comunicação',
  'Crescimento de Carreira e Desenvolvimento': 'Carreira',
  'Desempenho, Responsabilidade e Autonomia': 'Desempenho e Autonomia',
  'Propósito, Clareza de Papel e Alinhamento': 'Propósito e Clareza',
};
const curtoDriver = (d: string) =>
  DRIVER_CURTO[d] ?? (/^evento/i.test(d) ? d.replace(/^evento espec[ií]fico\s*-\s*/i, '') : d);

/** Capacidade do template: 10 slides de driver, 6 perguntas cada; 3 x 12 na biblioteca; 5 ondas. */
export const CAPACIDADE = { drivers: 10, perguntasPorDriver: 6, biblioteca: [12, 12, 12], ondas: 5 };

/**
 * Os textos do template. Chave = o que está entre {{ }} no .pptx.
 *
 * Linha de tabela sem dado NÃO recebe chave: quem preenche o deck remove a
 * linha inteira quando encontra uma célula `{{X_Rn_Cm}}` sem valor.
 */
export function tokensDoDeck(d: DadosApresentacao): Record<string, string> {
  const t: Record<string, string> = {};
  const a = d.atual.area;
  const ant = d.atual.anterior;
  const b = d.atual.bench;
  const antCurto = d.ondaAnterior?.curto ?? 'onda anterior';

  t.AREA = d.area;
  t.ONDA = d.onda.label;
  t.BENCH = d.bench;
  t.PART = d.participacao.semTaxa ? '—' : fmtPct(d.participacao.taxa, 0);
  t.PART_FB = d.participacao.semTaxa ? '—' : fmtPct(d.participacao.taxaBench, 1);
  t.ELEG = fmtNum(d.participacao.elegiveis);
  t.RESP = fmtNum(d.participacao.respostas);
  const nPerguntas = d.perguntas.filter((p) => !/^evento/i.test(p.driver)).length;
  t.DRIVERS_RESUMO = `${d.drivers.length} drivers · ${nPerguntas} perguntas${d.evento ? ` + ${d.evento.perguntas.length} sobre ${d.evento.nome}` : ''} (lista no apêndice)`;
  t.DRIVERS_LISTA = d.drivers.map((x) => x.nome).join(' · ') +
    (d.evento ? `. ${d.onda.curto} inclui ainda um bloco de ${d.evento.perguntas.length} perguntas sobre ${d.evento.nome}.` : '.');

  t.ENPS = fmtNum(a.enps);
  t.ENPS_SUB = `${fmtDelta(sub(a.enps, ant?.enps))} vs ${antCurto} · ${fmtDelta(sub(a.enps, b.enps))} vs ${d.bench}`;
  t.SAT = fmtNum(a.satisfacao, 1);
  t.SAT_SUB = `${fmtDelta(sub(a.satisfacao, ant?.satisfacao), 1)} vs ${antCurto} · ${fmtDelta(sub(a.satisfacao, b.satisfacao), 1)} vs ${d.bench}`;
  t.RISCO = fmtPct(a.risco, 1);
  t.RISCO_SUB = `${fmtDelta(sub(a.risco, ant?.risco), 1, ' pp')} vs ${antCurto} · ${fmtDelta(sub(a.risco, b.risco), 1, ' pp')} vs ${d.bench}`;
  t.HIST_N = 'n = ' + d.historico.map((h) => fmtNum(h.area.n)).join(', ');

  if (d.evento) {
    // Curto de propósito: a caixa do slide 10 tem duas linhas. O enunciado
    // de cada pergunta está no apêndice.
    t.EVENTO_RES = `${d.evento.nome} · favorável nas ${d.evento.perguntas.length} perguntas: ` +
      d.evento.perguntas.map((p) => fmtPct(p.fav, 0)).join(' · ') +
      ` (${d.bench}: ` + d.evento.perguntas.map((p) => fmtPct(p.favBench, 0)).join(' · ') + ')';
  }

  d.drivers.slice(0, CAPACIDADE.drivers).forEach((dr, k) => {
    const p = `D${k}`;
    t[`${p}_NOME`] = dr.nome;
    t[`${p}_DESC`] = dr.descricao;
    t[`${p}_FAV`] = fmtPct(dr.fav, 1);
    t[`${p}_MED`] = fmtNum(dr.media, 2);
    t[`${p}_VSFB`] = fmtDelta(sub(dr.fav, dr.favBench), 1, ' pp');
    t[`${p}_VSANT`] = fmtDelta(sub(dr.fav, dr.favAnt), 1, ' pp');
    dr.perguntas.slice(0, CAPACIDADE.perguntasPorDriver).forEach((q, i) => {
      t[`${p}_R${i}_C0`] = q.pergunta;
      t[`${p}_R${i}_C1`] = fmtPct(q.fav, 1);
      t[`${p}_R${i}_C2`] = fmtNum(q.media, 2);
      t[`${p}_R${i}_C3`] = fmtDelta(sub(q.fav, q.favBench), 1, ' pp');
    });
  });
  // Slides de driver sem driver: o título diz isso, em vez de "{{D9_NOME}}".
  for (let k = d.drivers.length; k < CAPACIDADE.drivers; k++) {
    t[`D${k}_NOME`] = '(slide sem driver nesta onda — pode apagar)';
    for (const s of ['DESC', 'FAV', 'MED', 'VSFB', 'VSANT']) t[`D${k}_${s}`] = '';
  }

  // Biblioteca: blocos de 12, na mesma ordem das perguntas.
  let i = 0;
  CAPACIDADE.biblioteca.forEach((cap, k) => {
    for (let r = 0; r < cap && i < d.perguntas.length; r++, i++) {
      const q = d.perguntas[i];
      const v = [curtoDriver(q.driver), q.pergunta, fmtPct(q.fav, 1),
        fmtDelta(sub(q.fav, q.favAnt), 1, ' pp'), q.r == null ? '—' : fmtNum(q.r, 2),
        fmtNum(q.media, 2), fmtDelta(sub(q.fav, q.favBench), 1, ' pp')];
      v.forEach((x, c) => { t[`L${k}_R${r}_C${c}`] = x; });
    }
  });

  // ---- sugestões dos slides 7, 8 e 9 (ver `sugestoes`)
  const sug = sugestoes(d);
  const evidencia = (p: Pergunta, max: number) =>
    `“${encurtar(p.pergunta, max)}” ${fmtPct(p.fav, 0)} (${d.bench} ${fmtPct(p.favBench, 0)}) · ` +
    `${fmtDelta(sub(p.fav, p.favAnt), 0, ' pp')} vs ${antCurto}${p.r == null ? '' : ` · r ${fmtNum(p.r, 2)}`}`;
  t.S7_SINTESE = `[Sugestão automática — revise antes da sessão. Âncoras: perguntas com favorável ≥ 75% e mais acima de ${d.bench}.]`;
  for (let k = 0; k < 3; k++) {
    const a = sug.ancoras[k];
    t[`A${k}_TOP`] = a ? curtoDriver(a.p.driver) : '[ÂNCORA]';
    t[`A${k}_EV`] = a ? evidencia(a.p, 70) : '[Evidência]';
  }
  t.S8_SINTESE = `[Sugestão automática — revise antes da sessão. Fricções: maiores quedas vs ${antCurto} ou distâncias abaixo de ${d.bench}. TRATAR quando a pergunta é ligada ao eNPS da área (r ≥ 0,35); APROFUNDAR quando não é.]`;
  sug.friccoes.forEach((f, k) => {
    t[`F${k}_TOP`] = f ? curtoDriver(f.p.driver) : '[TÓPICO]';
    // Uma linha só: abaixo dela, no slide 8, vem o rótulo "Leitura do HRBP".
    t[`F${k}_EV`] = f
      ? `“${encurtar(f.p.pergunta, 30)}” ${fmtPct(f.p.fav, 0)} · FB ${fmtPct(f.p.favBench, 0)} · ${fmtDelta(sub(f.p.fav, f.p.favAnt), 0, ' pp')}`
      : '[pontuação] · [comparação] · [tendência / associação]';
  });
  sug.populacoes.forEach(({ pop, qualificacao }, r) => {
    t[`P_R${r}_C0`] = rotuloSegmento(pop.segmento);
    t[`P_R${r}_C1`] = fmtPct(pop.risco, 1);
    t[`P_R${r}_C2`] = fmtPct(pop.riscoBench, 1);
    t[`P_R${r}_C3`] = fmtNum(pop.n);
    t[`P_R${r}_C4`] = `${qualificacao} · eNPS ${fmtNum(pop.enps)} vs ${fmtNum(pop.enpsBench)}`;
  });

  d.historico.slice(-CAPACIDADE.ondas).forEach((h, r) => {
    t[`H_R${r}_C0`] = h.curto;
    t[`H_R${r}_C1`] = fmtNum(h.area.enps);
    t[`H_R${r}_C2`] = fmtNum(h.area.satisfacao, 1);
    t[`H_R${r}_C3`] = fmtPct(h.area.risco, 1);
  });
  return t;
}

export interface SerieGrafico { nome: string; valores: Array<number | null> }
export interface DadosGrafico { categorias: string[]; series: SerieGrafico[] }

const round1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);

/** Os gráficos do template. Chave = a do manifesto (ver `deck.ts`). */
export function graficosDoDeck(d: DadosApresentacao): Record<string, DadosGrafico> {
  const g: Record<string, DadosGrafico> = {};
  const hist = d.historico.slice(-CAPACIDADE.ondas);
  const cats = hist.map((h) => h.curto);
  const par = (f: (i: Indicadores) => number | null): DadosGrafico => ({
    categorias: cats,
    series: [
      { nome: d.area, valores: hist.map((h) => f(h.area)) },
      { nome: d.bench, valores: hist.map((h) => f(h.bench)) },
    ],
  });
  g.s5_enps = par((i) => i.enps);
  g.s5_risco = par((i) => i.risco);
  g.h_enps = par((i) => i.enps);
  g.h_sat = par((i) => i.satisfacao);
  g.h_risco = par((i) => i.risco);

  const pop = (grupo: Populacao['grupo']) => d.populacoes.filter((p) => p.grupo === grupo);
  const funcao = pop('Escopo de função');
  g.s9_funcao = {
    categorias: funcao.map((p) => `${p.segmento === 'Contribuidores individuais' ? 'Individuais' : p.segmento} (${p.n ?? 0})`),
    series: [
      { nome: d.area, valores: funcao.map((p) => p.risco) },
      { nome: d.bench, valores: funcao.map((p) => p.riscoBench) },
    ],
  };
  const tempo = pop('Tempo de casa');
  g.s9_tempo = {
    categorias: tempo.map((p) => `${p.segmento.replace(' meses', 'm')} (${p.n ?? 0})`),
    series: [{ nome: 'Risco de retenção %', valores: tempo.map((p) => p.risco) }],
  };
  const seg = (ps: Populacao[], rot: (s: string) => string = (s) => s): DadosGrafico => ({
    categorias: ps.map((p) => `${rot(p.segmento)} (${p.n ?? 0})`),
    series: [
      { nome: 'eNPS', valores: ps.map((p) => p.enps) },
      { nome: 'Risco de retenção %', valores: ps.map((p) => p.risco) },
    ],
  });
  g.g_tempo = seg(tempo, (s) => s.replace(' meses', 'm'));
  g.g_funcao = seg(funcao, (s) => (s === 'Contribuidores individuais' ? 'Individuais' : s));
  g.g_marca = seg(pop('Marca'));
  g.g_modelo = seg(pop('Modelo de trabalho'));

  const antCurto = d.ondaAnterior?.curto ?? 'Anterior';
  d.drivers.slice(0, CAPACIDADE.drivers).forEach((dr, k) => {
    g[`d${k}`] = {
      categorias: [antCurto, d.onda.curto],
      series: [
        { nome: d.area, valores: [round1(dr.favAnt), round1(dr.fav)] },
        { nome: d.bench, valores: [round1(dr.favBenchAnt), round1(dr.favBench)] },
      ],
    };
  });

  const mov = d.drivers
    .map((dr) => ({ nome: dr.nome, v: sub(dr.fav, dr.favAnt) }))
    .sort((a, b) => (a.v ?? 0) - (b.v ?? 0));
  g.h_drivers = {
    categorias: mov.map((m) => (DRIVER_CURTO[m.nome] ?? m.nome).replace(' e Bem-Estar', '').replace(' e Autonomia', '').replace(' e Clareza', '')),
    series: [{ nome: `Variação do favorável ${antCurto} → ${d.onda.curto} (pp)`, valores: mov.map((m) => round1(m.v)) }],
  };
  return g;
}
