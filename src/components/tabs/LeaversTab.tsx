import { useDashboard } from '@/data/DashboardContext';
import { LeaverRecord } from '@/data/leaver-types';
import { fmt, fmtC, mLabel } from '@/data/helpers';
import KpiCard from '@/components/dashboard/KpiCard';
import ChartCard from '@/components/dashboard/ChartCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { COLORS } from '@/lib/colors';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import {
  Users,
  DollarSign,
  Clock,
  LogOut,
  TrendingUp,
  Briefcase,
  AlertTriangle,
  UserX,
  BarChart3,
  Search,
} from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { getCompAggregates, type CompAggregates } from '@/lib/comp.functions';
import FreshnessBadge from '@/components/dashboard/FreshnessBadge';

const BRAND_COLORS: Record<string, string> = {
  combined: COLORS.flutter,
  NSX: COLORS.nsx,
  'Betfair BR': COLORS.betfair,
  'Flutter International': COLORS.flutter,
  Porto: COLORS.flutter,
};

const SALARY_BAND_ORDER = ['Até 3k', '3k-5k', '5k-8k', '8k-12k', '12k-20k', '20k-50k', '50k+'];
const TENURE_ORDER = ['0-3 meses', '3-6 meses', '6-12 meses', '1-2 anos', '2-5 anos', '5+ anos'];
const LEVEL_ORDER = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L8'];

const PIE_COLORS = [COLORS.flutter, COLORS.nsx, COLORS.betfair, COLORS.purple, COLORS.orange, COLORS.danger, COLORS.success];

function countBy(records: LeaverRecord[], key: keyof LeaverRecord, order?: string[]) {
  const counts = new Map<string, number>();
  records.forEach(r => {
    const val = String(r[key] || 'Não informado');
    counts.set(val, (counts.get(val) || 0) + 1);
  });
  const entries = Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
  if (order) {
    const orderMap = new Map(order.map((o, i) => [o, i]));
    entries.sort((a, b) => (orderMap.get(a.name) ?? 999) - (orderMap.get(b.name) ?? 999));
  } else {
    entries.sort((a, b) => b.value - a.value);
  }
  return entries;
}

function avgSalary(records: LeaverRecord[]): number {
  const valid = records.filter(r => r.salario > 0);
  return valid.length > 0 ? valid.reduce((sum, r) => sum + r.salario, 0) / valid.length : 0;
}

function avgTenureMonths(records: LeaverRecord[]): number {
  return records.length > 0 ? records.reduce((sum, r) => sum + (r.tempo_casa_dias || 0), 0) / records.length / 30.44 : 0;
}

