import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getExperienceData,
  getEngagementCross,
  type ExperienceData,
  type EngagementCrossData,
} from "@/lib/experience.functions";
import { getSurveyWave, type SurveyWaveData } from "@/lib/survey.functions";
import SurveyCuts from "@/components/dashboard/SurveyCuts";
import DriverPriority from "@/components/dashboard/DriverPriority";
import DriverImportance from "@/components/dashboard/DriverImportance";
import EngagementReading from "@/components/dashboard/EngagementReading";
import AreaPriority from "@/components/dashboard/AreaPriority";
import Detalhe from "@/components/dashboard/Detalhe";
import SurveyTimeline from "@/components/dashboard/SurveyTimeline";
import EngagementMatrix from "@/components/dashboard/EngagementMatrix";
import EnpsSlope from "@/components/dashboard/EnpsSlope";
import EnpsSerie from "@/components/dashboard/EnpsSerie";
import TempoDeCasa from "@/components/dashboard/TempoDeCasa";
import DispersaoAreas from "@/components/dashboard/DispersaoAreas";
import RiscoPreviu from "@/components/dashboard/RiscoPreviu";
import RiskVsAttrition from "@/components/dashboard/RiskVsAttrition";
import DriversDeepDive from "@/components/dashboard/DriversDeepDive";
import KpiCard from "@/components/dashboard/KpiCard";
import Delta from "@/components/dashboard/Delta";
import { rotuloDe, toneDe } from "@/lib/metric-help";
import ChartCard from "@/components/dashboard/ChartCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { Heart, Users, Sparkles, TrendingUp, TrendingDown, HandHeart } from "lucide-react";
import { COLORS } from "@/lib/colors";
import FreshnessBadge from "@/components/dashboard/FreshnessBadge";
import { useDashboard } from "@/data/DashboardContext";

/**
 * Aba Experiencia: engajamento, jornada de entrada e inclusao.
 *
 * A sub-aba de engajamento foi reorganizada em 10/08/2026 depois de um retorno
 * direto -- "achei bem confuso, queria algo profundo mas simples de ler". Ela
 * tinha 11 graficos abertos ao mesmo tempo, o eNPS por area repetido em tres
 * lugares e ~20 paragrafos de ressalva. Cada peca estava certa; o conjunto nao
 * respondia "e dai".
 *
 * A regra agora: fica aberto o que responde O QUE FAZER; o que responde COMO
 * CHEGAMOS NESSE NUMERO vai para o bloco de detalhe, recolhido.
 * Tudo agregado; nenhuma resposta individual.
 */

const fmt1 = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/**
 * Os limiares que pintam estes cartoes viviam AQUI, como `if (v >= 70)`.
 * Mudaram de lugar para `lib/metric-help.ts` quando os tooltips passaram a
 * explicar o que a cor significa: com o numero em dois lugares, o primeiro
 * ajuste faria a explicacao mentir sobre a propria tela.
 */

function Loading() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

// ---------------------------------------------------------------- Engajamento

/** "2026-02" + "2026-07" → "fev–jul/2026". Duas datas ISO na tela cansam. */
function janelaLabel(inicio: string, fim: string): string {
  const M = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const [ai, mi] = inicio.split("-");
  const [af, mf] = fim.split("-");
  const a = M[Number(mi) - 1] ?? mi;
  const b = M[Number(mf) - 1] ?? mf;
  return ai === af ? `${a}–${b}/${ai}` : `${a}/${ai}–${b}/${af}`;
}

