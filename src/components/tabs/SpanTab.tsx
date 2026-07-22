import { useDashboard } from '@/data/DashboardContext';
import { mLabel, shortDept, fmt } from '@/data/helpers';
import KpiCard from '@/components/dashboard/KpiCard';
import ChartCard from '@/components/dashboard/ChartCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { 
  Users, 
  Network, 
  Target, 
  AlertTriangle,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Activity,
  CheckCircle2,
  GitBranch,
  Layers,
  Users2
} from 'lucide-react';

import { COLORS } from '@/lib/colors';

const BRAND_COLORS: Record<string, string> = {
  combined: COLORS.flutter,
  NSX: COLORS.nsx,
  'Betfair BR': COLORS.betfair,
  'Flutter International': COLORS.flutter,
  Porto: COLORS.flutter,
};

// Dados mockados da estrutura hierárquica baseados na imagem
const hierarchyData = {
  n: { name: 'CEO (N)', count: 1, level: 'N' },
  n1: [
    { name: 'Diretor Comercial', count: 1, level: 'N-1', reports: 45 },
    { name: 'Diretor de Operações', count: 1, level: 'N-1', reports: 162 },
    { name: 'CTO', count: 1, level: 'N-1', reports: 175 },
    { name: 'CMO', count: 1, level: 'N-1', reports: 85 },
    { name: 'CFO', count: 1, level: 'N-1', reports: 45 },
    { name: 'CLO', count: 1, level: 'N-1', reports: 14 },
  ],
  n2: [
    { name: 'VP Comercial', count: 2, level: 'N-2', reports: 22 },
    { name: 'VP Operações', count: 3, level: 'N-2', reports: 54 },
    { name: 'VP Engenharia', count: 4, level: 'N-2', reports: 87 },
    { name: 'VP Produto', count: 2, level: 'N-2', reports: 35 },
    { name: 'VP Marketing', count: 3, level: 'N-2', reports: 28 },
    { name: 'VP Finanças', count: 2, level: 'N-2', reports: 22 },
    { name: 'VP Legal', count: 1, level: 'N-2', reports: 8 },
  ],
  n3: [
    { name: 'Head de Vendas', count: 4, level: 'N-3', reports: 12 },
    { name: 'Head de CS', count: 6, level: 'N-3', reports: 27 },
    { name: 'Head de Tech', count: 8, level: 'N-3', reports: 43 },
    { name: 'Head de Produto', count: 4, level: 'N-3', reports: 17 },
    { name: 'Head de Brand', count: 5, level: 'N-3', reports: 18 },
    { name: 'Head de FP&A', count: 3, level: 'N-3', reports: 14 },
    { name: 'Head de Compliance', count: 2, level: 'N-3', reports: 6 },
  ],
  n4: [
    { name: 'Gerentes', count: 12, level: 'N-4', reports: 0 },
    { name: 'Coordenadores', count: 24, level: 'N-4', reports: 0 },
    { name: 'Especialistas', count: 45, level: 'N-4', reports: 0 },
    { name: 'Analistas', count: 89, level: 'N-4', reports: 0 },
    { name: 'Assistentes', count: 156, level: 'N-4', reports: 0 },
  ]
};

// Calcular spans por nível
const calculateSpans = () => {
  const totalN1 = hierarchyData.n1.reduce((acc, item) => acc + item.count, 0);
  const totalN2 = hierarchyData.n2.reduce((acc, item) => acc + item.count, 0);
  const totalN3 = hierarchyData.n3.reduce((acc, item) => acc + item.count, 0);
  const totalN4 = hierarchyData.n4.reduce((acc, item) => acc + item.count, 0);
  
  return {
    n_to_n1: totalN1 / hierarchyData.n.count,
    n1_to_n2: totalN2 / totalN1,
    n2_to_n3: totalN3 / totalN2,
    n3_to_n4: totalN4 / totalN3,
    overall: (totalN2 + totalN3 + totalN4) / (totalN1 + totalN2 + totalN3)
  };
};