export default function LeaversTab() {
  // Filtro de ano agora e GLOBAL (TopBar). Aqui so consumimos activeYear para
  // filtrar os desligados individuais pelo mes de desligamento.
  const { leavers, filters, brand, currentMonth, currentData, activeYear, allMonthsData } = useDashboard();
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;
  const [searchTerm, setSearchTerm] = useState('');

  // Ativos por faixa salarial (snapshot atual, agregado leve) -> denominador da
  // taxa de atricao por faixa (#23). Company-wide, coerente com a lista de
  // desligados (que nao e por marca).
  //
  // O DENOMINADOR PODE FALTAR, E ISSO PRECISA APARECER
  //
  // Quantos ativos ha em cada faixa salarial e informacao de salario, mesmo
  // agregada -- entao vem de `getCompAggregates` e continua exigindo a aba
  // Compensation. Decisao de 18/08/2026.
  //
  // O problema nao era esse. Era que, sem o denominador, o grafico continuava
  // desenhado e o tooltip trocava de significado em silencio: "12 · 4,3% dos
  // 280 ativos na faixa" virava "12 · 9% do total". Duas frases parecidas, duas
  // contas diferentes, nada dizendo que mudou. Quem le uma vez por mes nao
  // percebe -- so acha que o numero mexeu.
  //
  // Agora o estado e explicito e o subtitulo do quadro conta qual conta esta
  // sendo feita.
  const [comp, setComp] = useState<CompAggregates | null>(null);
  const [semAcesso, setSemAcesso] = useState(false);
  const fetchComp = useServerFn(getCompAggregates);
  useEffect(() => {
    let cancelled = false;
    fetchComp()
      .then((d) => { if (!cancelled) setComp(d as CompAggregates); })
      .catch((e: unknown) => {
        // Recusa por perfil e um fato sobre o acesso, nao uma falha. As duas
        // pedem frases diferentes: uma se resolve com o admin, a outra com o
        // suporte.
        const msg = e instanceof Error ? e.message : '';
        if (!cancelled) setSemAcesso(/forbidden|acesso a esta se/i.test(msg));
      });
    return () => { cancelled = true; };
  }, [fetchComp]);
  const activeByBand = useMemo(() => {
    const acc: Record<string, number> = {};
    comp?.bands.forEach((b) => { acc[b.band] = (acc[b.band] ?? 0) + b.n; });
    return acc;
  }, [comp]);
  // O que o subtitulo promete tem que ser o que o tooltip faz.
  //
  // Ligar isto a "a chamada deu certo" nao basta: um perfil com Compensation
  // concedida mas sem a camada N importada recebe a resposta com `bands` vazio.
  // A chamada foi bem-sucedida e mesmo assim nao ha denominador -- o subtitulo
  // prometeria uma taxa que o tooltip nao tem como calcular.
  const temDenominador = Object.keys(activeByBand).length > 0;

  const filteredLeavers = useMemo(() => {
    return leavers.filter(r => {
      if (activeYear && !(r.mes_desligamento || '').startsWith(activeYear)) return false;
      if (filters.departamento !== 'Todos' && r.departamento !== filters.departamento) return false;
      if (filters.jobFamily !== 'Todos' && r.job_family !== filters.jobFamily) return false;
      if (filters.tempoCasa !== 'Todos' && r.tempo_casa_faixa !== filters.tempoCasa) return false;
      if (filters.tipoContrato !== 'Todos' && r.vinculo !== filters.tipoContrato) return false;
      if (filters.faixaSalarial !== 'Todos' && r.faixa_salarial !== filters.faixaSalarial) return false;
      if (filters.tipoDesligamento !== 'Todos' && r.tipo_desligamento_agrupado !== filters.tipoDesligamento) return false;
      if (filters.level !== 'Todos' && r.level !== filters.level) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          r.nome.toLowerCase().includes(term) ||
          r.cargo.toLowerCase().includes(term) ||
          r.departamento.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [leavers, filters, searchTerm, activeYear]);

  const totalLeavers = filteredLeavers.length;
  const avgTenure = avgTenureMonths(filteredLeavers);
  const involuntary = filteredLeavers.filter(r => r.tipo_desligamento_agrupado === 'Involuntário').length;
  const voluntary = filteredLeavers.filter(r => r.tipo_desligamento_agrupado === 'Voluntário').length;
  const pctTot = (v: number) => (totalLeavers > 0 ? (v / totalLeavers) * 100 : 0);

  // Denominadores de ATIVOS para o "% sobre o HC" (significancia relativa: uma
  // area pequena com poucas saidas pode pesar mais que uma grande). HC atual do
  // depto (dept_data) e do nivel (level_base) da serie reconstruida.
  const deptHC: Record<string, number> = {};
  for (const [k, v] of Object.entries(currentData?.dept_data || {})) deptHC[k.toUpperCase().trim()] = v.hc;
  const levelHC = (currentData?.level_base || {}) as Record<string, number>;

  const addShare = (rows: { name: string; value: number }[]) =>
    rows.map(d => ({ ...d, pctTot: pctTot(d.value) }));

  const salaryBandData = countBy(filteredLeavers, 'faixa_salarial', SALARY_BAND_ORDER).map((d) => {
    const hc = activeByBand[d.name] ?? 0;
    return { ...d, pctTot: pctTot(d.value), hc, pctHC: hc > 0 ? (d.value / hc) * 100 : null };
  });
  const tenureData = addShare(countBy(filteredLeavers, 'tempo_casa_faixa', TENURE_ORDER));
  const levelData = countBy(filteredLeavers, 'level', LEVEL_ORDER).map(d => {
    const hc = levelHC[d.name] ?? 0;
    return { ...d, pctTot: pctTot(d.value), hc, pctHC: hc > 0 ? (d.value / hc) * 100 : null };
  });
  const deptData = countBy(filteredLeavers, 'departamento').map(d => {
    const hc = deptHC[d.name.toUpperCase().trim()] ?? 0;
    return { ...d, pctTot: pctTot(d.value), hc, pctHC: hc > 0 ? (d.value / hc) * 100 : null };
  });
  const typeData = countBy(filteredLeavers, 'tipo_desligamento_agrupado');

  // Evolucao mensal empilhada por tipo (voluntario x involuntario x outros) --
  // a "visao mes a mes classificando" pedida pela diretora.
  const monthlyData = useMemo(() => {
    const m = new Map<string, { voluntario: number; involuntario: number; outros: number }>();
    filteredLeavers.forEach(r => {
      const cur = m.get(r.mes_desligamento) || { voluntario: 0, involuntario: 0, outros: 0 };
      if (r.tipo_desligamento_agrupado === 'Voluntário') cur.voluntario++;
      else if (r.tipo_desligamento_agrupado === 'Involuntário') cur.involuntario++;
      else cur.outros++;
      m.set(r.mes_desligamento, cur);
    });
    return Array.from(m.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredLeavers]);

  // Taxa de atricao ACUMULADA do periodo (pergunta da Carolina): total de saidas
  // da serie ÷ HC medio do periodo -- distinta da media das taxas mensais. Usa a
  // serie mensal (allMonthsData, ja filtrada por activeYear no contexto).
  const seriesLeavers = allMonthsData.reduce((s, d) => s + (d.leavers || 0), 0);
  const avgHcPeriod = allMonthsData.length
    ? allMonthsData.reduce((s, d) => s + (d.headcount || 0), 0) / allMonthsData.length
    : 0;
  const accAttrition = avgHcPeriod > 0 ? (seriesLeavers / avgHcPeriod) * 100 : 0;

  const kpis = [
    { label: 'Total Desligados', value: fmt(totalLeavers), color: COLORS.danger, icon: UserX, sub: activeYear ? `acumulado ${activeYear}` : 'todos os anos' },
    { label: 'Atrição acumulada', value: `${accAttrition.toFixed(1)}%`, color: COLORS.orange, icon: TrendingUp, sub: `${seriesLeavers} saídas ÷ HC médio ${Math.round(avgHcPeriod)}` },
    { label: 'Voluntários', value: `${fmt(voluntary)} (${pctTot(voluntary).toFixed(0)}%)`, color: COLORS.info, icon: LogOut },
    { label: 'Involuntários', value: `${fmt(involuntary)} (${pctTot(involuntary).toFixed(0)}%)`, color: COLORS.orange, icon: AlertTriangle },
    { label: 'Tempo Médio de Casa', value: `${avgTenure.toFixed(1)}m`, color: COLORS.nsx, icon: Clock },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><FreshnessBadge dataset="leavers" /></div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <LogOut className="h-5 w-5" style={{ color: brandColor }} />
            Análise de Desligamentos
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {totalLeavers} desligamentos{activeYear ? ` em ${activeYear}` : ' (todos os anos)'} · dados reais ·
            {' '}filtro de ano no topo
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar colaborador, cargo ou departamento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-secondary border border-border rounded pl-9 pr-3 py-1.5 text-sm text-foreground w-full md:w-[320px] focus:outline-none focus:ring-1"
            style={{ '--tw-ring-color': brandColor } as React.CSSProperties}
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((kpi, idx) => (
          <KpiCard key={idx} {...kpi} />
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Desligamentos por Faixa Salarial"
          subtitle={
            temDenominador
              ? 'Absoluto · no tooltip, taxa sobre os ativos da faixa'
              : semAcesso
                ? 'Absoluto · no tooltip, % do total — a taxa sobre os ativos da faixa exige acesso a Compensation'
                : 'Absoluto · no tooltip, % do total'
          }
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={salaryBandData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, _n: string, item: any) => {
                  const p = item.payload;
                  return [
                    p.pctHC != null
                      ? `${value} · ${p.pctHC.toFixed(1)}% dos ${p.hc} ativos na faixa`
                      : `${value} · ${p.pctTot.toFixed(0)}% do total`,
                    'Desligados',
                  ];
                }}
              />
              <Bar dataKey="value" name="Desligados" fill={brandColor} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Desligamentos por Tempo de Casa" subtitle="Permanência média na empresa">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={tenureData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, _n: string, item: any) => [`${value} · ${item.payload.pctTot.toFixed(0)}% do total`, 'Desligados']}
              />
              <Bar dataKey="value" name="Desligados" fill={COLORS.nsx} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Por Tipo de Desligamento" subtitle="'Outros' = tipos fora de voluntário/involuntário/acordo">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={typeData}
                cx="50%"
                cy="45%"
                innerRadius={42}
                outerRadius={66}
                paddingAngle={3}
                dataKey="value"
              >
                {typeData.map((_, idx) => (
                  <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, name: string) => [`${value} desligados`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Por Departamento" subtitle="Absoluto · no tooltip, % sobre o HC do depto">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={deptData.slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis type="number" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} width={90} />
              <Tooltip
                contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, _n: string, item: any) => {
                  const p = item.payload;
                  return [p.pctHC != null ? `${value} · ${p.pctHC.toFixed(1)}% do HC (${p.hc} ativos)` : `${value} · ${p.pctTot.toFixed(0)}% do total`, 'Desligados'];
                }}
              />
              <Bar dataKey="value" name="Desligados" fill={COLORS.purple} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Por Level" subtitle="Absoluto · no tooltip, % sobre o HC do nível">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={levelData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, _n: string, item: any) => {
                  const p = item.payload;
                  return [p.pctHC != null ? `${value} · ${p.pctHC.toFixed(1)}% do HC (${p.hc} ativos)` : `${value} · ${p.pctTot.toFixed(0)}% do total`, 'Desligados'];
                }}
              />
              <Bar dataKey="value" name="Desligados" fill={COLORS.betfair} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Evolução mensal empilhada por tipo */}
      <ChartCard title="Evolução Mensal de Desligamentos" subtitle="Mês a mês, classificado por tipo">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis
              dataKey="month"
              tick={{ fill: 'var(--chart-tick)', fontSize: 10 }}
              tickFormatter={(v) => mLabel(v)}
            />
            <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 12 }}
              labelFormatter={(label) => mLabel(String(label))}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="voluntario" name="Voluntário" stackId="t" fill={COLORS.info} />
            <Bar dataKey="involuntario" name="Involuntário" stackId="t" fill={COLORS.orange} />
            <Bar dataKey="outros" name="Outros" stackId="t" fill={COLORS.gray800} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Detailed Table */}
      <Card className="border-l-4 bg-card/50" style={{ borderLeftColor: brandColor }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-foreground">
            <BarChart3 className="h-5 w-5" style={{ color: brandColor }} />
            Lista de Desligados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-[500px]">
            <table className="w-full text-[11px]">
              <thead className="text-muted-foreground uppercase sticky top-0 bg-card/95 backdrop-blur-sm">
                <tr className="border-b border-border/50">
                  <th className="text-left p-2">Nome</th>
                  <th className="text-left p-2">Cargo</th>
                  <th className="text-left p-2">Depto</th>
                  <th className="text-left p-2">Level</th>
                  <th className="text-left p-2">Vínculo</th>
                  <th className="text-left p-2">Tempo de Casa</th>
                  <th className="text-left p-2">Data Deslig.</th>
                  <th className="text-left p-2">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeavers.map((leaver) => (
                  <tr key={leaver.id} className="border-b border-border/30 hover:bg-muted/50">
                    <td className="p-2 font-medium text-foreground whitespace-nowrap">{leaver.nome}</td>
                    <td className="p-2 text-foreground">{leaver.cargo}</td>
                    <td className="p-2 text-foreground">{leaver.departamento}</td>
                    <td className="p-2 text-foreground">{leaver.level}</td>
                    <td className="p-2 text-foreground">{leaver.vinculo}</td>
                    <td className="p-2 text-foreground">{leaver.tempo_casa_faixa}</td>
                    <td className="p-2 text-foreground whitespace-nowrap">{leaver.data_desligamento_str}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        leaver.tipo_desligamento_agrupado === 'Involuntário'
                          ? 'bg-red-500/20 text-red-400'
                          : leaver.tipo_desligamento_agrupado === 'Voluntário'
                          ? 'bg-blue-500/20 text-blue-400'
                          : leaver.tipo_desligamento_agrupado === 'Acordo'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {leaver.tipo_desligamento_agrupado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredLeavers.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Nenhum desligado encontrado com os filtros selecionados.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
