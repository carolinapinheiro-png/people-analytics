import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { listCompRatio, type CompRatioRow } from '@/lib/comp.functions';
import KpiCard from '@/components/dashboard/KpiCard';
import ChartCard from '@/components/dashboard/ChartCard';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp, TrendingDown, Scale, ShieldAlert } from 'lucide-react';
import { COLORS } from '@/lib/colors';

/**
 * CompRatio individual (587 ativos). Dado sensivel: vem da server function
 * listCompRatio, que registra cada consulta. Nenhuma linha no bundle.
 */

const fmt1 = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const fmtBRL = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const QUARTILE_ORDER = ['Below Range', 'Q1', 'Q2', 'Q3', 'Q4', 'Above range'];
const quartileColor = (q: string) =>
  q === 'Below Range' ? COLORS.danger : q === 'Above range' ? COLORS.warning : COLORS.success;

export default function CompRatioTab() {
  const [rows, setRows] = useState<CompRatioRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const fetchData = useServerFn(listCompRatio);

  useEffect(() => {
    let cancelled = false;
    fetchData({ data: { context: 'aba compratio' } })
      .then((d) => { if (!cancelled) setRows(d as CompRatioRow[]); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar'); });
    return () => { cancelled = true; };
  }, [fetchData]);

  const stats = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const crs = rows.map((r) => r.comp_ratio ?? 0).filter((c) => c > 0);
    const sorted = [...crs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const above = rows.filter((r) => r.quartile === 'Above range').length;
    const below = rows.filter((r) => r.quartile === 'Below Range').length;
    const byQuartile = QUARTILE_ORDER.map((q) => ({ q, n: rows.filter((r) => r.quartile === q).length }));
    const byArea: Record<string, { sum: number; n: number }> = {};
    for (const r of rows) {
      const a = r.area ?? '—';
      (byArea[a] = byArea[a] ?? { sum: 0, n: 0 });
      byArea[a].sum += r.comp_ratio ?? 0;
      byArea[a].n++;
    }
    const areas = Object.entries(byArea)
      .map(([area, v]) => ({ area, avg: v.sum / v.n, n: v.n }))
      .sort((a, b) => b.avg - a.avg);
    return { total: rows.length, median, above, below, byQuartile, areas };
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter((r) =>
          [r.name, r.area, r.level, r.job_title].some((f) => (f ?? '').toLowerCase().includes(q)),
        )
      : rows;
    return base.slice(0, 100);
  }, [rows, query]);

  if (error) return <p className="text-sm text-muted-foreground text-center py-24">Não foi possível carregar o CompRatio: {error}</p>;
  if (!rows || !stats) return <div className="flex items-center justify-center py-24"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const qMax = Math.max(...stats.byQuartile.map((b) => b.n), 1);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Scale className="h-5 w-5 text-[hsl(var(--flutter))]" />
          Comp Ratio
        </h2>
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5" />
          Salário individual — cada consulta é registrada. {stats.total} ativos com banda salarial.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Ativos com banda" value={stats.total} color={COLORS.flutter} icon={DollarSign} />
        <KpiCard label="Comp ratio mediano" value={`${fmt1(stats.median)}%`} color={COLORS.nsx} icon={Scale} />
        <KpiCard label="Acima da faixa" value={`${stats.above} (${fmt1((stats.above / stats.total) * 100)}%)`} color={COLORS.warning} icon={TrendingUp} />
        <KpiCard label="Abaixo da faixa" value={`${stats.below} (${fmt1((stats.below / stats.total) * 100)}%)`} color={COLORS.danger} icon={TrendingDown} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard title="Distribuição por quartil da banda" icon={Scale}>
          <div className="space-y-2 pt-1">
            {stats.byQuartile.map((b) => (
              <div key={b.q} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{b.q}</span>
                  <span className="font-semibold tabular-nums">{b.n}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(b.n / qMax) * 100}%`, background: quartileColor(b.q) }} />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Comp ratio médio por área" icon={TrendingUp}>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2">Área</th>
                  <th className="p-2 text-right">Pessoas</th>
                  <th className="p-2 text-right">Comp ratio médio</th>
                </tr>
              </thead>
              <tbody>
                {stats.areas.map((a) => (
                  <tr key={a.area} className="border-b border-border/50">
                    <td className="p-2 font-medium">{a.area}</td>
                    <td className="p-2 text-right tabular-nums">{a.n}</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{fmt1(a.avg)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      <ChartCard title="Indivíduos" subtitle={`${rows.length} ativos · mostrando ${filtered.length}`} icon={DollarSign}>
        <Input
          placeholder="Buscar por nome, área, nível ou cargo..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-3 max-w-sm"
        />
        <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-2">Nome</th>
                <th className="p-2">Nível</th>
                <th className="p-2">Área</th>
                <th className="p-2">Cargo</th>
                <th className="p-2 text-right">Salário</th>
                <th className="p-2 text-right">Comp ratio</th>
                <th className="p-2">Quartil</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="p-2 font-medium whitespace-nowrap">{r.name}</td>
                  <td className="p-2">{r.level}</td>
                  <td className="p-2 text-xs">{r.area}</td>
                  <td className="p-2 text-xs text-muted-foreground max-w-[220px] truncate">{r.job_title}</td>
                  <td className="p-2 text-right tabular-nums whitespace-nowrap">{fmtBRL(r.salary)}</td>
                  <td className="p-2 text-right tabular-nums font-semibold">{fmt1(r.comp_ratio)}%</td>
                  <td className="p-2">
                    <Badge variant="outline" className="text-[10px]" style={{ borderColor: quartileColor(r.quartile ?? ''), color: quartileColor(r.quartile ?? '') }}>
                      {r.quartile}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
