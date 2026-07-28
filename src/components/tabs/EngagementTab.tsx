import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { getExperienceData, type ExperienceData } from '@/lib/experience.functions';
import KpiCard from '@/components/dashboard/KpiCard';
import ChartCard from '@/components/dashboard/ChartCard';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Heart, Users, Sparkles, TrendingUp, TrendingDown, HandHeart } from 'lucide-react';
import { COLORS } from '@/lib/colors';

/**
 * Aba Experiencia: engajamento (deck do CEO jan/26), onboarding (agregados do
 * banco, 3 etapas) e inclusao & pertencimento (Polly 2026 + Flutter Near You).
 * Tudo agregado; nenhuma resposta individual sai do banco.
 */

const fmt1 = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

const Delta = ({ v }: { v: number | null }) => {
  if (v == null) return <span className="text-muted-foreground text-xs">—</span>;
  const Icon = v > 0 ? TrendingUp : TrendingDown;
  const color = v === 0 ? 'text-muted-foreground' : v > 0 ? 'text-emerald-500' : 'text-amber-500';
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${color}`}>
      {v !== 0 && <Icon className="h-3 w-3" />}
      {v > 0 ? '+' : ''}{fmt1(v)}
    </span>
  );
};

function Loading() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

// ---------------------------------------------------------------- Engajamento

function EngagementSection({ data }: { data: ExperienceData }) {
  const company = data.engagement.find((e) => e.scope === 'company');
  const depts = data.engagement.filter((e) => e.scope !== 'company');
  const statusColor = (rr: number | null) =>
    rr == null ? COLORS.info : rr >= 20 ? COLORS.danger : rr >= 15 ? COLORS.warning : COLORS.success;

  return (
    <div className="space-y-4">
      {company && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="eNPS (jan/26)" value={fmt1(company.enps)} color={COLORS.flutter} icon={Heart} />
          <KpiCard label="Satisfação" value={`${fmt1(company.satisfaction)}/10`} color={COLORS.nsx} icon={Sparkles} />
          <KpiCard label="Risco de retenção" value={`${fmt1(company.retention_risk)}%`} color={COLORS.warning} icon={TrendingUp} />
          <KpiCard label="Participação" value={`${fmt1(company.participation)}%`} color={COLORS.info} icon={Users} />
        </div>
      )}
      {company?.status && (
        <p className="text-xs text-muted-foreground">Leitura geral: {company.status}.</p>
      )}

      <ChartCard title="eNPS por departamento" subtitle="jan/2026 · cor = risco de retenção" icon={Users}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={depts} layout="vertical" margin={{ left: 24, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="opacity-30" />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="scope" width={110} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => [v, 'eNPS']} />
            <Bar dataKey="enps" radius={[0, 4, 4, 0]}>
              {depts.map((d) => (
                <Cell key={d.scope} fill={statusColor(d.retention_risk)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Detalhe por departamento" icon={Users}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-2">Departamento</th>
                <th className="p-2 text-right">eNPS</th>
                <th className="p-2 text-right">Δ</th>
                <th className="p-2 text-right">Risco ret.</th>
                <th className="p-2 text-right">Satisfação</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {depts.map((d) => (
                <tr key={d.scope} className="border-b border-border/50">
                  <td className="p-2 font-medium">{d.scope}</td>
                  <td className="p-2 text-right tabular-nums">{fmt1(d.enps)}</td>
                  <td className="p-2 text-right"><Delta v={d.enps_delta} /></td>
                  <td className="p-2 text-right tabular-nums">{fmt1(d.retention_risk)}%</td>
                  <td className="p-2 text-right tabular-nums">{fmt1(d.satisfaction)}</td>
                  <td className="p-2 text-xs text-muted-foreground">{d.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

// ---------------------------------------------------------------- Onboarding

const STAGE_LABEL: Record<string, string> = {
  '1_semana': '1ª semana', '45_dias': '45 dias', '90_dias': '90 dias',
};
const METRIC_LABEL: Record<string, string> = {
  sat_onboarding: 'Satisfação com onboarding', sat_recrutamento: 'Recrutamento',
  sat_admissional: 'Processo admissional', sat_ti: 'Suporte de TI',
  clareza_resp: 'Clareza de responsabilidades', integracao_time: 'Integração ao time',
  pertencimento: 'Pertencimento', recomendacao: 'Recomendação (eNPS-like)',
  suporte_gestor: 'Suporte do gestor',
};

function OnboardingSection({ data }: { data: ExperienceData }) {
  const overall = data.onboarding.filter((o) => o.slice_type === 'overall');
  const stages = ['1_semana', '45_dias', '90_dias'];
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Pesquisas de jornada de entrada, por etapa. Médias de 0 a 10. Recortes com n&lt;3 suprimidos;
        comentários livres nunca entram no banco.
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
    </div>
  );
}

// ---------------------------------------------------------------- Inclusão

function Distribution({ rows, unit = '%' }: { rows: ExperienceData['distributions']; unit?: string }) {
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
              <div className="h-full rounded-full" style={{ width: `${(val / max) * 100}%`, background: COLORS.flutter }} />
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
  const demografiaQs = [...new Set(polly.filter((d) => d.section === 'demografia').map((d) => d.question))];
  const pertencimento = polly.filter((d) => d.section === 'pertencimento');
  const deiQs = [...new Set(polly.filter((d) => d.section === 'dei').map((d) => d.question))];
  const fnyConexao = fny.filter((d) => d.question.startsWith('FNY'));
  const fnyCluster = fny.filter((d) => d.question.startsWith('Elegíveis'));

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Polly Inclusion Survey 2026 — 327 respostas (≈55% da Flutter Brazil). Flutter Near You: programa
        de conexão. Só distribuições agregadas.
      </p>

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

      <div className="grid md:grid-cols-2 gap-4">
        {demografiaQs.map((q) => (
          <ChartCard key={q} title={q} subtitle="Polly 2026" icon={Users}>
            <Distribution rows={polly.filter((d) => d.section === 'demografia' && d.question === q)} />
          </ChartCard>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {deiQs.map((q) => (
          <ChartCard key={q} title={q} subtitle="Polly 2026" icon={Heart}>
            <Distribution rows={polly.filter((d) => d.section === 'dei' && d.question === q)} />
          </ChartCard>
        ))}
      </div>

      {fny.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {fnyConexao.length > 0 && (
            <ChartCard title="Flutter Near You — conexão" subtitle="Ajudou a se sentir mais conectado? · n=71" icon={HandHeart}>
              <Distribution rows={fnyConexao} />
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
  const [data, setData] = useState<ExperienceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchData = useServerFn(getExperienceData);

  useEffect(() => {
    let cancelled = false;
    fetchData()
      .then((d) => { if (!cancelled) setData(d as ExperienceData); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar'); });
    return () => { cancelled = true; };
  }, [fetchData]);

  if (error) {
    return <p className="text-sm text-muted-foreground text-center py-24">Não foi possível carregar a Experiência: {error}</p>;
  }
  if (!data) return <Loading />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[hsl(var(--flutter))]" />
          Experiência
        </h2>
        <p className="text-sm text-muted-foreground">
          Engajamento, jornada de entrada e inclusão &amp; pertencimento.
        </p>
      </div>

      <Tabs defaultValue="engajamento" className="space-y-4">
        <TabsList>
          <TabsTrigger value="engajamento" className="gap-2"><Heart className="h-4 w-4" />Engajamento</TabsTrigger>
          <TabsTrigger value="onboarding" className="gap-2"><Sparkles className="h-4 w-4" />Onboarding</TabsTrigger>
          <TabsTrigger value="inclusao" className="gap-2"><HandHeart className="h-4 w-4" />Inclusão &amp; Pertencimento</TabsTrigger>
        </TabsList>
        <TabsContent value="engajamento" className="mt-0"><EngagementSection data={data} /></TabsContent>
        <TabsContent value="onboarding" className="mt-0"><OnboardingSection data={data} /></TabsContent>
        <TabsContent value="inclusao" className="mt-0"><InclusionSection data={data} /></TabsContent>
      </Tabs>
    </div>
  );
}
