import { useDashboard, type BrandType } from '@/data/DashboardContext';
import { mLabel, fmt } from '@/data/helpers';
import KpiCard from '@/components/dashboard/KpiCard';
import ChartCard from '@/components/dashboard/ChartCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, Cell
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Users,
  Target,
  Award,
  Activity,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';
import { COLORS } from '@/lib/colors';

const BRAND_COLORS: Record<string, string> = {
  combined: COLORS.flutter,
  NSX: COLORS.nsx,
  'Betfair BR': COLORS.betfair,
  'Flutter International': COLORS.flutter,
  Porto: COLORS.flutter,
};

const ENG_DEPT = [
  { dept: 'Customer Service', enps: 85, rr: 26, sat: 8.9, status: 'Retention Risk', st: 'warn' },
  { dept: 'Marketing', enps: 62, rr: 21.8, sat: 8.4, status: 'Engagement + Retention', st: 'danger' },
  { dept: 'Technology', enps: 79, rr: 13.1, sat: 9.2, status: 'Retention trend', st: 'warn' },
  { dept: 'Commercial', enps: 76, rr: 12, sat: 8.9, status: 'Stable', st: 'ok' },
  { dept: 'Human Resources', enps: 88, rr: 17.6, sat: 9.2, status: 'Strong Engagement', st: 'good' },
  { dept: 'Finance', enps: 84, rr: 10.5, sat: 9.0, status: 'Improving', st: 'good' },
  { dept: 'Product', enps: 84, rr: 7.9, sat: 8.9, status: 'Very Healthy', st: 'good' },
  { dept: 'Legal', enps: 47, rr: 6.7, sat: 8.0, status: 'Engagement Gap', st: 'danger' },
  { dept: 'Betfair', enps: 75, rr: 15, sat: 8.9, status: 'Aligned (1ª onda)', st: 'ok' },
];

const ENG_DRIVERS = [
  { driver: 'Propósito & Clareza', avg: 4.58 },
  { driver: 'Diversidade & Pertencimento', avg: 4.40 },
  { driver: 'Comunicação & Informação', avg: 4.13 },
  { driver: 'Gestão & Colaboração', avg: 4.57 },
  { driver: 'Reconhecimento & Carreira', avg: 3.86 },
  { driver: 'Desempenho & Autonomia', avg: 3.98 },
  { driver: 'Carga de Trabalho', avg: 4.30 },
  { driver: 'Suporte de RH', avg: 4.35 },
];

// Dados calculados para análise de engajamento
const engagementAnalysis = {
  overall: {
    enps: 76,
    satisfaction: 8.9,
    retentionRisk: 16.6,
    participation: 79,
    trend: 'stable'
  },
  benchmarks: {
    enps: { excellent: 75, good: 60, poor: 40 },
    satisfaction: { excellent: 9.0, good: 8.0, poor: 7.0 },
    retention: { low: 10, medium: 20, high: 30 }
  },
  departmentAnalysis: {
    best: { dept: 'Human Resources', enps: 88, rr: 17.6 },
    worst: { dept: 'Legal', enps: 47, rr: 6.7 },
    risk: { dept: 'Customer Service', enps: 85, rr: 26 },
    improving: { dept: 'Finance', enps: 84, rr: 10.5 }
  },
  drivers: {
    best: { driver: 'Gestão & Colaboração', avg: 4.57 },
    worst: { driver: 'Reconhecimento & Carreira', avg: 3.86 },
    gap: 0.71
  },
  trends: {
    enpsChange: 0,
    satisfactionChange: 0,
    rrChange: 4.6,
    participationChange: 3
  }
};

