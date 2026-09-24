/**
 * ===========================================================================
 * TENDÊNCIA DOS ITENS COMPARÁVEIS -- A ONDA ANTERIOR, NO FORMATO DO DECK
 * ===========================================================================
 * Pedido da Thais (24/09/2026): a aba mostra a onda mais recente contra a
 * anterior, e com isso a comparação Jul/25 -> Jan/26 -- a do slide
 * "Engagement Highlights (2/3)" -- deixou de existir no painel. Para ver, o
 * time voltava ao PPT.
 *
 * Esta seção reproduz o slide: por pergunta, o Fav% da área nas duas ondas,
 * o mesmo da empresa, e a posição da área contra a empresa na onda mais nova.
 * O painel principal NÃO muda; isto é uma seção a mais.
 *
 * ------------------------------------------------------------------
 * "COMPARÁVEL" É DECIDIDO AQUI, E NÃO PELO TEXTO CRU
 * ------------------------------------------------------------------
 * O resto da aba casa as ondas pelo texto exato da pergunta. Isso funciona
 * para 8 das 10 perguntas de jul/25 -- e perde "recompensa justa", que mudou
 * de redação em jan/26 ("Sinto que sou recompensado(a)... em comparação com
 * outras pessoas do meu departamento"). O deck trata as duas como a mesma
 * pergunta, e a Carolina confirmou que o painel deve tratar também.
 *
 * Então a equivalência é uma LISTA EXPLÍCITA, revisada por gente, e não uma
 * semelhança calculada pelo código. Mesmo princípio do `talent_mobility_mapa`:
 * o código não adivinha qual pergunta é a mesma.
 *
 * Pergunta fora da lista não some: vira chave pelo próprio texto normalizado,
 * então uma onda futura com o mesmo questionário continua comparável sem
 * ninguém tocar aqui. A lista só é necessária quando a REDAÇÃO muda.
 *
 * Tudo é função pura: entram as linhas do servidor (já filtradas por escopo),
 * sai a tabela.
 */

/** O mínimo de uma linha de `survey_driver_scores` que esta conta usa. */
export interface LinhaDriver {
  /** O tema (driver). Jul/25 grava tudo como "Geral"; o tema vem da onda nova. */
  driver?: string;
  question: string;
  cutType: string;
  cutValue: string;
  n: number;
  favoravel: number | null;
}

interface ItemConhecido {
  chave: string;
  /** Rótulo curto, em português (a tela passa por `tx`). */
  rotulo: string;
  /** Todas as redações que já teve, em qualquer onda. */
  redacoes: string[];
}

/**
 * Perguntas com rótulo curto e, quando mudaram de redação, as equivalências.
 * Para acrescentar: uma entrada nova, com TODAS as redações que ela já teve.
 */
export const ITENS_CONHECIDOS: readonly ItemConhecido[] = [
  {
    chave: 'gestor-se-importa',
    rotulo: 'Gestor se importa com minha opinião',
    redacoes: ['Meu gestor se importa com a minha opinião.'],
  },
  {
    chave: 'recompensa-justa',
    rotulo: 'Recompensa justa',
    redacoes: [
      'Sou recompensado de forma justa (ex: salário, promoção, treinamentos) pelas minhas contribuições para a Flutter Brazil.',
      'Sinto que sou recompensado(a) de forma justa (ex.: salário, promoção, treinamento) pelas minhas contribuições em comparação com outras pessoas do meu departamento',
    ],
  },
  {
    chave: 'sei-o-que-se-espera',
    rotulo: 'Sei o que se espera de mim',
    redacoes: ['No trabalho, sei claramente o que é esperado de mim.'],
  },
  {
    chave: 'trabalho-significativo',
    rotulo: 'Trabalho significativo',
    redacoes: ['O trabalho que realizo é significativo para mim.'],
  },
  {
    chave: 'crescimento-carreira',
    rotulo: 'Crescimento de carreira',
    redacoes: ['Vejo possibilidades de crescimento na minha carreira dentro da organização.'],
  },
  {
    chave: 'oportunidades-iguais',
    rotulo: 'Oportunidades iguais',
    redacoes: ['Pessoas de todas as origens têm as mesmas oportunidades na Flutter Brazil.'],
  },
  {
    chave: 'conto-com-colegas',
    rotulo: 'Posso contar com colegas',
    redacoes: ['Posso contar com meus colegas de trabalho quando preciso de ajuda.'],
  },
  {
    chave: 'feedback-suficiente',
    rotulo: 'Feedback suficiente',
    redacoes: ['Recebo feedback suficiente para entender se estou desempenhando bem meu papel.'],
  },
  {
    chave: 'contribuicao-time',
    rotulo: 'Contribuição para as metas do time',
    redacoes: ['Entendo como o meu trabalho contribui para os objetivos do meu time.'],
  },
];

