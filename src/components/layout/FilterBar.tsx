import { useState, useMemo } from "react";
import { useDashboard, Filters } from "@/data/DashboardContext";
import { useRecorteDeSerie } from "@/data/use-series-cut";
import { RACE_ORDER } from "@/lib/race-order";
import { opcoesDoDado } from "@/data/opcoes-de-filtro";
import { COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { SCOPE_TO_DEPT } from "@/lib/engagement-context";
import { TEMPO_ORDEM, CROSS_BRAND } from "@/lib/aggregator/polly-survey";
import { isGlobalProfile, normalizeDept } from "@/lib/permissions";
import { aplicarFiltro } from "@/lib/aplicar-filtro";
import {
  filtersForTab,
  unavailableFilters,
  FILTER_LABELS,
  RECORTES_EXCLUSIVOS,
  ORDEM_DA_BARRA,
  type FilterKey,
} from "@/lib/tab-filters";
import { Lock, SlidersHorizontal, X } from "lucide-react";

/**
 * Barra de filtros.
 *
 * Três decisões, todas vindas de problemas reais observados na tela:
 *
 * 1. MOSTRA SÓ O QUE A ABA APLICA (ver tab-filters.ts). Antes exibia os sete em
 *    todas as abas, e seis deles só funcionam em Atrição & Desligamentos. A
 *    pessoa filtrava, nada acontecia, e a tela não avisava.
 *
 * 2. OS SELETORES FICAM VISÍVEIS, SEMPRE. Antes a barra vinha recolhida atrás
 *    de um botão "Filtros", com a justificativa de que uma linha de controles
 *    dizendo "Todos" ocupa espaço permanente para o estado padrão.
 *
 *    Trocado a pedido: "deixa os filtros visíveis direto, não precisa ter que
 *    clicar em Filtros para eles aparecerem e aí você selecionar". O
 *    argumento antigo mede o custo de quem NÃO vai filtrar; o de quem vai
 *    pagava dois cliques e, pior, precisava adivinhar que existiam recortes
 *    ali dentro. Controle escondido é controle que a maioria nunca descobre.
 *
 * 3. O QUE ESTÁ ATIVO VIRA ETIQUETA REMOVÍVEL, sempre visível. O problema
 *    anterior: você filtrava um departamento, mudava de aba, e o filtro
 *    continuava valendo sem nada gritar isso -- levando a ler o número de uma
 *    área achando que era o da empresa.
 */

const BRAND_COLORS: Record<string, string> = {
  combined: COLORS.flutter,
  NSX: COLORS.nsx,
  "Betfair BR": COLORS.betfair,
  "Flutter International": COLORS.flutter,
  Porto: COLORS.flutter,
};

/**
 * As áreas que a pesquisa de fato tem, derivadas do mapa que o resto do painel
 * usa -- e não digitadas aqui.
 *
 * ------------------------------------------------------------------
 * A CONTA DA ANNA MOSTROU O PROBLEMA
 * ------------------------------------------------------------------
 * O escopo dela lista treze departamentos, e cinco deles não são áreas:
 * CW GROUP, DIRETORIA, PORTO, TECHNOLOGY GROUP e SEM DEPTO. Eles vêm do
 * organograma, onde são linhas legítimas; na pesquisa não existem. O filtro
 * os oferecia, e escolher qualquer um devolvia tela vazia.
 *
 * Derivar de SCOPE_TO_DEPT resolve os dois lados: a lista para de ser uma
 * cópia manual que envelhece, e o que não é área não entra.
 */
const AREAS_DA_PESQUISA = [...new Set(Object.values(SCOPE_TO_DEPT))].sort();

/**
 * As marcas DA PESQUISA, que não são as do seletor do topo.
 *
 * ------------------------------------------------------------------
 * ENTIDADE E MARCA DE PRODUTO SÃO EIXOS DIFERENTES
 * ------------------------------------------------------------------
 * O seletor do topo tem NSX, Betfair BR e Flutter International: são
 * ENTIDADES, tiradas da razão social no headcount. A pesquisa é anônima e não
 * pergunta entidade -- ela pergunta qual MARCA a pessoa atende, e as respostas
 * são Betnacional, Betfair e "Ambas / Função cross-brand".
 *
 * Pôr os nomes do topo aqui daria um seletor onde escolher "NSX" não encontra
 * linha nenhuma, e vazio na tela se lê como "ninguém desta marca respondeu".
 * "NSX BETFAIR BRASIL S.A." é o lembrete de que os dois vocabulários se
 * parecem o bastante para alguém tentar mapear um no outro.
 *
 * `CROSS_BRAND` vem do agregador, e não escrito à mão: foi renomeado uma vez
 * ("Ambas" -> "Cross Brand", pedido da Marilia) e uma cópia aqui teria ficado
 * para trás.
 */
const MARCAS_DA_PESQUISA = ["Todos", "Betnacional", "Betfair", CROSS_BRAND];

/**
 * "Todos" na frente, sem duplicar.
 *
 * As listas derivadas do dado não trazem o sentinela -- ele é da barra, não do
 * cadastro. Sem esta função, ou o "Todos" some (e não há como limpar o filtro)
 * ou aparece duas vezes.
 */
const comTodos = (vs: string[]): string[] =>
  vs[0] === "Todos" ? vs : ["Todos", ...vs];

/**
 * A RESERVA, não a fonte.
 *
 * Estas listas eram a fonte da verdade e divergiam do que a carga grava -- ver
 * a nota em `opcoes-de-filtro.ts`. Hoje valem só para o que não vem da série
 * (pesquisa) e para o instante antes de a série carregar.
 */
const filterOptions: Record<FilterKey, string[]> = {
  departamento: ["Todos", ...AREAS_DA_PESQUISA],
  jobFamily: [
    "Todos",
    "Commercial & Marketing",
    "Customer Operations",
    "Product & Technology",
    "Finance",
    "Legal",
    "Leadership (Executive) SR and C-Levels (reporting to CEO or N-3)",
    "Other (Property, Security, Cleaning)",
    "HR",
  ],
  tempoCasa: ["Todos", "0-3 meses", "3-6 meses", "6-12 meses", "1-2 anos", "2-5 anos", "5+ anos"],
  tipoContrato: ["Todos", "CLT", "Pessoa Jurídica", "Sócio"],
  faixaSalarial: ["Todos", "Até 3k", "3k-5k", "5k-8k", "8k-12k", "12k-20k", "20k-50k", "50k+"],
  tipoDesligamento: [
    "Todos",
    "Voluntário",
    "Involuntário",
    "Acordo",
    "Término de Contrato",
    "Outros",
  ],
  level: ["Todos", "L0", "L1", "L2", "L3", "L4", "L5", "L6", "L8"],
  modeloTrabalho: ["Todos", "Presencial", "Híbrido", "Remoto"],
  marcaProduto: MARCAS_DA_PESQUISA,
};

/**
 * As faixas de tempo de casa DA PESQUISA não são as do headcount.
 *
 * ------------------------------------------------------------------
 * DUAS ESCADAS COM O MESMO NOME
 * ------------------------------------------------------------------
 * `filterOptions.tempoCasa` acima é a escada das bases por pessoa: 6-12 meses,
 * 1-2 anos, 2-5 anos, 5+ anos. A pesquisa pergunta outra coisa: 6-9, 9-12,
 * 12-18, 18-24, 24+ meses.
 *
 * Reusar a lista de cima na aba de Engajamento daria um seletor onde escolher
 * "1-2 anos" não encontra nada -- um filtro que parece funcionar e devolve
 * vazio, que é pior que filtro ausente. Peguei isto ANTES de ligar o filtro,
 * conferindo `TEMPO_ORDEM`; se tivesse ligado primeiro, o sintoma seria uma
 * tela em branco sem explicação.
 */
const TEMPO_DA_PESQUISA = ["Todos", ...TEMPO_ORDEM];

const VAZIO: Filters = {
  marcaProduto: "Todos",
  jobFamily: "Todos",
  departamento: "Todos",
  tempoCasa: "Todos",
  centroCusto: "Todos",
  tipoContrato: "Todos",
  faixaSalarial: "Todos",
  tipoDesligamento: "Todos",
  modeloTrabalho: "Todos",
  level: "Todos",
};

export default function FilterBar() {
  const {
    filters, setFilters, brand, activeTab, activeSubTab, serieSemRecorteDeArea, leavers,
    raceFilter, setRaceFilter,
  } = useDashboard();
  const { profile, departments, jobFamilies } = useAuth();

  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;
  const disponiveis = filtersForTab(activeTab, activeSubTab);
  const indisponiveis = unavailableFilters(activeTab, activeSubTab);

  /**
   * As raças com gente nesta fatia, na aba DEI -- mesmo cálculo do DEITab
   * (`race_cross`, `RACE_ORDER`), porque o seletor está fisicamente aqui
   * agora mas continua sendo o filtro da aba DEI. `useRecorteDeSerie('dei')`
   * é barato: não refaz fetch, só recorta o que o contexto já tem.
   */
  const { currentData: deiData } = useRecorteDeSerie('dei');
  const racasComGente = Object.entries(deiData?.race_cross || {})
    .filter(([, v]) => v.total > 0)
    .map(([race]) => race)
    .sort((a, b) => RACE_ORDER.indexOf(a) - RACE_ORDER.indexOf(b));

  /**
   * A barra inteira, já na ordem: ativos e esmaecidos misturados, ordenados
   * por `ORDEM_DA_BARRA`. `reason` preenchido = esmaecido.
   *
   * Ordenar aqui, e não em dois `map` separados, é o que garante que os quatro
   * fixos fiquem nas quatro primeiras posições em toda aba.
   */
  const barra: Array<{ key: FilterKey; reason: string | null }> = ORDEM_DA_BARRA
    .map((k) => ({
      key: k,
      reason: disponiveis.includes(k)
        ? null
        : indisponiveis.find((i) => i.key === k)?.reason ?? undefined,
    }))
    .filter((x): x is { key: FilterKey; reason: string | null } => x.reason !== undefined);

  // ------------------------------------------------------------------
  // PARA QUEM TEM ESCOPO, "TODOS" NAO EXISTE
  // ------------------------------------------------------------------
  // A lista ja vinha restrita aos departamentos atendidos, mas mantinha
  // "Todos" no topo. Escolher "Todos" nao vazava nada -- o servidor cai na
  // propria area de qualquer jeito -- e era exatamente esse o problema: a
  // tela dizia "Todos" e mostrava UMA area. Um rotulo que descreve errado o
  // que esta na tela e pior que um controle ausente, porque ninguem
  // desconfia de um numero que acha que entendeu.
  //
  // O mesmo vale para job family: o escopo e a UNIAO dos dois criterios, e
  // deixar um deles aberto tornaria o outro decorativo.
  const scoped = !!profile && !isGlobalProfile(profile);
  const meusDepts = departments
    .map(normalizeDept)
    .filter(Boolean)
    // Fora os que não são área. Ver AREAS_DA_PESQUISA. Se sobrar nada, mantém
    // a lista crua: melhor um seletor estranho que um seletor vazio, e o
    // servidor recusa o que a pessoa não pode ver de qualquer forma.
    .filter((d, _i, todos) =>
      todos.some((x) => AREAS_DA_PESQUISA.includes(x)) ? AREAS_DA_PESQUISA.includes(d) : true);

  /**
   * Escopo que alcança TODAS as áreas não tem o que travar.
   *
   * ------------------------------------------------------------------
   * LISTAR TUDO NÃO É O MESMO QUE SER GLOBAL, E ISSO VAZOU PARA A TELA
   * ------------------------------------------------------------------
   * Para dar acesso amplo à Anna, alguém listou todos os departamentos na
   * conta dela. Só que o perfil continua "com escopo", então o filtro travava
   * na primeira área em ordem alfabética -- COMMERCIAL -- e ela abria o painel
   * preso num departamento, com uma lista diferente da que a Marilia vê. Foi
   * exatamente o que ela relatou.
   *
   * A PERMISSÃO NÃO MUDA AQUI, e não deveria: `isInScope` devolve false quando
   * não há critério nenhum, de propósito, e afrouxar isso faria um cadastro
   * incompleto virar acesso total. O que muda é só o controle: quem já pode
   * ver todas as áreas não ganha nada com um cadeado, e perde a opção "Todos".
   */
  const cobreTodasAsAreas =
    scoped && AREAS_DA_PESQUISA.every((a) => meusDepts.includes(a));
  const minhasFamilias = (jobFamilies ?? []).filter(Boolean);

  // ------------------------------------------------------------------
  // O VOCABULÁRIO VEM DO DADO, NÃO DESTE ARQUIVO
  // ------------------------------------------------------------------
  // As listas em `filterOptions` divergiam do que a carga grava -- em TODOS os
  // filtros, cada um do seu jeito. Medido em 10/09: o seletor de tempo de casa
  // oferecia quatro faixas que não existiam em mês nenhum, o de level escondia
  // 178 pessoas (L7, L9 e NA), o de contrato escondia 14 e o de job family
  // escondia "Data & Analytics".
  //
  // `opcoesDoDado` lê as chaves que a própria carga escreveu. `filterOptions`
  // continua como reserva para o que não vem da série (pesquisa) e para o
  // instante antes de a série carregar. Ver `opcoes-de-filtro.ts`.
  const doDado = useMemo(
    () => opcoesDoDado(serieSemRecorteDeArea ?? [], leavers ?? []),
    [serieSemRecorteDeArea, leavers],
  );

  const opcoes = (k: FilterKey): string[] => {
    // Ver TEMPO_DA_PESQUISA: mesma chave de filtro, escadas diferentes.
    if (k === "tempoCasa" && activeTab === "engagement") return TEMPO_DA_PESQUISA;
    // O escopo do perfil manda ANTES do vocabulário: ele é permissão, e não
    // catálogo. Quem só enxerga duas áreas não pode receber a lista inteira só
    // porque ela agora vem do dado.
    if (scoped && k === "departamento") {
      return cobreTodasAsAreas ? comTodos(doDado.departamento ?? filterOptions[k]) : meusDepts;
    }
    if (scoped && k === "jobFamily" && minhasFamilias.length > 0) return minhasFamilias;
    const derivadas = doDado[k];
    return derivadas ? comTodos(derivadas) : filterOptions[k];
  };

  /**
   * Filtro que a pessoa nao pode desligar.
   *
   * Para perfil com escopo, o departamento nao e uma escolha: e quem ela e.
   * A etiqueta continua visivel -- ela explica de onde vem o numero -- mas sem
   * o "x", que so produziria a volta ao mesmo valor um instante depois.
   */
  const travado = (k: FilterKey) =>
    scoped && k === "departamento" && !cobreTodasAsAreas;

  /** Com uma area so, o seletor tem uma opcao. Vira texto, nao controle. */
  const semEscolhaDeDept = scoped && !cobreTodasAsAreas && meusDepts.length <= 1;

  // Todo filtro ligado aparece, sempre -- mesmo quando esta aba não o aplica.
  //
  // A versão anterior mostrava só os da aba atual. Parecia mais limpo e criou um
  // bug feio: o filtro continuava valendo invisível. Filtrar "contrato = CLT" em
  // Atrição e voltar ao Overview jogava o Overview na visão reduzida, sem nada
  // na tela explicando por quê -- lia-se como "os indicadores pararam de
  // funcionar". Estado que muda o que você vê não pode ficar escondido.
  const TODAS: FilterKey[] = [
    "departamento",
    "jobFamily",
    "tempoCasa",
    "tipoContrato",
    "faixaSalarial",
    "tipoDesligamento",
    "level",
  ];
  const ativos = disponiveis.filter((k) => filters[k] !== "Todos");
  const ativosForaDaAba = TODAS.filter((k) => filters[k] !== "Todos" && !disponiveis.includes(k));

  /**
   * O que foi zerado na última mudança, para a barra poder dizer.
   *
   * ------------------------------------------------------------------
   * O VALOR SUMIA EM SILÊNCIO
   * ------------------------------------------------------------------
   * Chegou como "os filtros não estão se cruzando": escolher tempo de casa
   * fazia modelo de trabalho voltar para "Todos", calado. Quem vê um valor
   * sumir sozinho conclui que o conjunto todo não combina -- e para de tentar
   * as combinações que funcionam.
   *
   * Na PESQUISA isso deixou de acontecer: área, tempo de casa e modelo se
   * somam, porque os cruzamentos passaram a ser gravados. Sobrou um caso só, e
   * ele é da SÉRIE MENSAL -- nível × tempo de casa --, que é outro dado e
   * continua sem o cruzamento pré-calculado.
   *
   * O aviso fica porque o caso que sobrou é justamente o que confunde: um
   * seletor voltando sozinho, numa tela onde os outros somam.
   */
  const [aviso, setAviso] = useState<string | null>(null);

  const set = (key: FilterKey, value: string) => {
    // A regra mora em `lib/aplicar-filtro.ts`, com teste. Dentro do componente
    // a única forma de conferir era ler o `if` e torcer.
    const { filtros, limpos } = aplicarFiltro(filters, key, value, activeTab);
    setAviso(
      limpos.length
        ? `${limpos.map((k) => FILTER_LABELS[k]).join(' e ')} ${
            limpos.length > 1 ? 'voltaram' : 'voltou'
          } para Todos: a série mensal não guarda o cruzamento ${
            limpos.length > 1 ? 'entre eles' : 'com ' + FILTER_LABELS[key]
          }. Na aba de Engajamento, área, tempo de casa e modelo se somam.`
        : null,
    );
    setFilters(filtros);
  };
  const limparUm = (key: FilterKey) => set(key, "Todos");
  const limparTudo = () =>
    // Preserva o que a pessoa nao tem direito de desligar. Sem isto,
    // "limpar todos" apagaria o departamento e o servidor o devolveria --
    // um botao que parece nao funcionar.
    setFilters({ ...VAZIO, departamento: scoped ? filters.departamento : "Todos" });

  // Aba sem nada filtrável: a barra some. Melhor que oferecer controle inerte.
  if (disponiveis.length === 0) return null;

  return (
    <div className="px-4 md:px-7 py-2 bg-card border-b border-border">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Deixou de ser botão: não há mais nada para abrir. Fica como âncora
            visual da barra e como lugar do contador. */}
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtros
          {ativos.length + ativosForaDaAba.length > 0 && (
            <span
              className="rounded-full px-1.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: brandColor }}
            >
              {ativos.length + ativosForaDaAba.length}
            </span>
          )}
        </span>

        {/* ------------------------------------------------------------
            ETIQUETA OU SELETOR, NUNCA OS DOIS
            ------------------------------------------------------------
            Com os seletores sempre visíveis, o chip "Departamento: TECHNOLOGY"
            passou a ser a mesma informação duas vezes na mesma linha. Sai.

            Os de OUTRAS abas continuam: não existe seletor aqui para
            representá-los, e sumir com eles esconderia um filtro ativo. */}
        {ativosForaDaAba.map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-amber-500/50 px-2 py-1 text-[11px] shrink-0"
            title="Ativo em outra aba. Não recorta esta, mas continua valendo onde se aplica."
          >
            <span className="text-amber-600 dark:text-amber-500">{FILTER_LABELS[k]}:</span>
            <span className="max-w-[140px] truncate">{filters[k]}</span>
            <span className="text-muted-foreground">· não aplicado aqui</span>
            <button
              onClick={() => limparUm(k)}
              aria-label={`Remover filtro ${FILTER_LABELS[k]}`}
              className="rounded-full hover:bg-background/60 p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {aviso && (
          <span className="text-[11px] text-amber-600 dark:text-amber-500 basis-full">
            {aviso}
          </span>
        )}

        {ativos.length + ativosForaDaAba.length > 1 && (
          <button
            onClick={limparTudo}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0"
          >
            limpar todos
          </button>
        )}

        {ativos.length + ativosForaDaAba.length === 0 && !scoped && (
          <span className="text-[11px] text-muted-foreground">Mostrando a empresa toda.</span>
        )}

        {RECORTES_EXCLUSIVOS.some((k) => disponiveis.includes(k) && filters[k] !== "Todos") && (
          <span className="text-[11px] text-amber-600 dark:text-amber-500">
            recorte único — só headcount, saídas e atrição
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2">
            {/* ------------------------------------------------------------
              UMA FILA SÓ, NA MESMA ORDEM EM TODA ABA
              ------------------------------------------------------------
              Antes eram duas listas: os ativos e, depois de todos eles, os
              esmaecidos. O efeito era que a MESMA aba mudava a posição do
              mesmo controle conforme ele recortasse ou não -- "Tempo de casa"
              em segundo lugar aqui e em quinto ali.

              Agora Departamento, Job family, Contrato e Tempo de casa ocupam
              sempre as quatro primeiras posições, ativos ou esmaecidos, e os
              extras da aba vêm atrás. Esmaecido continua sendo esmaecido: ele
              informa o limite, não some. */}
            {barra.map(({ key: k, reason }) => (reason ? (
              <div key={k} className="flex items-center gap-1.5 opacity-45" title={reason}>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                  {FILTER_LABELS[k]}
                </label>
                <div className="border border-dashed border-border rounded px-2 py-1 text-[11px] text-muted-foreground min-w-[140px] max-w-[200px] cursor-help">
                  não se aplica aqui
                </div>
              </div>
            ) : (
              <div key={k} className="flex items-center gap-1.5">
                {/* Prefixo na mesma linha, e não rótulo em cima: com um filtro
                  só, o rótulo empilhado custava uma linha inteira da barra. */}
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                  {FILTER_LABELS[k]}
                </label>
                {k === "departamento" && semEscolhaDeDept ? (
                  <div
                    className="rounded border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground min-w-[140px] max-w-[200px]"
                    title="Definido pelo seu acesso — não é uma escolha."
                  >
                    {meusDepts[0] ?? "sem área atribuída"}
                  </div>
                ) : (
                  <select
                    value={filters[k]}
                    onChange={(e) => set(k, e.target.value)}
                    className={cn(
                      // max-w evita que "Leadership (Executive) SR and C-Levels..."
                      // estique o seletor e empurre o resto para fora da tela --
                      // era a causa direta da rolagem horizontal.
                      "bg-secondary border rounded px-2 py-1 text-[11px] text-foreground",
                      "min-w-[140px] max-w-[200px]",
                      filters[k] !== "Todos" ? "ring-1" : "border-border",
                    )}
                    style={
                      filters[k] !== "Todos"
                        ? ({
                            borderColor: brandColor,
                            "--tw-ring-color": brandColor,
                          } as React.CSSProperties)
                        : undefined
                    }
                  >
                    {opcoes(k).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )))}
            {/* ------------------------------------------------------------
              RAÇA: SÓ NA ABA DEI, MESMO ESTILO DOS FIXOS ACIMA
              ------------------------------------------------------------
              Não é um FilterKey -- não passa por `aplicarFiltro`, não recorta
              a série, só escolhe a fatia de `race_cross` (já carregada) que
              os 4 KPIs da aba leem. Por isso fica fora de `barra`, mas com a
              MESMA classe de seletor: pedido foi "morar no mesmo lugar do
              filtro de departamento, visualmente" -- e "visualmente" aqui
              quer dizer também "não parecer um controle de segunda classe". */}
            {activeTab === "dei" && racasComGente.length > 0 && (
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                  Raça
                </label>
                <select
                  value={raceFilter}
                  onChange={(e) => setRaceFilter(e.target.value)}
                  className={cn(
                    "bg-secondary border rounded px-2 py-1 text-[11px] text-foreground",
                    "min-w-[140px] max-w-[200px]",
                    raceFilter !== "Todas" ? "ring-1" : "border-border",
                  )}
                  style={
                    raceFilter !== "Todas"
                      ? ({
                          borderColor: brandColor,
                          "--tw-ring-color": brandColor,
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  {["Todas", ...racasComGente].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            )}
        </div>
      </div>

      {/*
        AQUI HAVIA UM PARÁGRAFO EXPLICANDO A BARRA. SAIU EM 10/09.
        --------------------------------------------------------------------
        Ele repetia, em bloco e em toda aba, o que o motivo de cada filtro já
        diz no hover -- e cobrava a leitura de quatro linhas de quem só queria
        trocar um seletor.

        E tinha virado mentira: afirmava que "nas abas de série mensal só o
        departamento recorta, porque a série é pré-agregada e guarda apenas
        essa quebra". Era verdade quando foi escrito; desde a migração
        20260910030000 a série guarda também `family_breakdown`,
        `contract_breakdown` e `tenure_breakdown`, e os três recortam em
        Demográficos e DEI.

        É o motivo pelo qual explicação genérica não vale a pena: ela não fica
        ao lado do que descreve, então ninguém a atualiza junto. O motivo por
        filtro vive em `tab-filters.ts`, colado na decisão que o gera, e muda
        junto com ela.
      */}
    </div>
  );
}
