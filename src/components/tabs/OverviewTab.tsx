import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useDashboard } from '@/data/DashboardContext';
import { getExperienceData } from '@/lib/experience.functions';
import { getHeadcountMix, type HeadcountMix } from '@/lib/comp.functions';
import { calcTurnover, promoRate, mLabel, fmt } from '@/data/helpers';

const NSX_COS = ['NSX BRASIL RECIFE', 'NSX BRASIL SÃO PAULO', 'NSX MARECHAL'];
const BRAND_COMPANIES: Record<string, string[]> = {
  NSX: NSX_COS,
  'Betfair BR': ['NSX BETFAIR BRASIL S.A.'],
  'Flutter International': [],
  combined: [...NSX_COS, 'NSX BETFAIR BRASIL S.A.'],
};
const TENURE_ORDER = ['0-3m', '3-6m', '6-12m', '1-2a', '2-5a', '5a+'];
import KpiCard from '@/components/dashboard/KpiCard';
import ChartCard from '@/components/dashboard/ChartCard';
import { StorySection, StoryInsight, StoryMetric, StoryAlert } from '@/components/dashboard/StorySection';
import { COLORS } from '@/lib/colors';
import SeriesCutView from '@/components/dashboard/SeriesCutView';
import { applySeriesFilter, resolveSeriesCut, type SeriesFilterKey } from '@/data/series-filter';

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
  UserCheck,
  AlertTriangle,
} from 'lucide-react';

/** Rotulos das dimensoes de recorte, iguais aos da barra de filtros. */
const CUT_LABELS: Record<SeriesFilterKey, string> = {
  level: 'Nível',
  tempoCasa: 'Tempo de casa',
};

