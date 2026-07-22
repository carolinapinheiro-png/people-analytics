import { useDashboard } from '@/data/DashboardContext';
import { calcTurnover, promoRate, mLabel } from '@/data/helpers';
import ChartCard from '@/components/dashboard/ChartCard';
import { StorySection, StoryMetric, StoryInsight, StoryAlert } from '@/components/dashboard/StorySection';
import { SubSection, MetricBox, ListItem } from '@/components/dashboard/SubSection';
import KpiCard from '@/components/dashboard/KpiCard';
import { COLORS } from '@/lib/colors';
import {
  LineChart, Line, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  Users,
  Target,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  Activity
} from 'lucide-react';

export default function TrendTab() {
  const { allMonthsData, brand } = useDashboard();

  const first = allMonthsData[0] || {} as typeof allMonthsData[0];
  const last = allMonthsData[allMonthsData.length - 1] || {} as typeof allMonthsData[0];

  const hcGrowth = first.headcount > 0 ? ((last.headcount - first.headcount) / first.headcount * 100) : 0;
  const avgMonthlyHcGrowth = allMonthsData.length > 1
    ? allMonthsData.slice(1).reduce((sum, d, i) => {
        const prev = allMonthsData[i];
        return sum + (prev.headcount > 0 ? (d.headcount - prev.headcount) / prev.headcount * 100 : 0);
      }, 0) / (allMonthsData.length - 1)
    : 0;

  const attritionValues = allMonthsData.map(d => d.attrition_rate || 0);
  const avgAttrition = attritionValues.length > 0 ? attritionValues.reduce((a, b) => a + b, 0) / attritionValues.length : 0;
  const minAttrition = attritionValues.length > 0 ? Math.min(...attritionValues) : 0;
  const maxAttrition = attritionValues.length > 0 ? Math.max(...attritionValues) : 0;

  const turnoverValues = allMonthsData.map((d, i) => calcTurnover(d, i > 0 ? allMonthsData[i - 1] : undefined));
  const avgTurnover = turnoverValues.length > 0 ? turnoverValues.reduce((a, b) => a + b, 0) / turnoverValues.length : 0;
  const minTurnover = turnoverValues.length > 0 ? Math.min(...turnoverValues) : 0;
  const maxTurnover = turnoverValues.length > 0 ? Math.max(...turnoverValues) : 0;

  const totalPromotions = allMonthsData.reduce((sum, d) => sum + (d.promotions || 0), 0);
  const avgPromotionsPerMonth = allMonthsData.length > 0 ? totalPromotions / allMonthsData.length : 0;
  const avgHeadcount = allMonthsData.length > 0 ? allMonthsData.reduce((sum, d) => sum + (d.headcount || 0), 0) / allMonthsData.length : 0;
  const annualPromoRate = avgHeadcount > 0 ? (totalPromotions / avgHeadcount * 100) : 0;

  const genderGap = (last.gender_female_pct || 0) - 40;
  const monthsToTarget = genderGap < 0 && avgMonthlyHcGrowth !== 0
    ? Math.ceil(Math.abs(genderGap) / Math.max(0.1, Math.abs(avgMonthlyHcGrowth)))
    : 0;

  const years = [...new Set(allMonthsData.map(d => d.year))].sort();

  const hcData = allMonthsData.map(d => {
    const point: Record<string, number | null | string> = { month: mLabel(d.month) };
    years.forEach(y => {
      point[String(y)] = d.year === y ? d.headcount : null;
    });
    return point;
  });

  const attrData = allMonthsData.map((d, i) => ({
    month: mLabel(d.month),
    attricao: d.attrition_rate > 20 ? null : d.attrition_rate || 0,
    turnover: (() => { const v = calcTurnover(d, i > 0 ? allMonthsData[i - 1] : undefined); return v > 30 ? null : v; })(),
  }));

  const genderData = allMonthsData.map(d => ({
    month: mLabel(d.month),
    female: d.gender_female_pct,
    target: 40,
  }));

  const leaderData = allMonthsData.map(d => ({
    month: mLabel(d.month),
    lideres: d.leaders_pct,
    femaleLideres: d.leader_female_pct,
  }));

  const promoData = allMonthsData.map(d => ({
    month: mLabel(d.month),
    num: d.promotions || 0,
    pct: promoRate(d),
  }));

  const peakPromo = allMonthsData.reduce((max, d) => (d.promotions || 0) > (max.promotions || 0) ? d : max, allMonthsData[0]);

  const yearlyStats = years.map(year => {
    const yearData = allMonthsData.filter(d => d.year === year);
    const avgHc = yearData.reduce((sum, d) => sum + (d.headcount || 0), 0) / yearData.length;
    const avgAttr = yearData.reduce((sum, d) => sum + (d.attrition_rate || 0), 0) / yearData.length;
    return { year, avgHc, avgAttr };
  });

  const periodStart = first.month ? mLabel(first.month) : '—';
  const periodEnd = last.month ? mLabel(last.month) : '—';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex gap-5 flex-wrap text-xs text-muted-foreground">
        <span>Mostrando: <strong className="text-foreground">{brand === 'combined' ? 'Combined' : brand}</strong></span>
        <span>Período: <strong className="text-foreground">{periodStart} – {periodEnd}</strong></span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Crescimento HC"
          value={`${hcGrowth >= 0 ? '+' : ''}${hcGrowth.toFixed(1)}%`}
          sub={`${first.headcount || 0} → ${last.headcount || 0} colaboradores`}
          icon={TrendingUp}
          color={hcGrowth >= 0 ? COLORS.success : COLORS.danger}
        />
        <KpiCard
          label="Attrição Média"
          value={`${avgAttrition.toFixed(1)}%`}
          sub={`Range: ${minAttrition.toFixed(1)}% - ${maxAttrition.toFixed(1)}%`}
          icon={Activity}
          color={avgAttrition > 15 ? COLORS.danger : avgAttrition > 10 ? COLORS.warning : COLORS.success}
        />
        <KpiCard
          label="% Female"
          value={`${last.gender_female_pct || 0}%`}
          sub={`Gap: ${genderGap >= 0 ? '+' : ''}${genderGap.toFixed(1)}pp vs meta 40%`}
          icon={Target}
          color={COLORS.female}
        />
        <KpiCard
          label="Promoções"
          value={String(totalPromotions)}
          sub={`Taxa: ${annualPromoRate.toFixed(1)}% do HC médio`}
          icon={ArrowUpRight}
          color={COLORS.purple}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Headcount ao Longo do Tempo" icon={Users}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={hcData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis dataKey="month" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis tick={{ fill: '#4a5568', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {years.map((year, idx) => (
                <Line
                  key={year}
                  type="monotone"
                  dataKey={String(year)}
                  name={String(year)}
                  stroke={idx === 0 ? COLORS.flutter : COLORS.nsx}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Attrição vs Turnover" icon={Activity}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={attrData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis dataKey="month" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis tick={{ fill: '#4a5568', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="attricao" name="Attrição" stroke={COLORS.amber} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="turnover" name="Turnover" stroke={COLORS.orange} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Evolução Female %" icon={Target}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={genderData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis dataKey="month" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis tick={{ fill: '#4a5568', fontSize: 9 }} domain={[0, 60]} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="female" name="Female %" stroke={COLORS.female} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="target" name="Meta 40%" stroke={COLORS.success} strokeDasharray="4 4" strokeWidth={1} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Líderes % e Female Líderes %" icon={Users}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={leaderData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis dataKey="month" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis tick={{ fill: '#4a5568', fontSize: 9 }} domain={[0, 50]} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="lideres" name="Líderes %" stroke={COLORS.info} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="femaleLideres" name="Female Líderes %" stroke={COLORS.purple} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Promoções — Nº e % HC" icon={ArrowUpRight}>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={promoData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis dataKey="month" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis yAxisId="left" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="num" name="Nº" fill={COLORS.nsx + '77'} stroke={COLORS.nsx} strokeWidth={1} />
              <Line yAxisId="right" type="monotone" dataKey="pct" name="% HC" stroke={COLORS.purple} strokeWidth={2} dot={{ r: 3 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ANÁLISE DETALHADA */}
      <StorySection title="Análise Detalhada - Tendências" icon={TrendingUp} variant="highlight">

        {/* 1. Headcount Analysis */}
        <SubSection title="1. Evolução do Headcount" icon={Users}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricBox label={periodStart} value={String(first.headcount || 0)} />
            <MetricBox label={periodEnd} value={String(last.headcount || 0)} variant="success" />
            <MetricBox label="Crescimento" value={`${hcGrowth >= 0 ? '+' : ''}${hcGrowth.toFixed(1)}%`} variant={hcGrowth >= 0 ? 'success' : 'danger'} />
            <MetricBox label="Média Mensal" value={`${avgMonthlyHcGrowth >= 0 ? '+' : ''}${avgMonthlyHcGrowth.toFixed(1)}%`} />
          </div>
          <StoryInsight type={hcGrowth >= 0 ? 'positive' : 'negative'}>
            Crescimento de {hcGrowth.toFixed(1)}% no período, com média mensal de {avgMonthlyHcGrowth >= 0 ? '+' : ''}{avgMonthlyHcGrowth.toFixed(1)}%.
            {hcGrowth >= 0 ? ' Indica expansão da operação.' : ' Indica redução de headcount.'}
          </StoryInsight>
        </SubSection>

        {/* 2. Attrition & Turnover */}
        <SubSection title="2. Attrição vs Turnover" icon={Activity}>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg border bg-amber-950/20 border-amber-500/20 text-center">
              <p className="text-xs text-slate-400 mb-1">Attrição Média</p>
              <p className="text-2xl font-bold text-amber-400">{avgAttrition.toFixed(1)}%</p>
              <p className="text-xs text-slate-400 mt-1">Range: {minAttrition.toFixed(1)}% - {maxAttrition.toFixed(1)}%</p>
              <Badge className="mt-2 bg-amber-500/20 text-amber-300 border-amber-500/30">{avgAttrition > 15 ? 'Alto' : avgAttrition > 10 ? 'Monitorar' : 'Adequado'}</Badge>
            </div>
            <div className="p-3 rounded-lg border bg-orange-950/20 border-orange-500/20 text-center">
              <p className="text-xs text-slate-400 mb-1">Turnover Médio</p>
              <p className="text-2xl font-bold text-orange-400">{avgTurnover.toFixed(1)}%</p>
              <p className="text-xs text-slate-400 mt-1">Range: {minTurnover.toFixed(1)}% - {maxTurnover.toFixed(1)}%</p>
              <Badge className="mt-2 bg-orange-500/20 text-orange-300 border-orange-500/30">{avgTurnover > 20 ? 'Alto' : avgTurnover > 15 ? 'Monitorar' : 'Adequado'}</Badge>
            </div>
          </div>
          <StoryInsight type={avgTurnover > 15 ? 'warning' : 'positive'}>
            Attrição média de {avgAttrition.toFixed(1)}% e turnover médio de {avgTurnover.toFixed(1)}% no período.
            {avgTurnover > 15 ? ' Turnover elevado requer monitoramento contínuo.' : ' Indicadores dentro de patamar saudável.'}
          </StoryInsight>
        </SubSection>

        {/* 3. Gender Diversity */}
        <SubSection title="3. Diversidade de Gênero" icon={Target}>
          <div className="grid grid-cols-3 gap-4">
            <MetricBox label="Atual" value={`${last.gender_female_pct || 0}%`} variant="info" subtext="Female" />
            <MetricBox label="Target" value="40%" subtext="Meta" />
            <MetricBox label="Gap" value={`${genderGap >= 0 ? '+' : ''}${genderGap.toFixed(1)}%`} variant="info" subtext={genderGap < 0 ? `Faltam ~${monthsToTarget} meses` : 'Meta atingida'} />
          </div>
          <StoryInsight type={genderGap >= 0 ? 'positive' : 'warning'}>
            Female % evoluiu de {(first.gender_female_pct || 0).toFixed(1)}% ({periodStart}) para {(last.gender_female_pct || 0).toFixed(1)}% ({periodEnd}).
            {genderGap < 0
              ? ` Com ritmo atual, meta de 40% será atingida em aproximadamente ${monthsToTarget} meses.`
              : ' Meta de 40% atingida ou superada.'}
          </StoryInsight>
        </SubSection>

        {/* 4. Leadership */}
        <SubSection title="4. Liderança" icon={Users}>
          <div className="grid grid-cols-2 gap-4">
            <MetricBox label="Total Líderes" value={`${last.leaders_pct || 0}%`} variant="info" subtext="do headcount" />
            <MetricBox label="Female Líderes" value={`${last.leader_female_pct || 0}%`} variant="info" subtext="das lideranças" />
          </div>
          <StoryInsight type="positive">
            Representatividade feminina na liderança ({last.leader_female_pct || 0}%) e taxa de liderança total ({last.leaders_pct || 0}%)
            refletem a estrutura organizacional atual do {brand === 'combined' ? 'Combined' : brand}.
          </StoryInsight>
        </SubSection>

        {/* 5. Promotions */}
        <SubSection title="5. Promoções" icon={ArrowUpRight}>
          <div className="grid grid-cols-3 gap-4">
            <MetricBox label="Total" value={totalPromotions} variant="success" subtext="promoções" />
            <MetricBox label="Média Mensal" value={avgPromotionsPerMonth.toFixed(1)} variant="info" subtext="promoções/mês" />
            <MetricBox label="Taxa" value={`${annualPromoRate.toFixed(1)}%`} variant="info" subtext="do HC médio" />
          </div>
          <StoryInsight type="positive">
            Taxa de promoção de {annualPromoRate.toFixed(1)}% no período, com {totalPromotions} promoções no total.
            {peakPromo && (peakPromo.promotions || 0) > 0 && ` Pico em ${mLabel(peakPromo.month)} (${peakPromo.promotions} promoções).`}
          </StoryInsight>
        </SubSection>

        {/* 6. Comparative Analysis */}
        {yearlyStats.length > 1 && (
          <SubSection title="6. Análise Comparativa por Ano" icon={CheckCircle2}>
            <div className="space-y-2">
              {yearlyStats.map((stat, idx) => (
                <ListItem
                  key={stat.year}
                  label={`Headcount Médio ${stat.year}`}
                  value={`${Math.round(stat.avgHc)} colaboradores${idx > 0 ? ` (${((stat.avgHc - yearlyStats[idx - 1].avgHc) / yearlyStats[idx - 1].avgHc * 100) >= 0 ? '+' : ''}${((stat.avgHc - yearlyStats[idx - 1].avgHc) / yearlyStats[idx - 1].avgHc * 100).toFixed(1)}%)` : ''}`}
                  variant={idx > 0 && stat.avgHc >= yearlyStats[idx - 1].avgHc ? 'success' : 'default'}
                />
              ))}
              {yearlyStats.map((stat, idx) => (
                <ListItem
                  key={`attr-${stat.year}`}
                  label={`Attrição Média ${stat.year}`}
                  value={`${stat.avgAttr.toFixed(1)}%${idx > 0 ? ` (${(stat.avgAttr - yearlyStats[idx - 1].avgAttr) >= 0 ? '+' : ''}${(stat.avgAttr - yearlyStats[idx - 1].avgAttr).toFixed(1)}pp)` : ''}`}
                  variant={idx > 0 && stat.avgAttr <= yearlyStats[idx - 1].avgAttr ? 'success' : 'default'}
                />
              ))}
            </div>
            <StoryInsight type="positive">
              Comparativo anual baseado nos dados disponíveis. Acompanhar evolução de headcount e attrição para identificar tendências.
            </StoryInsight>
          </SubSection>
        )}

        {/* 7. Alerts & Recommendations */}
        <StoryAlert title="Alertas e Recomendações" severity="medium">
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="font-bold">1.</span>
              <span><strong>Monitorar Turnover:</strong> Turnover médio de {avgTurnover.toFixed(1)}% requer acompanhamento. Focar em entrevistas de desligamento nas áreas críticas.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">2.</span>
              <span><strong>Acelerar Diversidade:</strong> Meta de 40% female {genderGap < 0 ? `ainda não atingida. Projeção de ${monthsToTarget} meses para alcançar.` : 'atingida. Manter ações de retenção.'}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">3.</span>
              <span><strong>Manter Promoções:</strong> Taxa de {annualPromoRate.toFixed(1)}% reflete oportunidades de crescimento interno. Continuar investindo em desenvolvimento.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">4.</span>
              <span><strong>Otimizar Crescimento:</strong> Crescimento de {hcGrowth.toFixed(1)}% no período deve ser acompanhado de produtividade por colaborador.</span>
            </li>
          </ul>
        </StoryAlert>

      </StorySection>
    </div>
  );
}
