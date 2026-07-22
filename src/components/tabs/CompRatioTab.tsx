import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  Legend,
  ReferenceLine
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Users,
  Target,
  Scale,
  BarChart3
} from 'lucide-react';
import { useDashboard } from '@/data/DashboardContext';
import { COLORS } from '@/lib/colors';

const BRAND_COLORS: Record<string, string> = {
  combined: COLORS.flutter,
  NSX: COLORS.nsx,
  'Betfair BR': COLORS.betfair,
  'Flutter International': COLORS.flutter,
  Porto: COLORS.flutter,
};
import { mLabel, fmtC, shortDept } from '@/data/helpers';
import {
  StorySection,
  StoryInsight,
  StoryMetric,
  StoryAlert,
  ExecutiveSummary
} from '@/components/dashboard/StorySection';

// Benchmark de mercado referencial (fixo, usado apenas como proxy)
const MARKET_BENCHMARK = 18500;

function calcTotalCost(d: { headcount: number; leaders: number; avg_salary_leaders: number; avg_salary_non_leaders: number }) {
  const l = d.leaders || 0;
  const nl = Math.max(0, (d.headcount || 0) - l);
  return (l * (d.avg_salary_leaders || 0)) + (nl * (d.avg_salary_non_leaders || 0));
}

function calcAvgSalary(d: { headcount: number; leaders: number; avg_salary_leaders: number; avg_salary_non_leaders: number }) {
  return d.headcount > 0 ? calcTotalCost(d) / d.headcount : 0;
}

