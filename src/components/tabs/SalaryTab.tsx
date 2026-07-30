import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useDashboard } from '@/data/DashboardContext';
import { getCompAggregates, type CompAggregates } from '@/lib/comp.functions';
import { mLabel, shortDept, fmtC } from '@/data/helpers';
import KpiCard from '@/components/dashboard/KpiCard';
import ChartCard from '@/components/dashboard/ChartCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { COLORS } from '@/lib/colors';

const BRAND_COLORS: Record<string, string> = {
  combined: COLORS.flutter,
  NSX: COLORS.nsx,
  'Betfair BR': COLORS.betfair,
  'Flutter International': COLORS.flutter,
  Porto: COLORS.flutter,
};

// De-para marca -> empresas do comp_ratio (mesmo do agregador). Flutter nao tem
// dado de comp. "combined" soma NSX + Betfair.
const NSX_COS = ['NSX BRASIL RECIFE', 'NSX BRASIL SÃO PAULO', 'NSX MARECHAL'];
const BRAND_COMPANIES: Record<string, string[]> = {
  NSX: NSX_COS,
  'Betfair BR': ['NSX BETFAIR BRASIL S.A.'],
  'Flutter International': [],
  combined: [...NSX_COS, 'NSX BETFAIR BRASIL S.A.'],
};
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Users,
  Target,
  BarChart3,
  Activity,
  Wallet,
  Scale
} from 'lucide-react';

function calcTotalCost(d: { headcount: number; leaders: number; avg_salary_leaders: number; avg_salary_non_leaders: number }) {
  const l = d.leaders || 0;
  const nl = Math.max(0, (d.headcount || 0) - l);
  return (l * (d.avg_salary_leaders || 0)) + (nl * (d.avg_salary_non_leaders || 0));
}

