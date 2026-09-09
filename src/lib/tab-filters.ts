import type { DashboardTab } from '@/lib/permissions';

/**
 * Quais filtros CADA ABA de fato aplica.
 *
 * POR QUE ISTO EXISTE
 * A barra mostrava os sete filtros em todas as abas. Só que seis deles
 * (job family, tempo de casa, tipo de contrato, faixa salarial, tipo de
 * desligamento e level) são lidos APENAS em Atrição & Desligamentos --
 * confirmado no código: nenhum outro componente referencia `filters.*`.
 *
 * O resultado era pior do que poluição visual: a pessoa selecionava "Tempo de
 * casa: 1-2 anos" no Overview, nada mudava, e a tela não dizia nada. Uma
 * interface que afirma filtrar sem filtrar corrói a confiança no número que ela
 * mostra -- e recuperar isso custa muito mais do que uma barra feia.
 *
 * O filtro de DEPARTAMENTO é diferente: ele passa pelo applyDeptFilter do
 * DashboardContext, então vale para toda aba que consome a série do contexto.
 *
 * COMO MANTER
 * Ao criar uma aba, registre-a aqui. Lista vazia = a barra some naquela aba,
 * que é a resposta honesta quando nada é filtrável. Se uma aba passar a ler um
 * filtro novo, acrescente aqui no mesmo commit -- senão o controle existe e não
 * aparece, que é o erro simétrico.
 */

export type FilterKey =
  | 'departamento'
  | 'jobFamily'
  | 'tempoCasa'
  | 'tipoContrato'
  | 'faixaSalarial'
  | 'tipoDesligamento'
  | 'level'
  | 'modeloTrabalho'
  | 'marcaProduto';

/** Rótulo curto para a etiqueta de filtro ativo. */
export const FILTER_LABELS: Record<FilterKey, string> = {
  departamento: 'Departamento',
  jobFamily: 'Job family',
  tempoCasa: 'Tempo de casa',
  tipoContrato: 'Contrato',
  faixaSalarial: 'Faixa salarial',
  tipoDesligamento: 'Tipo de desligamento',
  level: 'Level',
  modeloTrabalho: 'Modelo de trabalho',
  marcaProduto: 'Marca de produto',
};

/**
 * Os quatro que aparecem em TODA aba, nesta ordem. Decisão da Carolina, 09/09.
 *
 * ===========================================================================
 * POR QUE UMA ORDEM FIXA, E POR QUE ESTES QUATRO
 * ===========================================================================
 * A barra mudava de composição E de ordem a cada aba: departamento sozinho no
 * Overview, sete em Desligamentos, e os esmaecidos jogados no fim. Quem
 * navega entre abas relia a barra toda vez para achar o mesmo controle.
 *
 * Agora estes quatro ocupam sempre as mesmas quatro posições. Quando um deles
 * não recorta a aba, ele fica NA POSIÇÃO, esmaecido, com o motivo -- não sai
 * da fila. Some da fila e a pessoa conclui que o painel não recorta aquilo em
 * lugar nenhum, quando recorta na aba ao lado.
 *
 * Os demais (level, faixa salarial, tipo de desligamento, modelo de trabalho,
 * marca de produto) continuam existindo e vêm DEPOIS, só onde funcionam de
 * verdade -- a regra deste arquivo não mudou: filtro que aparece ativo tem de
 * filtrar.
 */
export const FILTROS_FIXOS: FilterKey[] = [
  'departamento',
  'jobFamily',
  'tipoContrato',
  'tempoCasa',
];

/** Ordem de tudo: os fixos primeiro, na ordem acordada; os extras depois. */
export const ORDEM_DA_BARRA: FilterKey[] = [
  ...FILTROS_FIXOS,
  'level',
  'faixaSalarial',
  'tipoDesligamento',
  'modeloTrabalho',
  'marcaProduto',
];

const porOrdem = (ks: readonly FilterKey[]): FilterKey[] =>
  ORDEM_DA_BARRA.filter((k) => ks.includes(k));

