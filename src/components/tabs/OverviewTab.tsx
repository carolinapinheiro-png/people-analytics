import { useDashboard } from '@/data/DashboardContext';
import { calcTurnover, promoRate, mLabel, fmt } from '@/data/helpers';
import KpiCard from '@/components/dashboard/KpiCard';
import ChartCard from '@/components/dashboard/ChartCard';
import { StorySection, StoryInsight, StoryMetric, StoryAlert } from '@/components/dashboard/StorySection';
import { COLORS } from '@/lib/colors';

const BRAND_COLORS: Record<string, string> = {
  combined: COLORS.flutter,
  NSX: COLORS.nsx,
  'Betfair BR': COLORS.betfair,
  'Flutter International': COLORS.flutter,
  Porto: COLORS.flutter,
};

const ATTRITION_HIGH_THRESHOLD = 5;
const ATTRITION_MEDIUM_THRESHOLD = 3;
const TURNOVER_ALERT_THRESHOLD = 10;
const LEADERSHIP_HEALTHY_MIN = 10;
const LEADERSHIP_HEALTHY_MAX = 20;
import {
  LineChart, Line, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, Area, AreaChart
} from 'recharts';
import { 
  Users, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Target,
  Award,
  Building2,
  ArrowRightLeft,
  UserCheck
} from 'lucide-react';