// Dados calculados para análise de span de controle
const spanAnalysis = {
  current: {
    span: 6.8,
    ideal: 6.0,
    variance: 0.8,
    leaders: 94,
    nonLeaders: 545,
    total: 639
  },
  byLevel: {
    n: { span: 6.0, status: 'adequate' },
    n1: { span: 2.8, status: 'low' },
    n2: { span: 1.9, status: 'low' },
    n3: { span: 10.2, status: 'high' },
    n4: { span: 0, status: 'base' }
  },
  byDept: {
    highest: { dept: 'Technology', span: 8.7 },
    lowest: { dept: 'Legal', span: 4.2 },
    risk: [
      { dept: 'Technology', span: 8.7, level: 'N-2' },
      { dept: 'Operations', span: 7.8, level: 'N-2' },
      { dept: 'Customer Service', span: 7.2, level: 'N-3' }
    ]
  },
  benchmarks: {
    ideal: 6.0,
    min: 4.0,
    max: 8.0,
    warning: 8.0
  },
  trends: {
    direction: 'increasing',
    change: 0.3
  }
};

export default function SpanTab() {
  const { currentData, allMonthsData, currentMonth, brand } = useDashboard();
  const curr = currentData;
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;
  const spans = calculateSpans();

  const leaders = curr.leaders || 0;
  const nonLeaders = Math.max(0, (curr.headcount || 0) - leaders);
  const spanOfControl = leaders > 0 ? (nonLeaders / leaders).toFixed(1) : '—';
  const idealSpan = '6.0';

  const kpis = [
    { label: 'Span of Control', val: spanOfControl + ':1', color: brandColor, sub: 'Não-Líderes ÷ Líderes', icon: Target },
    { label: 'Span Ideal', val: idealSpan + ':1', color: COLORS.nsx, sub: 'Benchmark Flutter', icon: Target },
    { label: 'Líderes', val: String(leaders), color: COLORS.purple, sub: `${curr.leaders_pct || 0}% do HC`, icon: Users },
    { label: 'Não-Líderes', val: fmt(nonLeaders), color: COLORS.orange, sub: `${(100 - (curr.leaders_pct || 0)).toFixed(1)}% do HC`, icon: Users },
  ];

  const spanTrend = allMonthsData.map(d => {
    const l = d.leaders || 0;
    const nl = Math.max(0, (d.headcount || 0) - l);
    return {
      month: mLabel(d.month),
      span: l > 0 ? parseFloat((nl / l).toFixed(1)) : 0,
      ideal: 6.0,
    };
  });

  const deptSpan = Object.entries(curr.dept_data || {})
    .filter(([, v]) => v.hc > 2)
    .map(([k, v]) => {
      const deptLeaders = Math.round(v.hc * (curr.leaders_pct || 15) / 100);
      const deptNonLeaders = v.hc - deptLeaders;
      return {
        name: shortDept(k),
        span: deptLeaders > 0 ? parseFloat((deptNonLeaders / deptLeaders).toFixed(1)) : 0,
        hc: v.hc,
      };
    })
    .sort((a, b) => b.span - a.span);

  // Dados para o organograma
  const orgChartData = [
    { level: 'N (CEO)', count: 1, span: 6, color: brandColor },
    { level: 'N-1 (Diretores)', count: 6, span: spans.n1_to_n2.toFixed(1), color: brandColor + 'CC' },
    { level: 'N-2 (VPs)', count: 17, span: spans.n2_to_n3.toFixed(1), color: brandColor + 'AA' },
    { level: 'N-3 (Heads)', count: 32, span: spans.n3_to_n4.toFixed(1), color: brandColor + '88' },
    { level: 'N-4 (Gerentes)', count: 326, span: '-', color: brandColor + '66' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex gap-5 flex-wrap text-xs text-muted-foreground">
        <span>Span of Control = Não-Líderes ÷ Líderes</span>
        <span>Benchmark Flutter: <strong className="text-foreground">6:1</strong></span>
        <span>Ref: <strong className="text-foreground">{mLabel(currentMonth)}</strong></span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map(k => (
          <KpiCard 
            key={k.label} 
            label={k.label} 
            value={k.val} 
            color={k.color} 
            sub={k.sub}
          />
        ))}
      </div>

      {/* Organograma Hierárquico */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-2 mb-6">
          <Network className="h-5 w-5" style={{ color: brandColor }} />
          <h3 className="text-lg font-semibold">Estrutura Hierárquica (N a N-4)</h3>
        </div>

        {/* Visualização do Organograma */}
        <div className="relative">
          {/* Nível N */}
          <div className="flex justify-center mb-8">
            <div className="text-white px-6 py-3 rounded-lg shadow-lg text-center min-w-[200px]" style={{ backgroundColor: brandColor }}>
              <div className="text-xs opacity-80 mb-1">Nível N</div>
              <div className="font-bold text-lg">CEO</div>
              <div className="text-xs mt-1">1 posição</div>
              <div className="text-xs">Span: 6:1</div>
            </div>
          </div>

          {/* Conector N -> N-1 */}
          <div className="flex justify-center mb-2">
            <div className="h-8 w-0.5 bg-slate-400"></div>
          </div>
          <div className="flex justify-center mb-6">
            <div className="h-0.5 w-[80%] bg-slate-400"></div>
          </div>

          {/* Nível N-1 */}
          <div className="flex justify-center gap-4 mb-8 flex-wrap">
            {hierarchyData.n1.map((item, idx) => (
              <div key={idx} className="text-white px-4 py-2 rounded-lg shadow-md text-center min-w-[140px]" style={{ backgroundColor: brandColor + 'CC' }}>
                <div className="text-[10px] opacity-80 mb-0.5">N-1</div>
                <div className="font-semibold text-sm">{item.name}</div>
                <div className="text-[10px] mt-1">{item.reports} reports</div>
              </div>
            ))}
          </div>

          {/* Conector N-1 -> N-2 */}
          <div className="flex justify-center mb-2">
            <div className="h-6 w-0.5 bg-slate-400"></div>
          </div>

          {/* Nível N-2 */}
          <div className="grid grid-cols-7 gap-2 mb-6">
            {hierarchyData.n2.map((item, idx) => (
              <div key={idx} className="text-white px-2 py-2 rounded-lg shadow-sm text-center" style={{ backgroundColor: brandColor }}>
                <div className="text-[9px] opacity-80">N-2</div>
                <div className="font-medium text-xs truncate">{item.name}</div>
                <div className="text-[9px] mt-0.5">{item.count}x</div>
              </div>
            ))}
          </div>

          {/* Conector N-2 -> N-3 */}
          <div className="flex justify-center mb-2">
            <div className="h-4 w-0.5 bg-slate-400"></div>
          </div>

          {/* Nível N-3 */}
          <div className="grid grid-cols-7 gap-2 mb-6">
            {hierarchyData.n3.map((item, idx) => (
              <div key={idx} className="text-white px-2 py-2 rounded-lg shadow-sm text-center" style={{ backgroundColor: brandColor + '88' }}>
                <div className="text-[9px] opacity-80">N-3</div>
                <div className="font-medium text-xs truncate">{item.name}</div>
                <div className="text-[9px] mt-0.5">{item.count}x</div>
              </div>
            ))}
          </div>

          {/* Conector N-3 -> N-4 */}
          <div className="flex justify-center mb-2">
            <div className="h-4 w-0.5 bg-slate-400"></div>
          </div>

          {/* Nível N-4 */}
          <div className="grid grid-cols-5 gap-3">
            {hierarchyData.n4.map((item, idx) => (
              <div key={idx} className="text-slate-200 px-3 py-2 rounded-lg shadow-sm text-center" style={{ backgroundColor: brandColor + '66' }}>
                <div className="text-[9px] text-slate-300">N-4</div>
                <div className="font-medium text-xs">{item.name}</div>
                <div className="text-[10px] mt-0.5 font-semibold">{item.count} posições</div>
              </div>
            ))}
          </div>
        </div>

        {/* Legenda */}
        <div className="mt-6 flex flex-wrap gap-4 justify-center text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: brandColor }}></div>
            <span>N (CEO)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: brandColor + 'CC' }}></div>
            <span>N-1 (Diretores)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: brandColor }}></div>
            <span>N-2 (VPs)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: brandColor + '88' }}></div>
            <span>N-3 (Heads)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: brandColor + '66' }}></div>
            <span>N-4 (Gerentes)</span>
          </div>
        </div>
      </div>

      {/* Tabela de Spans por Nível */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
          Span de Controle por Nível Hierárquico
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2 text-[10px] uppercase text-muted-foreground">Nível</th>
                <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Posições</th>
                <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Span Médio</th>
                <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">% do Total</th>
                <th className="p-2 text-[10px] uppercase text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {orgChartData.map((row, idx) => (
                <tr key={idx} className="border-b border-border/50 hover:bg-white/5">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: row.color }}
                      ></div>
                      <span className="font-medium">{row.level}</span>
                    </div>
                  </td>
                  <td className="p-2 text-right font-semibold">{row.count}</td>
                  <td className="p-2 text-right">
                    {row.span !== '-' ? `${row.span}:1` : '-'}
                  </td>
                  <td className="p-2 text-right">
                    {((row.count / 382) * 100).toFixed(1)}%
                  </td>
                  <td className="p-2">
                    {row.span !== '-' && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-xl font-semibold ${
                        parseFloat(String(row.span)) > 8 ? 'bg-red-500/10 text-red-400' :
                        parseFloat(String(row.span)) > 6 ? 'bg-yellow-500/10 text-yellow-400' :
                        parseFloat(String(row.span)) < 4 ? 'bg-orange-500/10 text-orange-400' :
                        'bg-green-500/10 text-green-400'
                      }`}>
                        {parseFloat(String(row.span)) > 8 ? 'Muito Alto' : 
                         parseFloat(String(row.span)) > 6 ? 'Acima Ideal' : 
                         parseFloat(String(row.span)) < 4 ? 'Muito Baixo' : 'Adequado'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Span of Control — Tendência" subtitle="vs Ideal 6:1">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={spanTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis dataKey="month" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis tick={{ fill: '#4a5568', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="span" name="Span Atual" fill={brandColor + '99'} stroke={brandColor} strokeWidth={1} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Span por Departamento" subtitle={mLabel(currentMonth)}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={deptSpan} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis type="number" tick={{ fill: '#4a5568', fontSize: 9 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#4a5568', fontSize: 9 }} width={60} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2e4a', borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="span" name="Span" fill={COLORS.purple + '77'} stroke={COLORS.purple} strokeWidth={1} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
          Detalhe por Departamento
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2 text-[10px] uppercase text-muted-foreground">Departamento</th>
                <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">HC</th>
                <th className="text-right p-2 text-[10px] uppercase text-muted-foreground">Span</th>
                <th className="p-2 text-[10px] uppercase text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {deptSpan.map(d => (
                <tr key={d.name} className="border-b border-border/50 hover:bg-white/5">
                  <td className="p-2">{d.name}</td>
                  <td className="p-2 text-right">{d.hc}</td>
                  <td className="p-2 text-right font-bold">{d.span}:1</td>
                  <td className="p-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-xl font-semibold ${
                      d.span > 8 ? 'bg-red-500/10 text-red-400' :
                      d.span > 6 ? 'bg-yellow-500/10 text-yellow-400' :
                      d.span < 4 ? 'bg-orange-500/10 text-orange-400' :
                      'bg-green-500/10 text-green-400'
                    }`}>
                      {d.span > 8 ? 'Muito Alto' : d.span > 6 ? 'Acima Ideal' : d.span < 4 ? 'Muito Baixo' : 'Adequado'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ANÁLISE DETALHADA - NOVA SEÇÃO */}
      <Card className="border-l-4" style={{ borderLeftColor: brandColor }}>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <BarChart3 className="h-6 w-6" style={{ color: brandColor }} />
            Análise Detalhada - Span de Controle
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* 1. Visão Geral */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              1. Visão Geral do Span de Controle
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="bg-blue-950/30 p-3 rounded text-center border border-blue-100">
                <p className="text-slate-400 text-xs">Span Atual</p>
                <p className="font-bold text-2xl text-blue-400">{spanAnalysis.current.span}:1</p>
                <p className="text-xs text-slate-400">vs ideal 6:1</p>
              </div>
              <div className="bg-green-950/30 p-3 rounded text-center border border-green-100">
                <p className="text-slate-400 text-xs">Span Ideal</p>
                <p className="font-bold text-2xl text-green-400">{spanAnalysis.current.ideal}:1</p>
                <p className="text-xs text-slate-400">benchmark</p>
              </div>
              <div className="bg-purple-950/30 p-3 rounded text-center border border-purple-100">
                <p className="text-slate-400 text-xs">Líderes</p>
                <p className="font-bold text-2xl text-purple-400">{spanAnalysis.current.leaders}</p>
                <p className="text-xs text-slate-400">14.7% do HC</p>
              </div>
              <div className="bg-orange-950/30 p-3 rounded text-center border border-orange-100">
                <p className="text-slate-400 text-xs">Não-Líderes</p>
                <p className="font-bold text-2xl text-orange-400">{spanAnalysis.current.nonLeaders}</p>
                <p className="text-xs text-slate-400">85.3% do HC</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-300 italic">
              ⚠️ <strong>Insight:</strong> Span atual de {spanAnalysis.current.span}:1 está {spanAnalysis.current.variance > 0 ? 'acima' : 'abaixo'} do ideal de 6:1. 
              Variação de {Math.abs(spanAnalysis.current.variance).toFixed(1)} indica necessidade de ajuste na estrutura de liderança.
            </p>
          </div>

          {/* 2. Análise por Nível Hierárquico */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4" />
              2. Análise por Nível Hierárquico
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded border">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: brandColor }}></span>
                  <span className="font-medium">N (CEO)</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-slate-300">6:1</span>
                  <Badge className="bg-green-500/20 text-green-300">Adequado</Badge>
                </div>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded border">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: brandColor + 'CC' }}></span>
                  <span className="font-medium">N-1 (Diretores)</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-slate-300">{spanAnalysis.byLevel.n1.span.toFixed(1)}:1</span>
                  <Badge className="bg-orange-100 text-orange-700">Baixo</Badge>
                </div>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded border">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: brandColor }}></span>
                  <span className="font-medium">N-2 (VPs)</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-slate-300">{spanAnalysis.byLevel.n2.span.toFixed(1)}:1</span>
                  <Badge className="bg-orange-100 text-orange-700">Baixo</Badge>
                </div>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded border">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: brandColor + '88' }}></span>
                  <span className="font-medium">N-3 (Heads)</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-slate-300 font-bold text-red-400">{spanAnalysis.byLevel.n3.span.toFixed(1)}:1</span>
                  <Badge className="bg-red-500/20 text-red-300">Muito Alto</Badge>
                </div>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded border">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: brandColor + '66' }}></span>
                  <span className="font-medium">N-4 (Gerentes)</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-slate-300">Base</span>
                  <Badge className="bg-slate-700/50 text-slate-300">-</Badge>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-300 italic">
              ⚠️ <strong>Alerta:</strong> Nível N-3 (Heads) apresenta span de {spanAnalysis.byLevel.n3.span.toFixed(1)}:1, 
              significativamente acima do ideal. Isso indica possível sobrecarga de gestores de primeira linha.
            </p>
          </div>

          {/* 3. Análise por Departamento */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              3. Análise por Departamento
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-red-950/30 p-3 rounded border border-red-100">
                <p className="text-slate-300 text-xs font-medium">Maior Span</p>
                <p className="font-bold text-lg mt-1">{spanAnalysis.byDept.highest.dept}</p>
                <p className="text-2xl font-bold text-red-400">{spanAnalysis.byDept.highest.span}:1</p>
                <p className="text-xs text-slate-400">acima do ideal</p>
              </div>
              <div className="bg-green-950/30 p-3 rounded border border-green-100">
                <p className="text-slate-300 text-xs font-medium">Menor Span</p>
                <p className="font-bold text-lg mt-1">{spanAnalysis.byDept.lowest.dept}</p>
                <p className="text-2xl font-bold text-green-400">{spanAnalysis.byDept.lowest.span}:1</p>
                <p className="text-xs text-slate-400">abaixo do ideal</p>
              </div>
            </div>
            <div className="mt-3 p-3 bg-slate-800/50 rounded border">
              <p className="text-xs font-medium text-slate-300 mb-2">Departamentos em Risco (Span &gt; 7:1):</p>
              <div className="space-y-1 text-xs">
                {spanAnalysis.byDept.risk.map((dept, idx) => (
                  <div key={dept.dept} className="flex justify-between p-1 bg-red-950/30 rounded">
                    <span>{idx + 1}. {dept.dept} ({dept.level})</span>
                    <span className="font-bold text-red-400">{dept.span}:1</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-300 italic">
              ⚠️ <strong>Alerta:</strong> Technology ({spanAnalysis.byDept.highest.span}:1) e Operations (7.8:1) 
              apresentam spans elevados, indicando possível necessidade de promoções ou contratações de líderes.
            </p>
          </div>

          {/* 4. Benchmark e Metas */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <Target className="h-4 w-4" />
              4. Benchmark e Metas
            </h3>
            <div className="space-y-3 text-sm">
              <div className="bg-slate-800/50 p-3 rounded border">
                <p className="text-xs font-medium text-slate-300 mb-2">Faixa Ideal de Span:</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-orange-500 via-green-500 to-red-500 rounded-full" 
                      style={{ width: '100%' }}></div>
                  </div>
                  <span className="font-bold text-blue-400">{spanAnalysis.current.span}</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-orange-500">Muito Baixo (&lt;4)</span>
                  <span className="text-green-400">Ideal (6)</span>
                  <span className="text-red-500">Muito Alto (&gt;8)</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-green-950/30 p-2 rounded text-center">
                  <p className="text-slate-400">Mínimo</p>
                  <p className="font-bold text-green-400">{spanAnalysis.benchmarks.min}:1</p>
                </div>
                <div className="bg-blue-950/30 p-2 rounded text-center border border-blue-500/20">
                  <p className="text-slate-400">Ideal</p>
                  <p className="font-bold text-blue-400">{spanAnalysis.benchmarks.ideal}:1</p>
                </div>
                <div className="bg-red-950/30 p-2 rounded text-center">
                  <p className="text-slate-400">Máximo</p>
                  <p className="font-bold text-red-400">{spanAnalysis.benchmarks.max}:1</p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-300 italic">
              💡 <strong>Insight:</strong> Span de {spanAnalysis.current.span}:1 está na faixa de alerta (acima de 6). 
              Recomenda-se ajuste para 6:1 através de aumento de líderes ou redistribuição de equipes.
            </p>
          </div>

          {/* 5. Tendências Temporais */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              5. Tendências Temporais
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-slate-800/50 p-3 rounded border">
                <p className="text-slate-300 text-xs">Evolução do Span</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-bold text-lg">6.5</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-bold text-lg text-red-400">{spanAnalysis.current.span}</span>
                  <Badge className={`${spanAnalysis.trends.direction === 'increasing' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                    {spanAnalysis.trends.direction === 'increasing' ? '↑' : '↓'} {spanAnalysis.trends.change}
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 mt-1">Últimos 6 meses</p>
              </div>
              <div className="bg-slate-800/50 p-3 rounded border">
                <p className="text-slate-300 text-xs">Projeção</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-bold text-lg">{spanAnalysis.current.span}</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-bold text-lg text-orange-400">7.2</span>
                  <Badge className="bg-orange-100 text-orange-400">↑ +0.4</Badge>
                </div>
                <p className="text-xs text-slate-400 mt-1">Próximos 6 meses (se mantido crescimento)</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-300 italic">
              ⚠️ <strong>Alerta:</strong> Tendência de aumento do span ({spanAnalysis.trends.direction === 'increasing' ? '+' : '-'}{spanAnalysis.trends.change} 
              nos últimos meses). Se mantida, chegará a 7.2:1 em 6 meses, acima do limite recomendado.
            </p>
          </div>

          {/* 6. Impacto e Riscos */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h3 className="font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              6. Impacto e Riscos do Span Elevado
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2 p-2 bg-slate-800/50 rounded border">
                <span className="text-red-500 mt-0.5">⚠️</span>
                <div>
                  <p className="font-medium">Sobrecarga de Gestores</p>
                  <p className="text-xs text-slate-300">Span de {spanAnalysis.byLevel.n3.span.toFixed(1)}:1 em N-3 indica que Heads gerenciam em média {Math.round(spanAnalysis.byLevel.n3.span)} pessoas, 
                  acima do ideal de 6. Risco de burnout e qualidade de gestão.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 bg-slate-800/50 rounded border">
                <span className="text-yellow-500 mt-0.5">⚠️</span>
                <div>
                  <p className="font-medium">Desenvolvimento de Talentos</p>
                  <p className="text-xs text-slate-300">Spans elevados dificultam o acompanhamento individual e o desenvolvimento 
                  de carreira, impactando retenção de talentos.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 bg-slate-800/50 rounded border">
                <span className="text-orange-500 mt-0.5">⚠️</span>
                <div>
                  <p className="font-medium">Tomada de Decisão</p>
                  <p className="text-xs text-slate-300">Gestores com muitos reports podem se tornar gargalos na tomada de decisão 
                  e na comunicação estratégica.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 bg-slate-800/50 rounded border">
                <span className="text-blue-500 mt-0.5">💡</span>
                <div>
                  <p className="font-medium">Oportunidade de Promoções</p>
                  <p className="text-xs text-slate-300">Span baixo em N-1 ({spanAnalysis.byLevel.n1.span.toFixed(1)}:1) e N-2 ({spanAnalysis.byLevel.n2.span.toFixed(1)}:1) 
                  sugere oportunidade de promoções internas para balancear a estrutura.</p>
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
                <span><strong>Promover em N-3:</strong> Span de {spanAnalysis.byLevel.n3.span.toFixed(1)}:1 em Heads indica necessidade de 
                promoções para Gerentes/Coordenadores para reduzir span para 6:1.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">2.</span>
                <span><strong>Revisar Technology:</strong> Span de {spanAnalysis.byDept.highest.span}:1 é o mais alto da empresa. 
                Considerar estruturação de chapters ou tribes para distribuir gestão.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">3.</span>
                <span><strong>Redistribuir em Operations:</strong> Span de 7.8:1 pode ser otimizado com 
                criação de novas posições de liderança regional ou por vertical.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">4.</span>
                <span><strong>Manter Legal:</strong> Span de {spanAnalysis.byDept.lowest.span}:1 em Legal é adequado para área especializada. 
                Não requer ação imediata.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">5.</span>
                <span><strong>Monitorar Tendência:</strong> Span em crescimento ({spanAnalysis.trends.change} nos últimos meses). 
                Implementar ações antes de atingir 8:1 (limite crítico).</span>
              </li>
            </ul>
          </div>

        </CardContent>
      </Card>

      {/* Alertas */}
      <div className="bg-amber-950/30 border border-amber-500/20 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5" />
          <div>
            <h4 className="font-semibold text-amber-200">Alertas de Span de Controle</h4>
            <ul className="mt-2 space-y-1 text-sm text-amber-200">
              <li>• Nível N-3 apresenta span médio de {spanAnalysis.byLevel.n3.span.toFixed(1)}:1 - acima do ideal de 6:1</li>
              <li>• Área de {spanAnalysis.byDept.highest.dept} com span de {spanAnalysis.byDept.highest.span}:1 - revisão de estrutura recomendada</li>
              <li>• {spanAnalysis.byDept.risk.length} departamentos com span &gt; 7:1 - risco de sobrecarga de gestores</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