const TODOS: FilterKey[] = [
  'departamento',
  'jobFamily',
  'tempoCasa',
  'tipoContrato',
  'faixaSalarial',
  'tipoDesligamento',
  'level',
  'modeloTrabalho',
];

export const FILTERS_BY_TAB: Record<DashboardTab, FilterKey[]> = {
  // Consomem a série do contexto, que passa pelo applyDeptFilter.
  // Overview aceita UM recorte de dimensao alem do departamento (ver
  // series-filter.ts). A exclusividade entre os tres e garantida na barra.
  // tipoContrato saiu: a contagem por vinculo vive em contract_mix_monthly, que
  // a serie do contexto nao carrega -- dava headcount 0. Ver series-filter.ts.
  // `jobFamily` e `tipoContrato` entraram em 09/09, quando a carga passou a
  // gravar `family_base` e `contract_base` na linha mensal (migracao
  // 20260909170000). Antes disso eles apareciam esmaecidos aqui, e o motivo
  // escrito na tela -- "a serie so guarda a quebra por departamento" -- era
  // verdade sobre a tabela, nao sobre o dado.
  overview: ['departamento', 'level', 'tempoCasa', 'jobFamily', 'tipoContrato'],
  data: ['departamento'],
  // Compensação responde via a sub-aba de Salários (SalaryTab lê a série).
  // comp_ratio e person-level: level, contrato, familia, tempo de casa e faixa
  // salarial funcionam de verdade. As duas ultimas nao existem como coluna --
  // sao DERIVADAS de `hire` e `salary` no servidor (ver person-bands.ts), com os
  // mesmos cortes usados nos desligados.
  comp: ['departamento', 'level', 'tipoContrato', 'jobFamily', 'tempoCasa', 'faixaSalarial'],
  // Leem a série do contexto (já com applyDeptFilter).
  dei: ['departamento'],
  demographics: ['departamento'],
  // Filtradas no servidor, cada uma na própria server function.
  span: ['departamento'],
  // ------------------------------------------------------------------
  // TEMPO DE CASA E MODELO ENTRARAM, E O COMENTÁRIO ANTIGO ERA A PISTA
  // ------------------------------------------------------------------
  // Dizia: "alcança o engajamento; drivers/inclusão não têm recorte". A
  // segunda metade era verdade sobre a CONSULTA, não sobre o dado --
  // `survey_driver_scores` guarda 525 linhas por tempo de casa em três ondas
  // e 102 por modelo, e a query pedia só company e area.
  //
  // A Anna pediu os dois recortes. Com a consulta corrigida, eles funcionam
  // de verdade aqui, que é a condição para aparecerem nesta lista.
  // `marcaProduto` é a marca que a PESQUISA pergunta (Betnacional, Betfair,
  // Cross Brand), e não a entidade do seletor do topo. O cruzamento
  // 'area+marca' já era gravado em toda onda; faltava a barra oferecer.
  engagement: ['departamento', 'tempoCasa', 'modeloTrabalho', 'marcaProduto'],
  recruitment: ['departamento'],
  // Única que lê pessoa a pessoa com todas as dimensões.
  attrition: TODOS,
  // Meu Time agora aceita estreitar dentro do próprio escopo: um gestor de
  // duas áreas consegue olhar uma de cada vez. Mesma base do Comp Ratio, então
  // aceita as mesmas seis dimensões.
  team: ['departamento', 'level', 'tipoContrato', 'jobFamily', 'tempoCasa', 'faixaSalarial'],

  // Tem busca própria por pessoa; filtro de área não acrescenta.
  individual: [],
};

/**
 * Dentro de um agrupador, quem manda é a sub-aba.
 *
 * Sem isto, "Ciclo de vida" herdaria os sete filtros de Atrição e voltaria a
 * exibi-los em Recrutamento e Experiência, onde nenhum funciona -- exatamente
 * o problema que a separação por aba resolveu.
 */
