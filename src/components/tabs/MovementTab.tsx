import { useDashboard } from '@/data/DashboardContext';
import { promoRate, mLabel } from '@/data/helpers';
import ChartCard from '@/components/dashboard/ChartCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { COLORS } from '@/lib/colors';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { Award, Activity, BarChart3, TrendingUp } from 'lucide-react';

/**
 * Aba Movimentacao enxugada (decisao da area): entradas/saidas e
 * atricao/turnover sairam (ja vivem no Overview). Fica so PROMOCOES. Vira
 * "movimentacoes salariais" (merito x promocao) na onda de reajuste.
 */
export default function MovementTab() {
  const { allMonthsData, currentMonth } = useDashboard();

  const monthsCount = allMonthsData.length || 1;
  const totalPromotions = allMonthsData.reduce((sum, d) => sum + (d.promotions || 0), 0);
  const avgHc = allMonthsData.reduce((sum, d) => sum + d.headcount, 0) / monthsCount;
  const promotionRate = avgHc > 0 ? (totalPromotions / avgHc * 100) : 0;
  const peakPromotions = allMonthsData.reduce(
    (max, d) => ((d.promotions || 0) > (max.promotions || 0) ? d : max),
    allMonthsData[0] ?? { promotions: 0, month: '' },
  );

  const promoData = allMonthsData.map((d) => ({
    month: mLabel(d.month),
    num: d.promotions || 0,
    pct: promoRate(d),
  }));

  const years = [...new Set(allMonthsData.map((d) => d.year))].sort();
  const yearlyPromotions = years.map((year) => ({
    year,
    promotions: allMonthsData.filter((d) => d.year === year).reduce((s, d) => s + (d.promotions || 0), 0),
    months: allMonthsData.filter((d) => d.year === year).length,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Award className="h-5 w-5 text-[hsl(var(--purple))]" />
          Promoções
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Reconstruídas do histórico (Motivo = &quot;Promoção&quot;). Ref: {mLabel(currentMonth)}. Esta
          aba passará a reunir movimentações salariais (mérito × promoção) quando o reajuste entrar.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Total no período</p>
            <p className="text-xl font-bold text-purple-400">{totalPromotions}</p>
            <p className="text-xs text-slate-400 mt-1">{monthsCount} meses</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Média mensal</p>
            <p className="text-xl font-bold text-purple-400">{(totalPromotions / monthsCount).toFixed(1)}</p>
            <p className="text-xs text-slate-400 mt-1">promoções/mês</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Taxa sobre HC médio</p>
            <p className="text-xl font-bold text-purple-400">{promotionRate.toFixed(1)}%</p>
            <p className="text-xs text-slate-400 mt-1">no período</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-400">Pico mensal</p>
            <p className="text-xl font-bold text-purple-400">{peakPromotions?.promotions || 0}</p>
            <p className="text-xs text-slate-400 mt-1">{peakPromotions?.month ? mLabel(peakPromotions.month) : '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <ChartCard title="Promoções — Nº e % do HC" icon={Award}>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={promoData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
            <XAxis dataKey="month" tick={{ fill: '#4a5568', fontSize: 9 }} />
            <YAxis yAxisId="left" tick={{ fill: '#4a5568', fontSize: 9 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#4a5568', fontSize: 9 }} tickFormatter={(v) => `${v}%`} />
            <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="num" name="Nº" fill={COLORS.purple + '77'} stroke={COLORS.purple} strokeWidth={1} radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="pct" name="% HC" stroke={COLORS.nsx} strokeWidth={2} dot={{ r: 3 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Análise */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Análise de Promoções
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-300">
            <strong>Resumo:</strong> {totalPromotions} promoções no período ({(totalPromotions / monthsCount).toFixed(1)}/mês),
            {' '}taxa de {promotionRate.toFixed(1)}% sobre o headcount médio.
            {peakPromotions && (peakPromotions.promotions || 0) > 0 && ` Pico de ${peakPromotions.promotions} em ${mLabel(peakPromotions.month)}.`}
          </p>

          {yearlyPromotions.length > 1 && (
            <div className="bg-slate-800/50 rounded-lg p-4">
              <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Comparativo por ano
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {yearlyPromotions.map((s) => (
                  <div key={s.year} className="bg-slate-700/50 p-3 rounded flex justify-between items-center">
                    <span className="text-slate-300 text-xs font-medium">{s.year} ({s.months} meses)</span>
                    <span className="font-bold text-purple-400 flex items-center gap-1">
                      <TrendingUp className="h-3.5 w-3.5" /> {s.promotions}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
