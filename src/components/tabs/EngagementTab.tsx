import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import {
  getExperienceData, getEngagementCross,
  type ExperienceData, type EngagementDriver, type EngagementCrossData,
} from '@/lib/experience.functions';
import { getSurveyWave, type SurveyWaveData } from '@/lib/survey.functions';
import SurveyCuts from '@/components/dashboard/SurveyCuts';
import DriverImportance from '@/components/dashboard/DriverImportance';
import EngagementMatrix from '@/components/dashboard/EngagementMatrix';
import EnpsSlope from '@/components/dashboard/EnpsSlope';
import RiskVsAttrition from '@/components/dashboard/RiskVsAttrition';
import DriversDeepDive from '@/components/dashboard/DriversDeepDive';
import KpiCard from '@/components/dashboard/KpiCard';
import ChartCard from '@/components/dashboard/ChartCard';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, Legend,
} from 'recharts';
import {
  Heart, Users, Sparkles, TrendingUp, TrendingDown, HandHeart, ChevronDown, ChevronRight,
} from 'lucide-react';
import { COLORS } from '@/lib/colors';
import FreshnessBadge from '@/components/dashboard/FreshnessBadge';
import { useDashboard } from '@/data/DashboardContext';

/**
 * Aba Experiencia (profunda): engajamento (KPIs + 8 drivers com perguntas +
 * por departamento), onboarding (etapas + tendencia mensal + por departamento)
 * e inclusao & pertencimento (Polly 2026: demografia, pertencimento, DEI + FNY).
 * Tudo agregado; nenhuma resposta individual.
 */

const fmt1 = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

const scoreColor = (s: number | null) =>
  s == null ? COLORS.info : s >= 4.5 ? COLORS.success : s >= 4.0 ? COLORS.nsx : s >= 3.8 ? COLORS.warning : COLORS.danger;

