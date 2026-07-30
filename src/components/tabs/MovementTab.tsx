import { useDashboard } from '@/data/DashboardContext';
import { mLabel, fmtC } from '@/data/helpers';
import ChartCard from '@/components/dashboard/ChartCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { COLORS } from '@/lib/colors';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Award, BarChart3, TrendingUp } from 'lucide-react';

/**
 * Movimentacoes salariais reconstruidas do historico (Motivo): promocao x
 * merito/reajuste x dissidio (reajuste coletivo), com nº de eventos e valor do
 * reajuste. Substitui a antiga aba Movimentacao (entradas/saidas/atricao foram
 * para o Overview).
 */

type RaiseKey = 'promocao' | 'merito' | 'dissidio';
const TYPES: Array<{ key: RaiseKey; label: string; color: string }> = [
  { key: 'promocao', label: 'Promoção', color: COLORS.purple },
  { key: 'merito', label: 'Mérito/Reajuste', color: COLORS.nsx },
  { key: 'dissidio', label: 'Dissídio (coletivo)', color: COLORS.info },
];

export default function MovementTab() {
  const { allMonthsData, currentMonth } = useDashboard();

  const re = (d: { raise_events?: Record<string, { n: number; delta: number }> }, k: RaiseKey) =>
    d.raise_events?.[k] ?? { n: 0, delta: 0 };

  const totals: Record<RaiseKey, { n: number; delta: number }> = {
    promocao: { n: 0, delta: 0 },
    merito: { n: 0, delta: 0 },
    dissidio: { n: 0, delta: 0 },
  };
  allMonthsData.forEach((d) => {
    TYPES.forEach(({ key }) => {
      const x = re(d, key);
      totals[key].n += x.n;
      totals[key].delta += x.delta;
    });
  });
  const grandDelta = totals.promocao.delta + totals.merito.delta + totals.dissidio.delta;

  const monthlyN = allMonthsData.map((d) => ({
    month: mLabel(d.month),
    Promoção: re(d, 'promocao').n,
    'Mérito/Reajuste': re(d, 'merito').n,
    'Dissídio (coletivo)': re(d, 'dissidio').n,
  }));
  const monthlyValue = allMonthsData.map((d) => ({
    month: mLabel(d.month),
    Promoção: re(d, 'promocao').delta,
    'Mérito/Reajuste': re(d, 'merito').delta,
    'Dissídio (coletivo)': re(d, 'dissidio').delta,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Award className="h-5 w-5 text-[hsl(var(--purple))]" />
          Movimentações Salariais
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Reconstruídas do histórico (Motivo). Valor = salário do evento menos o último salário
          conhecido da pessoa. Ref: {mLabel(currentMonth)}.
        </p>
      </div>

      {/* KPIs por tipo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {TYPES.map(({ key, label, color }) => (
          <Card key={key}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold" style={{ color }}>{totals[key].n}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {totals[key].n > 0 ? `${fmtC(Math.round(totals[key].delta / totals[key].n))} médio` : 'sem eventos'}
              </p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Reajuste total (período)</p>
            <p className="text-xl font-bold text-green-400">{fmtC(grandDelta)}</p>
            <p className="text-xs text-muted-foreground mt-1">soma dos três tipos</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Eventos por mês e tipo" subtitle="Nº de movimentações" icon={Award}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyN}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
              <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {TYPES.map(({ label, color }) => (
                <Bar key={label} dataKey={label} stackId="n" fill={color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Valor do reajuste por mês e tipo" subtitle="Soma dos reajustes (R$)" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyValue}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
              <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => fmtC(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {TYPES.map(({ label, color }) => (
                <Bar key={label} dataKey={label} stackId="v" fill={color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Análise */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Como ler
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-foreground">
          <p>
            <strong>Promoção</strong>: mudança de cargo com aumento (maior reajuste médio).{' '}
            <strong>Mérito/Reajuste</strong>: ajuste individual por desempenho.{' '}
            <strong>Dissídio</strong>: reajuste coletivo da categoria (inclui antecipação e acordo
            coletivo) — muitos eventos, valor pequeno por pessoa.
          </p>
          <p className="text-xs text-muted-foreground">
            No período: {totals.promocao.n} promoções, {totals.merito.n} méritos e {totals.dissidio.n}{' '}
            dissídios; reajuste total reconstruído de {fmtC(grandDelta)}. Betfair só tem histórico
            das pessoas vindas do Talent Mobility; Flutter International não tem histórico salarial.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
