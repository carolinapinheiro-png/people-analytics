import { useDashboard } from '@/data/DashboardContext';
import { mLabel, fmt, fmtC } from '@/data/helpers';
import { StorySection, StoryMetric } from '@/components/dashboard/StorySection';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import DataQualityPanel from '@/components/dashboard/DataQualityPanel';

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

import { tx } from '@/lib/i18n';
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
      <DataQualityPanel />

      {/* Notas de confiabilidade / gaps (pergunta da Marilia) */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
          <Database className="h-4 w-4" />
          {tx("Confiabilidade e gaps conhecidos dos dados")}
        </h3>
        <ul className="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
          <li><strong className="text-foreground">{tx("PCD:")}</strong>{" "}{tx("campo quase vazio no cadastro (5 de ~649 ativos marcados) — subconta a representatividade real.")}</li>
          <li><strong className="text-foreground">{tx("Betfair (via Workday):")}</strong>{" "}{tx("a fonte não traz gênero, departamento nem salário; é retrato de mai/2026 (viés de sobrevivência no histórico).")}</li>
          <li><strong className="text-foreground">{tx("Flutter International:")}</strong>{" "}{tx("cadastro incompleto — sem histórico salarial e demográfico esparso.")}</li>
          <li><strong className="text-foreground">{tx("Atrição desejada × não desejada:")}</strong>{" "}{tx("estimativa (65% das saídas), não classificação individual real.")}</li>
          <li><strong className="text-foreground">{tx("Custo de substituição:")}</strong>{" "}{tx("premissa de R$ 45.000 por pessoa — não é custo apurado.")}</li>
          <li><strong className="text-foreground">{tx("Reconstrução histórica:")}</strong>{" "}{tx("liderança e nível usam o valor da época (nível assume +1 nível por promoção); gênero/estado são o valor atual onde não há histórico.")}</li>
          <li><strong className="text-foreground">{tx("\"Sem departamento\":")}</strong>{" "}{tx("ativos sem registro de depto vigente — cadastro a regularizar no DP.")}</li>
          <li><strong className="text-foreground">{tx("Metas e faixas (\"saudável/atenção\", 40%/30%):")}</strong>{" "}{tx("placeholders — dependem de validação da liderança para virarem referência.")}</li>
          <li><strong className="text-foreground">{tx("Salário individual:")}</strong>{" "}{tx("não é exposto no dashboard — apenas comp-ratio e agregados (médias/medianas).")}</li>
        </ul>
      </div>

      {/* Header */}
      <StorySection title={tx("Dados Brutos")} icon={Database} variant="highlight">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
          <p className="text-sm text-foreground">
            {tx("Visualização completa dos dados utilizados nos cálculos do dashboard.")}
            <span className="ml-1 text-muted-foreground">
              {tx("Marca:")}{" "}<strong className="text-foreground">{brand === 'combined' ? tx("Combinado") : brand}</strong>{" "}{tx("· Registros:")}{" "}<strong className="text-foreground">{allMonthsData.length}</strong>
            </span>
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StoryMetric label={tx("Média de HC")} value={fmt(avgHc)} subtext={tx("últimos 12 meses")} />
          <StoryMetric
            label={tx("Total de Entradas")}
            value={`+${totalJoiners}`}
            subtext="acumulado"
            trend="up"
            trendDirection="up"
          />
          <StoryMetric
            label={tx("Total de Saídas")}
            value={`-${totalLeavers}`}
            subtext="acumulado"
            trend="down"
            trendDirection="down"
          />
          <StoryMetric
            label={tx("Headcount Atual")}
            value={fmt(currentData.headcount)}
            subtext={mLabel(currentData.month)}
          />
        </div>
      </StorySection>

      {/* Monthly Data Table */}
      <StorySection title={tx("Dados Mensais — Série Completa")} icon={Calendar}>
        <ChartCard title={tx("Série Histórica")} subtitle={tx("Métricas mensais consolidadas")} icon={TrendingUp}>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left p-2 text-[10px] uppercase text-muted-foreground sticky left-0 bg-card/95 backdrop-blur-sm">
                    {tx("Mês")}
                  </th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">{tx("HC")}</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">{tx("Entradas")}</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">{tx("Saídas")}</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">{tx("Atrição %")}</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">{tx("Mulheres %")}</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">{tx("Líderes")}</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">{tx("Líd. %")}</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">{tx("Fem. Líd. %")}</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">{tx("Promoções")}</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">{tx("Sal. Líd.")}</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">{tx("Sal. Não-Líd.")}</th>
                </tr>
              </thead>
              <tbody>
                {allMonthsData.map((d, i) => (
                  <tr
                    key={d.month + i}
                    className="border-b border-border/30 hover:bg-muted/50"
                  >
                    <td className="p-2 font-semibold text-foreground sticky left-0 bg-card/95 backdrop-blur-sm">
                      {tx(mLabel(d.month))}
                    </td>
                    <td className="p-2 text-right text-foreground">{tx(fmt(d.headcount))}</td>
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
                    <td className="p-2 text-right text-foreground">{tx(fmtC(d.avg_salary_leaders))}</td>
                    <td className="p-2 text-right text-foreground">{tx(fmtC(d.avg_salary_non_leaders))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </StorySection>

      {/* Department Data */}
      <StorySection title={tx("Dados por Departamento")} icon={Building2}>
        <ChartCard
          title={tx("Departamentos")}
          subtitle={tx("Mês atual — {0}", [mLabel(currentData.month)])}
          icon={Building2}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left p-2 text-[10px] uppercase text-muted-foreground">{tx("Departamento")}</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">{tx("HC")}</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">{tx("Sal. Líd. Avg")}</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">{tx("Sal. Não-Líd. Avg")}</th>
                  <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">{tx("Gap")}</th>
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
                        <td className="p-2 font-semibold text-foreground">{tx(k)}</td>
                        <td className="p-2 text-right text-foreground">{v.hc || 0}</td>
                        <td className="p-2 text-right text-foreground">{tx(fmtC(v.avg_salary_leaders))}</td>
                        <td className="p-2 text-right text-foreground">{tx(fmtC(v.avg_salary_non_leaders))}</td>
                        <td className="p-2 text-right text-foreground">{tx(gap)}</td>
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
        <StorySection title={tx("Distribuição Geográfica")} icon={MapPin}>
          <ChartCard
            title={tx("Localização")}
            subtitle={tx("Mês atual — {0}", [mLabel(currentData.month)])}
            icon={MapPin}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left p-2 text-[10px] uppercase text-muted-foreground">{tx("Estado/Local")}</th>
                    <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">{tx("HC")}</th>
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
                          <td className="p-2 text-foreground">{tx(k)}</td>
                          <td className="p-2 text-right text-foreground">{v}</td>
                          <td className="p-2 text-right text-foreground">
                            {total > 0 ? tx(((v / total) * 100).toFixed(1)) : 0}%
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
