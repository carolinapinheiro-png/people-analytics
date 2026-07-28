import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { getSpanSnapshot, type SpanRow } from '@/lib/span.functions';
import KpiCard from '@/components/dashboard/KpiCard';
import ChartCard from '@/components/dashboard/ChartCard';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Network, Users, UserCog, GitBranch } from 'lucide-react';
import { COLORS } from '@/lib/colors';

/**
 * Span de controle calculado da cadeia real de reporte (Talent Mobility),
 * nao mais fabricado. So agregados; sem nomes individuais.
 */

const fmt1 = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

// cor por span: muito alto (>8) alerta, muito baixo (<3) atencao, saudavel verde
const spanColor = (s: number | null) =>
  s == null ? COLORS.info : s > 8 ? COLORS.warning : s < 3 ? COLORS.info : COLORS.success;

export default function SpanTab() {
  const [rows, setRows] = useState<SpanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchSpan = useServerFn(getSpanSnapshot);

  useEffect(() => {
    let cancelled = false;
    fetchSpan()
      .then((d) => { if (!cancelled) setRows(d as SpanRow[]); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar'); });
    return () => { cancelled = true; };
  }, [fetchSpan]);

  if (error) return <p className="text-sm text-muted-foreground text-center py-24">Não foi possível carregar o Span: {error}</p>;
  if (!rows) return <div className="flex items-center justify-center py-24"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const overall = rows.find((r) => r.scope_type === 'overall');
  const depts = rows.filter((r) => r.scope_type === 'department');
  const dist = rows.filter((r) => r.scope_type === 'distribution');
  const distMax = Math.max(...dist.map((d) => d.managers ?? 0), 1);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Network className="h-5 w-5 text-[hsl(var(--flutter))]" />
          Span de Controle
        </h2>
        <p className="text-sm text-muted-foreground">
          Calculado da cadeia real de reporte do Talent Mobility (jul/2026). Só agregados — sem nomes.
        </p>
      </div>

      {overall && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Ativos" value={fmt1(overall.actives)} color={COLORS.flutter} icon={Users} />
          <KpiCard label="Gestores" value={fmt1(overall.managers)} color={COLORS.nsx} icon={UserCog} />
          <KpiCard label="Span médio" value={fmt1(overall.avg_span)} color={COLORS.success} icon={GitBranch} />
          <KpiCard label="Contribuidores individuais" value={fmt1(overall.ics)} color={COLORS.info} icon={Users} />
        </div>
      )}

      <ChartCard title="Span médio por departamento" subtitle="reports por gestor · cor = faixa" icon={Network}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={depts} layout="vertical" margin={{ left: 40, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="opacity-30" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="scope" width={130} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number, _n, p) => [`${v} reports/gestor (${(p.payload as SpanRow).managers} gestores, ${(p.payload as SpanRow).reports} reports)`, 'Span médio']} />
            <Bar dataKey="avg_span" radius={[0, 4, 4, 0]}>
              {depts.map((d) => <Cell key={d.scope} fill={spanColor(d.avg_span)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Distribuição do tamanho de time" subtitle="quantos gestores por faixa" icon={UserCog}>
          <div className="space-y-2 pt-1">
            {dist.map((d) => (
              <div key={d.scope} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{d.scope}</span>
                  <span className="font-semibold tabular-nums">{d.managers} gestores</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${((d.managers ?? 0) / distMax) * 100}%`, background: COLORS.flutter }} />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Detalhe por departamento" icon={Network}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2">Departamento</th>
                  <th className="p-2 text-right">Gestores</th>
                  <th className="p-2 text-right">Reports</th>
                  <th className="p-2 text-right">Span médio</th>
                </tr>
              </thead>
              <tbody>
                {depts.map((d) => (
                  <tr key={d.scope} className="border-b border-border/50">
                    <td className="p-2 font-medium">{d.scope}</td>
                    <td className="p-2 text-right tabular-nums">{d.managers}</td>
                    <td className="p-2 text-right tabular-nums">{d.reports}</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{fmt1(d.avg_span)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      <p className="text-xs text-muted-foreground">
        Span médio geral de {fmt1(overall?.avg_span)} reports por gestor. Operation e Porto concentram
        os maiores times; Legal & Compliance e Commercial, os mais enxutos.
      </p>
    </div>
  );
}
