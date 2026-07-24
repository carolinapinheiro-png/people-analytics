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
import { useState, useMemo } from 'react';

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
  const { leavers, filters, brand, currentMonth } = useDashboard();
  const brandColor = BRAND_COLORS[brand] || COLORS.flutter;
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLeavers = useMemo(() => {
    return leavers.filter(r => {
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
  }, [leavers, filters, searchTerm]);

  const totalLeavers = filteredLeavers.length;
  const avgSal = avgSalary(filteredLeavers);
  const avgTenure = avgTenureMonths(filteredLeavers);
  const involuntary = filteredLeavers.filter(r => r.tipo_desligamento_agrupado === 'Involuntário').length;
  const voluntary = filteredLeavers.filter(r => r.tipo_desligamento_agrupado === 'Voluntário').length;

  const salaryBandData = countBy(filteredLeavers, 'faixa_salarial', SALARY_BAND_ORDER);
  const tenureData = countBy(filteredLeavers, 'tempo_casa_faixa', TENURE_ORDER);
  const levelData = countBy(filteredLeavers, 'level', LEVEL_ORDER);
  const deptData = countBy(filteredLeavers, 'departamento');
  const typeData = countBy(filteredLeavers, 'tipo_desligamento_agrupado');
  const jobFamilyData = countBy(filteredLeavers, 'job_family');

  const monthlyData = useMemo(() => {
    const counts = new Map<string, number>();
    filteredLeavers.forEach(r => {
      counts.set(r.mes_desligamento, (counts.get(r.mes_desligamento) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([month, value]) => ({ month, value }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredLeavers]);

  const kpis = [
    { label: 'Total Desligados', value: fmt(totalLeavers), color: COLORS.danger, icon: UserX },
    { label: 'Salário Médio', value: fmtC(Math.round(avgSal)), color: COLORS.flutter, icon: DollarSign },
    { label: 'Tempo Médio de Casa', value: `${avgTenure.toFixed(1)}m`, color: COLORS.nsx, icon: Clock },
    { label: 'Involuntários', value: fmt(involuntary), color: COLORS.orange, icon: AlertTriangle, sub: voluntary > 0 ? `${voluntary} voluntários` : undefined },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <LogOut className="h-5 w-5" style={{ color: brandColor }} />
            Análise de Desligamentos
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Dados reais de {totalLeavers} desligamentos · Mês atual: {mLabel(currentMonth)}
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, idx) => (
          <KpiCard key={idx} {...kpi} />
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Desligamentos por Faixa Salarial" subtitle="Distribuição real dos salários">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={salaryBandData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                formatter={(value: number) => [`${value} desligados`, 'Total']}
              />
              <Bar dataKey="value" name="Desligados" fill={brandColor} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Desligamentos por Tempo de Casa" subtitle="Permanência média na empresa">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={tenureData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                formatter={(value: number) => [`${value} desligados`, 'Total']}
              />
              <Bar dataKey="value" name="Desligados" fill={COLORS.nsx} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Por Tipo de Desligamento" subtitle="Voluntário, involuntário, acordo etc.">
          <ResponsiveContainer width="100%" height={240}>
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
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, name: string) => [`${value} desligados`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Por Departamento" subtitle="Top departamentos com desligamentos">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={deptData.slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} width={90} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                formatter={(value: number) => [`${value} desligados`, 'Total']}
              />
              <Bar dataKey="value" name="Desligados" fill={COLORS.purple} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Por Level" subtitle="Distribuição hierárquica">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={levelData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                formatter={(value: number) => [`${value} desligados`, 'Total']}
              />
              <Bar dataKey="value" name="Desligados" fill={COLORS.betfair} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Trend and Job Family */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Evolução Mensal de Desligamentos" subtitle="Série temporal de saídas">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis
                dataKey="month"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                tickFormatter={(v) => mLabel(v)}
              />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                formatter={(value: number) => [`${value} desligados`, 'Total']}
                labelFormatter={(label) => mLabel(String(label))}
              />
              <Bar dataKey="value" name="Desligados" fill={COLORS.danger} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Por Job Family" subtitle="Família de cargos">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={jobFamilyData.filter(d => d.name !== 'Não informado').slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(218 40% 21%)" />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 9 }} width={110} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                formatter={(value: number) => [`${value} desligados`, 'Total']}
              />
              <Bar dataKey="value" name="Desligados" fill={COLORS.success} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Detailed Table */}
      <Card className="border-l-4 bg-slate-900/50" style={{ borderLeftColor: brandColor }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-slate-100">
            <BarChart3 className="h-5 w-5" style={{ color: brandColor }} />
            Lista de Desligados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto max-h-[500px]">
            <table className="w-full text-[11px]">
              <thead className="text-muted-foreground uppercase sticky top-0 bg-slate-900/95 backdrop-blur-sm">
                <tr className="border-b border-slate-700/50">
                  <th className="text-left p-2">Nome</th>
                  <th className="text-left p-2">Cargo</th>
                  <th className="text-left p-2">Depto</th>
                  <th className="text-left p-2">Level</th>
                  <th className="text-right p-2">Salário</th>
                  <th className="text-left p-2">Vínculo</th>
                  <th className="text-left p-2">Tempo de Casa</th>
                  <th className="text-left p-2">Data Deslig.</th>
                  <th className="text-left p-2">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeavers.map((leaver) => (
                  <tr key={leaver.id} className="border-b border-slate-700/30 hover:bg-slate-800/50">
                    <td className="p-2 font-medium text-slate-100 whitespace-nowrap">{leaver.nome}</td>
                    <td className="p-2 text-slate-300">{leaver.cargo}</td>
                    <td className="p-2 text-slate-300">{leaver.departamento}</td>
                    <td className="p-2 text-slate-300">{leaver.level}</td>
                    <td className="p-2 text-right text-slate-300">{leaver.salario > 0 ? fmtC(leaver.salario) : '—'}</td>
                    <td className="p-2 text-slate-300">{leaver.vinculo}</td>
                    <td className="p-2 text-slate-300">{leaver.tempo_casa_faixa}</td>
                    <td className="p-2 text-slate-300 whitespace-nowrap">{leaver.data_desligamento_str}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        leaver.tipo_desligamento_agrupado === 'Involuntário'
                          ? 'bg-red-500/20 text-red-400'
                          : leaver.tipo_desligamento_agrupado === 'Voluntário'
                          ? 'bg-blue-500/20 text-blue-400'
                          : leaver.tipo_desligamento_agrupado === 'Acordo'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-slate-500/20 text-slate-400'
                      }`}>
                        {leaver.tipo_desligamento_agrupado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredLeavers.length === 0 && (
              <p className="text-center text-slate-400 py-8">Nenhum desligado encontrado com os filtros selecionados.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