function EngagementSection({
  data,
  cross,
  survey,
}: {
  data: ExperienceData;
  cross: EngagementCrossData | null;
  survey: SurveyWaveData | null;
}) {
  const company = data.engagement.find((e) => e.scope === "company");
  const depts = data.engagement.filter((e) => e.scope !== "company");

  // ------------------------------------------------------------------
  // OS CARTÕES SEGUEM O FILTRO
  // ------------------------------------------------------------------
  // Eles liam sempre a linha `company`. Com um departamento selecionado essa
  // linha não vinha, e os quatro cartões simplesmente SUMIAM -- filtrar por
  // uma área apagava os números em vez de mostrar os daquela área. Quem
  // filtra por Technology quer os números de Technology.
  //
  // `depts[0]` é seguro: o servidor devolve no máximo uma área quando há
  // filtro, e para perfil restrito devolve só a dele.
  const deptSel = data.escopo?.departamento ?? null;
  const areaSel = deptSel ? (depts[0] ?? null) : null;
  // Nem todo departamento do catálogo aparece na pesquisa -- CW GROUP,
  // DIRETORIA, PORTO e TECHNOLOGY GROUP não têm linha. Sem este caso separado,
  // o `??` cairia na linha da empresa e mostraria os números da Flutter Brazil
  // debaixo de um filtro que diz PORTO. Um número errado com rótulo certo é
  // pior que um espaço vazio: ninguém desconfia dele.
  const semDadoDaArea = !!deptSel && !areaSel;
  const foco = deptSel ? areaSel : company;
  // Referência para comparar. Só existe para quem pode ver a empresa: para
  // perfil restrito, `company` não vem -- e é essa ausência que impede
  // deduzir as outras áreas a partir do total.
  const referencia = areaSel && company ? company : null;
  // Saídas observadas, indexadas pelo nome da área da pesquisa, para enriquecer
  // a tabela de detalhe sem uma segunda tabela ao lado.
  const saidasPorScope = useMemo(() => {
    const m = new Map<string, { vol: number | null; total: number | null; taxa: number | null }>();
    for (const r of cross?.rows ?? []) {
      m.set(r.scope, {
        vol: r.saidasVoluntarias,
        total: r.saidasTotais,
        taxa: r.atricaoVoluntariaAnual,
      });
    }
    return m;
  }, [cross]);

  // ------------------------------------------------------------------
  // A MATRIZ VIRA ÍNDICE DA FILA
  // ------------------------------------------------------------------
  // Clicar numa bolha abre aquela área na fila, que já sabe mostrar as 34
  // perguntas dela. A matriz responde "onde"; a fila, "o quê". Sem isso a
  // matriz era a única visão da aba de onde não dava para ir a lugar nenhum.
  //
  // O `scrollIntoView` existe porque os dois cartões ficam longe um do outro:
  // sem rolar, o clique abriria um painel fora da tela e pareceria não ter
  // feito nada.
  // ------------------------------------------------------------------
  // AS DUAS RECEBEM A MESMA ENTRADA
  // ------------------------------------------------------------------
  // Unificar a REGRA não bastava: cada cartão enriquecia as linhas por conta
  // própria, e a matriz chamava o classificador sem o n de respostas. Sem n,
  // `noLimite` nunca fica verdadeiro -- a fila marcava quatro áreas como
  // frágeis e a matriz, nenhuma, com a mesma regra.
  //
  // Enriquecer UMA vez aqui e passar para as duas é o que garante que elas
  // vejam o mesmo dado, e não só o mesmo código.
  const rowsComN = useMemo(() => {
    const chave = (t: string) =>
      t
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toUpperCase();
    const n = new Map(
      (survey?.cuts ?? []).filter((c) => c.cutType === "area").map((c) => [chave(c.cutValue), c.n]),
    );
    return (cross?.rows ?? []).map((r) => ({ ...r, respostas: n.get(chave(r.scope)) ?? null }));
  }, [cross, survey]);

  const [areaEscolhida, setAreaEscolhida] = useState<string | null>(null);
  const escolherArea = (area: string | null) => {
    setAreaEscolhida(area);
    if (!area) return;
    // `setTimeout(0)` e não `requestAnimationFrame`. Dentro de um rAF o
    // `scrollIntoView` desta página simplesmente NÃO EXECUTA -- reproduzido
    // fora do React: a mesma chamada direta rola, dentro do rAF o scrollY não
    // se mexe um pixel. O clique expandia a área e a tela ficava parada, que
    // do ponto de vista de quem clicou é igual a não ter funcionado.
    //
    // O timeout continua cedendo o turno para o React renderizar antes de
    // medir a posição, que era a razão de haver um adiamento aqui.
    setTimeout(() => {
      document.getElementById("fila-por-area")?.scrollIntoView({ block: "start" });
    }, 0);
  };

  const janela = cross ? janelaLabel(cross.janelaInicio, cross.janelaFim) : "";

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <FreshnessBadge dataset="engagement" />
      </div>

      {/* ------------------------------------------------------------------
          A ORDEM DESTA ABA
          ------------------------------------------------------------------
          A versão anterior tinha onze gráficos e nenhuma conclusão: cada painel
          respondia bem a uma pergunta, e o conjunto não respondia "e daí".
          Quando tudo tem o mesmo peso, nada tem destaque.

          Agora são quatro perguntas, nesta ordem, um bloco cada:

            1. Como estamos      -> os números
            2. E daí             -> a leitura, calculada dos próprios dados
            3. Onde agir         -> por área, em fila de prioridade
            4. O que mudou       -> movimento entre as ondas
            5. Por onde começar  -> quais perguntas rendem mais
            6. Quem está longe   -> recortes que a leitura por área não mostra

          Tudo que responde "como vocês chegaram nesse número" foi para o bloco
          de detalhe, recolhido. Não sumiu -- alguém sempre duvida do número, e
          a resposta precisa estar no painel, não num print no Slack.
      ------------------------------------------------------------------ */}

      {semDadoDaArea && (
        <p className="rounded-lg border border-border/60 p-3 text-sm text-muted-foreground">
          <strong>{deptSel}</strong> não aparece na pesquisa de engajamento — a onda de jan/26 tem
          nove áreas, e esta não é uma delas. Os blocos abaixo que não têm recorte por área
          continuam sendo da Flutter Brazil inteira.
        </p>
      )}

      {foco && (
        <>
          {areaSel && (
            <p className="text-xs text-muted-foreground">
              Números de <strong>{deptSel}</strong>
              {referencia?.enps != null
                ? ` — a empresa toda está em eNPS ${fmt1(referencia.enps)}.`
                : "."}
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="eNPS"
              value={fmt1(foco.enps)}
              color={COLORS.flutter}
              icon={Heart}
              delta={
                foco.enps_delta == null ? undefined : (
                  <Delta v={foco.enps_delta} periodo="a onda anterior" />
                )
              }
              tone={toneDe("enps", foco.enps)}
              hint={rotuloDe("enps", foco.enps)}
              help="enps"
              helpValue={foco.enps}
            />
            <KpiCard
              label="Satisfação"
              value={`${fmt1(foco.satisfaction)}/10`}
              color={COLORS.nsx}
              icon={Sparkles}
              tone={toneDe("satisfacao", foco.satisfaction)}
              hint={rotuloDe("satisfacao", foco.satisfaction)}
              help="satisfacao"
              helpValue={foco.satisfaction}
            />
            <KpiCard
              label="Risco de saída"
              value={`${fmt1(foco.retention_risk)}%`}
              color={COLORS.warning}
              icon={TrendingUp}
              delta={
                foco.rr_delta == null ? undefined : (
                  <Delta v={foco.rr_delta} invertido periodo="a onda anterior" />
                )
              }
              tone={toneDe("riscoSaida", foco.retention_risk)}
              hint={rotuloDe("riscoSaida", foco.retention_risk)}
              help="riscoSaida"
              helpValue={foco.retention_risk}
            />
            {/* A participação é medida da onda inteira, não da área: a pesquisa
                não guarda quantos elegíveis cada área tinha. Com filtro ligado
                o cartão diz de quem é o número, em vez de sugerir que é da
                área. */}
            <KpiCard
              label={areaSel ? "Responderam (empresa)" : "Responderam"}
              value={survey ? String(survey.respondentes) : `${fmt1(company?.participation)}%`}
              color={COLORS.info}
              icon={Users}
              tone={toneDe("participacao", company?.participation)}
              hint={
                company?.participation == null
                  ? undefined
                  : `${fmt1(company.participation)}% dos elegíveis`
              }
              help="participacao"
              helpValue={company?.participation}
            />
          </div>
        </>
      )}

      {/* Recebe a mesma entrada da matriz e da fila. Esta leitura não mostra o
          marcador de limite hoje, mas os três classificam a partir do mesmo
          dado -- foi a entrada divergente, e não a regra, que fez a matriz e a
          fila discordarem antes. */}
      <EngagementReading
        enpsEmpresa={foco?.enps ?? null}
        respondentes={survey?.respondentes ?? null}
        participacao={company?.participation ?? null}
        areas={rowsComN}
        cuts={survey?.cuts ?? []}
        importancia={survey?.importancia ?? []}
      />

      {cross && (
        <div id="fila-por-area" className="scroll-mt-[150px]">
          <AreaPriority
            areaAberta={areaEscolhida}
            onAbrirArea={setAreaEscolhida}
            areas={rowsComN}
            cuts={survey?.cuts ?? []}
            elegiveisPorArea={survey?.elegiveisPorArea}
            drivers={survey?.driversPorArea ?? []}
            minimoExibicao={survey?.minimoExibicao ?? 5}
          />
        </div>
      )}

      {/* Duas ondas: slope, que responde "o que mudou desde a última pesquisa".
          Três ou mais: série, porque o slope só enxerga as duas pontas e uma
          área que caiu, subiu e voltou apareceria idêntica a uma parada.
          Quem decide é o banco, não uma constante para alguém lembrar. */}
      {cross &&
        (cross.serieEnps.length >= 3 ? (
          <EnpsSerie ondas={cross.serieEnps} />
        ) : (
          <EnpsSlope
            rows={cross.rows}
            ondaAnterior={cross.ondaAnteriorLabel}
            ondaAtual={cross.ondaAtualLabel}
          />
        ))}

      {/* ONDE a queda aconteceu. Logo depois da série, porque é a resposta à
          pergunta que a série provoca: o número da empresa mexeu, e daí? */}
      {cross?.tempoDeCasa && <TempoDeCasa ondas={cross.tempoDeCasa.ondas} />}

      {survey && survey.importancia.length > 0 && (
        <DriverPriority rows={survey.importancia} drivers={survey.driversPorArea} />
      )}

      {/* Depois da lista de perguntas, porque responde a pergunta seguinte:
          esta nota baixa é de todo mundo ou de alguém? */}
      {survey && <DispersaoAreas drivers={survey.driversPorArea} />}

      {survey && <SurveyCuts cuts={survey.cuts} departamentoSelecionado={deptSel} />}

      <Detalhe
        titulo="Detalhe e metodologia"
        resumo="como a pesquisa evoluiu, tabela por área, e se ela antecipou as saídas"
      >
        {/* A história vem primeiro: ela explica metade das ressalvas que
            apareceriam depois, e responde a pergunta que sempre abre a conversa
            quando alguém desconfia de um número. */}
        <SurveyTimeline ondas={data.ondas} />

        {/* Dentro do detalhe, e não no corpo da aba: é o painel conferindo a
            si mesmo, e quem abre esta seção é justamente quem quer saber se
            pode confiar no que leu acima. */}
        {cross?.risco && <RiscoPreviu dados={cross.risco} ondaLabel={cross.risco.ondaLabel} />}

        <ChartCard
          title="Detalhe por departamento"
          subtitle={cross ? `pesquisa × saídas em ${janela}` : undefined}
          icon={Users}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2">Departamento</th>
                  <th className="p-2 text-right">eNPS</th>
                  <th className="p-2 text-right">Δ</th>
                  <th className="p-2 text-right">Risco</th>
                  <th className="p-2 text-right">Satisfação</th>
                  {cross && <th className="p-2 text-right">Pediram demissão</th>}
                  {cross && <th className="p-2 text-right">Taxa a.a.</th>}
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {depts.map((d) => {
                  const s = saidasPorScope.get(d.scope);
                  return (
                    <tr key={d.scope} className="border-b border-border/50">
                      <td className="p-2 font-medium">{d.scope}</td>
                      <td className="p-2 text-right tabular-nums">{fmt1(d.enps)}</td>
                      <td className="p-2 text-right">
                        <Delta v={d.enps_delta} periodo="a onda anterior" />
                      </td>
                      <td className="p-2 text-right tabular-nums">{fmt1(d.retention_risk)}%</td>
                      <td className="p-2 text-right tabular-nums">{fmt1(d.satisfaction)}</td>
                      {cross && (
                        <td className="p-2 text-right tabular-nums">
                          {s?.vol == null ? (
                            <span
                              className="text-muted-foreground"
                              title="Área sem correspondência na base de desligados"
                            >
                              —
                            </span>
                          ) : (
                            <>
                              {s.vol}
                              {s.total != null && s.total !== s.vol && (
                                <span className="text-muted-foreground"> de {s.total}</span>
                              )}
                            </>
                          )}
                        </td>
                      )}
                      {cross && (
                        <td className="p-2 text-right tabular-nums">
                          {s?.taxa == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            `${fmt1(s.taxa)}%`
                          )}
                        </td>
                      )}
                      <td className="p-2 text-xs text-muted-foreground">{d.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>

        {cross && (
          <EngagementMatrix
            rows={rowsComN}
            ondaLabel={cross.ondaAtualLabel}
            prioritarias={(survey?.importancia ?? []).slice(0, 10).map((i) => ({
              question: i.question,
              driver: i.driver,
            }))}
            notasPorArea={(survey?.driversPorArea ?? [])
              .filter((d) => d.cutType === "area")
              .map((d) => ({
                question: d.question,
                area: d.cutValue,
                favoravel: d.favoravel,
                n: d.n,
              }))}
            notaDaEmpresa={
              new Map(
                (survey?.driversPorArea ?? [])
                  .filter((d) => d.cutType === "company")
                  .map((d) => [d.question, d.favoravel]),
              )
            }
            onEscolherArea={escolherArea}
          />
        )}

        {survey && survey.importancia.length > 0 && <DriverImportance rows={survey.importancia} />}

        <div className="space-y-2">
          <EscopoEmpresa escopo={data.escopo} />
          <DriversDeepDive drivers={data.drivers} />
        </div>

        {cross && (
          <RiskVsAttrition
            rows={cross.rows}
            janela={janela}
            meses={cross.mesesObservados}
            ressalvas={cross.ressalvas}
          />
        )}
      </Detalhe>
    </div>
  );
}

/**
 * Rótulo para blocos que são da empresa inteira numa tela filtrada por área.
 *
 * Existe por um motivo específico: um número sem rótulo, dentro de uma tela
 * que a pessoa filtrou pela própria área, é lido como sendo da área. O rótulo
 * não é decoração -- é o que separa "minha equipe" de "a companhia" quando as
 * duas coisas aparecem na mesma tela.
 */
function EscopoEmpresa({
  escopo,
}: {
  escopo?: { restrito: boolean; departamento: string | null };
}) {
  if (!escopo?.restrito && !escopo?.departamento) return null;
  return (
    <p className="text-[11px] text-muted-foreground">
      Números da <strong>Flutter Brazil</strong> inteira — esta seção não tem recorte por área.
      Serve de referência para comparar
      {escopo?.departamento ? ` com ${escopo.departamento}` : " com a sua"}.
    </p>
  );
}

// ---------------------------------------------------------------- Onboarding

const STAGE_LABEL: Record<string, string> = {
  "1_semana": "1ª semana",
  "45_dias": "45 dias",
  "90_dias": "90 dias",
};
const METRIC_LABEL: Record<string, string> = {
  sat_onboarding: "Satisfação com onboarding",
  sat_recrutamento: "Recrutamento",
  sat_admissional: "Processo admissional",
  sat_ti: "Suporte de TI",
  clareza_resp: "Clareza de responsabilidades",
  integracao_time: "Integração ao time",
  pertencimento: "Pertencimento",
  recomendacao: "Recomendação (eNPS-like)",
  suporte_gestor: "Suporte do gestor",
};
const monthLabel = (m: string) => {
  const map: Record<string, string> = {
    "01": "jan",
    "02": "fev",
    "03": "mar",
    "04": "abr",
    "05": "mai",
    "06": "jun",
    "07": "jul",
    "08": "ago",
    "09": "set",
    "10": "out",
    "11": "nov",
    "12": "dez",
  };
  const mm = m.slice(-2);
  const yy = m.slice(2, 4);
  return map[mm] ? `${map[mm]}/${yy}` : m;
};

/**
 * Cor por patamar da nota de 0 a 10. Todas as barras na mesma cor achatavam a
 * leitura: um 7,4 e um 9,6 pareciam a mesma coisa, e a queda só aparecia depois
 * de ler os números um a um.
 */
const notaCor = (v: number) =>
  v >= 9 ? COLORS.success : v >= 8 ? COLORS.nsx : v >= 7 ? COLORS.warning : COLORS.danger;
const notaClass = (v: number) =>
  v >= 9
    ? "text-emerald-600 dark:text-emerald-500"
    : v >= 8
      ? "text-foreground"
      : v >= 7
        ? "text-amber-600 dark:text-amber-500"
        : "text-red-600 dark:text-red-500";

function OnboardingSection({ data }: { data: ExperienceData }) {
  const overall = data.onboarding.filter((o) => o.slice_type === "overall");
  const stages = ["1_semana", "45_dias", "90_dias"];

  const trend = useMemo(() => {
    const byMonth = new Map<string, { mes: string; sort: number; [k: string]: string | number }>();
    for (const o of data.onboarding.filter((x) => x.slice_type === "cohort_month")) {
      const key = monthLabel(o.slice_value);
      const cur = byMonth.get(key) ?? { mes: key, sort: Number(o.slice_value.replace(/\D/g, "")) };
      cur[STAGE_LABEL[o.survey_stage] ?? o.survey_stage] = o.metrics.sat_onboarding ?? 0;
      byMonth.set(key, cur);
    }
    return [...byMonth.values()].sort((a, b) => a.sort - b.sort);
  }, [data.onboarding]);

  const byDept = useMemo(() => {
    const rows = data.onboarding.filter((o) => o.slice_type === "department");
    const depts = [...new Set(rows.map((r) => r.slice_value))].sort();
    return depts.map((dept) => {
      const cell = (stage: string) =>
        rows.find((r) => r.slice_value === dept && r.survey_stage === stage);
      return {
        dept,
        s1: cell("1_semana"),
        s45: cell("45_dias"),
        s90: cell("90_dias"),
      };
    });
  }, [data.onboarding]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Jornada de entrada por etapa. Médias de 0 a 10. Recortes com n&lt;3 suprimidos; comentários
        livres nunca no banco.
      </p>

      {/* As três notas de etapa e a tendência são da empresa; a tabela por
          área abaixo já vem restrita ao escopo de quem está olhando. */}
      {data.escopo?.restrito && (
        <p className="text-[11px] text-muted-foreground">
          As notas por etapa e a tendência abaixo são da <strong>Flutter Brazil</strong> inteira. A
          tabela por área mostra só a sua.
        </p>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {stages.map((stage) => {
          const row = overall.find((o) => o.survey_stage === stage);
          if (!row) return null;
          const entries = Object.entries(row.metrics).sort((a, b) => b[1] - a[1]);
          return (
            <ChartCard
              key={stage}
              title={STAGE_LABEL[stage] ?? stage}
              subtitle={`n=${row.n}`}
              icon={Sparkles}
            >
              <div className="space-y-2">
                {entries.map(([k, v]) => (
                  <div key={k} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{METRIC_LABEL[k] ?? k}</span>
                      <span className={`font-semibold tabular-nums ${notaClass(v)}`}>
                        {fmt1(v)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(v / 10) * 100}%`, background: notaCor(v) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          );
        })}
      </div>

      {trend.length > 0 && (
        <ChartCard
          title="Satisfação com onboarding — tendência por mês de entrada"
          icon={TrendingUp}
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend} margin={{ left: 0, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis domain={[8, 10]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="1ª semana"
                stroke={COLORS.flutter}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="45 dias"
                stroke={COLORS.nsx}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="90 dias"
                stroke={COLORS.success}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {byDept.length > 0 && (
        <ChartCard
          title="Satisfação por departamento (por etapa)"
          subtitle="n<3 suprimido"
          icon={Users}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2">Departamento</th>
                  <th className="p-2 text-right">1ª semana</th>
                  <th className="p-2 text-right">45 dias</th>
                  <th className="p-2 text-right">90 dias</th>
                </tr>
              </thead>
              <tbody>
                {byDept.map((d) => (
                  <tr key={d.dept} className="border-b border-border/50">
                    <td className="p-2 font-medium">{d.dept}</td>
                    <td className="p-2 text-right tabular-nums">
                      {d.s1 ? `${fmt1(d.s1.metrics.sat_onboarding)} (${d.s1.n})` : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {d.s45 ? `${fmt1(d.s45.metrics.sat_onboarding)} (${d.s45.n})` : "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {d.s90 ? `${fmt1(d.s90.metrics.sat_onboarding)} (${d.s90.n})` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Inclusão

function Distribution({
  rows,
  unit = "%",
  color = COLORS.flutter,
}: {
  rows: ExperienceData["distributions"];
  unit?: string;
  color?: string;
}) {
  const max = Math.max(...rows.map((r) => (unit === "%" ? (r.pct ?? 0) : (r.n ?? 0))), 1);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const val = unit === "%" ? (r.pct ?? 0) : (r.n ?? 0);
        return (
          <div key={r.category} className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{r.category}</span>
              <span className="font-semibold tabular-nums">
                {unit === "%" ? `${fmt1(val)}%` : val}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${(val / max) * 100}%`, background: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InclusionSection({ data }: { data: ExperienceData }) {
  const polly = data.distributions.filter((d) => d.survey === "polly_2026");
  const fny = data.distributions.filter((d) => d.survey === "fny_2026");
  const qsOf = (section: string) => [
    ...new Set(polly.filter((d) => d.section === section).map((d) => d.question)),
  ];
  const rowsOf = (section: string, q: string) =>
    polly.filter((d) => d.section === section && d.question === q);
  const pertencimento = polly.filter((d) => d.section === "pertencimento");
  const fnyConexao = fny.filter((d) => d.question.startsWith("FNY"));
  const fnyCluster = fny.filter((d) => d.question.startsWith("Elegíveis"));

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Polly Inclusion Survey 2026 — 327 respostas (≈55% da Flutter Brazil). Flutter Near You:
        programa de conexão. Só distribuições agregadas.
      </p>
      <EscopoEmpresa escopo={data.escopo} />

      {pertencimento.length > 0 && (
        <ChartCard
          title="Pertencimento"
          subtitle="% que concorda (notas 4+5) · n=327"
          icon={HandHeart}
        >
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-2">
            {pertencimento.map((p) => (
              <div key={p.question} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs gap-2">
                  <span className="text-muted-foreground">{p.question}</span>
                  <span className="font-semibold tabular-nums">{fmt1(p.pct)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${p.pct ?? 0}%`, background: COLORS.success }}
                  />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {qsOf("demografia").map((q) => (
          <ChartCard key={q} title={q} subtitle="Polly 2026" icon={Users}>
            <Distribution rows={rowsOf("demografia", q)} />
          </ChartCard>
        ))}
      </div>

      {qsOf("dei").length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {qsOf("dei").map((q) => (
            <ChartCard key={q} title={q} subtitle="Percepção DEI" icon={Heart}>
              <Distribution rows={rowsOf("dei", q)} color={COLORS.flutter} />
            </ChartCard>
          ))}
        </div>
      )}

      {qsOf("dei_conversas").length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {qsOf("dei_conversas").map((q) => (
            <ChartCard key={q} title={q} subtitle="Conversas sobre DEI" icon={HandHeart}>
              <Distribution rows={rowsOf("dei_conversas", q)} color={COLORS.nsx} />
            </ChartCard>
          ))}
        </div>
      )}

      {fny.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {fnyConexao.length > 0 && (
            <ChartCard
              title="Flutter Near You — conexão"
              subtitle="Ajudou a se sentir mais conectado? · n=71"
              icon={HandHeart}
            >
              <Distribution rows={fnyConexao} color={COLORS.success} />
            </ChartCard>
          )}
          {fnyCluster.length > 0 && (
            <ChartCard title="Flutter Near You — elegíveis por cluster" icon={Users}>
              <Distribution rows={fnyCluster} unit="n" />
            </ChartCard>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Tab

export default function EngagementTab() {
  const { filters, activeSubTab, setActiveSubTab } = useDashboard();
  const [data, setData] = useState<ExperienceData | null>(null);
  const [cross, setCross] = useState<EngagementCrossData | null>(null);
  const [survey, setSurvey] = useState<SurveyWaveData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchData = useServerFn(getExperienceData);
  const fetchCross = useServerFn(getEngagementCross);
  const fetchSurvey = useServerFn(getSurveyWave);

  useEffect(() => {
    let cancelled = false;
    fetchData({ data: { department: filters.departamento } })
      .then((d) => {
        if (!cancelled) setData(d as ExperienceData);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Falha ao carregar");
      });
    return () => {
      cancelled = true;
    };
  }, [fetchData, filters.departamento]);

  // ------------------------------------------------------------------
  // O CRUZAMENTO PASSOU A RESPEITAR O FILTRO
  // ------------------------------------------------------------------
  // O comentário antigo aqui dizia que ele "não depende do filtro de área,
  // porque é justamente a comparação ENTRE áreas". Estava errado por dois
  // motivos, e o segundo é grave:
  //
  //   1. Com TECHNOLOGY selecionado, a leitura continuava dizendo que o lugar
  //      de agir era Marketing. Uma tela filtrada que fala de outra área não
  //      está filtrada.
  //   2. É daqui que saem a fila por área e o gráfico de movimento entre
  //      ondas. Sem escopo, um líder de área lia o ranking das outras oito --
  //      o mesmo vazamento fechado nas outras visões, entrando por esta.
  //
  // Sim, com uma área só o gráfico vira um ponto. É a resposta correta para
  // quem só pode ver uma área.
  //
  // Falha aqui não derruba a aba: as visões da pesquisa continuam válidas sem
  // o cruzamento, então o erro só some com os gráficos.
  useEffect(() => {
    let cancelled = false;
    fetchCross({ data: { department: filters.departamento } })
      .then((d) => {
        if (!cancelled) setCross(d as EngagementCrossData);
      })
      .catch((e: unknown) => {
        console.error("cruzamento engajamento × saídas indisponível:", e);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchCross, filters.departamento]);

  // Recortes da onda mais recente.
  //
  // O recorte por ÁREA respeita o filtro e o escopo (era outra porta aberta:
  // trazia eNPS e risco das nove áreas, nominalmente, para qualquer perfil).
  // Os recortes por tempo de casa, função e marca continuam da empresa toda --
  // não identificam área, e servem de referência.
  //
  // A supressão por n baixo já vem aplicada do servidor, então o que chega
  // aqui nunca contém nota de grupo pequeno para quem não pode vê-la.
  useEffect(() => {
    let cancelled = false;
    fetchSurvey({ data: { department: filters.departamento } })
      .then((d) => {
        if (!cancelled) setSurvey(d as SurveyWaveData | null);
      })
      .catch((e: unknown) => {
        console.error("recortes da pesquisa indisponíveis:", e);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchSurvey, filters.departamento]);

  if (error)
    return (
      <p className="text-sm text-muted-foreground text-center py-24">
        Não foi possível carregar a Experiência: {error}
      </p>
    );
  if (!data) return <Loading />;

  // Sub-abas permitidas. Sem `subAbas` na resposta (versao antiga em cache),
  // assume as tres -- o servidor ja recusaria o que nao pode sair.
  const subs = data.subAbas ?? ["engajamento", "onboarding", "inclusao"];
  const podeVer = (id: string) => subs.includes(id as (typeof subs)[number]);
  // Uma sub-aba lembrada da sessao anterior pode nao existir mais para este
  // perfil. Sem isto, a tela abriria em branco -- com as Tabs apontando para
  // um valor sem conteudo -- e pareceria defeito.
  const subAtiva = podeVer(activeSubTab ?? "") ? (activeSubTab as string) : subs[0];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[hsl(var(--flutter))]" />
          Experiência
        </h2>
        {/* O subtitulo lista o que a aba tem. Prometer "jornada de entrada e
            inclusao" a quem so pode ver Engajamento manda a pessoa procurar
            duas secoes que nao existem para ela. */}
        <p className="text-sm text-muted-foreground">
          {subs.length > 1
            ? "Engajamento, jornada de entrada e inclusão & pertencimento."
            : "Resultado da pesquisa de engajamento."}
        </p>
      </div>

      <Tabs value={subAtiva} onValueChange={setActiveSubTab} className="space-y-4">
        {/* As sub-abas vem do SERVIDOR (`data.subAbas`), nao de um calculo aqui.
            Para o perfil "Experiencia -- Engajamento", Onboarding e Inclusao
            nao aparecem E nao sao enviados: se a lista fosse decidida so na
            tela, o conteudo continuaria no payload, a um inspetor de
            distancia. Uma sub-aba escondida com o dado dentro da resposta e
            uma sub-aba visivel para quem procura. */}
        {/* Uma aba so nao e escolha: a barra de sub-abas some. Um botao
            solitario marcado como "selecionado" sugere que existem outros --
            e a pessoa procura pelos que faltam. */}
        {subs.length > 1 && (
          <TabsList>
            {podeVer("engajamento") && (
              <TabsTrigger value="engajamento" className="gap-2">
                <Heart className="h-4 w-4" />
                Engajamento
              </TabsTrigger>
            )}
            {podeVer("onboarding") && (
              <TabsTrigger value="onboarding" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Onboarding
              </TabsTrigger>
            )}
            {podeVer("inclusao") && (
              <TabsTrigger value="inclusao" className="gap-2">
                <HandHeart className="h-4 w-4" />
                Inclusão &amp; Pertencimento
              </TabsTrigger>
            )}
          </TabsList>
        )}
        <TabsContent value="engajamento" className="mt-0">
          <EngagementSection data={data} cross={cross} survey={survey} />
        </TabsContent>
        {podeVer("onboarding") && (
          <TabsContent value="onboarding" className="mt-0">
            <OnboardingSection data={data} />
          </TabsContent>
        )}
        {podeVer("inclusao") && (
          <TabsContent value="inclusao" className="mt-0">
            <InclusionSection data={data} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
