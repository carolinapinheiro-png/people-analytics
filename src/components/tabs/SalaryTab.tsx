import { useDashboard } from '@/data/DashboardContext';
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

  const kpis = [
    { label: 'Custo Total Est.', value: fmtC(totalCost), color: COLORS.purple, icon: Wallet },
    { label: 'Custo por FTE', value: fmtC(fteCost), color: COLORS.flutter, icon: DollarSign },
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map(k => <KpiCard key={k.label} label={k.label} value={k.value} color={k.color} icon={k.icon} />)}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Evolução Custo por FTE" subtitle="Custo médio mensal por colaborador">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={costTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis dataKey="month" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis tick={{ fill: '#4a5568', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => fmtC(v)} />
              <Line type="monotone" dataKey="custoFTE" name="Custo/FTE" stroke={COLORS.flutter} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Salário Médio por Grupo" subtitle="Líderes vs Não-Líderes">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={salaryTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis dataKey="month" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis tick={{ fill: '#4a5568', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => fmtC(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="lideres" name="Líderes" stroke={COLORS.purple} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="naoLideres" name="Não-Líderes" stroke={COLORS.info} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Salário Médio por Depto" subtitle="Ordenado do maior para o menor">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={depts} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis type="number" tick={{ fill: '#4a5568', fontSize: 9 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#4a5568', fontSize: 9 }} width={80} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => fmtC(v)} />
              <Bar dataKey="avg" fill={COLORS.flutter + '77'} stroke={COLORS.flutter} strokeWidth={1} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Detalhe por Departamento" subtitle="Headcount e salário médio">
          <div className="overflow-auto max-h-[240px]">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground uppercase">
                <tr>
                  <th className="text-left py-2">Depto</th>
                  <th className="text-right py-2">HC</th>
                  <th className="text-right py-2">Sal. Médio</th>
                </tr>
              </thead>
              <tbody>
                {depts.map(d => (
                  <tr key={d.name} className="border-t border-border">
                    <td className="py-2 font-medium">{d.name}</td>
                    <td className="py-2 text-right">{d.hc}</td>
                    <td className="py-2 text-right">{fmtC(d.avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      {/* Detailed Analysis */}
      <Card className="border-l-4 bg-slate-900/50" style={{ borderLeftColor: brandColor }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-slate-100">
            <BarChart3 className="h-5 w-5" style={{ color: brandColor }} />
            Análise de Compensação — {mLabel(currentMonth)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Visão Geral de Custos
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 bg-slate-800/50 rounded border">
                  <span className="text-slate-400">Custo Total Est.</span>
                  <span className="font-bold text-green-400">{fmtC(totalCost)}</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-800/50 rounded border">
                  <span className="text-slate-400">Custo por FTE</span>
                  <span className="font-bold">{fmtC(fteCost)}</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-800/50 rounded border">
                  <span className="text-slate-400">Custo / Hora</span>
                  <span className="font-bold">R$ {hourCost}</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-800/50 rounded border">
                  <span className="text-slate-400">Var. vs mês ant.</span>
                  <span className={`font-bold ${costDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {costDelta >= 0 ? '+' : ''}{costDelta.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Estrutura Salarial
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 bg-slate-800/50 rounded border">
                  <span className="text-slate-400">Média Líderes</span>
                  <span className="font-bold text-purple-400">{fmtC(curr.avg_salary_leaders || 0)}</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-800/50 rounded border">
                  <span className="text-slate-400">Média Não-Líderes</span>
                  <span className="font-bold text-blue-400">{fmtC(curr.avg_salary_non_leaders || 0)}</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-800/50 rounded border">
                  <span className="text-slate-400">Gap Líder/NL</span>
                  <span className="font-bold">{salaryGap}x</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-800/50 rounded border">
                  <span className="text-slate-400">Líderes / Total</span>
                  <span className="font-bold">{leaders} / {curr.headcount || 0}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Tendências
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 bg-slate-800/50 rounded border">
                  <span className="text-slate-400">Var. Headcount</span>
                  <span className={`font-bold ${hcDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {hcDelta >= 0 ? '+' : ''}{hcDelta.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between p-2 bg-slate-800/50 rounded border">
                  <span className="text-slate-400">Var. Custo/FTE (YoY)</span>
                  <span className={`font-bold ${yoyCostChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {yoyCostChange >= 0 ? '+' : ''}{yoyCostChange.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between p-2 bg-slate-800/50 rounded border">
                  <span className="text-slate-400">Maior Depto</span>
                  <span className="font-bold">{highestDept?.name || '—'}</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-800/50 rounded border">
                  <span className="text-slate-400">Menor Depto</span>
                  <span className="font-bold">{lowestDept?.name || '—'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className={`p-4 rounded-lg border text-sm ${costDelta > 10 ? 'bg-amber-950/40 border-amber-500/30 text-amber-300' : 'bg-green-950/40 border-green-500/30 text-green-300'}`}>
            <div className="flex items-start gap-3">
              {costDelta > 10 ? <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" /> : <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />}
              <div>
                <strong>Insight:</strong>{' '}
                O custo total estimado é {fmtC(totalCost)} ({fmtC(fteCost)} por FTE).
                {costDelta > 10
                  ? ` A variação de ${costDelta.toFixed(1)}% no custo total vs mês anterior merece atenção.`
                  : ` Variação de custo vs mês anterior está em ${costDelta.toFixed(1)}%.`}
                {' '}O gap salarial líder/não-líder é de {salaryGap}x.
              </div>
            </div>
          </div>

          <div className="bg-amber-950/30 border border-amber-500/20 rounded-lg p-4">
            <h3 className="font-semibold text-amber-200 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Recomendações Estratégicas
            </h3>
            <ul className="space-y-2 text-sm text-amber-200">
              <li className="flex items-start gap-2">
                <span className="font-bold">1.</span>
                <span><strong>Monitorar evolução salarial:</strong> Acompanhar custo por FTE e gap líder/não-líder ao longo do tempo.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">2.</span>
                <span><strong>Benchmark por departamento:</strong> Comparar salários médios por área com práticas de mercado.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">3.</span>
                <span><strong>Eficiência:</strong> Avaliar relação entre custo e headcount por departamento para identificar oportunidades.</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