export default function OverviewTab() {
  const { currentData, prevData, allMonthsData, currentMonth, brand, filters, leavers } =
    useDashboard();

  // Recorte de dimensao unica (nivel ou tempo de casa). A serie mensal guarda
  // as bases separadas -- nao existe o cruzamento level x tempo de casa --, por
  // isso aqui e um so. Quando os dois vem selecionados (o usuario pode te-los
  // ativado na aba de Atricao, onde a leitura e pessoa a pessoa e o cruzamento
  // existe), resolveSeriesCut escolhe um e devolve o outro em `ignored`, que a
  // tela avisa em vez de ignorar em silencio.
  const seriesCut = resolveSeriesCut({ level: filters.level, tempoCasa: filters.tempoCasa });
  const cutKey: SeriesFilterKey | null = seriesCut.key;
  const cutValue = seriesCut.value;
  // O departamento entra aqui para as saidas serem contadas na MESMA populacao
  // do headcount. Antes o numerador vinha da empresa toda e o denominador do
  // departamento -- a atricao resultante nao correspondia a nada.
  const cut = applySeriesFilter(allMonthsData, leavers, cutKey, cutValue, filters.departamento);

  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;

  const curr = currentData;
  const prev = prevData;
  const tv = calcTurnover(curr, prev);
  const pr = promoRate(curr);

  // eNPS company-wide (clima, ultima onda). Fica no board executivo mesmo sendo
  // um numero unico da empresa (nao quebra por marca).
  const [enps, setEnps] = useState<{ v: number | null; d: number | null } | null>(null);
  const fetchExp = useServerFn(getExperienceData);
  useEffect(() => {
    let cancelled = false;
    fetchExp()
      .then((d: unknown) => {
        if (cancelled) return;
        const eng = (d as { engagement?: Array<{ scope: string; enps: number | null; enps_delta: number | null }> }).engagement ?? [];
        const c = eng.find((e) => e.scope === 'company');
        if (c) setEnps({ v: c.enps, d: c.enps_delta });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fetchExp]);

  // Composicao CLT/PJ (snapshot atual, contagem pura) para o quadro do HC.
  //
  // Vinha de `getCompAggregates`, que passou a exigir a aba Compensation. Quem
  // nao tem a aba ficava com "…" para sempre nesta linha -- um carregamento que
  // nunca termina se parece com lentidao, nao com falta de acesso, e ninguem
  // abre chamado por uma tela lenta. Agora vem de `getHeadcountMix`, que so
  // conta contrato e responde sob a permissao do proprio Overview.
  const [comp, setComp] = useState<HeadcountMix | null>(null);
  const [compErro, setCompErro] = useState<string | null>(null);
  const fetchComp = useServerFn(getHeadcountMix);
  useEffect(() => {
    let cancelled = false;
    fetchComp()
      .then((d) => { if (!cancelled) setComp(d as HeadcountMix); })
      // Engolir o erro deixava a linha em "…" indefinidamente. Guardar a
      // mensagem custa uma linha e transforma "parece travado" em "deu erro".
      .catch((e: unknown) => {
        if (!cancelled) setCompErro(e instanceof Error ? e.message : 'erro');
      });
    return () => { cancelled = true; };
  }, [fetchComp]);
  const contractMix = (() => {
    if (!comp) return null;
    const set = new Set(BRAND_COMPANIES[brand] ?? BRAND_COMPANIES.combined);
    const acc: Record<string, number> = {};
    comp.contracts.forEach((c) => { if (set.has(c.company)) acc[c.contract] = (acc[c.contract] ?? 0) + c.n; });
    const total = Object.values(acc).reduce((s, n) => s + n, 0);
    return { clt: acc['CLT'] ?? 0, pj: acc['PJ'] ?? 0, total };
  })();

  // Time que mais cresceu no mes (variacao de HC por depto vs mes anterior).
  const topGrowthDept = (() => {
    const prevMonth = allMonthsData[allMonthsData.length - 2];
    if (!prevMonth) return null;
    let best: { dept: string; delta: number } | null = null;
    for (const [dept, v] of Object.entries(curr.dept_data || {})) {
      if (dept === 'SEM DEPTO') continue;
      const delta = (v.hc || 0) - (prevMonth.dept_data?.[dept]?.hc || 0);
      if (!best || delta > best.delta) best = { dept, delta };
    }
    return best && best.delta > 0 ? best : null;
  })();

  // Tempo de casa: faixa mais comum do mes atual.
  const tenureTop = (() => {
    const tb = curr.tenure_base || {};
    const entries = TENURE_ORDER.map((k) => ({ k, n: tb[k] || 0 })).filter((e) => e.n > 0);
    const total = entries.reduce((s, e) => s + e.n, 0);
    const top = entries.sort((a, b) => b.n - a.n)[0];
    return top && total > 0 ? { faixa: top.k, pct: (top.n / total) * 100 } : null;
  })();

  // Panorama do periodo (incorpora a antiga aba Trend na visao executiva).
  const periodFirst = allMonthsData[0];
  const periodLast = allMonthsData[allMonthsData.length - 1];
  const hcGrowthPct = periodFirst?.headcount > 0 ? ((periodLast.headcount - periodFirst.headcount) / periodFirst.headcount) * 100 : 0;
  const attritionVals = allMonthsData.map((d) => d.attrition_rate || 0);
  const avgAttrition = attritionVals.length ? attritionVals.reduce((a, b) => a + b, 0) / attritionVals.length : 0;
  const turnoverVals = allMonthsData.map((d, i) => calcTurnover(d, i > 0 ? allMonthsData[i - 1] : undefined));
  const avgTurnover = turnoverVals.length ? turnoverVals.reduce((a, b) => a + b, 0) / turnoverVals.length : 0;
  const periodYears = [...new Set(allMonthsData.map((d) => d.year))].sort();
  const yearlyStats = periodYears.map((year) => {
    const yd = allMonthsData.filter((d) => d.year === year);
    return {
      year,
      avgHc: Math.round(yd.reduce((s, d) => s + (d.headcount || 0), 0) / yd.length),
      avgAttr: yd.reduce((s, d) => s + (d.attrition_rate || 0), 0) / yd.length,
    };
  });
  const attritionYoY = yearlyStats.length > 1 ? yearlyStats[yearlyStats.length - 1].avgAttr - yearlyStats[yearlyStats.length - 2].avgAttr : null;
  const totalPromoPeriod = allMonthsData.reduce((s, d) => s + (d.promotions || 0), 0);

  // Acumulado do periodo (pergunta da Carolina): total de saidas/entradas do
  // periodo sobre o HC medio -- diferente da media das taxas mensais.
  const totalLeaversPeriod = allMonthsData.reduce((s, d) => s + (d.leavers || 0), 0);
  const totalJoinersPeriod = allMonthsData.reduce((s, d) => s + (d.joiners || 0), 0);
  const avgHcPeriod = allMonthsData.length ? allMonthsData.reduce((s, d) => s + (d.headcount || 0), 0) / allMonthsData.length : 0;
  const attritionAccum = avgHcPeriod > 0 ? (totalLeaversPeriod / avgHcPeriod) * 100 : 0;
  const turnoverAccum = avgHcPeriod > 0 ? ((totalJoinersPeriod + totalLeaversPeriod) / 2 / avgHcPeriod) * 100 : 0;

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
      // As tres com `help` sao as que ja foram lidas errado: atricao
      // confundida com turnover, turnover lido como perda, e eNPS lido como
      // nota de 0 a 100. As outras cinco ("Headcount", "Saidas") dispensam --
      // um "?" em todo cartao deixa de significar "aqui tem sutileza".
      help: 'atricao' as const,
      val: (curr.attrition_rate || 0).toFixed(2) + '%',
      color: attritionTrend === 'high' ? COLORS.danger : attritionTrend === 'medium' ? COLORS.warning : COLORS.success,
      sub: `saídas ÷ HC · média período ${avgAttrition.toFixed(1)}%`,
      icon: Activity
    },
    {
      label: 'Turnover',
      help: 'turnover' as const,
      val: tv + '%',
      color: tv > TURNOVER_ALERT_THRESHOLD ? COLORS.orange : COLORS.success,
      sub: 'Movimentação total',
      icon: ArrowRightLeft
    },
    {
      label: 'eNPS',
      help: 'enps' as const,
      val: enps?.v != null ? String(enps.v) : '—',
      color: COLORS.info,
      sub: enps?.d != null ? `${enps.d >= 0 ? '+' : ''}${enps.d} vs onda ant.` : 'clima (empresa)',
      icon: Activity
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
    
    // Attrition narrative (factual, sem rotulo de benchmark nao validado).
    parts.push(`atrição de ${(curr.attrition_rate || 0).toFixed(1)}% no mês (média do período ${avgAttrition.toFixed(1)}%)`);

    // Gender narrative (factual).
    parts.push(`${curr.gender_female_pct || 0}% de mulheres no quadro`);

    return parts.join(', ');
  };

  // Aviso de recorte ignorado. Fica FORA do `if` abaixo porque tambem precisa
  // aparecer no Overview cheio -- se nenhum dos dois puder ser aplicado, o
  // usuario ainda tem que saber que a selecao dele nao esta valendo aqui.
  const cutWarning = seriesCut.ignored.length > 0 ? (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <p>
        Esta visão aceita <strong>um</strong> recorte entre nível e tempo de casa: a série
        mensal guarda as duas bases separadas, sem o cruzamento. Aplicado{' '}
        <strong>{CUT_LABELS[seriesCut.key ?? 'level']}: {seriesCut.value}</strong>; ignorado{' '}
        {seriesCut.ignored.map((i) => `${CUT_LABELS[i.key]}: ${i.value}`).join(', ')}. Para
        cruzar as duas dimensões, use a aba Atrição &amp; Desligamentos.
      </p>
    </div>
  ) : null;

  // Com recorte de dimensao ativo, a tela troca para a visao reduzida: sob esse
  // corte a maior parte dos blocos nao tem valor exato, e desativa-los um a um
  // deixaria a chance de algum cartao esquecido mostrar numero da empresa com
  // rotulo do recorte -- o pior desfecho possivel aqui.
  if (cut.active && cut.label) {
    return (
      <div className="space-y-4">
        {cutWarning}
        <SeriesCutView
          months={cut.months}
          label={cut.label}
          suppressed={cut.suppressed}
          brandColor={brandColor}
          unreliable={cut.unreliable}
        />
      </div>
    );
  }


  return (
    <div className="space-y-6">
      {/* Executive Summary Header */}
      <div className="bg-gradient-to-r p-6 rounded-xl border" style={{ background: `linear-gradient(to right, ${brandColor}1a, transparent)`, borderColor: `${brandColor}33` }}>
        <div className="flex items-center gap-3 mb-3">
          <Building2 className="h-6 w-6" style={{ color: brandColor }} />
          <h2 className="text-xl font-bold text-foreground">Resumo Executivo</h2>
          <span className="text-sm text-muted-foreground">{mLabel(currentMonth)}</span>
        </div>
        <p className="text-foreground leading-relaxed">
          Em {mLabel(currentMonth)}, a organização apresenta <strong>{generateNarrative()}</strong>. 
          Com {curr.headcount} colaboradores ativos, {curr.leaders} líderes ({curr.leaders_pct}% do total) 
          e {curr.promotions || 0} promoções realizadas, o cenário atual demonstra 
          {growthTrend === 'positive' ? ' expansão' : growthTrend === 'negative' ? ' contração' : ' estabilidade'}
          {' '}no headcount. Números factuais do período; leituras de "adequado/atenção" dependem de metas
          {' '}a validar com a liderança.
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
            help={'help' in k ? k.help : undefined}
          />
        ))}
      </div>

      {/* Panorama do período (antiga aba Trend, agora na visão executiva) */}
      <StorySection title="Panorama do Período" icon={Activity}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StoryMetric
            label="Crescimento no período"
            value={`${hcGrowthPct >= 0 ? '+' : ''}${hcGrowthPct.toFixed(1)}%`}
            subtext={`${periodFirst?.headcount || 0} → ${periodLast?.headcount || 0}`}
            trendDirection={hcGrowthPct >= 0 ? 'up' : 'down'}
          />
          <StoryMetric
            label="Atrição acumulada"
            value={`${attritionAccum.toFixed(1)}%`}
            subtext={`${totalLeaversPeriod} saídas · média mensal ${avgAttrition.toFixed(1)}%`}
            trendDirection={attritionYoY != null ? (attritionYoY <= 0 ? 'up' : 'down') : 'neutral'}
          />
          <StoryMetric
            label="Turnover acumulado"
            value={`${turnoverAccum.toFixed(1)}%`}
            subtext={`${totalJoinersPeriod} entradas / ${totalLeaversPeriod} saídas · média mensal ${avgTurnover.toFixed(1)}%`}
          />
          <StoryMetric label="Promoções no período" value={String(totalPromoPeriod)} subtext="acumulado" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
          <strong>Como é calculado.</strong> <em>Atrição acumulada</em> = total de saídas do período ÷ HC médio do período.
          <em> Turnover acumulado</em> = (entradas + saídas) ÷ 2 ÷ HC médio. A <em>média mensal</em> é a média das taxas de cada mês —
          útil para o ritmo recorrente, enquanto o acumulado mostra o total do período selecionado. A atrição{' '}
          <em>não desejada</em> (estimativa de 65% das saídas, ainda sem classificação real na origem) fica detalhada na aba{' '}
          <strong>Atrição &amp; Desligamentos</strong>.
        </p>
        {yearlyStats.length > 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            {yearlyStats.map((s) => (
              <div key={s.year} className="rounded-lg border border-border bg-card/40 p-3 flex items-center justify-between text-sm">
                <span className="font-medium">{s.year}</span>
                <span className="text-muted-foreground">
                  HC médio <strong className="text-foreground">{s.avgHc}</strong> · atrição{' '}
                  <strong className="text-foreground">{s.avgAttr.toFixed(1)}%</strong>
                </span>
              </div>
            ))}
          </div>
        )}
      </StorySection>

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
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="month" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
                  <Tooltip 
                    contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 12 }}
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
            <div className="rounded-lg border border-border bg-card/40 p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Este mês</span>
                <span className="font-semibold">
                  <span className="text-green-400">+{curr.joiners || 0}</span>
                  {' / '}
                  <span className="text-red-400">−{curr.leavers || 0}</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">% Mulheres / Homens</span>
                <span className="font-semibold">
                  <span className="text-pink-400">{curr.gender_female_pct || 0}%</span>
                  {' / '}
                  <span className="text-blue-400">{(100 - (curr.gender_female_pct || 0)).toFixed(0)}%</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tempo de casa (moda)</span>
                <span className="font-semibold">{tenureTop ? `${tenureTop.faixa} (${tenureTop.pct.toFixed(0)}%)` : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">CLT / PJ</span>
                <span className="font-semibold">
                  {contractMix && contractMix.total > 0
                    ? `${contractMix.clt} / ${contractMix.pj}`
                    : comp ? '—'
                    // Tres estados distintos, e nao dois. "…" so significa
                    // "ainda carregando"; falha vira "erro", nao um "…" que
                    // dura para sempre.
                    : compErro ? <span className="text-muted-foreground font-normal" title={compErro}>erro</span>
                    : '…'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Time que + cresceu</span>
                <span className="font-semibold text-right">
                  {topGrowthDept
                    ? <>{topGrowthDept.dept.replace(/_/g, ' ')} <span className="text-green-400">+{topGrowthDept.delta}</span></>
                    : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
        <StoryInsight type={netGrowth >= 0 ? 'positive' : 'negative'}>
          O headcount {netGrowth >= 0 ? 'cresceu' : 'reduziu'} {Math.abs(netGrowth)} colaboradores em {mLabel(currentMonth)}, 
          representando uma variação de {((netGrowth / (curr.headcount - netGrowth)) * 100).toFixed(1)}% 
          em relação ao mês anterior. {netGrowth >= 0
            ? 'Resultado de mais entradas que saídas no mês.'
            : 'As saídas superaram as entradas no mês; os motivos ficam na aba Atrição & Desligamentos.'}
        </StoryInsight>
      </StorySection>

      {/* Movement Story */}
      <StorySection title="Movimentação de Pessoas" icon={ArrowRightLeft}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Entradas vs Saídas" subtitle="Fluxo mensal de colaboradores">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={jlData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="month" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="entradas" name="Entradas" fill={COLORS.success + '99'} stroke={COLORS.success} strokeWidth={1} radius={[4, 4, 0, 0]} />
                <Bar dataKey="saidas" name="Saídas" fill={COLORS.danger + '99'} stroke={COLORS.danger} strokeWidth={1} radius={[4, 4, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Taxas de Movimentação" subtitle="Atrição vs Turnover (%)">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={attrTurnData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="month" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
                <Line type="monotone" dataKey="attricao" name="Atrição %" stroke={COLORS.warning} strokeWidth={3} dot={{ r: 4 }} connectNulls />
                <Line type="monotone" dataKey="turnover" name="Turnover %" stroke={COLORS.orange} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" connectNulls />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
        
        <StoryInsight type="neutral">
          Em {mLabel(currentMonth)}: {curr.joiners || 0} entradas e {curr.leavers || 0} saídas
          {' '}(atrição {(curr.attrition_rate || 0).toFixed(2)}%, turnover {tv}%). Média do período:
          {' '}atrição {avgAttrition.toFixed(1)}%, turnover {avgTurnover.toFixed(1)}%.
          {tv > 0 && ` No ritmo do mês, cerca de 1 em cada ${Math.round(100 / tv)} colaboradores é substituído.`}
          {' '}Para aprofundar as causas, ver a aba Atrição &amp; Desligamentos.
        </StoryInsight>
      </StorySection>

      {/* Distribuição por Departamento */}
      <StorySection title="Distribuição por Departamento" icon={Building2}>
        <ChartCard title="Headcount por área" subtitle="Colaboradores e % do total">
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={depts} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis type="number" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} width={120} />
              <Tooltip
                contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }}
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
