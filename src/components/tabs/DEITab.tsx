import { useDashboard } from '@/data/DashboardContext';
import { useRecorteDeSerie } from '@/data/use-series-cut';
import { mLabel } from '@/data/helpers';
import KpiCard from '@/components/dashboard/KpiCard';
import ChartCard from '@/components/dashboard/ChartCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { COLORS } from '@/lib/colors';
import { RACE_ORDER } from '@/lib/race-order';

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

import { tx } from '@/lib/i18n';
/**
 * Donut de gênero com o percentual NO CENTRO.
 *
 * Antes: `Legend` do Recharts dentro do gráfico mais um bloco com `-mt-4`
 * embaixo -- a legenda e o percentual se sobrepunham (17/09/2026). E o centro
 * do donut, que é onde o número deve estar, ficava vazio.
 *
 * A legenda virou marcadores próprios embaixo, com a contagem de cada lado:
 * o cartão passa a dizer quantas pessoas são, e não só a proporção.
 */
function DonutGenero({ data, pct, legenda, corDestaque }: {
  data: { name: string; value: number }[];
  pct: number;
  legenda: string;
  corDestaque: string;
}) {
  const cores = [COLORS.female, '#42a5f5'];
  const total = data.reduce((t, d) => t + (d.value || 0), 0);
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full" style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} innerRadius={58} outerRadius={78} dataKey="value" strokeWidth={0} startAngle={90} endAngle={-270}>
              {data.map((d, i) => <Cell key={d.name} fill={cores[i]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* No buraco do donut, sem encostar em nada. `pointer-events-none` para
            não roubar o hover das fatias. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold leading-none" style={{ color: corDestaque }}>
            {total > 0 ? `${pct}%` : '—'}
          </span>
          <span className="text-[10px] text-muted-foreground mt-1 max-w-[90px] text-center leading-tight">{tx(legenda)}</span>
        </div>
      </div>
      <div className="flex items-center justify-center gap-4 mt-2 text-xs">
        {data.map((d, i) => (
          <span key={d.name} className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: cores[i] }} />
            {tx(d.name)}
            <span className="font-semibold text-foreground">{d.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function DEITab() {
  const { currentMonth, brand, filteredDeptKey, raceFilter, setRaceFilter } = useDashboard();
  // Mesma razão do DemographicsTab: o contexto só aplica o filtro de
  // departamento. Sem o hook, os seletores de job family, contrato e tempo de
  // casa acendem nesta aba e não recortam nada.
  const { currentData, prevData, allMonthsData, cut } = useRecorteDeSerie('dei');
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
  const sel = raceFilter !== 'Todas' ? raceCross[raceFilter] : null;
  const selFemalePct = sel && sel.total > 0 ? (sel.female / sel.total) * 100 : 0;
  const selLeadFemalePct = sel && sel.leaders > 0 ? (sel.female_leaders / sel.leaders) * 100 : 0;
  // Mesma conta do card sem filtro (pcd/apprentice sobre o total da fatia,
  // não sobre `pcd_conhecido`) -- pra "0,8% PCD" e "0,8% PCD · Branca"
  // significarem a mesma coisa, só que sobre populações diferentes.
  const selPcdPct = sel && sel.total > 0 ? (sel.pcd / sel.total) * 100 : 0;
  const selApprenticePct = sel && sel.total > 0 ? (sel.apprentice / sel.total) * 100 : 0;

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
      help: 'liderancaFeminina' as const,
      helpValue: sel ? selLeadFemalePct : (curr.leader_female_pct || 0),
      sub: sel
        ? `${sel.female_leaders} de ${sel.leaders} líderes ${raceFilter}`
        : lpDelta >= 0
          ? `<span style="color:#66bb6a">+${lpDelta.toFixed(1)}pp</span> vs mês ant.`
          : `<span style="color:#ef5350">${lpDelta.toFixed(1)}pp</span> vs mês ant.`
    },
    {
      label: sel ? `% PCD · ${raceFilter}` : '% PCD',
      value: `${(sel ? selPcdPct : ((curr.pcd || 0) / (curr.headcount || 1)) * 100).toFixed(1)}%`,
      color: COLORS.info,
      sub: sel
        // Mesmo formato e mesmo denominador do card de Demográficos: o quadro.
        // A cobertura do campo saiu daqui e virou a ressalva de piso no "?"
        // (verbete `pcd` em metric-help.ts) -- ver 17/09/2026.
        ? `${sel.pcd} de ${sel.total} pessoas ${raceFilter}`
        : `${curr.pcd || 0} de ${curr.headcount || 0}`,
    },
    {
      label: sel ? `% Aprendiz · ${raceFilter}` : '% Aprendiz',
      value: `${(sel ? selApprenticePct : ((curr.apprentice || 0) / (curr.headcount || 1)) * 100).toFixed(1)}%`,
      color: COLORS.nsx,
      sub: sel
        ? `${sel.apprentice} de ${sel.total} pessoas ${raceFilter} (vínculo)`
        : `${curr.apprentice || 0} de ${curr.headcount || 0} (vínculo)`,
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

  /* ------------------------------------------------------------------
     POR QUE A TABELA DE RAÇA NÃO ESTÁ AQUI
     ------------------------------------------------------------------
     `race_cross` vem vazio de propósito quando a cobertura de raça do mês não
     sustenta percentual -- a tabela divide pelo headcount, e com metade das
     pessoas sem raça "Branca: 20% do quadro" seria lido como
     representatividade quando é desconhecimento.

     Só que "vem vazio" fazia a seção inteira sumir sem uma palavra, que é a
     mesma troca que este painel passou a semana desfazendo: ausência lida
     como inexistência. Em ago/26 isso acontece na Flutter International --
     9 de 21 pessoas com raça conhecida.

     A cobertura não precisa de campo novo: `demographics.race` já traz a
     contagem por raça, e a soma dela sobre o headcount É a cobertura. */
  const comRaca = Object.values(curr.demographics?.race ?? {})
    .reduce((a: number, b: number) => a + b, 0);
  const coberturaRaca = (curr.headcount || 0) > 0 ? comRaca / (curr.headcount || 1) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex gap-5 flex-wrap text-xs text-muted-foreground">
        <span>{tx("Ref:")}{" "}<strong className="text-foreground">{tx(mLabel(currentMonth))}</strong></span>
        {cut.active && cut.label && (
          <span>{tx("Recorte:")}{" "}<strong className="text-foreground">{tx(cut.label)}</strong></span>
        )}
      </div>
      {/* Gráfico vazio sem uma frase ao lado se lê como "não temos ninguém" --
          e num painel de DEI essa leitura errada é especialmente cara. */}
      {cut.active && currentData?.race_cross == null && (
        <p className="text-[11px] rounded-md border border-amber-500/40 p-2 text-amber-600 dark:text-amber-500">
          {tx("A composição de")}{" "}<strong>{tx(cut.label)}</strong>{" "}{tx("não foi calculada: ou este mês é anterior à quebra, ou o recorte está combinado com um departamento — a série guarda quem é de cada área e quem é de cada fatia, nunca o cruzamento dos dois. Os gráficos abaixo ficam vazios por isso, e não por ausência de pessoas.")}
        </p>
      )}

      {/* O seletor de raça foi para a barra global, mesmo lugar do filtro de
          departamento -- ver FilterBar.tsx. O que sobra aqui é só o aviso do
          que o filtro FAZ: sem ele, quem chega com "Branca" já escolhida não
          teria como saber que só os 4 KPIs abaixo mudam. */}
      {sel && (
        <p className="text-[11px] text-muted-foreground">
          {tx("Os 4 KPIs abaixo são de")}{" "}<strong className="text-foreground">{tx(raceFilter)}</strong>{tx("; gráficos de tendência seguem company-wide.")}
        </p>
      )}

      {recorteAproximado ? (
        <ChartCard title={tx("Gênero e liderança em {0}", [filteredDeptKey])}>
          <p className="text-sm text-muted-foreground py-4 leading-relaxed">
            <strong className="text-foreground">
              {tx("A série não guarda a quebra de gênero deste departamento nesta marca ou neste período.")}
            </strong>{' '}
            {tx("Os números de mulheres, liderança e cor/raça ficam de fora do recorte em vez de aparecerem rateados — o rateio multiplicaria os totais da empresa pela fatia de headcount da área, o que produz gente que não existe e some com gente que existe. Escolha uma marca específica, ou volte o departamento para")}{" "}<em>{tx("Todos")}</em>{tx(", para ver os números de verdade.")}
          </p>
        </ChartCard>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {kpis.map(k => <KpiCard key={k.label} label={tx(k.label)} value={k.value} color={k.color} sub={tx(k.sub)} icon={k.label.includes('Líder') ? Award : Users} help={k.help} helpValue={k.helpValue} />)}
          </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title={tx("Evolução de mulheres (%)")} subtitle={tx("Geral vs Liderança")}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={genderTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
              <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} domain={[0, 60]} />
              <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="overall" name={tx("Geral")} stroke={COLORS.female} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="lideranca" name={tx("Liderança")} stroke={COLORS.purple} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={tx("Composição de Liderança")} subtitle={tx("Líderes por gênero ao longo do tempo")}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={leaderStack}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
              <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="female" name={tx("Mulheres")} stackId="a" fill={COLORS.female} />
              <Bar dataKey="male" name={tx("Homens")} stackId="a" fill="#42a5f5" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title={tx("Gênero — Geral")} subtitle={`${curr.gender_female || 0} / ${curr.headcount || 0}`}>
          <DonutGenero data={genderDonut} pct={curr.gender_female_pct || 0} legenda="feminino" corDestaque={COLORS.female} />
        </ChartCard>

        <ChartCard title={tx("Gênero — Liderança")} subtitle={`${curr.leader_female || 0} / ${curr.leaders || 0}`}>
          <DonutGenero data={leaderDonut} pct={curr.leader_female_pct || 0} legenda={tx("líderes mulheres")} corDestaque={COLORS.purple} />
        </ChartCard>
          </div>
        </>
      )}

      {/* Liderança feminina por área */}
      {leaderByArea.length > 0 && (
        <ChartCard title={tx("Liderança feminina por área")} subtitle={tx("{0} · áreas com ≥2 líderes", [mLabel(currentMonth)])}>
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

      {!hasRaceCross && (curr.headcount || 0) > 0 && (
        <ChartCard title={tx("Recorte por raça")}>
          <p className="text-sm text-muted-foreground py-4 leading-relaxed">
            <strong className="text-foreground">
              {comRaca}{" "}{tx("de")}{" "}{curr.headcount}{" "}{tx("pessoas têm cor/raça preenchida neste recorte (")}{Math.round(coberturaRaca * 100)}%).
            </strong>{' '}
            {tx("Abaixo de 90% a tabela não é publicada: ela divide cada grupo pelo total do quadro, e com parte das pessoas sem a informação os percentuais mediriam o preenchimento do cadastro, não a representatividade. O dado que existe está guardado — o que falta é cobertura para publicá-lo.")}
          </p>
        </ChartCard>
      )}

      {/* Recorte por raça (DEI) */}
      {hasRaceCross && (
        <ChartCard title={tx("Recorte por raça")} subtitle={tx("{0} · representatividade e liderança por cor/raça (dado sensível, só agregado)", [mLabel(currentMonth)])}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border text-left">
                  <th className="p-2">{tx("Cor / Raça")}</th>
                  <th className="p-2 text-right">{tx("Pessoas")}</th>
                  <th className="p-2 text-right">{tx("% do quadro")}</th>
                  <th className="p-2 text-right">{tx("% mulheres")}</th>
                  <th className="p-2 text-right">{tx("% em liderança")}</th>
                </tr>
              </thead>
              <tbody>
                {raceRows.map((r) => (
                  <tr
                    key={r.race}
                    onClick={() => setRaceFilter(raceFilter === r.race ? 'Todas' : r.race)}
                    className={`border-b border-border/50 cursor-pointer hover:bg-muted/40 ${raceFilter === r.race ? 'bg-muted/60' : ''}`}
                  >
                    <td className="p-2 font-medium">{tx(r.race)}</td>
                    <td className="p-2 text-right tabular-nums">{r.total}</td>
                    {/* Uma casa decimal: com grupos pequenos, o inteiro escondia
                        o movimento -- 1 pessoa indígena aparecia como "0% do
                        quadro", e a linha inteira parecia parada mês a mês. */}
                    <td className="p-2 text-right tabular-nums">{tx(r.pctQuadro.toFixed(1))}%</td>
                    <td className="p-2 text-right tabular-nums">{tx(r.pctFemale.toFixed(1))}%</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{tx(r.pctLead.toFixed(1))}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {tx("\"% em liderança\" = share de cada grupo que está em posição de liderança. Diferenças grandes entre grupos (ex.: Parda vs Branca) apontam onde a representatividade na liderança falta.")}
          </p>
        </ChartCard>
      )}

      {/* Senioridade (nivel) reconstruida */}
      {hasLevel && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard
            title={tx("Pirâmide de senioridade")}
            subtitle={tx("{0} · {1} com nível{2}", [mLabel(currentMonth), levelKnown, levelNA ? ` · ${levelNA} sem nível` : ''])}
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={levelPyramid} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis type="number" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                <YAxis type="category" dataKey="level" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} width={32} />
                <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="n" name={tx("Pessoas")} radius={[0, 4, 4, 0]}>
                  {levelPyramid.map((r) => (
                    <Cell key={r.level} fill={LEVEL_COLORS[LEVELS.indexOf(r.level)] || COLORS.flutter} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={tx("Senioridade no tempo")} subtitle={tx("Distribuição por nível a cada mês (valor da época)")}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={levelStack}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="month" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
                <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                {LEVELS.map((l, i) => (
                  <Bar key={l} dataKey={l} name={tx(l)} stackId="lv" fill={LEVEL_COLORS[i]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {hasLevel && (
        <p className="text-xs text-muted-foreground -mt-2">
          {tx("Nível e liderança são reconstruídos com o valor")}{" "}<strong>{tx("da época")}</strong>{tx(": ancorados no quadro atual e recuados apenas por eventos datados (promoções e transições para liderança no histórico). Premissa documentada: 1 nível por promoção. Exato no mês mais recente.")}
        </p>
      )}

      {/* Detailed Analysis */}
      <Card className="border-l-4 bg-card/50" style={{ borderLeftColor: brandColor }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-foreground">
            <BarChart3 className="h-5 w-5" style={{ color: brandColor }} />
            {tx("Análise DEI —")}{" "}{tx(mLabel(currentMonth))}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" />
                {tx("Visão Geral")}
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">{tx("Mulheres %")}</span>
                  <span className="font-bold text-pink-400">{curr.gender_female_pct}%</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">{tx("Homens %")}</span>
                  <span className="font-bold text-blue-400">{tx((100 - (curr.gender_female_pct || 0)).toFixed(1))}%</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">{tx("Total mulheres")}</span>
                  <span className="font-bold">{curr.gender_female || 0}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">{tx("Total homens")}</span>
                  <span className="font-bold">{curr.gender_male || 0}</span>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Award className="h-4 w-4" />
                {tx("Liderança")}
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">{tx("Mulheres na liderança")}</span>
                  <span className="font-bold text-purple-400">{curr.leader_female_pct}%</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">{tx("Líderes mulheres")}</span>
                  <span className="font-bold">{curr.leader_female || 0}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">{tx("Líderes homens")}</span>
                  <span className="font-bold">{(curr.leaders || 0) - (curr.leader_female || 0)}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">{tx("Total Líderes")}</span>
                  <span className="font-bold">{curr.leaders || 0}</span>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Target className="h-4 w-4" />
                {tx("Evolução no período")}
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">{tx("Início do período")}</span>
                  <span className="font-bold">{tx(startFemalePct.toFixed(1))}%</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">{tx("Crescimento")}</span>
                  <span className={`font-bold ${progressGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {progressGrowth >= 0 ? '+' : ''}{tx(progressGrowth.toFixed(1))}{tx("pp")}
                  </span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">{tx("Tendência")}</span>
                  <span className="font-bold">{fpDelta >= 0 ? tx("Subindo") : tx("Descendo")}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-lg border text-sm bg-muted/40 border-border/40 text-foreground">
            <div className="flex items-start gap-3">
              <Users className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <strong>{tx("Panorama:")}</strong>{' '}
                {tx("A representação feminina no quadro é de")}{" "}{curr.gender_female_pct}%
                {' '}({fpDelta >= 0 ? '+' : ''}{tx(fpDelta.toFixed(1))}{tx("pp vs mês anterior). Na liderança,")}
                {' '}{curr.leader_female_pct}{tx("% são mulheres")}
                {' '}({lpDelta >= 0 ? '+' : ''}{tx(lpDelta.toFixed(1))}{tx("pp vs mês anterior). Desde o início")}
                {' '}{tx("do período, a proporção geral variou")}{" "}{progressGrowth >= 0 ? '+' : ''}{tx(progressGrowth.toFixed(1))}{tx("pp.")}
              </div>
            </div>
          </div>

          <div className="bg-muted/40 border border-border/40 rounded-lg p-4">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {tx("Pontos de atenção")}
            </h3>
            <ul className="space-y-2 text-sm text-foreground">
              <li className="flex items-start gap-2">
                <span className="font-bold">1.</span>
                <span><strong>{tx("Representatividade geral:")}</strong>{" "}{tx("acompanhar a evolução mensal da proporção de mulheres no quadro e o ritmo de contratações.")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">2.</span>
                <span><strong>{tx("Liderança feminina:")}</strong>{" "}{tx("desenvolver pipeline interno e revisar processos de promoção para equilibrar a representatividade em posições de comando.")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">3.</span>
                <span><strong>{tx("Retenção:")}</strong>{" "}{tx("monitorar a taxa de atrito por gênero para garantir que mulheres não saiam em proporção maior.")}</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