const FILTERS_BY_SUBTAB: Record<string, FilterKey[]> = {
  // Compensação: Salários lê a série (só departamento recorta); Comp Ratio lê
  // o comp_ratio, que é por pessoa e aceita as quatro dimensões. Sem esta
  // distinção, os filtros de pessoa apareceriam em Salários sem efeito.
  custos: ['departamento'],
  compratio: ['departamento', 'level', 'tipoContrato', 'jobFamily', 'tempoCasa', 'faixaSalarial'],
  movimentacoes: ['departamento'],

  // ------------------------------------------------------------------
  // EXPERIÊNCIA: AS TRÊS SUB-ABAS NÃO RECORTAM IGUAL
  // ------------------------------------------------------------------
  // Faltavam aqui, então herdavam os três filtros da aba -- e dois deles não
  // existem fora de Engajamento. Achado na revisão pré-lançamento.
  //
  //   engajamento .. os três funcionam. `survey_cut_scores` e
  //                  `survey_driver_scores` guardam área, tempo de casa,
  //                  modelo e os cruzamentos entre eles.
  //   onboarding ... só área. A pesquisa é fatiada por `department`,
  //                  `overall` e `cohort_month`. Tempo de casa ali seria vazio
  //                  de sentido: quem está em onboarding tem 0-3 meses por
  //                  definição. Modelo não foi perguntado.
  //   inclusao ..... NENHUM. `experience_distributions` não tem coluna de
  //                  recorte -- é distribuição da empresa inteira, e o
  //                  servidor não a filtra por nada. O seletor de área
  //                  aparecia e não fazia efeito algum.
  engajamento: ['departamento', 'tempoCasa', 'modeloTrabalho', 'marcaProduto'],
  onboarding: ['departamento'],
  inclusao: [],
};

/**
 * Por que um filtro não se aplica a uma SUB-ABA.
 *
 * `FILTER_UNAVAILABLE_REASON` responde por aba e por natureza do dado. Estes
 * são mais específicos: dentro do mesmo agrupador, uma sub-aba recorta e a
 * outra não, e a diferença não é adivinhável de fora.
 */
const MOTIVO_POR_SUBABA: Record<string, string> = {
  onboarding:
    'A pesquisa de onboarding é fatiada por área, empresa e mês de entrada. Tempo de casa não recorta aqui porque quem está em onboarding tem 0-3 meses por definição, e modelo de trabalho não foi perguntado nela.',
  inclusao:
    'A pesquisa de inclusão guarda só a distribuição da empresa inteira: não há recorte gravado, nem por área. Recortar exigiria recoletar com a quebra.',
};

/**
 * Filtros que existem mas NÃO se aplicam à aba, com o motivo.
 *
 * A barra mostra estes esmaecidos em vez de sumir com eles: some sem
 * explicação faz parecer que o controle nunca existiu, e a pessoa não aprende
 * o limite -- volta a procurar o filtro na próxima vez.
 */
export const FILTER_UNAVAILABLE_REASON: Record<string, string> = {
  serie:
    'A série mensal guarda apenas a quebra por departamento. Para recortar por este critério seria preciso pré-calcular a quebra dele mês a mês.',
  pessoa:
    'Este recorte só existe nas bases por pessoa (comp ratio e desligados), não nesta aba.',
  escopo: 'Esta aba já vem escopada pelo seu perfil de acesso.',
};

/** Para cada aba, o que fica visível-porém-inativo e por quê. */
/** Por que os quatro fixos não recortam ESTA aba. */
const MOTIVO_POR_ABA: Partial<Record<DashboardTab, string>> = {
  individual:
    'Esta aba mostra uma pessoa por vez, encontrada pela busca. Recorte de conjunto não muda o que ela responde.',
};