/** Texto sem acento, caixa, pontuação final nem espaço duplo. */
export function normalizarPergunta(q: string): string {
  return q
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim();
}

const POR_REDACAO = new Map<string, ItemConhecido>(
  ITENS_CONHECIDOS.flatMap((it) => it.redacoes.map((r) => [normalizarPergunta(r), it] as const)),
);

/** Chave estável da pergunta entre ondas. */
export function chaveDaPergunta(q: string): string {
  const n = normalizarPergunta(q);
  return POR_REDACAO.get(n)?.chave ?? n;
}

/** Rótulo curto quando conhecido; senão o próprio texto da pergunta. */
export function rotuloDaPergunta(q: string): string {
  return POR_REDACAO.get(normalizarPergunta(q))?.rotulo ?? q;
}

export interface LinhaTendencia {
  chave: string;
  /** Tema da pergunta na onda mais nova. */
  tema: string;
  rotulo: string;
  /** Redação da onda mais nova, para o tooltip. */
  pergunta: string;
  areaAntes: number | null;
  areaDepois: number | null;
  /** Em pontos percentuais, da conta SEM arredondar (igual ao deck). */
  deltaArea: number | null;
  empresaAntes: number | null;
  empresaDepois: number | null;
  deltaEmpresa: number | null;
  /** Área menos empresa, na onda mais nova. */
  gap: number | null;
}

const dif = (a: number | null, b: number | null) =>
  a == null || b == null ? null : Math.round((a - b) * 10) / 10;

/**
 * Monta a tabela do slide.
 *
 * Só entram perguntas que existem nas DUAS ondas no nível da empresa -- é a
 * definição de "comparável" do deck ("direct comparables only"). Uma pergunta
 * nova de jan/26 não tem com o que comparar e ficaria com meia linha vazia.
 *
 * `area` null devolve só as colunas da empresa preenchidas.
 *
 * ------------------------------------------------------------------
 * QUANDO A ONDA ANTIGA NÃO TEM O RECORTE
 * ------------------------------------------------------------------
 * Com entidade (NSX, Betfair BR), jan/26 tem o recorte e jul/25 não --
 * jul/25 não perguntou marca. Sem par nas duas ondas a regra acima zeraria a
 * tabela, e a entidade perderia até o Jan/26 que ela tem.
 *
 * Então `chavesComparaveis` -- calculado pela tela sobre a Flutter Brazil
 * inteira, onde as duas ondas existem -- diz quais perguntas são comparáveis,
 * e as colunas da onda antiga ficam vazias. A definição de "comparável"
 * continua a mesma; só deixa de depender do recorte que falta.
 */
export function chavesComparaveis(
  depois: readonly LinhaDriver[],
  antes: readonly LinhaDriver[],
): Set<string> {
  const da = (ls: readonly LinhaDriver[]) => new Set(
    ls.filter((l) => l.cutType === 'company').map((l) => chaveDaPergunta(l.question)),
  );
  const a = da(antes);
  return new Set([...da(depois)].filter((k) => a.has(k)));
}

export function montarTendencia(
  depois: readonly LinhaDriver[],
  antes: readonly LinhaDriver[],
  area: string | null,
  comparaveis?: ReadonlySet<string>,
): LinhaTendencia[] {
  const indexar = (ls: readonly LinhaDriver[], cutType: string, cutValue: string | null) => {
    const m = new Map<string, LinhaDriver>();
    if (cutValue == null) return m;
    for (const l of ls) {
      if (l.cutType === cutType && l.cutValue === cutValue) m.set(chaveDaPergunta(l.question), l);
    }
    return m;
  };
  const empD = indexar(depois, 'company', 'company');
  const empA = indexar(antes, 'company', 'company');
  const areaD = indexar(depois, 'area', area);
  const areaA = indexar(antes, 'area', area);

  const linhas: LinhaTendencia[] = [];
  for (const [chave, ed] of empD) {
    const ea = empA.get(chave);
    if (comparaveis ? !comparaveis.has(chave) : !ea) continue;
    const ad = areaD.get(chave)?.favoravel ?? null;
    const aa = areaA.get(chave)?.favoravel ?? null;
    linhas.push({
      chave,
      tema: ed.driver ?? 'Geral',
      rotulo: rotuloDaPergunta(ed.question),
      pergunta: ed.question,
      areaAntes: aa,
      areaDepois: ad,
      deltaArea: dif(ad, aa),
      empresaAntes: ea?.favoravel ?? null,
      empresaDepois: ed.favoravel,
      deltaEmpresa: dif(ed.favoravel, ea?.favoravel ?? null),
      gap: dif(ad, ed.favoravel),
    });
  }
  // Mesma leitura do deck: primeiro onde a área mais se destaca da empresa.
  // Sem área, pelo movimento da empresa.
  const peso = (l: LinhaTendencia) => (area ? l.gap : l.deltaEmpresa) ?? -Infinity;
  return linhas.sort((a, b) => peso(b) - peso(a) || a.rotulo.localeCompare(b.rotulo));
}

