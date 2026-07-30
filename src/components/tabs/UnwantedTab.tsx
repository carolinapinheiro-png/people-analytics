import { useDashboard } from '@/data/DashboardContext';
import { LeaverRecord } from '@/data/leaver-types';
import { mLabel, fmt, fmtC } from '@/data/helpers';
import KpiCard from '@/components/dashboard/KpiCard';
import ChartCard from '@/components/dashboard/ChartCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { COLORS } from '@/lib/colors';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell, PieChart, Pie
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Users,
  Target,
  BarChart3,
  Activity,
  UserX,
  HeartCrack,
  Briefcase,
  DollarSign,
} from 'lucide-react';

// Heurística configurável: percentual estimado de saídas consideradas não desejadas.
const UNWANTED_ATTRITION_PCT = 0.65;

// Benchmarks configuráveis (% do headcount)
const BENCHMARK_TARGET = 3.5;
const BENCHMARK_MARKET = 4.2;
const BENCHMARK_CRITICAL = 6.0;

// Custo médio de substituição e meses de ramp-up (estimativa)
const REPLACEMENT_COST = 45000;
const PRODUCTIVITY_LOSS_MONTHS = 6;

const SALARY_BAND_ORDER = ['Até 3k', '3k-5k', '5k-8k', '8k-12k', '12k-20k', '20k-50k', '50k+'];
const PIE_COLORS = [COLORS.danger, COLORS.success, COLORS.warning, COLORS.purple, COLORS.orange];

function calcUnwantedAttrition(totalLeavers: number): number {
  return Math.round(totalLeavers * UNWANTED_ATTRITION_PCT);
}

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