export function unavailableFilters(
  tab: DashboardTab,
  subTab?: string | null,
): Array<{ key: FilterKey; reason: string }> {
  const ativos = new Set(filtersForTab(tab, subTab));
  const out: Array<{ key: FilterKey; reason: string }> = [];

  // ------------------------------------------------------------------
  // OS QUATRO FIXOS APARECEM SEMPRE -- ATIVOS OU ESMAECIDOS
  // ------------------------------------------------------------------
  // Antes, só três abas (dei, demographics, data) explicavam a ausência; nas
  // outras o controle simplesmente não existia, e "não recorta aqui" ficava
  // indistinguível de "esqueceram de pôr". Agora a fila é a mesma em toda aba
  // e a ausência tem motivo em todas.
  const motivoDaSubAba = subTab ? MOTIVO_POR_SUBABA[subTab] : undefined;
  const motivoDaAba = MOTIVO_POR_ABA[tab];
  for (const k of FILTROS_FIXOS) {
    if (ativos.has(k)) continue;
    out.push({
      key: k,
      reason: motivoDaSubAba
        ?? motivoDaAba
        // Departamento passa pelo applyDeptFilter e vale em toda aba que
        // consome a série; se ele cair aqui, não é a série que falta.
        ?? (k === 'departamento'
          ? FILTER_UNAVAILABLE_REASON.escopo
          : FILTER_UNAVAILABLE_REASON.serie),
    });
  }

  // O que a ABA oferece mas esta SUB-ABA não honra -- fora dos quatro fixos,
  // que já foram tratados acima. Sumir sem explicação faria a pessoa concluir
  // que o painel não recorta aquilo em lugar nenhum, quando recorta na sub-aba
  // ao lado.
  if (motivoDaSubAba) {
    for (const k of FILTERS_BY_TAB[tab] ?? []) {
      if (!ativos.has(k) && !out.some((o) => o.key === k)) {
        out.push({ key: k, reason: motivoDaSubAba });
      }
    }
  }
  return out;
}

export function filtersForTab(tab: DashboardTab, subTab?: string | null): FilterKey[] {
  const brutos = subTab && subTab in FILTERS_BY_SUBTAB
    ? FILTERS_BY_SUBTAB[subTab]
    : FILTERS_BY_TAB[tab] ?? ['departamento'];
  // A ordem da barra é uma só, e não a ordem em que cada lista foi digitada
  // aqui. Sem isto, "Contrato" aparece antes de "Job family" numa aba e depois
  // na outra, e a barra tem de ser relida a cada troca.
  return porOrdem(brutos);
}

/**
 * Recortes de dimensão única sobre a série mensal. No máximo UM ativo por vez.
 *
 * Combinar dois exigiria o cruzamento pré-calculado ("L4 E PJ" mês a mês), que
 * a série não guarda. Em vez de devolver número errado ou vazio silencioso, a
 * barra troca a seleção: escolher um limpa o outro, e diz isso.
 */
export const RECORTES_EXCLUSIVOS: FilterKey[] = ['level', 'tempoCasa', 'jobFamily', 'tipoContrato'];

/**
 * Os perfis DEIXARAM de se excluir. Esta lista ficou vazia de propósito.
 *
 * ------------------------------------------------------------------
 * O QUE ESTAVA ESCRITO AQUI, E POR QUE ESTAVA ERRADO
 * ------------------------------------------------------------------
 * "Tempo de casa e modelo continuam se excluindo entre si: o cruzamento é
 * SEMPRE com área, e não há 'tempo+modelo'. Cruzar três dimensões deixaria
 * quase toda combinação abaixo do mínimo de cinco respostas, então nem foi
 * gravado."
 *
 * A primeira metade era verdade sobre o banco. A segunda era um palpite meu,
 * escrito com a mesma cara de fato -- e, medido em ago/26, errado nos dois
 * sentidos:
 *
 *   tempo+modelo .......... 20 de  20 combinações viáveis (100%), cobrindo
 *                           100% das pessoas. O MELHOR cruzamento do painel,
 *                           descartado sem contar. Nem são três dimensões:
 *                           são duas.
 *   area+tempo+modelo ..... 29 de 106 (27%), cobrindo 69% das pessoas. Aqui o
 *                           palpite acertou a direção e errou o tamanho: 69%
 *                           não é "quase nada".
 *
 * Os dois passaram a ser gravados e a exclusão perdeu a razão de existir. A
 * lista fica -- vazia -- porque `aplicarFiltro` a consulta, e porque apagá-la
 * apagaria junto o registro de que isto já foi uma restrição inventada.
 */
export const PERFIS_EXCLUSIVOS: FilterKey[] = [];

