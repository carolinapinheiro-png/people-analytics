import { useDashboard } from '@/data/DashboardContext';
import { calcTurnover, promoRate, mLabel, fmt } from '@/data/helpers';
import ChartCard from '@/components/dashboard/ChartCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { COLORS } from '@/lib/colors';
import {
  LineChart, Line, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell
} from 'recharts';
import {
  Users,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  BarChart3,
  UserPlus,
  UserMinus,
  Award
} from 'lucide-react';

export default function MovementTab() {
  const { allMonthsData, currentMonth } = useDashboard();

  const totalJoiners = allMonthsData.reduce((sum, d) => sum + (d.joiners || 0), 0);
  const totalLeavers = allMonthsData.reduce((sum, d) => sum + (d.leavers || 0), 0);
  const totalPromotions = allMonthsData.reduce((sum, d) => sum + (d.promotions || 0), 0);
  const netTotal = totalJoiners - totalLeavers;
  const monthsCount = allMonthsData.length || 1;

  const avgMonthlyJoiners = totalJoiners / monthsCount;
  const avgMonthlyLeavers = totalLeavers / monthsCount;
  const avgMonthlyNet = netTotal / monthsCount;
  const avgAttrition = allMonthsData.reduce((sum, d) => sum + (d.attrition_rate || 0), 0) / monthsCount;
  const avgTurnover = allMonthsData.reduce((sum, d, i) => sum + calcTurnover(d, i > 0 ? allMonthsData[i - 1] : undefined), 0) / monthsCount;

  const peakJoiners = allMonthsData.reduce((max, d) => (d.joiners || 0) > (max.joiners || 0) ? d : max, allMonthsData[0]);
  const peakLeavers = allMonthsData.reduce((max, d) => (d.leavers || 0) > (max.leavers || 0) ? d : max, allMonthsData[0]);
  const peakPromotions = allMonthsData.reduce((max, d) => (d.promotions || 0) > (max.promotions || 0) ? d : max, allMonthsData[0]);

  const replacementRate = totalJoiners > 0 ? (totalLeavers / totalJoiners * 100) : 0;
  const firstHc = allMonthsData[0]?.headcount || 0;
  const lastHc = allMonthsData[allMonthsData.length - 1]?.headcount || 0;
  const growthRate = firstHc > 0 ? ((lastHc - firstHc) / firstHc * 100) : 0;
  const avgHc = allMonthsData.reduce((sum, d) => sum + d.headcount, 0) / monthsCount;
  const promotionRate = avgHc > 0 ? (totalPromotions / avgHc * 100) : 0;

  const negativeMonths = allMonthsData
    .map(d => ({ month: d.month, net: (d.joiners || 0) - (d.leavers || 0), joiners: d.joiners || 0, leavers: d.leavers || 0 }))
    .filter(d => d.net < 0)
    .sort((a, b) => a.net - b.net);

  const attrData = allMonthsData.map((d, i) => ({
    month: mLabel(d.month),
    attricao: d.attrition_rate > 20 ? null : d.attrition_rate || 0,
    turnover: (() => { const v = calcTurnover(d, i > 0 ? allMonthsData[i - 1] : undefined); return v > 30 ? null : v; })(),
  }));

  const joinersData = allMonthsData.map(d => ({ month: mLabel(d.month), entradas: d.joiners || 0 }));
  const leaversData = allMonthsData.map(d => ({ month: mLabel(d.month), saidas: d.leavers || 0 }));

  const netData = allMonthsData.map(d => ({
    month: mLabel(d.month),
    net: (d.joiners || 0) - (d.leavers || 0),
  }));

  const promoData = allMonthsData.map(d => ({
    month: mLabel(d.month),
    num: d.promotions || 0,
    pct: promoRate(d),
  }));

  const years = [...new Set(allMonthsData.map(d => d.year))].sort();
  const yearlyStats = years.map(year => {
    const yearData = allMonthsData.filter(d => d.year === year);
    return {
      year,
      joiners: yearData.reduce((sum, d) => sum + (d.joiners || 0), 0),
      leavers: yearData.reduce((sum, d) => sum + (d.leavers || 0), 0),
      promotions: yearData.reduce((sum, d) => sum + (d.promotions || 0), 0),
      net: yearData.reduce((sum, d) => sum + (d.joiners || 0), 0) - yearData.reduce((sum, d) => sum + (d.leavers || 0), 0),
      months: yearData.length,
    };
  });

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Total Entradas</p>
                <p className="text-xl font-bold text-green-400">{totalJoiners}</p>
              </div>
              <UserPlus className="h-6 w-6 text-green-500" />
            </div>
            <p className="text-xs text-slate-400 mt-1">Média: {avgMonthlyJoiners.toFixed(1)}/mês</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Total Saídas</p>
                <p className="text-xl font-bold text-red-400">{totalLeavers}</p>
              </div>
              <UserMinus className="h-6 w-6 text-red-500" />
            </div>
            <p className="text-xs text-slate-400 mt-1">Média: {avgMonthlyLeavers.toFixed(1)}/mês</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Saldo Líquido</p>
                <p className={`text-xl font-bold ${netTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {netTotal >= 0 ? '+' : ''}{netTotal}
                </p>
              </div>
              {netTotal >= 0 ? <TrendingUp className="h-6 w-6 text-green-500" /> : <TrendingDown className="h-6 w-6 text-red-500" />}
            </div>
            <p className="text-xs text-slate-400 mt-1">Média: {avgMonthlyNet.toFixed(1)}/mês</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Total Promoções</p>
                <p className="text-xl font-bold text-purple-400">{totalPromotions}</p>
              </div>
              <Award className="h-6 w-6 text-purple-500" />
            </div>
            <p className="text-xs text-slate-400 mt-1">Taxa: {promotionRate.toFixed(1)}% do HC médio</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Entradas vs Saídas" icon={UserPlus}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={allMonthsData.map(d => ({ month: mLabel(d.month), entradas: d.joiners || 0, saidas: d.leavers || 0 }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis dataKey="month" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis tick={{ fill: '#4a5568', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="entradas" name="Entradas" fill={COLORS.success + '99'} stroke={COLORS.success} strokeWidth={1} radius={[4, 4, 0, 0]} />
              <Bar dataKey="saidas" name="Saídas" fill={COLORS.danger + '99'} stroke={COLORS.danger} strokeWidth={1} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Saldo Líquido Mensal" icon={Activity}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={netData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis dataKey="month" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis tick={{ fill: '#4a5568', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="net" name="Saldo Líquido" fill={COLORS.info + '99'} stroke={COLORS.info} strokeWidth={1} radius={[4, 4, 0, 0]}>
                {netData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={(entry.net >= 0 ? COLORS.success : COLORS.danger) + '99'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Atrição vs Turnover" icon={Activity}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={attrData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis dataKey="month" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis tick={{ fill: '#4a5568', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="attricao" name="Atrição %" stroke={COLORS.warning} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="turnover" name="Turnover %" stroke={COLORS.orange} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Promoções — Nº e % HC" icon={Award}>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={promoData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis dataKey="month" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis yAxisId="left" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="num" name="Nº" fill={COLORS.purple + '77'} stroke={COLORS.purple} strokeWidth={1} radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="pct" name="% HC" stroke={COLORS.nsx} strokeWidth={2} dot={{ r: 3 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Detailed Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Análise Detalhada da Movimentação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* 1. Overview */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              1. Visão Geral
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="bg-slate-800/50 p-3 rounded border">
                <p className="text-slate-400 text-xs">Taxa de Reposição</p>
                <p className="font-bold text-xl text-amber-400">{replacementRate.toFixed(1)}%</p>
                <p className="text-xs text-slate-400">saídas/entradas</p>
              </div>
              <div className="bg-slate-800/50 p-3 rounded border">
                <p className="text-slate-400 text-xs">Crescimento no Período</p>
                <p className={`font-bold text-xl ${growthRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {growthRate >= 0 ? '+' : ''}{growthRate.toFixed(1)}%
                </p>
                <p className="text-xs text-slate-400">{firstHc} → {lastHc}</p>
              </div>
              <div className="bg-slate-800/50 p-3 rounded border">
                <p className="text-slate-400 text-xs">Atrição Média</p>
                <p className="font-bold text-xl text-amber-400">{avgAttrition.toFixed(1)}%</p>
                <p className="text-xs text-slate-400">média mensal</p>
              </div>
              <div className="bg-slate-800/50 p-3 rounded border">
                <p className="text-slate-400 text-xs">Turnover Médio</p>
                <p className="font-bold text-xl text-orange-400">{avgTurnover.toFixed(1)}%</p>
                <p className="text-xs text-slate-400">média mensal</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-300 italic">
              <strong>Insight:</strong> Taxa de reposição de {replacementRate.toFixed(1)}% indica que
              {replacementRate < 50 ? ' a maior parte das contratações representa crescimento líquido.' :
               replacementRate < 80 ? ' cerca da metade das contratações são para reposição de vagas.' :
               ' a maioria das contratações são para reposição de saídas.'}
            </p>
          </div>

          {/* 2. Entradas */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              2. Análise de Entradas
            </h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="bg-green-950/30 p-3 rounded border border-green-500/20">
                <p className="text-slate-400 text-xs">Total</p>
                <p className="font-bold text-xl text-green-400">{totalJoiners}</p>
                <p className="text-xs text-slate-400">{monthsCount} meses</p>
              </div>
              <div className="bg-green-950/30 p-3 rounded border border-green-500/20">
                <p className="text-slate-400 text-xs">Média Mensal</p>
                <p className="font-bold text-xl text-green-400">{avgMonthlyJoiners.toFixed(1)}</p>
                <p className="text-xs text-slate-400">entradas/mês</p>
              </div>
              <div className="bg-green-950/30 p-3 rounded border border-green-500/20">
                <p className="text-slate-400 text-xs">Pico</p>
                <p className="font-bold text-xl text-green-400">{peakJoiners?.joiners || 0}</p>
                <p className="text-xs text-slate-400">{peakJoiners?.month ? mLabel(peakJoiners.month) : '—'}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-300 italic">
              <strong>Insight:</strong> Média de {avgMonthlyJoiners.toFixed(1)} entradas mensais, com pico de {peakJoiners?.joiners || 0} em {peakJoiners?.month ? mLabel(peakJoiners.month) : '—'}.
            </p>
          </div>

          {/* 3. Saídas */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <UserMinus className="h-4 w-4" />
              3. Análise de Saídas
            </h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="bg-red-950/30 p-3 rounded border border-red-500/20">
                <p className="text-slate-400 text-xs">Total</p>
                <p className="font-bold text-xl text-red-400">{totalLeavers}</p>
                <p className="text-xs text-slate-400">{monthsCount} meses</p>
              </div>
              <div className="bg-red-950/30 p-3 rounded border border-red-500/20">
                <p className="text-slate-400 text-xs">Média Mensal</p>
                <p className="font-bold text-xl text-red-400">{avgMonthlyLeavers.toFixed(1)}</p>
                <p className="text-xs text-slate-400">saídas/mês</p>
              </div>
              <div className="bg-red-950/30 p-3 rounded border border-red-500/20">
                <p className="text-slate-400 text-xs">Pico</p>
                <p className="font-bold text-xl text-red-400">{peakLeavers?.leavers || 0}</p>
                <p className="text-xs text-slate-400">{peakLeavers?.month ? mLabel(peakLeavers.month) : '—'}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-300 italic">
              <strong>Insight:</strong> Média de {avgMonthlyLeavers.toFixed(1)} saídas mensais, com pico de {peakLeavers?.leavers || 0} em {peakLeavers?.month ? mLabel(peakLeavers.month) : '—'}.
              {negativeMonths.length > 0 && ` ${negativeMonths.length} mês(es) apresentaram saldo negativo.`}
            </p>
          </div>

          {/* 4. Negative Months */}
          {negativeMonths.length > 0 && (
            <div className="bg-red-950/30 border border-red-500/20 rounded-lg p-4">
              <h3 className="font-semibold text-red-200 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                4. Meses com Saldo Negativo
              </h3>
              <div className="space-y-1 text-xs text-red-200">
                {negativeMonths.map((m, i) => (
                  <div key={i} className="flex justify-between p-1 bg-red-950/30 rounded">
                    <span>{mLabel(m.month)}</span>
                    <span className="font-bold text-red-400">{m.net} ({m.joiners} entradas, {m.leavers} saídas)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. Promoções */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <Award className="h-4 w-4" />
              5. Análise de Promoções
            </h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="bg-slate-800/50 p-3 rounded border">
                <p className="text-slate-400 text-xs">Total Promoções</p>
                <p className="font-bold text-xl text-purple-400">{totalPromotions}</p>
                <p className="text-xs text-slate-400">{monthsCount} meses</p>
              </div>
              <div className="bg-slate-800/50 p-3 rounded border">
                <p className="text-slate-400 text-xs">Média Mensal</p>
                <p className="font-bold text-xl text-purple-400">{(totalPromotions / monthsCount).toFixed(1)}</p>
                <p className="text-xs text-slate-400">promoções/mês</p>
              </div>
              <div className="bg-slate-800/50 p-3 rounded border">
                <p className="text-slate-400 text-xs">Pico</p>
                <p className="font-bold text-xl text-purple-400">{peakPromotions?.promotions || 0}</p>
                <p className="text-xs text-slate-400">{peakPromotions?.month ? mLabel(peakPromotions.month) : '—'}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-300 italic">
              <strong>Insight:</strong> Taxa de promoção de {promotionRate.toFixed(1)}% sobre o headcount médio.
              {peakPromotions && (peakPromotions.promotions || 0) > 0 && ` Pico de ${peakPromotions.promotions} promoções em ${mLabel(peakPromotions.month)}.`}
            </p>
          </div>

          {/* 6. Análise Temporal */}
          {yearlyStats.length > 1 && (
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                6. Análise Comparativa por Ano
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {yearlyStats.map(stat => (
                  <div key={stat.year} className="bg-slate-700/50 p-3 rounded">
                    <p className="text-slate-300 text-xs font-medium">{stat.year} ({stat.months} meses)</p>
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between"><span>Entradas:</span><span className="font-bold text-green-400">{stat.joiners}</span></div>
                      <div className="flex justify-between"><span>Saídas:</span><span className="font-bold text-red-400">{stat.leavers}</span></div>
                      <div className="flex justify-between"><span>Net:</span><span className={`font-bold ${stat.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>{stat.net >= 0 ? '+' : ''}{stat.net}</span></div>
                      <div className="flex justify-between"><span>Promoções:</span><span className="font-bold text-purple-400">{stat.promotions}</span></div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-300 italic">
                <strong>Insight:</strong> Comparativo anual baseado nos dados disponíveis. Acompanhar a evolução de entradas, saídas e promoções.
              </p>
            </div>
          )}

          {/* 7. Recomendações */}
          <div className="bg-amber-950/30 border border-amber-500/20 rounded-lg p-4">
            <h3 className="font-semibold text-amber-200 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              7. Recomendações Estratégicas
            </h3>
            <ul className="space-y-2 text-sm text-amber-200">
              <li className="flex items-start gap-2">
                <span className="font-bold">1.</span>
                <span><strong>Sustentar Crescimento:</strong> Ritmo médio de {avgMonthlyJoiners.toFixed(1)} entradas/mês. Garantir qualidade no processo seletivo para manter cultura organizacional.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">2.</span>
                <span><strong>Investigar Picos de Saídas:</strong> {peakLeavers?.month ? `Pico em ${mLabel(peakLeavers.month)} (${peakLeavers.leavers} saídas).` : 'Monitorar saídas recorrentes.'} Realizar entrevistas de desligamento para identificar causas.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">3.</span>
                <span><strong>Manter Taxa de Promoções:</strong> Taxa de {promotionRate.toFixed(1)}% reflete oportunidades de crescimento interno. Continuar investindo em desenvolvimento.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">4.</span>
                <span><strong>Monitorar Turnover:</strong> Turnover médio de {avgTurnover.toFixed(1)}% requer acompanhamento, especialmente em períodos de crescimento acelerado.</span>
              </li>
            </ul>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