function Delta({ v }: { v: number | null }) {
  if (v == null) return <span className="text-muted-foreground text-[11px]">—</span>;
  const Icon = v > 0 ? TrendingUp : TrendingDown;
  const color = v === 0 ? 'text-muted-foreground' : v > 0 ? 'text-emerald-500' : 'text-amber-500';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] ${color}`}>
      {v !== 0 && <Icon className="h-3 w-3" />}{v > 0 ? '+' : ''}{fmt1(v)}
    </span>
  );
}

function Loading() {
  return <div className="flex items-center justify-center py-24"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
}

// ---------------------------------------------------------------- Engajamento

function DriverBlock({ driver, rows }: { driver: string; rows: EngagementDriver[] }) {
  const [open, setOpen] = useState(false);
  const scores = rows.map((r) => r.score_current ?? 0).filter((s) => s > 0);
  const avg = scores.reduce((a, b) => a + b, 0) / (scores.length || 1);
  const desc = rows.find((r) => r.driver_desc)?.driver_desc;
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition-colors">
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{driver}</div>
          {desc && <div className="text-[11px] text-muted-foreground truncate">{desc}</div>}
        </div>
        <div className="w-28 hidden sm:block">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(avg / 5) * 100}%`, background: scoreColor(avg) }} />
          </div>
        </div>
        <span className="text-sm font-bold tabular-nums w-10 text-right" style={{ color: scoreColor(avg) }}>{fmt1(avg)}</span>
      </button>
      {open && (
        <div className="border-t border-border divide-y divide-border/50">
          {rows.map((q) => (
            <div key={q.question} className="flex items-center gap-3 px-3 py-2 pl-10">
              <span className="flex-1 text-xs text-muted-foreground">{q.question}</span>
              <Delta v={q.score_prev != null && q.score_current != null ? Math.round((q.score_current - q.score_prev) * 10) / 10 : null} />
              <span className="text-xs tabular-nums w-8 text-right font-semibold" style={{ color: scoreColor(q.score_current) }}>{fmt1(q.score_current)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** "2026-02" + "2026-07" → "fev–jul/2026". Duas datas ISO na tela cansam. */
function janelaLabel(inicio: string, fim: string): string {
  const M = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [ai, mi] = inicio.split('-');
  const [af, mf] = fim.split('-');
  const a = M[Number(mi) - 1] ?? mi;
  const b = M[Number(mf) - 1] ?? mf;
  return ai === af ? `${a}–${b}/${ai}` : `${a}/${ai}–${b}/${af}`;
}

function EngagementSection({
  data, cross, survey,
}: {
  data: ExperienceData;
  cross: EngagementCrossData | null;
  survey: SurveyWaveData | null;
}) {
  const company = data.engagement.find((e) => e.scope === 'company');
  const depts = data.engagement.filter((e) => e.scope !== 'company');
  const statusColor = (rr: number | null) => rr == null ? COLORS.info : rr >= 20 ? COLORS.danger : rr >= 15 ? COLORS.warning : COLORS.success;

  // Saídas observadas, indexadas pelo nome da área da pesquisa, para enriquecer
  // a tabela de detalhe sem uma segunda tabela ao lado.
  const saidasPorScope = useMemo(() => {
    const m = new Map<string, { vol: number | null; total: number | null; taxa: number | null }>();
    for (const r of cross?.rows ?? []) {
      m.set(r.scope, { vol: r.saidasVoluntarias, total: r.saidasTotais, taxa: r.atricaoVoluntariaAnual });
    }
    return m;
  }, [cross]);

  const janela = cross ? janelaLabel(cross.janelaInicio, cross.janelaFim) : '';

  const driverGroups = useMemo(() => {
    const map = new Map<string, EngagementDriver[]>();
    for (const d of [...data.drivers].sort((a, b) => a.driver_pos - b.driver_pos || a.q_pos - b.q_pos)) {
      if (!map.has(d.driver)) map.set(d.driver, []);
      map.get(d.driver)!.push(d);
    }
    return [...map.entries()].map(([driver, rows]) => {
      const scores = rows.map((r) => r.score_current ?? 0).filter((s) => s > 0);
      return { driver, rows, avg: scores.reduce((a, b) => a + b, 0) / (scores.length || 1) };
    });
  }, [data.drivers]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><FreshnessBadge dataset="engagement" /></div>
      {company && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="eNPS (jan/26)" value={fmt1(company.enps)} color={COLORS.flutter} icon={Heart} />
          <KpiCard label="Satisfação" value={`${fmt1(company.satisfaction)}/10`} color={COLORS.nsx} icon={Sparkles} />
          <KpiCard label="Risco de retenção" value={`${fmt1(company.retention_risk)}%`} color={COLORS.warning} icon={TrendingUp} />
          <KpiCard label="Participação" value={`${fmt1(company.participation)}%`} color={COLORS.info} icon={Users} />
        </div>
      )}
      {company && (
        <p className="text-xs text-muted-foreground -mt-1 leading-relaxed">
          <strong>Participação (jan/2026): {fmt1(company.participation)}%</strong>
          {survey && ` — ${survey.respondentes} pessoas responderam`}
          {survey?.elegiveis ? ` de ${survey.elegiveis} elegíveis` : ''}.
          {survey && (
            <>
              {' '}O <strong>n de cada área</strong> aparece nos recortes mais abaixo. Vale olhar
              antes de comparar áreas: as menores têm menos de 20 respostas, e ali uma pessoa move
              o eNPS em vários pontos.
            </>
          )}
        </p>
      )}

      {/* Ordem deliberada: primeiro ONDE agir, depois O QUE mudou, depois SE a
          pesquisa se confirmou. É a sequência em que a conversa acontece na
          reunião -- e evita que o detalhe por área apareça antes de haver um
          critério para lê-lo. */}
      {cross && <EngagementMatrix rows={cross.rows} />}
      {cross && <EnpsSlope rows={cross.rows} />}
      {cross && (
        <RiskVsAttrition
          rows={cross.rows}
          janela={janela}
          meses={cross.mesesObservados}
          ressalvas={cross.ressalvas}
        />
      )}

      <ChartCard title="eNPS por departamento" subtitle="jan/2026 · cor = risco de retenção" icon={Users}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={depts} layout="vertical" margin={{ left: 24, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="opacity-30" />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="scope" width={110} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => [v, 'eNPS']} />
            <Bar dataKey="enps" radius={[0, 4, 4, 0]}>
              {depts.map((d) => <Cell key={d.scope} fill={statusColor(d.retention_risk)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Detalhe por departamento"
        subtitle={cross ? `o que a pesquisa disse × o que aconteceu em ${janela}` : undefined}
        icon={Users}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-2">Departamento</th><th className="p-2 text-right">eNPS</th><th className="p-2 text-right">Δ</th>
                <th className="p-2 text-right">Risco ret.</th><th className="p-2 text-right">Satisfação</th>
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
                    <td className="p-2 text-right"><Delta v={d.enps_delta} /></td>
                    <td className="p-2 text-right tabular-nums">{fmt1(d.retention_risk)}%</td>
                    <td className="p-2 text-right tabular-nums">{fmt1(d.satisfaction)}</td>
                    {cross && (
                      <td className="p-2 text-right tabular-nums">
                        {s?.vol == null ? (
                          // Traço, não zero: a área não tem correspondência no
                          // dashboard (Betfair é marca). Zero diria "ninguém
                          // saiu", que é afirmação diferente de "não sabemos".
                          <span className="text-muted-foreground" title="Área sem correspondência na base de desligados">—</span>
                        ) : (
                          <>{s.vol}{s.total != null && s.total !== s.vol && <span className="text-muted-foreground"> de {s.total}</span>}</>
                        )}
                      </td>
                    )}
                    {cross && (
                      <td className="p-2 text-right tabular-nums">
                        {s?.taxa == null ? <span className="text-muted-foreground">—</span> : `${fmt1(s.taxa)}%`}
                      </td>
                    )}
                    <td className="p-2 text-xs text-muted-foreground">{d.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {cross && (
          <p className="text-[11px] text-muted-foreground mt-2.5 leading-relaxed">
            &quot;Pediram demissão&quot; conta só saída voluntária no período, com o total entre as
            duas quando houve desligamento pela empresa também. A taxa é anualizada sobre o
            headcount médio da janela, para ficar comparável com a atrição do resto do painel.
          </p>
        )}
      </ChartCard>

      {/* Recortes e importância vêm do arquivo original da pesquisa, não do
          deck. Entram depois do detalhe por área porque respondem "por que",
          e só faz sentido perguntar por que depois de saber onde. */}
      {survey && <SurveyCuts cuts={survey.cuts} />}
      {survey && survey.importancia.length > 0 && <DriverImportance rows={survey.importancia} />}

      {driverGroups.length > 0 && (
        <ChartCard title="Drivers de engajamento" subtitle="média das perguntas (1–5) · clique para abrir" icon={Sparkles}>
          <div className="space-y-2">
            {driverGroups.map((g) => <DriverBlock key={g.driver} driver={g.driver} rows={g.rows} />)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Δ compara jan/26 com jul/25 (quando a pergunta existia).
          </p>
        </ChartCard>
      )}

      <DriversDeepDive drivers={data.drivers} />
    </div>
  );
}

// ---------------------------------------------------------------- Onboarding

const STAGE_LABEL: Record<string, string> = { '1_semana': '1ª semana', '45_dias': '45 dias', '90_dias': '90 dias' };
const METRIC_LABEL: Record<string, string> = {
  sat_onboarding: 'Satisfação com onboarding', sat_recrutamento: 'Recrutamento', sat_admissional: 'Processo admissional',
  sat_ti: 'Suporte de TI', clareza_resp: 'Clareza de responsabilidades', integracao_time: 'Integração ao time',
  pertencimento: 'Pertencimento', recomendacao: 'Recomendação (eNPS-like)', suporte_gestor: 'Suporte do gestor',
};
const monthLabel = (m: string) => {
  const map: Record<string, string> = { '01': 'jan', '02': 'fev', '03': 'mar', '04': 'abr', '05': 'mai', '06': 'jun', '07': 'jul', '08': 'ago', '09': 'set', '10': 'out', '11': 'nov', '12': 'dez' };
  const mm = m.slice(-2); const yy = m.slice(2, 4);
  return map[mm] ? `${map[mm]}/${yy}` : m;
};

function OnboardingSection({ data }: { data: ExperienceData }) {
  const overall = data.onboarding.filter((o) => o.slice_type === 'overall');
  const stages = ['1_semana', '45_dias', '90_dias'];

  const trend = useMemo(() => {
    const byMonth = new Map<string, { mes: string; sort: number; [k: string]: string | number }>();
    for (const o of data.onboarding.filter((x) => x.slice_type === 'cohort_month')) {
      const key = monthLabel(o.slice_value);
      const cur = byMonth.get(key) ?? { mes: key, sort: Number(o.slice_value.replace(/\D/g, '')) };
      cur[STAGE_LABEL[o.survey_stage] ?? o.survey_stage] = o.metrics.sat_onboarding ?? 0;
      byMonth.set(key, cur);
    }
    return [...byMonth.values()].sort((a, b) => a.sort - b.sort);
  }, [data.onboarding]);

  const byDept = useMemo(() => {
    const rows = data.onboarding.filter((o) => o.slice_type === 'department');
    const depts = [...new Set(rows.map((r) => r.slice_value))].sort();
    return depts.map((dept) => {
      const cell = (stage: string) => rows.find((r) => r.slice_value === dept && r.survey_stage === stage);
      return {
        dept,
        s1: cell('1_semana'), s45: cell('45_dias'), s90: cell('90_dias'),
      };
    });
  }, [data.onboarding]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Jornada de entrada por etapa. Médias de 0 a 10. Recortes com n&lt;3 suprimidos; comentários livres nunca no banco.
      </p>

      <div className="grid md:grid-cols-3 gap-4">
        {stages.map((stage) => {
          const row = overall.find((o) => o.survey_stage === stage);
          if (!row) return null;
          const entries = Object.entries(row.metrics).sort((a, b) => b[1] - a[1]);
          return (
            <ChartCard key={stage} title={STAGE_LABEL[stage] ?? stage} subtitle={`n=${row.n}`} icon={Sparkles}>
              <div className="space-y-2">
                {entries.map(([k, v]) => (
                  <div key={k} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{METRIC_LABEL[k] ?? k}</span>
                      <span className="font-semibold tabular-nums">{fmt1(v)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(v / 10) * 100}%`, background: COLORS.nsx }} />
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          );
        })}
      </div>

      {trend.length > 0 && (
        <ChartCard title="Satisfação com onboarding — tendência por mês de entrada" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend} margin={{ left: 0, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis domain={[8, 10]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="1ª semana" stroke={COLORS.flutter} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="45 dias" stroke={COLORS.nsx} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="90 dias" stroke={COLORS.success} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {byDept.length > 0 && (
        <ChartCard title="Satisfação por departamento (por etapa)" subtitle="n<3 suprimido" icon={Users}>
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
                    <td className="p-2 text-right tabular-nums">{d.s1 ? `${fmt1(d.s1.metrics.sat_onboarding)} (${d.s1.n})` : '—'}</td>
                    <td className="p-2 text-right tabular-nums">{d.s45 ? `${fmt1(d.s45.metrics.sat_onboarding)} (${d.s45.n})` : '—'}</td>
                    <td className="p-2 text-right tabular-nums">{d.s90 ? `${fmt1(d.s90.metrics.sat_onboarding)} (${d.s90.n})` : '—'}</td>
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

function Distribution({ rows, unit = '%', color = COLORS.flutter }: { rows: ExperienceData['distributions']; unit?: string; color?: string }) {
  const max = Math.max(...rows.map((r) => (unit === '%' ? r.pct ?? 0 : r.n ?? 0)), 1);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const val = unit === '%' ? r.pct ?? 0 : r.n ?? 0;
        return (
          <div key={r.category} className="space-y-0.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{r.category}</span>
              <span className="font-semibold tabular-nums">{unit === '%' ? `${fmt1(val)}%` : val}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(val / max) * 100}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InclusionSection({ data }: { data: ExperienceData }) {
  const polly = data.distributions.filter((d) => d.survey === 'polly_2026');
  const fny = data.distributions.filter((d) => d.survey === 'fny_2026');
  const qsOf = (section: string) => [...new Set(polly.filter((d) => d.section === section).map((d) => d.question))];
  const rowsOf = (section: string, q: string) => polly.filter((d) => d.section === section && d.question === q);
  const pertencimento = polly.filter((d) => d.section === 'pertencimento');
  const fnyConexao = fny.filter((d) => d.question.startsWith('FNY'));
  const fnyCluster = fny.filter((d) => d.question.startsWith('Elegíveis'));

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Polly Inclusion Survey 2026 — 327 respostas (≈55% da Flutter Brazil). Flutter Near You: programa de conexão.
        Só distribuições agregadas.
      </p>

      {pertencimento.length > 0 && (
        <ChartCard title="Pertencimento" subtitle="% que concorda (notas 4+5) · n=327" icon={HandHeart}>
          <div className="grid md:grid-cols-2 gap-x-8 gap-y-2">
            {pertencimento.map((p) => (
              <div key={p.question} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs gap-2">
                  <span className="text-muted-foreground">{p.question}</span>
                  <span className="font-semibold tabular-nums">{fmt1(p.pct)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${p.pct ?? 0}%`, background: COLORS.success }} />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {qsOf('demografia').map((q) => (
          <ChartCard key={q} title={q} subtitle="Polly 2026" icon={Users}>
            <Distribution rows={rowsOf('demografia', q)} />
          </ChartCard>
        ))}
      </div>

      {qsOf('dei').length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {qsOf('dei').map((q) => (
            <ChartCard key={q} title={q} subtitle="Percepção DEI" icon={Heart}>
              <Distribution rows={rowsOf('dei', q)} color={COLORS.flutter} />
            </ChartCard>
          ))}
        </div>
      )}

      {qsOf('dei_conversas').length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {qsOf('dei_conversas').map((q) => (
            <ChartCard key={q} title={q} subtitle="Conversas sobre DEI" icon={HandHeart}>
              <Distribution rows={rowsOf('dei_conversas', q)} color={COLORS.nsx} />
            </ChartCard>
          ))}
        </div>
      )}

      {fny.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {fnyConexao.length > 0 && (
            <ChartCard title="Flutter Near You — conexão" subtitle="Ajudou a se sentir mais conectado? · n=71" icon={HandHeart}>
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
  const { filters } = useDashboard();
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
      .then((d) => { if (!cancelled) setData(d as ExperienceData); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar'); });
    return () => { cancelled = true; };
  }, [fetchData, filters.departamento]);

  // O cruzamento com saídas não depende do filtro de área: ele é justamente a
  // comparação ENTRE áreas, e filtrar deixaria um ponto só no gráfico. Por isso
  // busca uma vez e fica. Falha aqui não derruba a aba -- as visões da pesquisa
  // continuam válidas sem o cruzamento, então o erro só some com os gráficos.
  useEffect(() => {
    let cancelled = false;
    fetchCross()
      .then((d) => { if (!cancelled) setCross(d as EngagementCrossData); })
      .catch((e: unknown) => { console.error('cruzamento engajamento × saídas indisponível:', e); });
    return () => { cancelled = true; };
  }, [fetchCross]);

  // Recortes da onda mais recente. Como o cruzamento, não depende do filtro de
  // área -- e a supressão por n baixo já vem aplicada do servidor, então o que
  // chega aqui nunca contém nota de grupo pequeno para quem não pode vê-la.
  useEffect(() => {
    let cancelled = false;
    fetchSurvey({ data: {} })
      .then((d) => { if (!cancelled) setSurvey(d as SurveyWaveData | null); })
      .catch((e: unknown) => { console.error('recortes da pesquisa indisponíveis:', e); });
    return () => { cancelled = true; };
  }, [fetchSurvey]);

  if (error) return <p className="text-sm text-muted-foreground text-center py-24">Não foi possível carregar a Experiência: {error}</p>;
  if (!data) return <Loading />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[hsl(var(--flutter))]" />
          Experiência
        </h2>
        <p className="text-sm text-muted-foreground">Engajamento, jornada de entrada e inclusão &amp; pertencimento.</p>
      </div>

      <Tabs defaultValue="engajamento" className="space-y-4">
        <TabsList>
          <TabsTrigger value="engajamento" className="gap-2"><Heart className="h-4 w-4" />Engajamento</TabsTrigger>
          <TabsTrigger value="onboarding" className="gap-2"><Sparkles className="h-4 w-4" />Onboarding</TabsTrigger>
          <TabsTrigger value="inclusao" className="gap-2"><HandHeart className="h-4 w-4" />Inclusão &amp; Pertencimento</TabsTrigger>
        </TabsList>
        <TabsContent value="engajamento" className="mt-0">
          <EngagementSection data={data} cross={cross} survey={survey} />
        </TabsContent>
        <TabsContent value="onboarding" className="mt-0"><OnboardingSection data={data} /></TabsContent>
        <TabsContent value="inclusao" className="mt-0"><InclusionSection data={data} /></TabsContent>
      </Tabs>
    </div>
  );
}