export default function EngagementTab() {
  const { brand, currentData, prevData, currentMonth } = useDashboard();
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;
  const curr = currentData;

  const brandName: string = brand === 'combined' ? 'Todas as marcas' : brand;
  const monthLabel = mLabel(currentMonth);
  const prevMonthLabel = prevData ? mLabel(prevData.month) : 'mês anterior';

  const brandTag = brand === 'combined' ? '' : ` · ${brandName}`;
  const baseLabel = `${fmt(curr.headcount || 0)} colaboradores`;

  const kpis = [
    { label: 'eNPS', val: '76', color: brandColor, sub: `${monthLabel}${brandTag}` },
    { label: 'Satisfação', val: '8.9/10', color: COLORS.nsx, sub: `Base: ${baseLabel}` },
    { label: 'Risco de Retenção', val: '16.6%', color: COLORS.danger, sub: `+4.6pp vs ${prevMonthLabel}` },
    { label: 'Participação', val: '79%', color: COLORS.success, sub: `Base: ${baseLabel}` },
  ];

  const npsData = [...ENG_DEPT].sort((a, b) => b.enps - a.enps).map(d => ({
    name: d.dept, enps: d.enps,
    fill: d.enps >= 76 ? brandColor + '77' : COLORS.danger + '77',
    stroke: d.enps >= 76 ? brandColor : COLORS.danger,
  }));

  const rrData = [...ENG_DEPT].sort((a, b) => b.rr - a.rr).map(d => ({
    name: d.dept, rr: d.rr,
    fill: d.rr > 16.6 ? COLORS.danger + '77' : brandColor + '77',
    stroke: d.rr > 16.6 ? COLORS.danger : brandColor,
  }));

  const driverData = [...ENG_DRIVERS].sort((a, b) => a.avg - b.avg).map(d => ({
    name: d.driver, avg: d.avg,
    fill: d.avg < 4.0 ? COLORS.danger + '77' : d.avg < 4.3 ? COLORS.amber + '77' : brandColor + '77',
    stroke: d.avg < 4.0 ? COLORS.danger : d.avg < 4.3 ? COLORS.amber : brandColor,
  }));

  const statusColors: Record<string, { bg: string; text: string }> = {
    danger: { bg: 'rgba(239,83,80,.12)', text: '#ef5350' },
    warn: { bg: 'rgba(255,202,40,.1)', text: '#ffca28' },
    good: { bg: 'rgba(102,187,106,.1)', text: '#66bb6a' },
    ok: { bg: 'rgba(121,134,203,.1)', text: '#7986cb' },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex gap-5 flex-wrap text-xs text-muted-foreground">
        <span>Marca: <strong className="text-foreground">{brandName}</strong></span>
        <span>Onda: <strong className="text-foreground">{monthLabel}</strong></span>
        <span>Base: <strong className="text-foreground">{baseLabel}</strong></span>
        <span>Questões: <strong className="text-foreground">32 itens · 8 drivers</strong></span>
        <span>Participação: <strong className="text-foreground">79% (+3pp)</strong></span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map(k => <KpiCard key={k.label} label={k.label} value={k.val} color={k.color} sub={k.sub} />)}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="eNPS por Departamento" subtitle={`Ref. empresa: 76 · ${brandName}`}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={npsData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#4a5568', fontSize: 9 }} width={100} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
              <ReferenceLine x={76} stroke={COLORS.amber + '88'} strokeDasharray="5 4" strokeWidth={1.5} />
              <Bar dataKey="enps">
                {npsData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} stroke={entry.stroke} strokeWidth={1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Risco de Retenção por Departamento" subtitle={`Ref. empresa: 16.6% · ${brandName}`}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={rrData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis type="number" domain={[0, 30]} tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#4a5568', fontSize: 9 }} width={100} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
              <ReferenceLine x={16.6} stroke={COLORS.amber + '88'} strokeDasharray="5 4" strokeWidth={1.5} />
              <Bar dataKey="rr">
                {rrData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} stroke={entry.stroke} strokeWidth={1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Score Médio por Driver" subtitle={`Escala 1–5 · vermelho <4.0 · ${brandName}`}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={driverData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
            <XAxis type="number" domain={[3.2, 5.0]} tick={{ fill: '#4a5568', fontSize: 9 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#4a5568', fontSize: 9 }} width={160} />
            <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey="avg">
              {driverData.map((entry, idx) => (
                <Cell key={idx} fill={entry.fill} stroke={entry.stroke} strokeWidth={1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Department Table */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
          Indicadores por Departamento — {monthLabel}{brand !== 'combined' ? ` · ${brandName}` : ''}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2 text-[10px] uppercase text-muted-foreground">Departamento</th>
                <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">eNPS</th>
                <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Ret. Risk</th>
                <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Satisfação</th>
                <th className="p-2 text-[10px] uppercase text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {ENG_DEPT.map(d => {
                const sc = statusColors[d.st] || statusColors.ok;
                return (
                  <tr key={d.dept} className="border-b border-border/50 hover:bg-white/5">
                    <td className="p-2 font-semibold">{d.dept}</td>
                    <td className="p-2 text-right font-bold" style={{ color: d.enps < 60 ? '#ef5350' : d.enps > 82 ? '#66bb6a' : undefined }}>{d.enps}</td>
                    <td className="p-2 text-right font-bold" style={{ color: d.rr >= 20 ? '#ef5350' : d.rr >= 15 ? '#ffca28' : '#66bb6a' }}>{d.rr}%</td>
                    <td className="p-2 text-right">{d.sat}</td>
                    <td className="p-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-xl font-semibold" style={{ background: sc.bg, color: sc.text }}>{d.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ANÁLISE DETALHADA - NOVA SEÇÃO */}
      <Card className="border-l-4" style={{ borderLeftColor: brandColor }}>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <BarChart3 className="h-6 w-6" style={{ color: brandColor }} />
            Análise Detalhada - Engajamento · {brandName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* 1. Visão Geral */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              1. Visão Geral do Engajamento ({monthLabel} - 3ª Onda)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="bg-blue-950/30 p-3 rounded text-center border border-blue-100">
                <p className="text-slate-400 text-xs">eNPS</p>
                <p className="font-bold text-2xl text-blue-400">{engagementAnalysis.overall.enps}</p>
                <p className="text-xs text-slate-400">3ª onda</p>
              </div>
              <div className="bg-green-950/30 p-3 rounded text-center border border-green-100">
                <p className="text-slate-400 text-xs">Satisfação</p>
                <p className="font-bold text-2xl text-green-400">{engagementAnalysis.overall.satisfaction}</p>
                <p className="text-xs text-slate-400">de 10</p>
              </div>
              <div className="bg-red-950/30 p-3 rounded text-center border border-red-100">
                <p className="text-slate-400 text-xs">Risco Retenção</p>
                <p className="font-bold text-2xl text-red-400">{engagementAnalysis.overall.retentionRisk}%</p>
                <p className="text-xs text-slate-400">+4.6pp vs {prevMonthLabel}</p>
              </div>
              <div className="bg-purple-950/30 p-3 rounded text-center border border-purple-100">
                <p className="text-slate-400 text-xs">Participação</p>
                <p className="font-bold text-2xl text-purple-400">{engagementAnalysis.overall.participation}%</p>
                <p className="text-xs text-slate-400">+3pp vs {prevMonthLabel}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-300 italic">
              ✅ <strong>Insight:</strong> eNPS de 76 está acima do benchmark de excelência (75). Satisfação estável em 8.9/10. 
              Alerta para aumento de 4.6pp no risco de retenção, indicando necessidade de ações preventivas.
            </p>
          </div>

          {/* 2. Análise de Departamentos */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" />
              2. Análise por Departamento
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-green-950/30 p-3 rounded border border-green-100">
                <p className="text-slate-300 text-xs font-medium flex items-center gap-1">
                  <ThumbsUp className="h-3 w-3" /> Melhor Performance
                </p>
                <p className="font-bold text-lg mt-1">{engagementAnalysis.departmentAnalysis.best.dept}</p>
                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>eNPS:</span>
                    <span className="font-bold text-green-400">{engagementAnalysis.departmentAnalysis.best.enps}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Risco Retenção:</span>
                    <span className="font-bold">{engagementAnalysis.departmentAnalysis.best.rr}%</span>
                  </div>
                </div>
              </div>
              <div className="bg-red-950/30 p-3 rounded border border-red-100">
                <p className="text-slate-300 text-xs font-medium flex items-center gap-1">
                  <ThumbsDown className="h-3 w-3" /> Atenção Necessária
                </p>
                <p className="font-bold text-lg mt-1">{engagementAnalysis.departmentAnalysis.worst.dept}</p>
                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>eNPS:</span>
                    <span className="font-bold text-red-400">{engagementAnalysis.departmentAnalysis.worst.enps}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Risco Retenção:</span>
                    <span className="font-bold">{engagementAnalysis.departmentAnalysis.worst.rr}%</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 p-3 bg-slate-800/50 rounded border">
              <p className="text-xs font-medium text-slate-300 mb-2">Departamentos em Risco:</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between p-1 bg-red-950/30 rounded">
                  <span>Customer Service</span>
                  <span className="font-bold text-red-400">eNPS 85, RR 26% ⚠️ Alto risco de turnover</span>
                </div>
                <div className="flex justify-between p-1 bg-red-950/30 rounded">
                  <span>Marketing</span>
                  <span className="font-bold text-red-400">eNPS 62, RR 21.8% ⚠️ Baixo engajamento + alto risco</span>
                </div>
                <div className="flex justify-between p-1 bg-yellow-950/30 rounded">
                  <span>Technology</span>
                  <span className="font-bold text-yellow-400">eNPS 79, RR 13.1% ⚠️ Tendência de retenção</span>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-300 italic">
              ⚠️ <strong>Alerta:</strong> Customer Service apresenta paradoxo: alto eNPS (85) mas alto risco de retenção (26%). 
              Marketing precisa de atenção imediata com eNPS 62 e RR 21.8%.
            </p>
          </div>

          {/* 3. Análise de Drivers */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <Target className="h-4 w-4" />
              3. Análise de Drivers de Engajamento
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-green-950/30 p-3 rounded border border-green-100">
                <p className="text-slate-300 text-xs font-medium">Melhor Driver</p>
                <p className="font-bold text-lg mt-1">{engagementAnalysis.drivers.best.driver}</p>
                <p className="text-2xl font-bold text-green-400">{engagementAnalysis.drivers.best.avg}</p>
                <p className="text-xs text-slate-400">de 5.0</p>
              </div>
              <div className="bg-red-950/30 p-3 rounded border border-red-100">
                <p className="text-slate-300 text-xs font-medium">Driver com Gap</p>
                <p className="font-bold text-lg mt-1">{engagementAnalysis.drivers.worst.driver}</p>
                <p className="text-2xl font-bold text-red-400">{engagementAnalysis.drivers.worst.avg}</p>
                <p className="text-xs text-slate-400">de 5.0</p>
              </div>
            </div>
            <div className="mt-3 p-3 bg-slate-800/50 rounded border">
              <p className="text-xs font-medium text-slate-300 mb-2">Todos os Drivers (ordem crescente):</p>
              <div className="space-y-1 text-xs">
                {ENG_DRIVERS.sort((a, b) => a.avg - b.avg).map((driver, idx) => (
                  <div key={driver.driver} className="flex justify-between p-1 rounded" 
                    style={{ 
                      background: driver.avg < 4.0 ? 'rgba(239,83,80,.1)' : 
                                driver.avg < 4.3 ? 'rgba(255,202,40,.1)' : 'rgba(102,187,106,.1)'
                    }}>
                    <span>{idx + 1}. {driver.driver}</span>
                    <span className="font-bold" 
                      style={{ 
                        color: driver.avg < 4.0 ? '#ef5350' : 
                              driver.avg < 4.3 ? '#ffca28' : '#66bb6a'
                      }}>
                      {driver.avg}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-300 italic">
              ⚠️ <strong>Alerta:</strong> Gap de {engagementAnalysis.drivers.gap.toFixed(2)} entre melhor e pior driver. 
              "Reconhecimento & Carreira" (3.86) está abaixo de 4.0 e precisa de ações imediatas de gestão.
            </p>
          </div>

          {/* 4. Benchmark Comparativo */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <Award className="h-4 w-4" />
              4. Benchmark e Metas
            </h3>
            <div className="space-y-3 text-sm">
              <div className="bg-slate-800/50 p-3 rounded border">
                <p className="text-xs font-medium text-slate-300 mb-2">eNPS - Benchmarks:</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-500 rounded-full" 
                      style={{ width: '76%' }}></div>
                  </div>
                  <span className="font-bold text-blue-400">76</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-red-500">Pobre (&lt;40)</span>
                  <span className="text-yellow-400">Bom (60)</span>
                  <span className="text-green-400">Excelente (75+)</span>
                </div>
              </div>
              <div className="bg-slate-800/50 p-3 rounded border">
                <p className="text-xs font-medium text-slate-300 mb-2">Satisfação - Benchmarks:</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-500 rounded-full" 
                      style={{ width: '89%' }}></div>
                  </div>
                  <span className="font-bold text-green-400">8.9</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-red-500">Pobre (&lt;7)</span>
                  <span className="text-yellow-400">Bom (8)</span>
                  <span className="text-green-400">Excelente (9+)</span>
                </div>
              </div>
              <div className="bg-slate-800/50 p-3 rounded border">
                <p className="text-xs font-medium text-slate-300 mb-2">Risco de Retenção - Benchmarks:</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-500 via-yellow-400 to-red-500 rounded-full" 
                      style={{ width: '55%' }}></div>
                  </div>
                  <span className="font-bold text-yellow-400">16.6%</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-green-400">Baixo (&lt;10%)</span>
                  <span className="text-yellow-400">Médio (20%)</span>
                  <span className="text-red-500">Alto (&gt;30%)</span>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-300 italic">
              ✅ <strong>Insight:</strong> eNPS 76 está na faixa de excelência. Satisfação 8.9/10 é excelente. 
              Risco de retenção 16.6% está na faixa média, mas tendência de aumento requer atenção.
            </p>
          </div>

          {/* 5. Tendências Temporais */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              5. Tendências Temporais ({prevMonthLabel} → {monthLabel})
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-slate-800/50 p-3 rounded border">
                <p className="text-slate-300 text-xs">eNPS</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-bold text-lg">76</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-bold text-lg">76</span>
                  <Badge className="bg-slate-700/50 text-slate-300">= Estável</Badge>
                </div>
              </div>
              <div className="bg-slate-800/50 p-3 rounded border">
                <p className="text-slate-300 text-xs">Satisfação</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-bold text-lg">8.9</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-bold text-lg">8.9</span>
                  <Badge className="bg-slate-700/50 text-slate-300">= Estável</Badge>
                </div>
              </div>
              <div className="bg-red-950/30 p-3 rounded border border-red-100">
                <p className="text-slate-300 text-xs">Risco Retenção</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-bold text-lg">12.0%</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-bold text-lg text-red-400">16.6%</span>
                  <Badge className="bg-red-500/20 text-red-400">↑ +4.6pp</Badge>
                </div>
              </div>
              <div className="bg-green-950/30 p-3 rounded border border-green-100">
                <p className="text-slate-300 text-xs">Participação</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-bold text-lg">76%</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-bold text-lg text-green-400">79%</span>
                  <Badge className="bg-green-500/20 text-green-400">↑ +3pp</Badge>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-300 italic">
              ⚠️ <strong>Alerta:</strong> Estabilidade em eNPS e satisfação é positiva, mas aumento de 4.6pp no risco de 
              retenção em 7 meses é preocupante. Aumento de participação (+3pp) sugere maior confiança na pesquisa.
            </p>
          </div>

          {/* 6. Correlações e Insights */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              6. Correlações e Insights Avançados
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2 p-2 bg-slate-800/50 rounded border">
                <span className="text-yellow-500 mt-0.5">⚠️</span>
                <div>
                  <p className="font-medium">Paradoxo Customer Service</p>
                  <p className="text-xs text-slate-300">Alto eNPS (85) mas alto risco de retenção (26%). Possível exaustão emocional ou sobrecarga de trabalho.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 bg-slate-800/50 rounded border">
                <span className="text-red-500 mt-0.5">🚨</span>
                <div>
                  <p className="font-medium">Marketing em Alerta</p>
                  <p className="text-xs text-slate-300">eNPS 62 (abaixo de 75) + RR 21.8% (acima de 16.6%). Requer ação imediata de liderança.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 bg-slate-800/50 rounded border">
                <span className="text-green-500 mt-0.5">✅</span>
                <div>
                  <p className="font-medium">HR e Product como Referência</p>
                  <p className="text-xs text-slate-300">HR (eNPS 88) e Product (eNPS 84, RR 7.9%) são modelos de boas práticas de gestão.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 bg-slate-800/50 rounded border">
                <span className="text-blue-500 mt-0.5">💡</span>
                <div>
                  <p className="font-medium">Legal - Baixo Engajamento</p>
                  <p className="text-xs text-slate-300">eNPS 47 é significativamente baixo. Possível desconexão com cultura ou falta de clareza de propósito.</p>
                </div>
              </div>
            </div>
          </div>

          {/* 7. Recomendações */}
          <div className="bg-amber-950/30 border border-amber-500/20 rounded-lg p-4">
            <h3 className="font-semibold text-amber-200 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              7. Recomendações Estratégicas
            </h3>
            <ul className="space-y-2 text-sm text-amber-200">
              <li className="flex items-start gap-2">
                <span className="font-bold">1.</span>
                <span><strong>Ação Imediata - Marketing:</strong> eNPS 62 e RR 21.8% exigem intervenção de liderança. 
                Realizar entrevistas qualitativas para identificar causas raiz.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">2.</span>
                <span><strong>Investigar Customer Service:</strong> Paradoxo de alto eNPS com alto risco de retenção 
                sugere exaustão. Avaliar carga de trabalho e burnout.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">3.</span>
                <span><strong>Reconhecimento & Carreira:</strong> Driver com menor score (3.86). Implementar programa 
                de reconhecimento e revisar planos de carreira.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">4.</span>
                <span><strong>Replicar Boas Práticas:</strong> HR e Product são referências. Documentar práticas 
                de gestão e replicar em outros departamentos.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">5.</span>
                <span><strong>Monitorar Tendência RR:</strong> Aumento de 4.6pp em 7 meses é alerta. 
                Implementar ações preventivas de retenção antes que se torne crítico.</span>
              </li>
            </ul>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