export default function UnwantedTab() {
  const { currentData, allMonthsData, currentMonth, brand, leavers, filters } = useDashboard();
  const curr = currentData;

  const brandColor = brand === 'NSX' ? COLORS.nsx : brand === 'Betfair BR' ? COLORS.betfair : COLORS.flutter;
  const brandLabel = brand === 'combined' ? 'Combinado' : brand;

  // Filter real leavers data
  const filteredLeavers = leavers.filter(r => {
    if (filters.departamento !== 'Todos' && r.departamento !== filters.departamento) return false;
    if (filters.jobFamily !== 'Todos' && r.job_family !== filters.jobFamily) return false;
    if (filters.tempoCasa !== 'Todos' && r.tempo_casa_faixa !== filters.tempoCasa) return false;
    if (filters.tipoContrato !== 'Todos' && r.vinculo !== filters.tipoContrato) return false;
    if (filters.faixaSalarial !== 'Todos' && r.faixa_salarial !== filters.faixaSalarial) return false;
    if (filters.tipoDesligamento !== 'Todos' && r.tipo_desligamento_agrupado !== filters.tipoDesligamento) return false;
    if (filters.level !== 'Todos' && r.level !== filters.level) return false;
    return true;
  });

  const realLeaversCount = filteredLeavers.length;
  const realInvoluntary = filteredLeavers.filter(r => r.tipo_desligamento_agrupado === 'Involuntário').length;
  const realVoluntary = filteredLeavers.filter(r => r.tipo_desligamento_agrupado === 'Voluntário').length;
  const realAgreement = filteredLeavers.filter(r => r.tipo_desligamento_agrupado === 'Acordo').length;
  const realAvgSalary = avgSalary(filteredLeavers);
  const realAvgTenure = avgTenureMonths(filteredLeavers);

  const salaryBandData = countBy(filteredLeavers, 'faixa_salarial', SALARY_BAND_ORDER);
  const typeData = countBy(filteredLeavers, 'tipo_desligamento_agrupado');
  const deptData = countBy(filteredLeavers, 'departamento');

  const totalLeavers = curr.leavers || 0;
  const unwantedLeavers = calcUnwantedAttrition(totalLeavers);
  const wantedLeavers = totalLeavers - unwantedLeavers;
  const unwantedRate = curr.headcount > 0 ? ((unwantedLeavers / curr.headcount) * 100) : 0;
  const wantedRate = curr.headcount > 0 ? ((wantedLeavers / curr.headcount) * 100) : 0;

  const currentIndex = allMonthsData.findIndex(d => d.month === currentMonth);
  const prevData = currentIndex > 0 ? allMonthsData[currentIndex - 1] : undefined;
  const sixMonthsAgoData = currentIndex >= 6 ? allMonthsData[currentIndex - 6] : allMonthsData[0];

  const calcUnwantedRate = (d?: { leavers: number; headcount: number }) =>
    d && d.headcount > 0 ? ((calcUnwantedAttrition(d.leavers || 0) / d.headcount) * 100) : 0;

  const lastMonthRate = calcUnwantedRate(prevData);
  const sixMonthsAgoRate = calcUnwantedRate(sixMonthsAgoData);
  const monthlyChange = unwantedRate - lastMonthRate;
  const semestralChange = unwantedRate - sixMonthsAgoRate;

  const trendData = allMonthsData.map(d => ({
    month: mLabel(d.month),
    naoDesejada: calcUnwantedAttrition(d.leavers || 0),
    desejada: (d.leavers || 0) - calcUnwantedAttrition(d.leavers || 0),
    taxaNaoDesejada: d.headcount > 0 ? parseFloat(((calcUnwantedAttrition(d.leavers || 0) / d.headcount) * 100).toFixed(2)) : 0,
  }));

  const totalCost = unwantedLeavers * REPLACEMENT_COST;

  const kpis = [
    { label: 'Atriç. Não Desejada', value: String(unwantedLeavers), color: COLORS.danger, sub: `${unwantedRate.toFixed(2)}% do HC` },
    { label: 'Atriç. Desejada', value: String(wantedLeavers), color: COLORS.success, sub: `${wantedRate.toFixed(2)}% do HC` },
    { label: 'Total Saídas', value: String(totalLeavers), color: COLORS.gray400, sub: mLabel(currentMonth) },
    { label: 'Custo Estimado', value: `R$ ${(totalCost / 1000).toFixed(0)}k`, color: COLORS.orange, sub: `${unwantedLeavers} substituições` },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200/90 leading-relaxed">
        <strong>Como ler esta aba:</strong> a divisão <em>desejada × não desejada</em> é uma{' '}
        <strong>estimativa</strong> — {(UNWANTED_ATTRITION_PCT * 100).toFixed(0)}% das saídas são
        tratadas como não desejadas (premissa configurável), não uma classificação individual de cada
        desligamento. O <strong>custo estimado</strong> = nº de saídas não desejadas ×{' '}
        R$ {REPLACEMENT_COST.toLocaleString('pt-BR')} (custo médio de substituição, premissa). Para
        números reais, seria preciso marcar cada saída como desejada/não na origem.
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <KpiCard key={i} label={k.label} value={k.value} sub={k.sub} color={k.color} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Saídas: Não Desejada vs Desejada" icon={UserX}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
              <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="naoDesejada" name="Não Desejada" stackId="a" fill={COLORS.danger} radius={[4, 4, 0, 0]} />
              <Bar dataKey="desejada" name="Desejada" stackId="a" fill={COLORS.success} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Taxa de Atrito Não Desejado (%)" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
              <YAxis tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
              <Line type="monotone" dataKey="taxaNaoDesejada" name="Taxa Não Desejada %" stroke={COLORS.danger} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Real Leavers Data Section */}
      <Card className="border-l-4 bg-card/50" style={{ borderLeftColor: brandColor }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-foreground">
            <BarChart3 className="h-5 w-5" style={{ color: brandColor }} />
            Dados Reais de Desligamentos — {realLeaversCount} registros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Real KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/50 rounded-lg p-4 text-center border">
              <p className="text-muted-foreground text-xs">Desligados Reais</p>
              <p className="font-bold text-2xl text-foreground">{fmt(realLeaversCount)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center border">
              <p className="text-muted-foreground text-xs">Involuntários</p>
              <p className="font-bold text-2xl text-red-400">{fmt(realInvoluntary)}</p>
              <p className="text-xs text-muted-foreground">{realLeaversCount > 0 ? ((realInvoluntary / realLeaversCount) * 100).toFixed(1) : 0}%</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center border">
              <p className="text-muted-foreground text-xs">Voluntários</p>
              <p className="font-bold text-2xl text-blue-400">{fmt(realVoluntary)}</p>
              <p className="text-xs text-muted-foreground">{realLeaversCount > 0 ? ((realVoluntary / realLeaversCount) * 100).toFixed(1) : 0}%</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-center border">
              <p className="text-muted-foreground text-xs">Salário Médio</p>
              <p className="font-bold text-2xl text-green-400">{fmtC(Math.round(realAvgSalary))}</p>
              <p className="text-xs text-muted-foreground">{realAvgTenure.toFixed(1)} meses médios</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Attrition por Faixa Salarial (Real)
              </h3>
              {salaryBandData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={salaryBandData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                      <XAxis type="number" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} width={90} />
                      <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
                      <Bar dataKey="value" name="Saídas" fill={brandColor} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                    {salaryBandData.map((item, idx) => (
                      <div key={idx} className="bg-muted/50 p-3 rounded border text-sm">
                        <p className="text-foreground text-xs">{item.name}</p>
                        <p className="font-bold text-lg">{item.value}</p>
                        <p className="text-xs text-muted-foreground">{realLeaversCount > 0 ? ((item.value / realLeaversCount) * 100).toFixed(1) : 0}% das saídas</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma saída registrada no período para análise por faixa salarial.</p>
              )}
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Tipo de Desligamento (Real)
              </h3>
              {typeData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={typeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {typeData.map((_, idx) => (
                          <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-4">
                    {typeData.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-foreground">{item.name}</span>
                        <span className="font-bold">{item.value} ({realLeaversCount > 0 ? ((item.value / realLeaversCount) * 100).toFixed(1) : 0}%)</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum dado de tipo de desligamento disponível.</p>
              )}
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Top Departamentos (Real)
              </h3>
              {deptData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={deptData.slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis type="number" tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fill: 'var(--chart-tick)', fontSize: 9 }} width={100} />
                    <Tooltip contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, fontSize: 11 }} />
                    <Bar dataKey="value" name="Saídas" fill={COLORS.purple} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum dado por departamento disponível.</p>
              )}
            </div>
          </div>

          <div className="bg-blue-950/30 border border-blue-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Activity className="h-5 w-5 text-blue-400 mt-0.5" />
              <div>
                <h4 className="font-semibold text-blue-200">Integração de Dados Reais</h4>
                <p className="mt-1 text-sm text-blue-200">
                  As análises acima combinam dados mensais agregados do headcount com os {realLeaversCount} registros reais de desligamentos.
                  Os dados por faixa salarial, tipo de desligamento e departamento são baseados nos registros individuais.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-l-4 bg-card/50" style={{ borderLeftColor: brandColor }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-foreground">
            <BarChart3 className="h-5 w-5" style={{ color: brandColor }} />
            Análise de Attrition Não Desejada — {mLabel(currentMonth)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Benchmarks
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Meta Interna</span>
                  <span className="font-bold text-green-400">{BENCHMARK_TARGET}%</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Média de Mercado</span>
                  <span className="font-bold text-yellow-400">{BENCHMARK_MARKET}%</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Limite Crítico</span>
                  <span className="font-bold text-red-400">{BENCHMARK_CRITICAL}%</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Taxa Atual</span>
                  <span className={`font-bold ${unwantedRate > BENCHMARK_CRITICAL ? 'text-red-400' : unwantedRate > BENCHMARK_TARGET ? 'text-yellow-400' : 'text-green-400'}`}>
                    {unwantedRate.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Tendências
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Var. Mensal</span>
                  <span className={`font-bold ${monthlyChange >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {monthlyChange >= 0 ? '+' : ''}{monthlyChange.toFixed(2)} p.p.
                  </span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Var. Semestral</span>
                  <span className={`font-bold ${semestralChange >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {semestralChange >= 0 ? '+' : ''}{semestralChange.toFixed(2)} p.p.
                  </span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Custo Estimado</span>
                  <span className="font-bold">R$ {(totalCost / 1000).toFixed(0)}k</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Ramp-up Médio</span>
                  <span className="font-bold">{PRODUCTIVITY_LOSS_MONTHS} meses</span>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Impacto
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Headcount Atual</span>
                  <span className="font-bold">{fmt(curr.headcount || 0)}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Total de Saídas</span>
                  <span className="font-bold">{fmt(totalLeavers)}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Não Desejadas</span>
                  <span className="font-bold text-red-400">{fmt(unwantedLeavers)}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/50 rounded border">
                  <span className="text-muted-foreground">Desejadas</span>
                  <span className="font-bold text-green-400">{fmt(wantedLeavers)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className={`p-4 rounded-lg border text-sm ${unwantedRate > BENCHMARK_CRITICAL ? 'bg-red-950/40 border-red-500/30 text-red-300' : unwantedRate > BENCHMARK_TARGET ? 'bg-amber-950/40 border-amber-500/30 text-amber-300' : 'bg-green-950/40 border-green-500/30 text-green-300'}`}>
            <div className="flex items-start gap-3">
              {unwantedRate > BENCHMARK_CRITICAL ? <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" /> : <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />}
              <div>
                <strong>Insight:</strong>{' '}
                A taxa de atrito não desejado está em {unwantedRate.toFixed(2)}%,
                {unwantedRate > BENCHMARK_CRITICAL
                  ? ' acima do limite crítico. Recomenda-se investigação imediata das causas.'
                  : unwantedRate > BENCHMARK_TARGET
                  ? ' acima da meta interna, mas abaixo do limite crítico.'
                  : ' dentro da meta interna.'}
                {' '}A variação mensal é de {monthlyChange >= 0 ? '+' : ''}{monthlyChange.toFixed(2)} p.p.
              </div>
            </div>
          </div>

          <div className="bg-amber-950/30 border border-amber-500/20 rounded-lg p-4">
            <h3 className="font-semibold text-amber-200 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Recomendações
            </h3>
            <ul className="space-y-2 text-sm text-amber-200">
              <li className="flex items-start gap-2">
                <span className="font-bold">1.</span>
                <span><strong>Investigar picos:</strong> Meses com taxa não desejada acima de {BENCHMARK_CRITICAL}% devem ser analisados com entrevistas de saída.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">2.</span>
                <span><strong>Revisar compensação:</strong> Quando a taxa supera a média de mercado, avaliar política salarial e benefícios.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">3.</span>
                <span><strong>Plano de sucessão:</strong> Reduzir dependência de colaboradores críticos com cross-training e documentação.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">4.</span>
                <span><strong>Monitorar tendência:</strong> Acompanhar variação mensal para identificar deterioração precoce.</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