export default function OverviewTab() {
  const { currentData, prevData, allMonthsData, currentMonth, brand } = useDashboard();
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;
  const curr = currentData;
  const prev = prevData;
  const tv = calcTurnover(curr, prev);
  const pr = promoRate(curr);

  // Calculate narrative metrics
  const netGrowth = (curr.joiners || 0) - (curr.leavers || 0);
  const growthTrend = netGrowth > 0 ? 'positive' : netGrowth < 0 ? 'negative' : 'neutral';
  const attritionTrend = (curr.attrition_rate || 0) > ATTRITION_HIGH_THRESHOLD ? 'high' : (curr.attrition_rate || 0) > ATTRITION_MEDIUM_THRESHOLD ? 'medium' : 'low';
  const genderBalance = (curr.gender_female_pct || 0) >= 40 && (curr.gender_female_pct || 0) <= 60 ? 'balanced' : 'imbalanced';
  
  // Leadership health
  const leaderRatio = curr.leaders_pct || 0;
  const leaderHealth = leaderRatio >= LEADERSHIP_HEALTHY_MIN && leaderRatio <= LEADERSHIP_HEALTHY_MAX ? 'healthy' : leaderRatio < LEADERSHIP_HEALTHY_MIN ? 'low' : 'high';

  const kpis = [
    { 
      label: 'Headcount', 
      val: fmt(curr.headcount), 
      color: COLORS.flutter, 
      sub: 'Total ativo',
      icon: Users
    },
    { 
      label: 'Crescimento Líquido', 
      val: (netGrowth > 0 ? '+' : '') + netGrowth, 
      color: netGrowth >= 0 ? COLORS.success : COLORS.danger, 
      sub: 'Entradas - Saídas',
      icon: TrendingUp
    },
    { 
      label: 'Taxa de Atrição', 
      val: (curr.attrition_rate || 0).toFixed(2) + '%', 
      color: attritionTrend === 'high' ? COLORS.danger : attritionTrend === 'medium' ? COLORS.warning : COLORS.success, 
      sub: attritionTrend === 'high' ? 'Acima do ideal' : 'Dentro do esperado',
      icon: Activity
    },
    { 
      label: 'Turnover', 
      val: tv + '%', 
      color: tv > TURNOVER_ALERT_THRESHOLD ? COLORS.orange : COLORS.success, 
      sub: 'Movimentação total',
      icon: ArrowRightLeft
    },
    { 
      label: 'Mulheres', 
      val: (curr.gender_female_pct || 0) + '%', 
      color: COLORS.female, 
      sub: `${curr.gender_female || 0} colaboradoras`,
      icon: UserCheck
    },
    {
      label: 'Promoções',
      val: `${curr.promotions || 0}`, 
      color: COLORS.nsx, 
      sub: `${pr}% do HC`,
      icon: Target
    },
    { 
      label: 'Saídas', 
      val: String(curr.leavers || 0), 
      color: COLORS.danger, 
      sub: 'Este mês',
      icon: TrendingDown
    },
  ];

  // Enhanced trend data with storytelling
  const trendData = allMonthsData.map((d, i) => {
    const prev = i > 0 ? allMonthsData[i - 1] : undefined;
    const growth = prev ? d.headcount - prev.headcount : 0;
    return {
      month: mLabel(d.month),
      hc: d.headcount,
      growth: growth,
      joiners: d.joiners || 0,
      leavers: d.leavers || 0,
    };
  });

  const jlData = allMonthsData.map(d => ({
    month: mLabel(d.month),
    entradas: d.joiners || 0,
    saidas: d.leavers || 0,
    net: (d.joiners || 0) - (d.leavers || 0),
  }));

  const genderData = [
    { name: 'Female', value: curr.gender_female || 0, pct: curr.gender_female_pct || 0 },
    { name: 'Male', value: curr.gender_male || 0, pct: 100 - (curr.gender_female_pct || 0) },
  ];

  const leaderGenderData = [
    { name: 'Female', value: curr.leader_female || 0 },
    { name: 'Male', value: (curr.leaders || 0) - (curr.leader_female || 0) },
  ];

  const depts = Object.entries(curr.dept_data || {})
    .filter(([k, v]) => !['DIRETORIA', 'GERAL'].includes(k) && v.hc > 2)
    .sort((a, b) => b[1].hc - a[1].hc)
    .slice(0, 8)
    .map(([k, v]) => ({ 
      name: k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
      hc: v.hc,
      pct: ((v.hc / curr.headcount) * 100).toFixed(1)
    }));

  const attrTurnData = allMonthsData.map((d, i) => ({
    month: mLabel(d.month),
    attricao: d.attrition_rate > 20 ? null : d.attrition_rate || 0,
    turnover: calcTurnover(d, i > 0 ? allMonthsData[i - 1] : undefined),
  })).map(d => ({ ...d, turnover: (d.turnover as number) > 30 ? null : d.turnover }));

  const promoData = allMonthsData.map(d => ({
    month: mLabel(d.month),
    num: d.promotions || 0,
    pct: promoRate(d),
  }));

  // Generate executive narrative
  const generateNarrative = () => {
    const parts = [];
    
    // Headcount narrative
    if (netGrowth > 0) {
      parts.push(`crescimento de ${netGrowth} colaboradores`);
    } else if (netGrowth < 0) {
      parts.push(`redução de ${Math.abs(netGrowth)} colaboradores`);
    } else {
      parts.push('estabilidade no headcount');
    }
    
    // Attrition narrative
    if (attritionTrend === 'high') {
      parts.push('atrição elevada requer atenção');
    } else if (attritionTrend === 'medium') {
      parts.push('atrição dentro da faixa de atenção');
    } else {
      parts.push('atrição controlada');
    }
    
    // Gender narrative
    if (genderBalance === 'balanced') {
      parts.push('diversidade de gênero equilibrada');
    } else {
      parts.push('oportunidade de melhoria na diversidade');
    }
    
    return parts.join(', ');
  };

  return (
    <div className="space-y-6">
      {/* Executive Summary Header */}
      <div className="bg-gradient-to-r p-6 rounded-xl border" style={{ background: `linear-gradient(to right, ${brandColor}1a, transparent)`, borderColor: `${brandColor}33` }}>
        <div className="flex items-center gap-3 mb-3">
          <Building2 className="h-6 w-6" style={{ color: brandColor }} />
          <h2 className="text-xl font-bold text-slate-100">Resumo Executivo</h2>
          <span className="text-sm text-slate-400">{mLabel(currentMonth)}</span>
        </div>
        <p className="text-slate-300 leading-relaxed">
          Em {mLabel(currentMonth)}, a organização apresenta <strong>{generateNarrative()}</strong>. 
          Com {curr.headcount} colaboradores ativos, {curr.leaders} líderes ({curr.leaders_pct}% do total) 
          e {curr.promotions || 0} promoções realizadas, o cenário atual demonstra 
          {growthTrend === 'positive' ? ' expansão' : growthTrend === 'negative' ? ' contração' : ' estabilidade'} 
          {' '}com {attritionTrend === 'high' ? 'desafios de retenção' : 'indicadores saudáveis de retenção'}.
        </p>
      </div>

      {/* KPI Cards with Icons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((k, idx) => (
          <KpiCard 
            key={k.label} 
            label={k.label} 
            value={k.val} 
            color={k.color} 
            sub={k.sub}
          />
        ))}
      </div>

      {/* Headcount Evolution Story */}
      <StorySection title="Evolução do Headcount" icon={TrendingUp}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ChartCard title="Crescimento ao Longo do Tempo" subtitle="Headcount total e variação mensal">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorHc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={brandColor} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={brandColor} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
                  <XAxis dataKey="month" tick={{ fill: '#4a5568', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#4a5568', fontSize: 10 }} />
                  <Tooltip 
                    contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number, name: string) => [value, name === 'hc' ? 'Headcount' : name]}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="hc" 
                    stroke={brandColor} 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorHc)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <div className="space-y-3">
            <StoryMetric
              label="Total Atual"
              value={fmt(curr.headcount)}
              subtext="colaboradores"
              trend={netGrowth > 0 ? `+${netGrowth}` : `${netGrowth}`}
              trendDirection={netGrowth > 0 ? 'up' : netGrowth < 0 ? 'down' : 'neutral'}
            />
            <StoryMetric
              label="Média Mensal"
              value={fmt(Math.round(allMonthsData.reduce((acc, d) => acc + d.headcount, 0) / allMonthsData.length))}
              subtext="últimos 12 meses"
            />
            <StoryMetric
              label="Maior HC"
              value={fmt(Math.max(...allMonthsData.map(d => d.headcount)))}
              subtext="pico registrado"
            />
          </div>
        </div>
        <StoryInsight type={netGrowth >= 0 ? 'positive' : 'negative'}>
          O headcount {netGrowth >= 0 ? 'cresceu' : 'reduziu'} {Math.abs(netGrowth)} colaboradores em {mLabel(currentMonth)}, 
          representando uma variação de {((netGrowth / (curr.headcount - netGrowth)) * 100).toFixed(1)}% 
          em relação ao mês anterior. {netGrowth >= 0 
            ? 'Este crescimento demonstra expansão organizacional.' 
            : 'Esta redução requer atenção para entender os drivers de saída.'}
        </StoryInsight>
      </StorySection>

      {/* Movement Story */}
      <StorySection title="Movimentação de Pessoas" icon={ArrowRightLeft}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Entradas vs Saídas" subtitle="Fluxo mensal de colaboradores">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={jlData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
                <XAxis dataKey="month" tick={{ fill: '#4a5568', fontSize: 9 }} />
                <YAxis tick={{ fill: '#4a5568', fontSize: 9 }} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="entradas" name="Entradas" fill={COLORS.success + '99'} stroke={COLORS.success} strokeWidth={1} radius={[4, 4, 0, 0]} />
                <Bar dataKey="saidas" name="Saídas" fill={COLORS.danger + '99'} stroke={COLORS.danger} strokeWidth={1} radius={[4, 4, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Taxas de Movimentação" subtitle="Atrição vs Turnover (%)">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={attrTurnData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
                <XAxis dataKey="month" tick={{ fill: '#4a5568', fontSize: 9 }} />
                <YAxis tick={{ fill: '#4a5568', fontSize: 9 }} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
                <Line type="monotone" dataKey="attricao" name="Atrição %" stroke={COLORS.warning} strokeWidth={3} dot={{ r: 4 }} connectNulls />
                <Line type="monotone" dataKey="turnover" name="Turnover %" stroke={COLORS.orange} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" connectNulls />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        
        {attritionTrend === 'high' && (
          <StoryAlert title="Atenção: Atrição Elevada" severity="medium">
            A taxa de atrição de {(curr.attrition_rate || 0).toFixed(2)}% está acima do ideal ({ATTRITION_HIGH_THRESHOLD}%). 
            Recomenda-se revisar as causas principais de saída e implementar ações de retenção. 
            O turnover de {tv}% indica alta movimentação no período.
          </StoryAlert>
        )}
        
        <StoryInsight type={attritionTrend === 'high' ? 'negative' : 'positive'}>
          {attritionTrend === 'high' 
            ? `Com ${curr.leavers} saídas em ${mLabel(currentMonth)}, a atrição está acima do benchmark de mercado. 
               O turnover de ${tv}% indica que aproximadamente 1 em cada ${Math.round(100 / tv)} colaboradores 
               está sendo substituído mensalmente.`
            : `A atrição de ${(curr.attrition_rate || 0).toFixed(2)}% está dentro da faixa saudável, 
               indicando boa retenção de talentos. O turnover de ${tv}% reflete movimentação normal.`
          }
        </StoryInsight>
      </StorySection>

      {/* Distribuição por Departamento */}
      <StorySection title="Distribuição por Departamento" icon={Building2}>
        <ChartCard title="Headcount por área" subtitle="Colaboradores e % do total">
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={depts} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis type="number" tick={{ fill: '#4a5568', fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#4a5568', fontSize: 11 }} width={120} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }}
                formatter={(value: number, name: string, props: any) => [`${value} (${props.payload.pct}%)`, 'Colaboradores']}
              />
              <Bar dataKey="hc" fill={brandColor + '55'} stroke={brandColor} strokeWidth={1} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </StorySection>
    </div>
  );
}