export default function SalaryTab() {
  const { currentData, prevData, allMonthsData, currentMonth, brand } = useDashboard();
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;
  const curr = currentData;

  // Agregados de comp (CLT/PJ e comp-ratio por area) -- snapshot atual, so
  // medias/contagens (nenhuma linha individual).
  const [comp, setComp] = useState<CompAggregates | null>(null);
  const fetchComp = useServerFn(getCompAggregates);
  useEffect(() => {
    let cancelled = false;
    fetchComp().then((d) => { if (!cancelled) setComp(d as CompAggregates); }).catch(() => {});
    return () => { cancelled = true; };
  }, [fetchComp]);

  const contractMix = useMemo(() => {
    if (!comp) return null;
    const set = new Set(BRAND_COMPANIES[brand] ?? BRAND_COMPANIES.combined);
    const acc: Record<string, { n: number; salSum: number; salN: number }> = {};
    comp.contracts.forEach((c) => {
      if (!set.has(c.company)) return;
      const a = (acc[c.contract] = acc[c.contract] ?? { n: 0, salSum: 0, salN: 0 });
      a.n += c.n; a.salSum += c.sal_sum; a.salN += c.sal_n;
    });
    const rows = Object.entries(acc)
      .map(([contract, v]) => ({ contract, n: v.n, avg: v.salN ? Math.round(v.salSum / v.salN) : null }))
      .sort((a, b) => b.n - a.n);
    return { rows, total: rows.reduce((s, r) => s + r.n, 0) };
  }, [comp, brand]);

  const areaComp = useMemo(() => {
    if (!comp) return null;
    const set = new Set(BRAND_COMPANIES[brand] ?? BRAND_COMPANIES.combined);
    const acc: Record<string, { n: number; crSum: number; crN: number }> = {};
    comp.areas.forEach((a) => {
      if (!set.has(a.company)) return;
      const x = (acc[a.area] = acc[a.area] ?? { n: 0, crSum: 0, crN: 0 });
      x.n += a.n; x.crSum += a.cr_sum; x.crN += a.cr_n;
    });
    return Object.entries(acc)
      .map(([area, v]) => ({ area, n: v.n, cr: v.n >= 3 && v.crN ? Math.round((v.crSum / v.crN) * 10) / 10 : null }))
      .filter((r) => r.cr != null)
      .sort((a, b) => (b.cr ?? 0) - (a.cr ?? 0));
  }, [comp, brand]);

  // Bandas de senioridade (#13 da revisao do Caio): agrupa niveis em faixas
  // nao-sobrepostas, com comp-ratio e salario medios. O split lider/IC dentro
  // do nivel precisaria da flag de lideranca (nao esta no comp agregado).
  const SENIORITY_BANDS: Array<{ label: string; levels: number[] }> = [
    { label: 'Júnior (L0–L2)', levels: [0, 1, 2] },
    { label: 'Pleno (L3–L4)', levels: [3, 4] },
    { label: 'Sênior (L5–L6)', levels: [5, 6] },
    { label: 'Liderança/C-level (L7+)', levels: [7, 8, 9] },
  ];
  const levelBands = useMemo(() => {
    if (!comp) return null;
    const set = new Set(BRAND_COMPANIES[brand] ?? BRAND_COMPANIES.combined);
    const bandOf = (lvl: string) => {
      const m = lvl.toUpperCase().match(/L?(\d+)/);
      const n = m ? Number(m[1]) : null;
      return n == null ? null : SENIORITY_BANDS.find((b) => b.levels.includes(n))?.label ?? null;
    };
    const acc: Record<string, { n: number; crSum: number; crN: number; salSum: number; salN: number }> = {};
    comp.levels.forEach((l) => {
      if (!set.has(l.company)) return;
      const band = bandOf(l.level);
      if (!band) return;
      const x = (acc[band] = acc[band] ?? { n: 0, crSum: 0, crN: 0, salSum: 0, salN: 0 });
      x.n += l.n; x.crSum += l.cr_sum; x.crN += l.cr_n; x.salSum += l.sal_sum; x.salN += l.sal_n;
    });
    return SENIORITY_BANDS.map((b) => {
      const v = acc[b.label];
      return {
        band: b.label,
        n: v?.n ?? 0,
        cr: v && v.n >= 3 && v.crN ? Math.round((v.crSum / v.crN) * 10) / 10 : null,
        sal: v && v.n >= 3 && v.salN ? Math.round(v.salSum / v.salN) : null,
      };
    }).filter((r) => r.n > 0);
  }, [comp, brand]);

  const leaders = curr.leaders || 0;
  const nonLeaders = Math.max(0, (curr.headcount || 0) - leaders);
  const totalCost = calcTotalCost(curr);
  const fteCost = curr.headcount > 0 ? Math.round(totalCost / curr.headcount) : 0;
  const hourCost = curr.headcount > 0 ? (totalCost / curr.headcount / 220).toFixed(2) : '0';

  const prevTotalCost = prevData ? calcTotalCost(prevData) : 0;
  const costDelta = prevTotalCost > 0 ? ((totalCost - prevTotalCost) / prevTotalCost * 100) : 0;
  const hcDelta = prevData && prevData.headcount > 0 ? ((curr.headcount - prevData.headcount) / prevData.headcount * 100) : 0;

  const salaryGap = curr.avg_salary_non_leaders > 0
    ? (curr.avg_salary_leaders / curr.avg_salary_non_leaders).toFixed(1)
    : '0';

  // Mediana (mais robusta que a media p/ visao geral -- pedido da Marilia).
  const medBrand = comp?.medians.find((m) => m.group === (brand === 'combined' ? 'combined' : brand)) ?? null;

  const kpis = [
    { label: 'Custo Total Est.', value: fmtC(totalCost), color: COLORS.purple, icon: Wallet },
    { label: 'Custo por FTE', value: fmtC(fteCost), color: COLORS.flutter, icon: DollarSign },
    { label: 'Salário mediano', value: medBrand?.med_salary != null ? fmtC(medBrand.med_salary) : '—', color: COLORS.info, icon: Scale },
    { label: 'Custo / Hora Est.', value: `R$ ${hourCost}`, color: COLORS.nsx, icon: Activity },
    { label: 'FTEs', value: String(curr.headcount || 0), color: COLORS.orange, icon: Users },
  ];

  const costTrend = allMonthsData.map(d => {
    const tc = calcTotalCost(d);
    return {
      month: mLabel(d.month),
      custoFTE: d.headcount > 0 ? Math.round(tc / d.headcount) : 0,
      custoHora: d.headcount > 0 ? parseFloat((tc / d.headcount / 220).toFixed(2)) : 0,
    };
  });

  const salaryTrend = allMonthsData.map(d => ({
    month: mLabel(d.month),
    lideres: d.avg_salary_leaders || 0,
    naoLideres: d.avg_salary_non_leaders || 0,
  }));

  const depts = Object.entries(curr.dept_data || {})
    .filter(([k, v]) => !['DIRETORIA', 'GERAL'].includes(k) && (v.avg_salary_leaders > 0 || v.avg_salary_non_leaders > 0))
    .map(([k, v]) => {
      const avg = v.avg_salary_non_leaders > 0 ? v.avg_salary_non_leaders : v.avg_salary_leaders;
      return { name: shortDept(k), avg, hc: v.hc };
    })
    .sort((a, b) => b.avg - a.avg);

  const highestDept = depts[0];
  const lowestDept = depts[depts.length - 1];

  const sameMonthLastYear = allMonthsData.find(d => {
    const [y, mo] = d.month.split('-').map(Number);
    return y === (curr.year - 1) && mo === parseInt(curr.month.split('-')[1]);
  });
  const yoyCostChange = sameMonthLastYear && sameMonthLastYear.headcount > 0
    ? ((fteCost - Math.round(calcTotalCost(sameMonthLastYear) / sameMonthLastYear.headcount)) / Math.round(calcTotalCost(sameMonthLastYear) / sameMonthLastYear.headcount) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex gap-5 flex-wrap text-xs text-muted-foreground">
        <span>Ref: <strong className="text-foreground">{mLabel(currentMonth)}</strong></span>
        <span>Carga horária: <strong className="text-foreground">220h/mês</strong></span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {kpis.map(k => <KpiCard key={k.label} label={k.label} value={k.value} color={k.color} icon={k.icon} />)}
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        O <strong>salário mediano</strong> ({medBrand?.med_salary != null ? fmtC(medBrand.med_salary) : '—'})
        é a leitura mais robusta do &quot;típico&quot; da organização — menos puxada por poucos C-levels que a média.
      </p>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Evolução Custo por FTE" subtitle="Custo médio mensal por colaborador">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={costTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
              <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => fmtC(v)} />
              <Line type="monotone" dataKey="custoFTE" name="Custo/FTE" stroke={COLORS.flutter} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Salário Médio por Grupo" subtitle="Líderes vs Não-Líderes">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={salaryTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
              <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => fmtC(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="lideres" name="Líderes" stroke={COLORS.purple} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="naoLideres" name="Não-Líderes" stroke={COLORS.info} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Comp-ratio médio por área" subtitle="Quadro atual · marca selecionada (n≥3)">
          {areaComp && areaComp.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={areaComp} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis type="number" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} domain={[0, 'dataMax']} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="area" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} width={130} />
                <Tooltip
                  contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number, _n: string, item: any) => [`${v}% · ${item.payload.n} pessoas`, 'Comp-ratio médio']}
                />
                <Bar dataKey="cr" fill={COLORS.nsx + '99'} stroke={COLORS.nsx} strokeWidth={1} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground py-16 text-center">
              {comp ? 'Sem dados de comp para esta marca (ex.: Flutter International).' : 'Carregando…'}
            </p>
          )}
        </ChartCard>

        <ChartCard title="Composição CLT / PJ" subtitle="Quadro atual · contagem e salário médio">
          {contractMix && contractMix.total > 0 ? (
            <div className="space-y-3 pt-1">
              {contractMix.rows.map((r) => {
                const pct = contractMix.total > 0 ? (r.n / contractMix.total) * 100 : 0;
                return (
                  <div key={r.contract} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{r.contract}</span>
                      <span className="text-muted-foreground text-xs">
                        {r.n} ({pct.toFixed(0)}%){r.avg != null ? ` · ${fmtC(r.avg)} méd.` : ''}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: brandColor }} />
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground pt-1">
                Total com contrato informado: {contractMix.total}. Salário médio é do snapshot atual.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-16 text-center">
              {comp ? 'Sem dados de contrato para esta marca.' : 'Carregando…'}
            </p>
          )}
        </ChartCard>
      </div>

      {/* Bandas de senioridade (#13) */}
      {levelBands && levelBands.length > 0 && (
        <ChartCard title="Comp-ratio e salário por banda de senioridade" subtitle="Quadro atual · faixas de nível (n≥3)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border text-left">
                  <th className="p-2">Banda</th>
                  <th className="p-2 text-right">Pessoas</th>
                  <th className="p-2 text-right">Comp-ratio médio</th>
                  <th className="p-2 text-right">Salário médio</th>
                </tr>
              </thead>
              <tbody>
                {levelBands.map((b) => (
                  <tr key={b.band} className="border-b border-border/50">
                    <td className="p-2 font-medium">{b.band}</td>
                    <td className="p-2 text-right tabular-nums">{b.n}</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{b.cr != null ? `${b.cr}%` : '—'}</td>
                    <td className="p-2 text-right tabular-nums">{b.sal != null ? fmtC(b.sal) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Faixas não sobrepostas por nível. O split líder × IC dentro do nível (ex.: L4) depende da flag de liderança, que não está no agregado de comp — fica para uma próxima iteração.
          </p>
        </ChartCard>
      )}

      {/* Detailed Analysis */}
      <Card className="border-l-4 bg-card/50" style={{ borderLeftColor: brandColor }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-foreground">
            <BarChart3 className="h-5 w-5" style={{ color: brandColor }} />
            Análise de Compensação — {mLabel(currentMonth)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Visão Geral de Custos
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Custo Total Est.</span>
                  <span className="font-bold text-green-400">{fmtC(totalCost)}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Custo por FTE</span>
                  <span className="font-bold">{fmtC(fteCost)}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Custo / Hora</span>
                  <span className="font-bold">R$ {hourCost}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Var. vs mês ant.</span>
                  <span className={`font-bold ${costDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {costDelta >= 0 ? '+' : ''}{costDelta.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Estrutura Salarial
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Média Líderes</span>
                  <span className="font-bold text-purple-400">{fmtC(curr.avg_salary_leaders || 0)}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Média Não-Líderes</span>
                  <span className="font-bold text-blue-400">{fmtC(curr.avg_salary_non_leaders || 0)}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Gap Líder/NL</span>
                  <span className="font-bold">{salaryGap}x</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Líderes / Total</span>
                  <span className="font-bold">{leaders} / {curr.headcount || 0}</span>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Tendências
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Var. Headcount</span>
                  <span className={`font-bold ${hcDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {hcDelta >= 0 ? '+' : ''}{hcDelta.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Var. Custo/FTE (YoY)</span>
                  <span className={`font-bold ${yoyCostChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {yoyCostChange >= 0 ? '+' : ''}{yoyCostChange.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Maior Depto</span>
                  <span className="font-bold">{highestDept?.name || '—'}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Menor Depto</span>
                  <span className="font-bold">{lowestDept?.name || '—'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg border text-sm bg-muted/40 border-border/40 text-foreground">
            <div className="flex items-start gap-3">
              <BarChart3 className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <strong>Resumo:</strong>{' '}
                Custo total estimado {fmtC(totalCost)} ({fmtC(fteCost)} por FTE), variação de
                {' '}{costDelta >= 0 ? '+' : ''}{costDelta.toFixed(1)}% vs o mês anterior. O salário médio
                {' '}de líderes é {salaryGap}x o dos não-líderes.
              </div>
            </div>
          </div>

          <div className="bg-muted/40 border border-border/40 rounded-lg p-4">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Pontos de atenção
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="font-bold">1.</span>
                <span><strong>Evolução salarial:</strong> acompanhar custo por FTE e a razão líder/não-líder ao longo do tempo.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">2.</span>
                <span><strong>Comparabilidade:</strong> comparar comp-ratio por área e por banda de senioridade para leituras consistentes.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">3.</span>
                <span><strong>Cobertura do dado:</strong> Betfair/Flutter têm dado de comp parcial; considerar na leitura consolidada.</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