export type TipoSinal = 'destaque' | 'melhora' | 'queda';

export interface Sinal {
  tipo: TipoSinal;
  linha: LinhaTendencia;
}

/** Movimento abaixo disto é ruído de amostra, e não entra nos sinais. */
export const LIMIAR_SINAL_PP = 3;

/**
 * Os "Key signals" do slide, calculados em vez de escritos à mão.
 *
 * Três no máximo, e sempre os mesmos três tipos, para a leitura não mudar de
 * forma entre áreas: onde a área mais se destaca da empresa, o que mais
 * melhorou e o que mais caiu. Cada um só aparece se passar do limiar -- uma
 * "maior queda" de 1pp não é sinal, e escrevê-la como se fosse inventaria um
 * problema.
 */
export function sinaisDaTendencia(linhas: readonly LinhaTendencia[]): Sinal[] {
  const comGap = linhas.filter((l) => l.gap != null);
  const comDelta = linhas.filter((l) => l.deltaArea != null);
  const out: Sinal[] = [];
  const destaque = [...comGap].sort((a, b) => b.gap! - a.gap!)[0];
  if (destaque && destaque.gap! >= LIMIAR_SINAL_PP) out.push({ tipo: 'destaque', linha: destaque });
  const melhora = [...comDelta].sort((a, b) => b.deltaArea! - a.deltaArea!)[0];
  if (melhora && melhora.deltaArea! >= LIMIAR_SINAL_PP) out.push({ tipo: 'melhora', linha: melhora });
  const queda = [...comDelta].sort((a, b) => a.deltaArea! - b.deltaArea!)[0];
  if (queda && queda.deltaArea! <= -LIMIAR_SINAL_PP) out.push({ tipo: 'queda', linha: queda });
  return out;
}

// ===========================================================================
// POR TEMA PRIMEIRO, A PERGUNTA QUANDO FOR NECESSÁRIA
// ===========================================================================
// Pedido da Carolina (24/09), no mesmo espírito de "Tema por tema, e o que a
// média esconde": a tabela abre por tema, e as perguntas de cada um aparecem
// ao clicar. Com Jan/26 -> Ago/26 são 31 perguntas; por tema, oito linhas.

export interface TemaTendencia {
  tema: string;
  /** Perguntas comparáveis do tema, na ordem da tabela. */
  perguntas: LinhaTendencia[];
  areaAntes: number | null;
  areaDepois: number | null;
  deltaArea: number | null;
  empresaAntes: number | null;
  empresaDepois: number | null;
  deltaEmpresa: number | null;
  gap: number | null;
}

/**
 * Fav% do tema = média simples do Fav% das perguntas do tema, a mesma leitura
 * de "Tema por tema" (cada pergunta pesa igual). Δ e gap saem das médias, e só
 * das perguntas com valor NOS DOIS lados da conta -- senão uma pergunta sem
 * nota na área mudaria o Δ sem que nada tivesse mudado.
 */
export function agruparPorTema(linhas: readonly LinhaTendencia[], area: string | null): TemaTendencia[] {
  const media = (vs: Array<number | null>) => {
    const ok = vs.filter((v): v is number => v != null);
    return ok.length ? Math.round((ok.reduce((a, b) => a + b, 0) / ok.length) * 10) / 10 : null;
  };
  /** Diferença das médias, usando só as perguntas com os dois valores. */
  const difPareada = (ls: LinhaTendencia[], a: keyof LinhaTendencia, b: keyof LinhaTendencia) => {
    const par = ls.filter((l) => l[a] != null && l[b] != null);
    if (!par.length) return null;
    return dif(media(par.map((l) => l[a] as number)), media(par.map((l) => l[b] as number)));
  };
  const grupos = new Map<string, LinhaTendencia[]>();
  for (const l of linhas) grupos.set(l.tema, [...(grupos.get(l.tema) ?? []), l]);
  const temas = [...grupos].map(([tema, ls]) => ({
    tema,
    perguntas: ls,
    areaAntes: media(ls.map((l) => l.areaAntes)),
    areaDepois: media(ls.map((l) => l.areaDepois)),
    deltaArea: difPareada(ls, 'areaDepois', 'areaAntes'),
    empresaAntes: media(ls.map((l) => l.empresaAntes)),
    empresaDepois: media(ls.map((l) => l.empresaDepois)),
    deltaEmpresa: difPareada(ls, 'empresaDepois', 'empresaAntes'),
    gap: difPareada(ls, 'areaDepois', 'empresaDepois'),
  }));
  const peso = (t: TemaTendencia) => (area ? t.gap : t.deltaEmpresa) ?? -Infinity;
  return temas.sort((a, b) => (peso(b) - peso(a)) || a.tema.localeCompare(b.tema));
}
