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
 * ===========================================================================
 * 10/09: TODOS OS RECORTES FORAM DESLIGADOS, A PEDIDO. SÓ DEPARTAMENTO FICOU.
 * ===========================================================================
 * Decisão da Carolina, depois de um dia inteiro encontrando filtros que
 * acendiam e não filtravam: "nenhum filtro funciona!!! remova todos, deixe só
 * departamento."
 *
 * O que estava de fato quebrado, medido no banco na hora da decisão:
 *
 *   job family ..... FUNCIONAVA (152 pessoas em Product & Technology)
 *   level .......... FUNCIONAVA (75 em L5)
 *   contrato ....... `contract_base` com um único valor, "Não informado" --
 *                    o vínculo era lido da listagem, onde vem nulo. Corrigido
 *                    no código; o dado só muda na próxima gravação.
 *   tempo de casa .. a série gravada tem a régua antiga (0-6 / 2-4 / 4+) e o
 *                    seletor oferecia a nova. Mesma pendência.
 *
 * Ou seja: dois funcionavam e dois dependiam de uma execução da carga que não
 * aconteceu. A decisão de tirar os quatro foi tomada com essa informação na
 * mesa -- e é dela, não minha. Confiança em painel se perde por acumulação, e
 * ela já tinha gastado a dela.
 *
 * ---------------------------------------------------------------------------
 * COMO VOLTAR
 * ---------------------------------------------------------------------------
 * Nada foi apagado. `applySeriesFilter`, `useRecorteDeSerie`, as quebras por
 * família/contrato/tempo e as opções derivadas do dado continuam no lugar e
 * com testes. Voltar é acrescentar a chave de novo às listas abaixo -- e a
 * verificação em `tab-filters.test.ts` continua cobrando que quem declara,
 * aplique.
 *
 * Antes de voltar qualquer um: rodar a carga e conferir no banco que a coluna
 * correspondente tem mais de um valor. Foi a ausência dessa conferência que
 * produziu o dia de hoje.
 */
export const FILTROS_FIXOS: FilterKey[] = [
  'departamento',
];

/**
 * A ordem de tudo. Hoje só departamento aparece, mas a fila continua escrita:
 * ela é a decisão de POSIÇÃO ("job family sempre em segundo"), que sobrevive a
 * quais filtros estão ligados. Reduzi-la agora obrigaria a redescobrir a ordem
 * depois.
 */
export const ORDEM_DA_BARRA: FilterKey[] = [
  'departamento',
  'jobFamily',
  'tipoContrato',
  'tempoCasa',
  'level',
  'faixaSalarial',
  'tipoDesligamento',
  'modeloTrabalho',
  'marcaProduto',
];

const porOrdem = (ks: readonly FilterKey[]): FilterKey[] =>
  ORDEM_DA_BARRA.filter((k) => ks.includes(k));

/**
 * O que Atrição & Desligamentos SABE recortar, guardado para quando voltar.
 *
 * Não está em uso desde 10/09 -- ver a nota em FILTROS_FIXOS. Fica aqui, e não
 * apagada, porque esta lista é conhecimento medido: cada chave só entrou nela
 * depois de alguém verificar que `LeaverRecord` tem o campo e que a aba o lê.
 * `modeloTrabalho`, por exemplo, foi TIRADO em 09/09 por não passar nesse teste.
 *
 * Reconstruir isso do zero custaria a mesma investigação de novo.
 */
export const RECORTES_DE_ATRICAO: FilterKey[] = [
  'departamento',
  'jobFamily',
  'tempoCasa',
  'tipoContrato',
  'faixaSalarial',
  'tipoDesligamento',
  'level',
];

export const FILTERS_BY_TAB: Record<DashboardTab, FilterKey[]> = {
  // TODOS reduzidos a departamento em 10/09. Ver a nota em FILTROS_FIXOS: o
  // que cada aba SABIA recortar está registrado no histórico do git e nos
  // testes, e voltar é acrescentar a chave de novo aqui.
  overview: ['departamento'],
  data: ['departamento'],
  comp: ['departamento'],
  dei: ['departamento'],
  demographics: ['departamento'],
  span: ['departamento'],
  engagement: ['departamento'],
  recruitment: ['departamento'],
  attrition: ['departamento'],
  team: ['departamento'],
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
  // Reduzidas junto com as abas, em 10/09.
  custos: ['departamento'],
  compratio: ['departamento'],
  movimentacoes: ['departamento'],
  engajamento: ['departamento'],
  onboarding: ['departamento'],
  // `experience_distributions` não tem coluna de recorte: o servidor não a
  // filtra por nada, nem por área. Esta continua vazia por um motivo próprio,
  // que não é o desligamento geral dos filtros.
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
 * Abas que de fato APLICAM o recorte de dimensão (`useRecorteDeSerie`).
 *
 * ===========================================================================
 * POR QUE ESTA LISTA EXISTE
 * ===========================================================================
 * Declarar o filtro aqui e aplicá-lo no componente eram duas coisas separadas,
 * e nada ligava as duas. Em 10/09 eu acrescentei `jobFamily`, `tipoContrato` e
 * `tempoCasa` a `dei` e `demographics` -- e esqueci que só o `OverviewTab`
 * chamava `applySeriesFilter`. Os seletores acenderam, e nenhum filtrava.
 *
 * Foi o defeito que este arquivo inteiro existe para impedir, cometido dentro
 * dele. A lição não é "prestar mais atenção": é que a declaração e a
 * implementação precisavam de um fio entre elas.
 *
 * Este é o fio. O teste em `tab-filters.test.ts` cobra: toda aba que oferece
 * um recorte de dimensão tem de estar aqui, e toda aba daqui tem de oferecer
 * pelo menos um. Acrescentar `jobFamily` a uma aba nova sem chamar o hook
 * quebra a verificação, em vez de virar um seletor morto que alguém descobre
 * olhando a tela.
 *
 * Atrição fica de FORA: ela lê pessoa a pessoa, com o cruzamento real, e não
 * passa por `applySeriesFilter`. Compensação e Meu Time também -- mesma razão.
 */
// Vazia desde 10/09: nenhuma aba oferece recorte de dimensão. Os componentes
// continuam chamando `useRecorteDeSerie`, que não encontra nada oferecido e
// devolve a série intacta -- é assim que voltar um filtro volta a funcionar
// sozinho, sem religar fiação.
export const ABAS_QUE_APLICAM_RECORTE: DashboardTab[] = [];

/** As abas que leem pessoa a pessoa: recortam de verdade, por outro caminho. */
export const ABAS_PESSOA_A_PESSOA: DashboardTab[] = [];

/**
 * Abas cujo recorte acontece no SERVIDOR, na própria server function.
 *
 * Terceiro caminho, e eu não sabia que ele existia até o teste acima apontar:
 * Engajamento oferece tempo de casa, modelo e marca, e nenhum deles passa por
 * `applySeriesFilter` -- a consulta a `survey_cut_scores` já traz o recorte
 * pronto. Funciona de verdade; só não funciona por aqui.
 *
 * A lista existe para que a verificação distinga "recorta por outro caminho"
 * de "não recorta". Sem ela, o teste acusaria Engajamento e a resposta seria
 * silenciá-lo -- que é como uma verificação boa vira ruído e depois some.
 */
export const ABAS_FILTRADAS_NO_SERVIDOR: DashboardTab[] = [];

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