export default function CompRatioTab() {
  const { brand, currentData, prevData, allMonthsData, currentMonth } = useDashboard();
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;
  const curr = currentData;

  const avgSalary = calcAvgSalary(curr);
  const compRatioProxy = avgSalary > 0 ? (avgSalary / MARKET_BENCHMARK) * 100 : 0;
  const prevAvgSalary = prevData ? calcAvgSalary(prevData) : 0;
  const salaryDelta = prevAvgSalary > 0 ? ((avgSalary - prevAvgSalary) / prevAvgSalary) * 100 : 0;

  const leaders = curr.leaders || 0;
  const nonLeaders = Math.max(0, (curr.headcount || 0) - leaders);

  const brandLabel = brand === 'combined' ? 'Combined' : brand;

  const quartileDistribution = [
    { name: 'Abaixo de P25', value: Math.max(0, Math.round(curr.headcount * 0.18)), color: COLORS.danger },
    { name: 'P25-P50', value: Math.max(0, Math.round(curr.headcount * 0.28)), color: COLORS.orange },
    { name: 'P50-P75', value: Math.max(0, Math.round(curr.headcount * 0.32)), color: COLORS.warning },
    { name: 'Acima de P75', value: Math.max(0, Math.round(curr.headcount * 0.22)), color: COLORS.success },
  ];

  const byArea = Object.entries(curr.dept_data || {})
    .filter(([k, v]) => !['DIRETORIA', 'GERAL'].includes(k) && (v.avg_salary_non_leaders > 0 || v.avg_salary_leaders > 0))
    .map(([k, v]) => {
      const avg = v.avg_salary_non_leaders > 0 ? v.avg_salary_non_leaders : v.avg_salary_leaders;
      return {
        area: shortDept(k),
        count: v.hc,
        avg_comp_ratio: avg > 0 ? parseFloat(((avg / MARKET_BENCHMARK) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.avg_comp_ratio - a.avg_comp_ratio);

  const trend = allMonthsData.map(d => ({
    month: mLabel(d.month),
    comp_ratio: parseFloat(((calcAvgSalary(d) / MARKET_BENCHMARK) * 100).toFixed(1)),
    avg_salary: Math.round(calcAvgSalary(d)),
  }));

  const formatCurrency = (value: number) => fmtC(value);

  const summaryText = `Em ${mLabel(currentMonth)}, o ${brandLabel} apresenta salário médio de ${formatCurrency(avgSalary)} e um posicionamento estimado de ${compRatioProxy.toFixed(1)}% em relação ao benchmark de mercado (R$ ${MARKET_BENCHMARK.toLocaleString('pt-BR')}).`;

  return (
    <div className="space-y-6">
      <ExecutiveSummary
        title={`Resumo Executivo — Comp. Ratio (${brandLabel})`}
        summary={summaryText}
        highlights={[
          { label: 'Salário Médio', value: formatCurrency(avgSalary), trend: salaryDelta >= 0 ? 'up' : 'down' },
          { label: 'CompRatio Est.', value: `${compRatioProxy.toFixed(1)}%`, trend: 'neutral' },
          { label: 'Headcount', value: String(curr.headcount || 0), trend: 'neutral' },
          { label: 'Líderes', value: String(leaders), trend: 'neutral' },
        ]}
        alerts={compRatioProxy > 120 ? [{
          title: 'Posicionamento Acima do Mercado',
          description: `CompRatio estimado de ${compRatioProxy.toFixed(1)}% indica salários acima do benchmark. Recomenda-se revisar política salarial.`,
          severity: 'medium'
        }] : compRatioProxy < 90 ? [{
          title: 'Posicionamento Abaixo do Mercado',
          description: `CompRatio estimado de ${compRatioProxy.toFixed(1)}% pode indicar risco de retenção.`,
          severity: 'high'
        }] : []}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StoryMetric
          label="CompRatio Médio Est."
          value={`${compRatioProxy.toFixed(1)}%`}
          subtext="vs benchmark mercado"
          trend={compRatioProxy >= 100 ? 'Acima do mercado' : 'Abaixo do mercado'}
          trendDirection={compRatioProxy >= 100 ? 'up' : 'down'}
          color={compRatioProxy >= 100 ? COLORS.success : COLORS.danger}
          icon={Target}
        />
        <StoryMetric
          label="Salário Médio Est."
          value={formatCurrency(avgSalary)}
          subtext="média ponderada"
          icon={DollarSign}
        />
        <StoryMetric
          label="Var. vs Mês Ant."
          value={`${salaryDelta >= 0 ? '+' : ''}${salaryDelta.toFixed(1)}%`}
          subtext="salário médio"
          trendDirection={salaryDelta >= 0 ? 'up' : 'down'}
          color={salaryDelta >= 0 ? COLORS.success : COLORS.danger}
          icon={salaryDelta >= 0 ? TrendingUp : TrendingDown}
        />
        <StoryMetric
          label="FTEs"
          value={String(curr.headcount || 0)}
          subtext="base de cálculo"
          icon={Users}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StorySection title="Distribuição Salarial Estimada" icon={Scale}>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={quartileDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {quartileDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <StoryInsight type="neutral">
            Distribuição estimada baseada no headcount atual. Para uma distribuição real por percentil, são necessários dados individuais de salários.
          </StoryInsight>
        </StorySection>

        <StorySection title="Evolução do CompRatio Estimado" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis dataKey="month" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis tick={{ fill: '#4a5568', fontSize: 9 }} domain={['dataMin - 10', 'dataMax + 10']} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
              <Line type="monotone" dataKey="comp_ratio" name="CompRatio Est." stroke={brandColor} strokeWidth={2} dot={{ r: 3 }} />
              <ReferenceLine y={100} name="Benchmark" stroke={COLORS.success} strokeDasharray="4 4" strokeWidth={1} />
            </LineChart>
          </ResponsiveContainer>
        </StorySection>
      </div>

      <StorySection title="CompRatio por Área" icon={BarChart3}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={byArea} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
            <XAxis type="number" tick={{ fill: '#4a5568', fontSize: 9 }} domain={[0, 'dataMax + 20']} />
            <YAxis type="category" dataKey="area" tick={{ fill: '#4a5568', fontSize: 10 }} width={100} />
            <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey="avg_comp_ratio" name="CompRatio Est." fill={brandColor} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <StoryInsight type={compRatioProxy >= 100 ? 'positive' : 'warning'}>
          {compRatioProxy >= 100
            ? `Posicionamento salarial estimado de ${compRatioProxy.toFixed(1)}% indica política competitiva.`
            : `Posicionamento salarial estimado de ${compRatioProxy.toFixed(1)}% pode indicar oportunidade de revisão salarial.`}
        </StoryInsight>
      </StorySection>

      {/* Detailed Analysis */}
      <Card className="border-l-4 bg-slate-900/50" style={{ borderLeftColor: brandColor }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-slate-100">
            <Scale className="h-5 w-5" style={{ color: brandColor }} />
            Análise de Posicionamento Salarial — {mLabel(currentMonth)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="font-semibold text-slate-100 mb-3">Métricas Gerais</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 bg-slate-800/50 rounded border">
                  <span className="text-slate-400">Salário Médio</span>
                  <span className="font-bold text-green-400">{formatCurrency(avgSalary)}</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-800/50 rounded border">
                  <span className="text-slate-400">Benchmark Mercado</span>
                  <span className="font-bold">{formatCurrency(MARKET_BENCHMARK)}</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-800/50 rounded border">
                  <span className="text-slate-400">CompRatio Est.</span>
                  <span className={`font-bold ${compRatioProxy >= 100 ? 'text-green-400' : 'text-red-400'}`}>{compRatioProxy.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-800/50 rounded border">
                  <span className="text-slate-400">Var. vs Mês Ant.</span>
                  <span className={`font-bold ${salaryDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {salaryDelta >= 0 ? '+' : ''}{salaryDelta.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="font-semibold text-slate-100 mb-3">Análise por Área</h3>
              <div className="space-y-2 text-sm max-h-[220px] overflow-auto">
                {byArea.map((area, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-slate-800/50 rounded border">
                    <span className="text-slate-300">{area.area}</span>
                    <div className="text-right">
                      <span className={`font-bold ${area.avg_comp_ratio >= 100 ? 'text-green-400' : 'text-yellow-400'}`}>
                        {area.avg_comp_ratio}%
                      </span>
                      <span className="text-xs text-slate-500 ml-2">({area.count})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`p-4 rounded-lg border text-sm ${compRatioProxy >= 90 && compRatioProxy <= 120 ? 'bg-green-950/40 border-green-500/30 text-green-300' : 'bg-amber-950/40 border-amber-500/30 text-amber-300'}`}>
            <div className="flex items-start gap-3">
              {compRatioProxy >= 90 && compRatioProxy <= 120 ? <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />}
              <div>
                <strong>Insight:</strong>{' '}
                O {brandLabel} apresenta salário médio de {formatCurrency(avgSalary)} e CompRatio estimado de {compRatioProxy.toFixed(1)}%.
                {compRatioProxy >= 90 && compRatioProxy <= 120
                  ? ' Posicionamento dentro da faixa saudável.'
                  : compRatioProxy > 120
                    ? ' Posicionamento acima do mercado pode indicar política premium ou necessidade de revisão de benchmark.'
                    : ' Posicionamento abaixo do mercado pode representar risco de retenção.'}
              </div>
            </div>
          </div>

          <div className="bg-amber-950/30 border border-amber-500/20 rounded-lg p-4">
            <h3 className="font-semibold text-amber-200 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Recomendações
            </h3>
            <ul className="space-y-2 text-sm text-amber-200">
              <li className="flex items-start gap-2">
                <span className="font-bold">1.</span>
                <span><strong>Revisar benchmark:</strong> Atualizar referências de mercado por área e nível regularmente.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">2.</span>
                <span><strong>Monitorar evolução:</strong> Acompanhar variação do salário médio e CompRatio mês a mês.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">3.</span>
                <span><strong>Análise por área:</strong> Identificar departamentos com maior desvio do benchmark para ação corretiva.</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
