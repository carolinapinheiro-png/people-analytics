import { useMemo, useState } from "react";
import { Info, ChevronDown } from "lucide-react";
import AreaDriverPanel from "@/components/dashboard/AreaDriverPanel";
import type { DriverPorRecorte } from "@/lib/survey.functions";
import ChartCard from "@/components/dashboard/ChartCard";
import { COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { classifyAreas, type Veredito } from "@/lib/area-priority";
import { historicoPorArea, type HistoricoDeArea } from "@/lib/analise-engajamento";
import type { OndaEnps } from "@/lib/experience.functions";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { EngagementContextRow } from "@/lib/engagement-context";
import type { SurveyCut } from "@/lib/survey.functions";

/**
 * Uma lista por área, ordenada por prioridade. Substitui três visões.
 *
 * ------------------------------------------------------------------
 * O QUE ISTO SUBSTITUI, E POR QUÊ
 * ------------------------------------------------------------------
 * A aba mostrava o eNPS por área em TRÊS lugares: uma matriz de dispersão, um
 * gráfico de barras e uma tabela de oito colunas. Os três com o mesmo dado, e
 * nenhum dizendo o que fazer.
 *
 * A dispersão era a pior das três para o uso real. Ela é excelente para achar
 * padrão num conjunto grande, e aqui há oito pontos -- não existe padrão a
 * achar em oito pontos, existe uma ordem a estabelecer. Além disso obriga a
 * ler dois eixos e cruzar de cabeça, e o que a pessoa quer saber é simples:
 * quem primeiro.
 *
 * Uma lista ordenada responde isso sem exigir leitura de eixo. A barra dá a
 * grandeza, a cor dá o risco, o rótulo dá o veredito, e a ordem dá a resposta.
 *
 * ------------------------------------------------------------------
 * COMO A ORDEM É DEFINIDA
 * ------------------------------------------------------------------
 * Não é por eNPS. O exemplo que motivou a regra, em JAN/26: Legal tinha eNPS 47,
 * o pior da empresa, e ao mesmo tempo o MENOR risco de saída de todas (6,7%),
 * com 15 pessoas. Agir ali primeiro seria gastar esforço onde ninguém estava de
 * saída.
 *
 * Os números acima são de jan/26 e NÃO valem mais -- em ago/26 Legal está em 69
 * e continua com o menor risco (6,3%). Ficam datados de propósito: o raciocínio
 * que eles ilustram continua válido, e um exemplo sem data vira, três ondas
 * depois, uma afirmação errada sobre o presente.
 *
 * A regra de classificação vive em lib/area-priority.ts, compartilhada com a
 * leitura do topo da aba -- as duas precisam dizer a mesma coisa, e duas cópias
 * da mesma regra divergem no primeiro ajuste.
 */

/**
 * O n vem de survey_cut_scores e o nome da area de engagement_scores. As duas
 * fontes escrevem o mesmo departamento com grafias que so coincidem por sorte
 * -- espaco extra, caixa, acento. Quando nao coincidiam, a coluna inteira
 * exibia "--", com o rodape logo abaixo mandando reparar no n.
 *
 * Comparar pela forma normalizada e inofensivo quando os nomes ja batem, e
 * resolve quando nao batem.
 */
const chave = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

const fmt1 = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

const VEREDITO: Record<Veredito, { label: string; cor: string; explica: string }> = {
  agir: {
    label: "Agir primeiro",
    cor: COLORS.danger,
    explica:
      "Engajamento claramente abaixo do grupo E risco de saída claramente acima. É a combinação que mais vira saída nos meses seguintes.",
  },
  vigiar: {
    label: "Engajados, mas de saída",
    cor: COLORS.warning,
    explica:
      "Risco de saída acima do grupo sem engajamento baixo. Gostam da empresa e ainda assim pensam em sair — costuma ser carreira ou remuneração, não clima.",
  },
  ouvir: {
    label: "Vale ouvir",
    cor: COLORS.info,
    explica:
      "Engajamento abaixo do grupo, mas sem intenção de sair. Tende a aparecer na entrega antes de aparecer como turnover.",
  },
  manter: {
    label: "Sem sinal de alerta",
    cor: COLORS.success,
    explica:
      "Nem engajamento claramente abaixo do grupo, nem risco claramente acima. Não quer dizer que está tudo ótimo — quer dizer que nada aqui se destaca a ponto de pedir ação agora.",
  },
  // Este rótulo aparece quando o filtro deixa uma área só. Antes, a mesma área
  // caía em "Sem sinal de alerta" -- a mediana era o próprio valor dela, então
  // nada ficava abaixo de nada. Filtrar Marketing transformava "agir primeiro"
  // em "sem sinal", com os números idênticos na tela.
  "sem-comparacao": {
    label: "Sem grupo para comparar",
    cor: COLORS.gray400,
    explica:
      "A fila classifica comparando as áreas entre si, e o filtro deixou poucas na tela. Os números abaixo continuam corretos; o que não dá para dizer é se são altos ou baixos para esta empresa. Tire o filtro de departamento para ver a fila.",
  },
};

/**
 * A trajetória da área em miniatura, com a distância para a própria média.
 *
 * Sparkline sem eixo nem escala compartilhada: aqui não interessa comparar a
 * altura de uma área com a de outra -- para isso existe o número do eNPS ao
 * lado. Interessa a FORMA: desceu sempre, subiu sempre, ou foi e voltou.
 *
 * O número é a distância entre a onda corrente e a média das anteriores DESTA
 * área. É a segunda régua que a fila não tinha: a primeira compara com as
 * outras áreas, esta compara a área com ela mesma. Uma área pode estar acima
 * do grupo e em queda livre, e as duas coisas importam.
 */
function Trajetoria({ h }: { h: HistoricoDeArea | undefined }) {
  if (!h || h.contraSuaMedia == null) {
    return <span className="w-[96px] shrink-0" />;
  }

  const vals = h.valores.filter((v): v is number => v != null);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const amp = Math.max(max - min, 1);
  const W = 44;
  const H = 14;
  const passo = h.valores.length > 1 ? W / (h.valores.length - 1) : 0;

  const cor =
    h.trajetoria === "queda"
      ? COLORS.danger
      : h.trajetoria === "subida"
        ? COLORS.success
        : COLORS.gray400;

  // Trechos contínuos: onde a área não respondeu, a linha corta. Mesma regra da
  // série grande -- atravessar o buraco afirmaria uma trajetória não medida.
  const trechos: Array<Array<[number, number]>> = [];
  let atual: Array<[number, number]> = [];
  h.valores.forEach((v, i) => {
    if (v == null) {
      if (atual.length) trechos.push(atual);
      atual = [];
      return;
    }
    atual.push([i * passo, H - ((v - min) / amp) * H]);
  });
  if (atual.length) trechos.push(atual);

  const positivo = h.contraSuaMedia > 0;

  return (
    <TooltipProvider delayDuration={200}>
      <UiTooltip>
        <TooltipTrigger asChild>
          <span className="w-[96px] shrink-0 flex items-center justify-end gap-1.5">
            <svg width={W} height={H} className="shrink-0 overflow-visible" aria-hidden>
              {trechos.map((t, ti) => (
                <polyline
                  key={ti}
                  points={t.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={cor}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {trechos.at(-1)?.at(-1) && (
                <circle cx={trechos.at(-1)!.at(-1)![0]} cy={trechos.at(-1)!.at(-1)![1]} r={1.8} fill={cor} />
              )}
            </svg>
            <span
              className="text-[11px] tabular-nums w-9 text-right"
              style={{ color: h.contraSuaMedia === 0 ? undefined : positivo ? COLORS.success : COLORS.danger }}
            >
              {positivo ? "+" : ""}
              {fmt1(h.contraSuaMedia)}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px] text-xs leading-relaxed">
          eNPS por onda: {h.valores.map((v) => (v == null ? "—" : Math.round(v))).join(" → ")}.
          {h.mediaAnterior != null && (
            <> A média das ondas anteriores é {fmt1(h.mediaAnterior)}.</>
          )}{" "}
          {h.trajetoria === "queda"
            ? "Caiu em todas as passagens — é tendência, não oscilação."
            : h.trajetoria === "subida"
              ? "Subiu em todas as passagens."
              : "Sobe e desce sem direção clara, o que é comum em área pequena."}
        </TooltipContent>
      </UiTooltip>
    </TooltipProvider>
  );
}

export default function AreaPriority({
  areas,
  cuts,
  elegiveisPorArea,
  drivers = [],
  minimoExibicao = 5,
  areaAberta,
  onAbrirArea,
  serie = [],
}: {
  areas: EngagementContextRow[];
  /**
   * A série de todas as ondas, para a fila deixar de ser um retrato.
   *
   * ------------------------------------------------------------------
   * DUAS ÁREAS EM 60 NÃO SÃO A MESMA ÁREA
   * ------------------------------------------------------------------
   * A fila mostrava só a onda corrente e classificava contra as outras áreas.
   * Nisso, uma área que sempre esteve em 60 e uma que caiu de 85 para 60
   * apareciam idênticas -- e pedem reuniões opostas: a primeira tem um
   * patamar, a segunda teve um acontecimento.
   *
   * A Marilia pediu as duas coisas que fecham esse buraco: saber se a queda é
   * nova ou constante, e comparar a área com a própria média histórica além da
   * média da empresa. As duas saem daqui.
   *
   * Vazio quando há uma onda só -- e aí a coluna não aparece, em vez de
   * mostrar uma comparação de uma medição consigo mesma.
   */
  serie?: OndaEnps[];
  /**
   * Quantas pessoas podiam responder em cada área. Sem isso a coluna mostra só
   * o n, e um n de 24 não diz se a área toda respondeu ou se metade calou --
   * que são leituras opostas do mesmo eNPS.
   */
  elegiveisPorArea?: Record<string, number>;
  /** Recortes por área da carga bruta: n de respondentes E a composição. */
  cuts: SurveyCut[];
  /** Notas por pergunta e por área, para o painel que abre no clique. */
  drivers?: DriverPorRecorte[];
  minimoExibicao?: number;
  /**
   * Área aberta por comando de fora -- hoje, o clique numa bolha da matriz.
   * A fila continua dona do estado quando ninguém manda nada; quando manda,
   * ela obedece. Duas fontes de verdade para "qual está aberta" divergiriam
   * no primeiro clique.
   */
  areaAberta?: string | null;
  onAbrirArea?: (area: string | null) => void;
}) {
  /**
   * A área com o painel aberto. Uma de cada vez, e não um acordeão múltiplo:
   * a lista existe para dar ORDEM, e três painéis abertos empurram o resto
   * para fora da tela justamente quando a pessoa está comparando.
   */
  const [abertaLocal, setAbertaLocal] = useState<string | null>(null);
  const controlada = areaAberta !== undefined;
  const aberta = controlada ? areaAberta : abertaLocal;
  const setAberta = (v: string | null) => {
    if (controlada) onAbrirArea?.(v);
    else setAbertaLocal(v);
  };
  const [sobre, setSobre] = useState<string | null>(null);

  const { itens, cutPorArea, nPorArea, gapPorArea, medianas, comparavel } = useMemo(() => {
    const doTipoArea = cuts.filter((c) => c.cutType === "area");
    const cutPorArea = new Map(doTipoArea.map((c) => [chave(c.cutValue), c]));
    const nPorArea = new Map(doTipoArea.map((c) => [chave(c.cutValue), c.n]));
    // As linhas já chegam com `respostas` da aba -- ver o comentário lá. Se
    // este componente voltasse a enriquecer por conta própria, a matriz e a
    // fila podiam divergir de novo sem ninguém notar.
    const c = classifyAreas(areas);
    const gapPorArea = new Map(areas.map((a) => [chave(a.scope), a.gapEntEnps]));
    return {
      itens: c.itens,
      cutPorArea,
      nPorArea,
      gapPorArea,
      medianas: { enps: c.medianaEnps, risco: c.medianaRisco },
      comparavel: c.comparavel,
    };
  }, [areas, cuts]);

  // Uma passada só, indexada por área, em vez de varrer a série por linha.
  //
  // Fica ACIMA do `return null` abaixo de propósito: hook depois de saída
  // condicional roda em ordens diferentes entre renders, e o React quebra em
  // runtime -- o lint pegou isto, o TypeScript não pegaria.
  const historico = useMemo(() => {
    if (serie.length < 2) return null;
    return new Map(historicoPorArea(serie).map((h) => [chave(h.scope), h]));
  }, [serie]);

  if (!itens.length) return null;

  const maxEnps = Math.max(...itens.map((i) => i.enps), 1);


  return (
    <ChartCard
      title="Por onde começar, área por área"
      subtitle={
        comparavel
          ? // ------------------------------------------------------------------
            // "GRUPO" NÃO DIZIA QUE ERA MEDIANA, E ISSO CUSTOU CARO
            // ------------------------------------------------------------------
            // Dizia "grupo: eNPS 67,5, risco 14,3%". A Marilia leu isso, comparou
            // com o eNPS 69 e o risco 16,1% dos cartões do topo, e perguntou:
            // "é diferente do que tá aqui em cima, só para entender se eu que
            // fiz errada". Ela não fez nada errado -- os dois números estão
            // certos e medem coisas diferentes.
            //
            // A régua da fila é a MEDIANA das áreas: cada área conta uma vez,
            // do tamanho que for. O número do topo é o da empresa, calculado
            // sobre todas as respostas, então área grande pesa mais. Quando os
            // dois divergem, a divergência é informação -- risco mediano 14,3
            // contra 16,1 na empresa quer dizer que as áreas MAIORES estão
            // acima do típico.
            //
            // Nada disso aparecia. Só a palavra "grupo", que não é nada disso.
            `ordenado por prioridade · mediana das ${itens.length} áreas: eNPS ${fmt1(medianas.enps)}, risco ${fmt1(medianas.risco)}%`
          : // Sem grupo, "grupo: eNPS 48" seria o eNPS da própria área devolvido
            // como se fosse a régua -- a área comparada consigo mesma.
            'sem grupo para comparar · a régua da fila são as outras áreas'
      }
    >
      {/* ------------------------------------------------------------------
          CABEÇALHO DE COLUNA, QUE ESTA LISTA NUNCA TEVE
          ------------------------------------------------------------------
          Havia só uma legenda no rodapé -- "barra e número = eNPS, coluna do
          meio = risco de saída". Legenda no rodapé é uma chave que chega
          depois da fechadura: quem lê encontra os números primeiro.

          A Marilia leu "67,5" e "14,3" lado a lado e perguntou o que era cada
          um. É uma pergunta sobre a tela, não sobre os dados -- e a resposta
          já existia, só estava trinta linhas abaixo de onde era precisa.

          As larguras batem com as das células. Se alguém mexer numa delas sem
          mexer aqui, o cabeçalho desalinha visivelmente na primeira olhada --
          que é o tipo de erro que se conserta, ao contrário de um rótulo
          silenciosamente errado. */}
      <div
        className="flex items-center gap-3 px-1 -mx-1 pb-1.5 mb-1 border-b border-border/60
                   text-[10px] uppercase tracking-wider text-muted-foreground"
      >
        <span className="w-[168px] shrink-0">Área</span>
        <span className="flex-1 min-w-0" />
        <span className="w-8 text-right">eNPS</span>
        {historico && (
          <span className="w-[96px] text-right shrink-0" title="Trajetória nas ondas e distância para a média histórica da própria área">
            Histórico
          </span>
        )}
        <span className="w-14 text-right">Risco (%)</span>
        <span className="w-[92px] text-right shrink-0">Participação</span>
        <span className="w-[54px] text-right shrink-0" title="Diferença de eNPS para a Flutter International">
          vs FI
        </span>
      </div>

      <div className="space-y-1">
        {itens.map((i, idx) => {
          const v = VEREDITO[i.veredito];
          const primeiroDoGrupo = idx === 0 || itens[idx - 1].veredito !== i.veredito;
          return (
            <div key={i.scope}>
              {primeiroDoGrupo && (
                <div className="flex items-center gap-1.5 pt-2.5 pb-1 first:pt-0">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: v.cor }} />
                  <span className="text-[11px] font-medium">{v.label}</span>
                  <TooltipProvider delayDuration={200}>
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <button aria-label={`O que significa ${v.label}`}>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[260px] text-xs leading-relaxed">
                        {v.explica}
                      </TooltipContent>
                    </UiTooltip>
                  </TooltipProvider>
                </div>
              )}
              {/* ----------------------------------------------------------
                  A LINHA INTEIRA VIRA BOTÃO
                  ----------------------------------------------------------
                  E não um ícone de "expandir" no canto: alvo pequeno em lista
                  densa é acerto por sorte. A linha toda é o alvo, o cursor
                  muda, e a seta à esquerda diz que há mais por baixo.

                  `button` de verdade, e não `div` com onClick: teclado e
                  leitor de tela vêm junto sem código extra, e o `aria-expanded`
                  informa o estado a quem não vê a seta girar.
              ---------------------------------------------------------- */}
              <button
                type="button"
                onClick={() => setAberta(aberta === i.scope ? null : i.scope)}
                onMouseEnter={() => setSobre(i.scope)}
                onMouseLeave={() => setSobre(null)}
                aria-expanded={aberta === i.scope}
                aria-label={`Ver as perguntas de ${i.scope}`}
                className={cn(
                  "w-full flex items-center gap-3 py-1 px-1 -mx-1 rounded text-left transition-colors",
                  (sobre === i.scope || aberta === i.scope) && "bg-secondary/60",
                )}
              >
                <span
                  className="w-[168px] shrink-0 text-xs flex items-center gap-1"
                  title={i.scope}
                >
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
                      aberta === i.scope ? "rotate-0" : "-rotate-90",
                    )}
                  />
                  <span className="truncate">{i.scope}</span>
                  {/* Veredito decidido por menos que uma resposta. Fica ao lado
                      do nome, e não no fim da linha, porque quem lê precisa da
                      ressalva ANTES de olhar o número, não depois. */}
                  {i.noLimite && (
                    <TooltipProvider delayDuration={200}>
                      <UiTooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="shrink-0 rounded px-1 text-[9px] uppercase tracking-wide border border-amber-500/50 text-amber-600 dark:text-amber-500"
                            aria-label="Veredito no limite"
                          >
                            limite
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[280px] text-xs leading-relaxed">
                          {i.scope} está a {fmt1(i.distanciaEnps)} ponto
                          {i.distanciaEnps === 1 ? "" : "s"} da mediana de eNPS
                          {i.distanciaRisco != null &&
                            ` e a ${fmt1(i.distanciaRisco)} p.p. da de risco`}
                          .
                          {i.pesoDeUmaResposta != null && (
                            <>
                              {" "}
                              Uma resposta aqui vale {fmt1(i.pesoDeUmaResposta)} ponto
                              {i.pesoDeUmaResposta === 1 ? "" : "s"} — ou seja, este veredito pode
                              virar sozinho na próxima onda, sem nada ter mudado de verdade.
                            </>
                          )}
                        </TooltipContent>
                      </UiTooltip>
                    </TooltipProvider>
                  )}
                </span>
                <div className="flex-1 min-w-0 h-5 flex items-center">
                  {/* Cor = o que fazer (veredito); intensidade = magnitude do
                      eNPS. A opacidade fixa de antes achatava a percepção de
                      grandeza, já que a largura era o único sinal. */}
                  <div
                    className="h-2.5 rounded-full transition-all"
                    style={{
                      width: `${(i.enps / maxEnps) * 100}%`,
                      background: `linear-gradient(90deg, color-mix(in oklab, ${v.cor} ${45 + (i.enps / maxEnps) * 25}%, transparent), ${v.cor})`,
                    }}
                  />
                </div>
                {/* Maior que os vizinhos de propósito: é o número que a Marilia
                    pediu em destaque, e é o que ordena a fila. */}
                <span className="text-base font-bold tabular-nums w-8 text-right">{i.enps}</span>

                {historico && <Trajetoria h={historico.get(chave(i.scope))} />}

                <span
                  className={cn(
                    "text-[11px] tabular-nums w-14 text-right",
                    // Só pinta de âmbar contra um grupo de verdade. Com uma
                    // área só, `risco > mediana` é o valor contra ele mesmo.
                    comparavel && (i.risco ?? 0) > medianas.risco
                      ? "text-amber-600 dark:text-amber-500"
                      : "text-muted-foreground",
                  )}
                >
                  {fmt1(i.risco)}%
                </span>
                {(() => {
                  const n = nPorArea.get(chave(i.scope));
                  const eleg = elegiveisPorArea?.[i.scope];
                  const taxa = n != null && eleg ? Math.round((n / eleg) * 100) : null;
                  return (
                    <span
                      className={cn(
                        "text-[11px] tabular-nums w-[92px] text-right shrink-0",
                        // Abaixo de dois terços, quem calou pesa tanto quanto
                        // quem respondeu, e a nota da área passa a descrever
                        // um pedaço dela. Isso precisa saltar aos olhos.
                        taxa != null && taxa < 67
                          ? "text-amber-600 dark:text-amber-500"
                          : "text-muted-foreground",
                      )}
                      title={
                        eleg
                          ? `${n} de ${eleg} pessoas responderam (${taxa}%)`
                          : "sem headcount da área para calcular a taxa"
                      }
                    >
                      {n == null ? "—" : eleg ? `${n}/${eleg} · ${taxa}%` : `n=${n}`}
                    </span>
                  );
                })()}
                {/* Segunda régua: como a área está contra a Flutter International.
                    Legal é a de pior eNPS aqui E a mais distante da entidade
                    global (-29) -- as duas leituras concordam, e isso muda a
                    conversa. Onde elas discordam é ainda mais interessante. */}
                <span
                  className={cn(
                    "text-[11px] tabular-nums w-[54px] text-right shrink-0",
                    (gapPorArea.get(chave(i.scope)) ?? 0) < 0
                      ? "text-amber-600 dark:text-amber-500"
                      : "text-muted-foreground",
                  )}
                  title="Diferença de eNPS para a Flutter International, informada no deck de jan/26"
                >
                  {gapPorArea.get(chave(i.scope)) == null
                    ? "—"
                    : `${(gapPorArea.get(chave(i.scope)) as number) > 0 ? "+" : ""}${gapPorArea.get(chave(i.scope))} glob.`}
                </span>
              </button>

              {/* A composição, sem precisar clicar. O eNPS é uma subtração, e
                  subtração perde informação: 60 pode ser "80 promotores e 20
                  detratores" ou "60 promotores e 40 passivos" -- duas
                  conversas diferentes com o mesmo número. */}
              {sobre === i.scope &&
                aberta !== i.scope &&
                (() => {
                  const c = cutPorArea.get(chave(i.scope));
                  if (!c || c.promotores == null) return null;
                  return (
                    <div className="ml-[130px] -mt-0.5 mb-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>
                        <strong className="text-emerald-600 dark:text-emerald-500">
                          {c.promotores}
                        </strong>{" "}
                        promotores
                      </span>
                      <span>
                        <strong className="text-foreground">{c.passivos ?? "—"}</strong> passivos
                      </span>
                      <span>
                        <strong className="text-red-600 dark:text-red-500">
                          {c.detratores ?? "—"}
                        </strong>{" "}
                        detratores
                      </span>
                      <span>
                        satisfação{" "}
                        <strong className="text-foreground">{c.satisfacao ?? "—"}</strong>
                      </span>
                      <span className="italic">clique para ver as perguntas</span>
                    </div>
                  );
                })()}

              {aberta === i.scope && (
                <AreaDriverPanel area={i.scope} drivers={drivers} minimoExibicao={minimoExibicao} />
              )}
            </div>
          );
        })}
      </div>

      {/* O rodapé perdeu "barra e número = eNPS" e "coluna do meio = risco":
          isso agora está no cabeçalho, onde é lido antes dos números em vez de
          depois. Fica aqui só o que um título de coluna não cabe -- o que as
          cores querem dizer, e o que é FI. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 pt-2.5 border-t border-border/60 text-xs text-muted-foreground">
        <span>
          cor da barra = <strong className="text-foreground">o que fazer</strong>, e o comprimento
          é o eNPS
        </span>
        <span>
          <strong className="text-amber-600 dark:text-amber-500">âmbar em Risco</strong> = acima da
          mediana das áreas
        </span>
        <span>
          <strong className="text-amber-600 dark:text-amber-500">âmbar em Participação</strong> =
          menos de dois terços responderam
        </span>
        <span>
          <strong className="text-foreground">Histórico</strong> = trajetória do eNPS nas ondas e
          distância para a média anterior <em>desta</em> área
        </span>
        <span className="basis-full">
          A régua desta fila é a <strong className="text-foreground">mediana das áreas</strong>,
          onde cada área conta uma vez. Os cartões do topo trazem o número{' '}
          <strong className="text-foreground">da empresa</strong>, calculado sobre todas as
          respostas — então área grande pesa mais lá e não pesa aqui. Os dois divergirem é normal, e
          a diferença diz algo: risco mediano abaixo do risco da empresa significa que as áreas
          maiores estão acima do típico.
        </span>
        <span>
          <strong className="text-foreground">vs FI</strong> = diferença de eNPS para a Flutter
          International
        </span>
      </div>

      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
        {/* ------------------------------------------------------------------
            DUAS CORREÇÕES NESTE PARÁGRAFO
            ------------------------------------------------------------------
            1. Ele afirmava coisas sobre "as áreas" com uma área só na tela. A
               frase de abertura -- "a área de pior eNPS é também a de menor
               risco" -- é uma observação sobre o conjunto, e some com o filtro.

            2. Ele descrevia a régua ANTIGA: "só chama de 'abaixo' quem está
               mais distante do grupo que o afastamento típico entre as áreas"
               era o desvio absoluto mediano, trocado em 21/08/26 pela mediana
               pura com o marcador `limite`. O texto continuou prometendo uma
               proteção que o código não faz mais -- e prometer proteção
               inexistente é pior que não ter proteção. */}
        {comparavel ? (
          <>
            A ordem não é por eNPS: a área de pior eNPS é também a de menor risco de saída, e agir
            ali primeiro seria gastar esforço onde ninguém está saindo. A fila combina engajamento
            baixo, risco alto e tamanho da área. O corte é a <strong>mediana das áreas</strong> —
            metade fica de cada lado por construção, então &quot;abaixo&quot; quer dizer abaixo do
            resto da casa, não ruim. Onde a distância até a linha é menor do que uma única resposta
            moveria, a área leva o selo <strong>limite</strong>.{" "}
          </>
        ) : (
          <>
            Esta fila ordena <strong>comparando as áreas entre si</strong>, e o filtro deixou poucas
            na tela — por isso não há veredito. Os números continuam corretos; o que falta é a régua
            para dizer se são altos ou baixos.{" "}
          </>
        )}
        Repare na <strong>taxa de resposta</strong>: uma nota de 24 pessoas significa coisas opostas
        se a área tem 25 ou 46. Elegíveis é o headcount do mês em que a pesquisa começou — a mesma
        base do cartão de participação lá em cima, e não o número de convites enviados. Em área
        pequena, além disso, uma pessoa move o eNPS em vários pontos.
      </p>
    </ChartCard>
  );
}
