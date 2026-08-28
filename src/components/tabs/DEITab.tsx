import { useState } from 'react';
import { useDashboard } from '@/data/DashboardContext';
import { mLabel } from '@/data/helpers';
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
  ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import {
  Users,
  Target,
  TrendingUp,
  Award,
  BarChart3
} from 'lucide-react';

export default function DEITab() {
  const { currentData, prevData, allMonthsData, currentMonth, brand, filteredDeptKey } = useDashboard();
  const curr = currentData;

  /* ------------------------------------------------------------------
     O RECORTE POR ÁREA É EXATO, OU NÃO É NADA
     ------------------------------------------------------------------
     `applyDeptFilter` tem dois caminhos. Com `dept_breakdown`, recorta de
     verdade. Sem ela, RATEIA: multiplica os números da empresa pela fatia de
     headcount do departamento e mantém os percentuais company-wide.

     O rateio chegou à tela como bug: com Commercial selecionado, "Mulheres —
     Geral" e "Mulheres na liderança" ficavam idênticos aos da empresa
     (percentual company-wide) enquanto o gráfico de composição de liderança
     mudava (contagem rateada) -- e o arredondamento do rateio zerava as
     mulheres, fazendo parecer que a área não tem nenhuma na liderança.

     Dois números contraditórios na mesma tela, e o mais alarmante era o
     inventado. Agora, quando o recorte não é exato, esta aba não mostra número
     de gênero nenhum: diz que não tem a quebra. */
  const recorteAproximado = !!filteredDeptKey
    && allMonthsData.some((m) => m.dept_filter_exact === false);
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;

  const fpDelta = prevData
    ? (curr.gender_female_pct || 0) - (prevData.gender_female_pct || 0)
    : 0;
  const lpDelta = prevData
    ? (curr.leader_female_pct || 0) - (prevData.leader_female_pct || 0)
    : 0;
  const firstMonth = allMonthsData[0];
  const startFemalePct = firstMonth?.gender_female_pct || 0;
  const progressGrowth = (curr.gender_female_pct || 0) - startFemalePct;

  // Filtro de raca (interativo): quando uma raca e escolhida, os KPIs de
  // representatividade e lideranca recalculam so para aquele grupo (via
  // race_cross). As series temporais seguem company-wide (a serie nao guarda
  // gênero/liderança por raca no tempo) -- avisado na tela.
  const raceCross = curr.race_cross || {};
  const [raceFilter, setRaceFilter] = useState<string>('Todas');
  const sel = raceFilter !== 'Todas' ? raceCross[raceFilter] : null;
  const selFemalePct = sel && sel.total > 0 ? (sel.female / sel.total) * 100 : 0;
  const selLeadFemalePct = sel && sel.leaders > 0 ? (sel.female_leaders / sel.leaders) * 100 : 0;

  const kpis = [
    {
      label: sel ? `Mulheres · ${raceFilter}` : 'Mulheres — Geral',
      value: (sel ? selFemalePct.toFixed(0) : (curr.gender_female_pct || 0)) + '%',
      color: COLORS.female,
      sub: sel
        ? `${sel.female} de ${sel.total} pessoas ${raceFilter}`
        : fpDelta >= 0
          ? `<span style="color:#66bb6a">+${fpDelta.toFixed(1)}pp</span> vs mês ant.`
          : `<span style="color:#ef5350">${fpDelta.toFixed(1)}pp</span> vs mês ant.`
    },
    {
      label: sel ? `Mulheres na liderança · ${raceFilter}` : 'Mulheres na liderança',
      value: (sel ? selLeadFemalePct.toFixed(0) : (curr.leader_female_pct || 0)) + '%',
      color: COLORS.purple,
      sub: sel
        ? `${sel.female_leaders} de ${sel.leaders} líderes ${raceFilter}`
        : lpDelta >= 0
          ? `<span style="color:#66bb6a">+${lpDelta.toFixed(1)}pp</span> vs mês ant.`
          : `<span style="color:#ef5350">${lpDelta.toFixed(1)}pp</span> vs mês ant.`
    },
    {
      label: '% PCD',
      value: `${(((curr.pcd || 0) / (curr.headcount || 1)) * 100).toFixed(1)}%`,
      color: COLORS.info,
      sub: `${curr.pcd || 0} pessoas · campo pouco preenchido (subconta)`,
    },
    {
      label: '% Aprendiz',
      value: `${(((curr.apprentice || 0) / (curr.headcount || 1)) * 100).toFixed(1)}%`,
      color: COLORS.nsx,
      sub: `${curr.apprentice || 0} aprendizes (vínculo)`,
    },
  ];

  const genderTrend = allMonthsData.map(d => ({
    month: mLabel(d.month),
    overall: d.gender_female_pct,
    lideranca: d.leader_female_pct,
  }));

  const leaderStack = allMonthsData.map(d => ({
    month: mLabel(d.month),
    female: d.leader_female || 0,
    male: (d.leaders || 0) - (d.leader_female || 0),
  }));

  const genderDonut = [
    { name: 'Mulheres', value: curr.gender_female || 0 },
    { name: 'Homens', value: curr.gender_male || 0 },
  ];

  const leaderDonut = [
    { name: 'Mulheres', value: curr.leader_female || 0 },
    { name: 'Homens', value: (curr.leaders || 0) - (curr.leader_female || 0) },
  ];

  // Senioridade (nivel L0..L9) DA EPOCA: distribuicao reconstruida (âncora no
  // snapshot atual, recuo de 1 nivel por promocao datada). So a serie
  // reconstruida traz level_base; se estiver vazio, a secao nao aparece.
  const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'];
  const LEVEL_COLORS = [
    '#1e3a5f', '#24507a', '#2b6cb0', '#3182ce', '#4299e1',
    '#63b3ed', '#7f9cf5', '#9f7aea', '#b794f4', '#d6bcfa',
  ];
  const levelBase = curr.level_base || {};
  const hasLevel = LEVELS.some((l) => (levelBase[l] || 0) > 0);
  const levelNA = levelBase['NA'] || 0;
  const levelKnown = LEVELS.reduce((s, l) => s + (levelBase[l] || 0), 0);
  const levelPyramid = LEVELS.map((l) => ({ level: l, n: levelBase[l] || 0 })).filter((r) => r.n > 0);
  const levelStack = allMonthsData.map((d) => {
    const lb = d.level_base || {};
    const row: Record<string, number | string> = { month: mLabel(d.month) };
    for (const l of LEVELS) row[l] = lb[l] || 0;
    return row;
  });

  // Lideranca feminina por area (quebra pedida pela diretora). So areas com >=2
  // lideres para o % nao ficar ruidoso.
  const leaderByArea = Object.entries(curr.leader_dept || {})
    .map(([area, v]) => ({
      area,
      leaders: v.leaders,
      female: v.female,
      pct: v.leaders > 0 ? (v.female / v.leaders) * 100 : 0,
    }))
    .filter((r) => r.leaders >= 2 && r.area !== 'SEM DEPTO')
    .sort((a, b) => b.pct - a.pct);

  // Recorte de DEI por raca (representatividade + lideranca por raca).
  const RACE_ORDER = ['Branca', 'Parda', 'Preta', 'Amarela', 'Indígena', 'Não informado'];
  const raceRows = Object.entries(raceCross)
    .map(([race, v]) => ({
      race,
      total: v.total,
      pctQuadro: (curr.headcount || 0) > 0 ? (v.total / (curr.headcount || 1)) * 100 : 0,
      pctFemale: v.total > 0 ? (v.female / v.total) * 100 : 0,
      pctLead: v.total > 0 ? (v.leaders / v.total) * 100 : 0,
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => (RACE_ORDER.indexOf(a.race) - RACE_ORDER.indexOf(b.race)) || b.total - a.total);
  const hasRaceCross = raceRows.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex gap-5 flex-wrap text-xs text-muted-foreground">
        <span>Ref: <strong className="text-foreground">{mLabel(currentMonth)}</strong></span>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        <strong>Líder</strong> = colaborador marcado como liderança no cadastro (campo &quot;Liderança?&quot;),
        reconstruído pelo cargo da época — não é por nível nem por nº de reportes diretos.
      </p>

      {/* Filtro de raça (interativo) */}
      {hasRaceCross && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Filtrar por raça</span>
          {['Todas', ...raceRows.map((r) => r.race)].map((r) => (
            <button
              key={r}
              onClick={() => setRaceFilter(r)}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                raceFilter === r ? 'text-white border-transparent' : 'text-muted-foreground border-border hover:text-foreground'
              }`}
              style={raceFilter === r ? { background: brandColor } : undefined}
            >
              {r}
            </button>
          ))}
          {sel && (
            <span className="text-[11px] text-muted-foreground ml-1">
              KPIs de mulheres/liderança abaixo são de <strong className="text-foreground">{raceFilter}</strong>; gráficos de tendência seguem company-wide.
            </span>
          )}
        </div>
      )}

      {recorteAproximado ? (
        <ChartCard title={`Gênero e liderança em ${filteredDeptKey}`}>
          <p className="text-sm text-muted-foreground py-4 leading-relaxed">
            <strong className="text-foreground">
              A série não guarda a quebra de gênero deste departamento nesta marca ou neste período.
            </strong>{' '}
            Os números de mulheres, liderança e cor/raça ficam de fora do recorte em vez de
            aparecerem rateados — o rateio multiplicaria os totais da empresa pela fatia de
            headcount da área, o que produz gente que não existe e some com gente que existe.
            Escolha uma marca específica, ou volte o departamento para <em>Todos</em>, para ver os
            números de verdade.
          </p>
        </ChartCard>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {kpis.map(k => <KpiCard key={k.label} label={k.label} value={k.value} color={k.color} sub={k.sub} icon={k.label.includes('Líder') ? Award : Users} />)}
          </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Evolução de mulheres (%)" subtitle="Geral vs Liderança">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={genderTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
              <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} domain={[0, 60]} />
              <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="overall" name="Geral" stroke={COLORS.female} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="lideranca" name="Liderança" stroke={COLORS.purple} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Composição de Liderança" subtitle="Líderes por gênero ao longo do tempo">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={leaderStack}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
              <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="female" name="Mulheres" stackId="a" fill={COLORS.female} />
              <Bar dataKey="male" name="Homens" stackId="a" fill="#42a5f5" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Gênero — Geral" subtitle={`${curr.gender_female || 0} / ${curr.headcount || 0}`}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={genderDonut} innerRadius={50} outerRadius={70} dataKey="value" strokeWidth={0}>
                <Cell fill={COLORS.female} />
                <Cell fill="#42a5f5" />
              </Pie>
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="text-center -mt-4">
            <span className="text-2xl font-bold" style={{ color: COLORS.female }}>{curr.gender_female_pct}%</span>
            <span className="text-xs text-muted-foreground ml-1">feminino</span>
          </div>
        </ChartCard>

        <ChartCard title="Gênero — Liderança" subtitle={`${curr.leader_female || 0} / ${curr.leaders || 0}`}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={leaderDonut} innerRadius={50} outerRadius={70} dataKey="value" strokeWidth={0}>
                <Cell fill={COLORS.female} />
                <Cell fill="#42a5f5" />
              </Pie>
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="text-center -mt-4">
            <span className="text-2xl font-bold" style={{ color: COLORS.purple }}>{curr.leader_female_pct}%</span>
            <span className="text-xs text-muted-foreground ml-1">líderes mulheres</span>
          </div>
        </ChartCard>
          </div>
        </>
      )}

      {/* Liderança feminina por área */}
      {leaderByArea.length > 0 && (
        <ChartCard title="Liderança feminina por área" subtitle={`${mLabel(currentMonth)} · áreas com ≥2 líderes`}>
          <ResponsiveContainer width="100%" height={Math.max(200, leaderByArea.length * 34)}>
            <BarChart data={leaderByArea} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="area" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} width={130} />
              <Tooltip
                contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }}
                formatter={(v: number, _n: string, item: any) => [`${v.toFixed(0)}% · ${item.payload.female} de ${item.payload.leaders} líderes`, 'Mulheres na liderança']}
              />
              <Bar dataKey="pct" fill={COLORS.female + '99'} stroke={COLORS.female} strokeWidth={1} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Recorte por raça (DEI) */}
      {hasRaceCross && (
        <ChartCard title="Recorte por raça" subtitle={`${mLabel(currentMonth)} · representatividade e liderança por cor/raça (dado sensível, só agregado)`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border text-left">
                  <th className="p-2">Cor / Raça</th>
                  <th className="p-2 text-right">Pessoas</th>
                  <th className="p-2 text-right">% do quadro</th>
                  <th className="p-2 text-right">% mulheres</th>
                  <th className="p-2 text-right">% em liderança</th>
                </tr>
              </thead>
              <tbody>
                {raceRows.map((r) => (
                  <tr
                    key={r.race}
                    onClick={() => setRaceFilter(raceFilter === r.race ? 'Todas' : r.race)}
                    className={`border-b border-border/50 cursor-pointer hover:bg-muted/40 ${raceFilter === r.race ? 'bg-muted/60' : ''}`}
                  >
                    <td className="p-2 font-medium">{r.race}</td>
                    <td className="p-2 text-right tabular-nums">{r.total}</td>
                    <td className="p-2 text-right tabular-nums">{r.pctQuadro.toFixed(0)}%</td>
                    <td className="p-2 text-right tabular-nums">{r.pctFemale.toFixed(0)}%</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{r.pctLead.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            "% em liderança" = share de cada grupo que está em posição de liderança. Diferenças grandes
            entre grupos (ex.: Parda vs Branca) apontam onde a representatividade na liderança falta.
          </p>
        </ChartCard>
      )}

      {/* Senioridade (nivel) reconstruida */}
      {hasLevel && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard
            title="Pirâmide de senioridade"
            subtitle={`${mLabel(currentMonth)} · ${levelKnown} com nível${levelNA ? ` · ${levelNA} sem nível` : ''}`}
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={levelPyramid} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis type="number" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                <YAxis type="category" dataKey="level" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} width={32} />
                <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="n" name="Pessoas" radius={[0, 4, 4, 0]}>
                  {levelPyramid.map((r) => (
                    <Cell key={r.level} fill={LEVEL_COLORS[LEVELS.indexOf(r.level)] || COLORS.flutter} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Senioridade no tempo" subtitle="Distribuição por nível a cada mês (valor da época)">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={levelStack}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="month" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                {LEVELS.map((l, i) => (
                  <Bar key={l} dataKey={l} name={l} stackId="lv" fill={LEVEL_COLORS[i]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {hasLevel && (
        <p className="text-xs text-muted-foreground -mt-2">
          Nível e liderança são reconstruídos com o valor <strong>da época</strong>: ancorados no
          quadro atual e recuados apenas por eventos datados (promoções e transições para
          liderança no histórico). Premissa documentada: 1 nível por promoção. Exato no mês mais
          recente.
        </p>
      )}

      {/* Detailed Analysis */}
      <Card className="border-l-4 bg-card/50" style={{ borderLeftColor: brandColor }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-foreground">
            <BarChart3 className="h-5 w-5" style={{ color: brandColor }} />
            Análise DEI — {mLabel(currentMonth)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Visão Geral
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Mulheres %</span>
                  <span className="font-bold text-pink-400">{curr.gender_female_pct}%</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Homens %</span>
                  <span className="font-bold text-blue-400">{(100 - (curr.gender_female_pct || 0)).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Total mulheres</span>
                  <span className="font-bold">{curr.gender_female || 0}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Total homens</span>
                  <span className="font-bold">{curr.gender_male || 0}</span>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Award className="h-4 w-4" />
                Liderança
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Mulheres na liderança</span>
                  <span className="font-bold text-purple-400">{curr.leader_female_pct}%</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Líderes mulheres</span>
                  <span className="font-bold">{curr.leader_female || 0}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Líderes homens</span>
                  <span className="font-bold">{(curr.leaders || 0) - (curr.leader_female || 0)}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Total Líderes</span>
                  <span className="font-bold">{curr.leaders || 0}</span>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Evolução no período
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Início do período</span>
                  <span className="font-bold">{startFemalePct.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Crescimento</span>
                  <span className={`font-bold ${progressGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {progressGrowth >= 0 ? '+' : ''}{progressGrowth.toFixed(1)}pp
                  </span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Tendência</span>
                  <span className="font-bold">{fpDelta >= 0 ? 'Subindo' : 'Descendo'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg border text-sm bg-muted/40 border-border/40 text-foreground">
            <div className="flex items-start gap-3">
              <Users className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <strong>Panorama:</strong>{' '}
                A representação feminina no quadro é de {curr.gender_female_pct}%
                {' '}({fpDelta >= 0 ? '+' : ''}{fpDelta.toFixed(1)}pp vs mês anterior). Na liderança,
                {' '}{curr.leader_female_pct}% são mulheres
                {' '}({lpDelta >= 0 ? '+' : ''}{lpDelta.toFixed(1)}pp vs mês anterior). Desde o início
                {' '}do período, a proporção geral variou {progressGrowth >= 0 ? '+' : ''}{progressGrowth.toFixed(1)}pp.
              </div>
            </div>
          </div>

          <div className="bg-muted/40 border border-border/40 rounded-lg p-4">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Pontos de atenção
            </h3>
            <ul className="space-y-2 text-sm text-foreground">
              <li className="flex items-start gap-2">
                <span className="font-bold">1.</span>
                <span><strong>Representatividade geral:</strong> acompanhar a evolução mensal da proporção de mulheres no quadro e o ritmo de contratações.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">2.</span>
                <span><strong>Liderança feminina:</strong> desenvolver pipeline interno e revisar processos de promoção para equilibrar a representatividade em posições de comando.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">3.</span>
                <span><strong>Retenção:</strong> monitorar a taxa de atrito por gênero para garantir que mulheres não saiam em proporção maior.</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
