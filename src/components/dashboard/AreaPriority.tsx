import { useMemo, useState } from "react";
import { Info, ChevronDown } from "lucide-react";
import AreaDriverPanel from "@/components/dashboard/AreaDriverPanel";
import type { DriverPorRecorte } from "@/lib/survey.functions";
import ChartCard from "@/components/dashboard/ChartCard";
import { COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { classifyAreas, type Veredito } from "@/lib/area-priority";
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
 * Não é por eNPS. Ordenar por eNPS puro colocaria Legal no topo -- eNPS 47, o
 * pior da empresa -- quando Legal tem o MENOR risco de saída de todas (6,7%) e
 * são 15 pessoas. Agir ali primeiro seria gastar esforço onde ninguém está de
 * saída.
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
};

export default function AreaPriority({
  areas,
  cuts,
  elegiveisPorArea,
  drivers = [],
  minimoExibicao = 5,
  areaAberta,
  onAbrirArea,
}: {
  areas: EngagementContextRow[];
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

  const { itens, cutPorArea, nPorArea, gapPorArea, medianas } = useMemo(() => {
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
    };
  }, [areas, cuts]);

  if (!itens.length) return null;

  const maxEnps = Math.max(...itens.map((i) => i.enps), 1);

  return (
    <ChartCard
      title="Por onde começar, área por área"
      subtitle={`ordenado por prioridade · grupo: eNPS ${fmt1(medianas.enps)}, risco ${fmt1(medianas.risco)}%`}
    >
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
                <span className="text-sm font-semibold tabular-nums w-8 text-right">{i.enps}</span>

                <span
                  className={cn(
                    "text-[11px] tabular-nums w-14 text-right",
                    (i.risco ?? 0) > medianas.risco
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 pt-2.5 border-t border-border/60 text-xs text-muted-foreground">
        <span>
          barra e número = <strong className="text-foreground">eNPS</strong>
        </span>
        <span>
          coluna do meio = <strong className="text-foreground">risco de saída</strong>
        </span>
        <span>
          <strong className="text-foreground">respostas / elegíveis</strong> — âmbar quando menos de
          dois terços responderam
        </span>
        <span>
          glob. = <strong className="text-foreground">vs Flutter International</strong>
        </span>
      </div>

      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
        A ordem não é por eNPS: a área de pior eNPS é também a de menor risco de saída, e agir ali
        primeiro seria gastar esforço onde ninguém está saindo. A fila combina engajamento baixo,
        risco alto e tamanho da área — e só chama de &quot;abaixo&quot; quem está mais distante do
        grupo que o afastamento típico entre as áreas, para diferença de arredondamento não virar
        alarme. Repare na <strong>taxa de resposta</strong>: uma nota de 24 pessoas significa coisas
        opostas se a área tem 25 ou 46. Elegíveis é o headcount do mês em que a pesquisa começou — a
        mesma base do cartão de participação lá em cima, e não o número de convites enviados. Em
        área pequena, além disso, uma pessoa move o eNPS em vários pontos.
      </p>
    </ChartCard>
  );
}
