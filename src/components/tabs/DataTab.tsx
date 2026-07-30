import { useDashboard } from '@/data/DashboardContext';
import { mLabel, fmt, fmtC } from '@/data/helpers';
import { StorySection, StoryMetric } from '@/components/dashboard/StorySection';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';

const BRAND_COLORS: Record<string, string> = {
  combined: COLORS.flutter,
  NSX: COLORS.nsx,
  'Betfair BR': COLORS.betfair,
  'Flutter International': COLORS.flutter,
  Porto: COLORS.flutter,
};

import {
  Calendar,
  Building2,
  MapPin,
  TrendingUp,
  Database,
} from 'lucide-react';

export default function DataTab() {
  const { allMonthsData, currentData, brand } = useDashboard();
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;

  const totalJoiners = allMonthsData.reduce((acc, d) => acc + (d.joiners || 0), 0);
  const totalLeavers = allMonthsData.reduce((acc, d) => acc + (d.leavers || 0), 0);
  const avgHc = Math.round(
    allMonthsData.reduce((acc, d) => acc + d.headcount, 0) / allMonthsData.length
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <StorySection title="Dados Brutos" icon={Database} variant="highlight">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
          <p className="text-sm text-foreground">
            Visualização completa dos dados utilizados nos cálculos do dashboard.
            <span className="ml-1 text-muted-foreground">
              Marca: <strong className="text-foreground">{brand === 'combined' ? 'Combinado' : brand}</strong> ·
              Registros: <strong className="text-foreground">{allMonthsData.length}</strong>
            </span>
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StoryMetric label="Média de HC" value={fmt(avgHc)} subtext="últimos 12 meses" />
          <StoryMetric
            label="Total de Entradas"
            value={`+${totalJoiners}`}
            subtext="acumulado"
            trend="up"
            trendDirection="up"
          />
          <StoryMetric
            label="Total de Saídas"
            value={`-${totalLeavers}`}
            subtext="acumulado"
            trend="down"
            trendDirection="down"
          />
          <StoryMetric
            label="Headcount Atual"
            value={fmt(currentData.headcount)}
            subtext={mLabel(currentData.month)}
          />
        </div>
      </StorySection>

      {/* Monthly Data Table */}
      <StorySection title="Dados Mensais — Série Completa" icon={Calendar}>
        <ChartCard title="Série Histórica" subtitle="Métricas mensais consolidadas" icon={TrendingUp}>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left p-2 text-[10px] uppercase text-muted-foreground sticky left-0 bg-card/95 backdrop-blur-sm">
                    Mês
                  </th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">HC</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Entradas</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Saídas</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Atrição %</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Mulheres %</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Líderes</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Líd. %</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Fem. Líd. %</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Promoções</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Sal. Líd.</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Sal. Não-Líd.</th>
                </tr>
              </thead>
              <tbody>
                {allMonthsData.map((d, i) => (
                  <tr
                    key={d.month + i}
                    className="border-b border-border/30 hover:bg-muted/50"
                  >
                    <td className="p-2 font-semibold text-foreground sticky left-0 bg-card/95 backdrop-blur-sm">
                      {mLabel(d.month)}
                    </td>
                    <td className="p-2 text-right text-foreground">{fmt(d.headcount)}</td>
                    <td className="p-2 text-right text-green-400">+{d.joiners || 0}</td>
                    <td className="p-2 text-right text-red-400">-{d.leavers || 0}</td>
                    <td className="p-2 text-right text-foreground">
                      {d.attrition_rate > 20 ? '—' : (d.attrition_rate || 0) + '%'}
                    </td>
                    <td className="p-2 text-right text-foreground">{d.gender_female_pct || 0}%</td>
                    <td className="p-2 text-right text-foreground">{d.leaders || 0}</td>
                    <td className="p-2 text-right text-foreground">{d.leaders_pct || 0}%</td>
                    <td className="p-2 text-right text-foreground">{d.leader_female_pct || 0}%</td>
                    <td className="p-2 text-right text-foreground">{d.promotions || 0}</td>
                    <td className="p-2 text-right text-foreground">{fmtC(d.avg_salary_leaders)}</td>
                    <td className="p-2 text-right text-foreground">{fmtC(d.avg_salary_non_leaders)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </StorySection>

      {/* Department Data */}
      <StorySection title="Dados por Departamento" icon={Building2}>
        <ChartCard
          title="Departamentos"
          subtitle={`Mês atual — ${mLabel(currentData.month)}`}
          icon={Building2}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left p-2 text-[10px] uppercase text-muted-foreground">Departamento</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">HC</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Sal. Líd. Avg</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Sal. Não-Líd. Avg</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Gap</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(currentData.dept_data || {})
                  .sort((a, b) => b[1].hc - a[1].hc)
                  .map(([k, v]) => {
                    const gap =
                      v.avg_salary_leaders > 0 && v.avg_salary_non_leaders > 0
                        ? (v.avg_salary_leaders / v.avg_salary_non_leaders).toFixed(1) + 'x'
                        : '—';
                    return (
                      <tr
                        key={k}
                        className="border-b border-border/30 hover:bg-muted/50"
                      >
                        <td className="p-2 font-semibold text-foreground">{k}</td>
                        <td className="p-2 text-right text-foreground">{v.hc || 0}</td>
                        <td className="p-2 text-right text-foreground">{fmtC(v.avg_salary_leaders)}</td>
                        <td className="p-2 text-right text-foreground">{fmtC(v.avg_salary_non_leaders)}</td>
                        <td className="p-2 text-right text-foreground">{gap}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </StorySection>

      {/* State Mix */}
      {Object.keys(currentData.state_mix || {}).length > 0 && (
        <StorySection title="Distribuição Geográfica" icon={MapPin}>
          <ChartCard
            title="Localização"
            subtitle={`Mês atual — ${mLabel(currentData.month)}`}
            icon={MapPin}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left p-2 text-[10px] uppercase text-muted-foreground">Estado/Local</th>
                    <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">HC</th>
                    <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">%</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(currentData.state_mix || {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => {
                      const total = Object.values(currentData.state_mix || {}).reduce(
                        (a, b) => a + b,
                        0
                      );
                      return (
                        <tr key={k} className="border-b border-border/30">
                          <td className="p-2 text-foreground">{k}</td>
                          <td className="p-2 text-right text-foreground">{v}</td>
                          <td className="p-2 text-right text-foreground">
                            {total > 0 ? ((v / total) * 100).toFixed(1) : 0}%
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </StorySection>
      )}
    </div>
  );
}
