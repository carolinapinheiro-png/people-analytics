import { useEffect, useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { GitCompareArrows, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listMetricsBySource, type MetricSeriesRow } from '@/lib/metrics.functions';

/**
 * Comparacao lado a lado: serie congelada (raw-data.ts) x reconstruida
 * (agregador sobre Talent_Mobility). E aqui que a decisao de qual serie vira
 * oficial ganha evidencia -- inclusive os +-1 dos cortes de dia exato
 * (decisao 3 da revisao fria: manter e medir).
 *
 * Limitacao estrutural declarada: na reconstruida, genero, lideranca e estado
 * sao valores ATUAIS aplicados retroativamente (a base nao tem historico).
 */

const METRICS = [
  { key: 'headcount', label: 'Headcount' },
  { key: 'joiners', label: 'Joiners' },
  { key: 'leavers', label: 'Leavers' },
  { key: 'attrition_rate', label: 'Attrition %' },
  { key: 'gender_female_pct', label: 'Mulheres %' },
  { key: 'leaders', label: 'Lideres' },
  { key: 'leader_female_pct', label: 'Mulheres na lideranca %' },
  { key: 'leaders_pct', label: 'Lideranca %' },
  { key: 'avg_salary_leaders', label: 'Salario medio lideres' },
  { key: 'avg_salary_non_leaders', label: 'Salario medio nao-lideres' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

const FROZEN = 'raw-data.ts';
const REBUILT = 'reconstruido';

export default function SeriesComparisonCard() {
  const [rows, setRows] = useState<MetricSeriesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState('NSX');
  const [metric, setMetric] = useState<MetricKey>('headcount');

  const listFn = useServerFn(listMetricsBySource);

  useEffect(() => {
    (async () => {
      try {
        const data = (await listFn({
          data: { sources: [FROZEN, REBUILT] },
        })) as MetricSeriesRow[];
        setRows(data);
      } catch (err) {
        toast.error('Erro ao carregar as series');
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const brands = useMemo(() => [...new Set(rows.map((r) => r.brand))].sort(), [rows]);

  const table = useMemo(() => {
    const of = (source: string) =>
      new Map(
        rows.filter((r) => r.brand === brand && r.source === source).map((r) => [r.month, r]),
      );
    const frozen = of(FROZEN);
    const rebuilt = of(REBUILT);
    const months = [...new Set([...frozen.keys(), ...rebuilt.keys()])].sort();
    return months.map((month) => {
      const f = frozen.get(month);
      const r = rebuilt.get(month);
      const fv = (f?.[metric] ?? null) as number | null;
      const rv = (r?.[metric] ?? null) as number | null;
      return {
        month,
        frozen: fv,
        rebuilt: rv,
        delta: fv != null && rv != null ? Math.round((rv - fv) * 100) / 100 : null,
        qualityFlag: f?.quality_flag ?? null,
      };
    });
  }, [rows, brand, metric]);

  const hasRebuilt = rows.some((r) => r.source === REBUILT);
  const fmt = (v: number | null) =>
    v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <GitCompareArrows className="h-5 w-5" />
          Comparacao de series
        </CardTitle>
        <CardDescription>
          Congelada (raw-data.ts) x reconstruida, mes a mes. A decisao de qual serie vira oficial
          sai daqui. Na reconstruida, genero, lideranca e estado sao valores atuais aplicados
          retroativamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricKey)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
        ) : !hasRebuilt ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            A serie reconstruida ainda nao foi importada. Use o card de importacao acima.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left">
                  <th className="p-2 font-medium">Mes</th>
                  <th className="p-2 font-medium text-right">Congelada</th>
                  <th className="p-2 font-medium text-right">Reconstruida</th>
                  <th className="p-2 font-medium text-right">Δ</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r) => (
                  <tr key={r.month} className="border-b border-border/50">
                    <td className="p-2 whitespace-nowrap">
                      {r.month.slice(0, 7)}
                      {r.qualityFlag && (
                        <span title={r.qualityFlag}>
                          <AlertTriangle className="h-3 w-3 inline ml-1 text-amber-500" />
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-right tabular-nums">{fmt(r.frozen)}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(r.rebuilt)}</td>
                    <td
                      className={`p-2 text-right tabular-nums ${
                        r.delta == null || r.delta === 0
                          ? 'text-muted-foreground'
                          : 'text-amber-600 font-medium'
                      }`}
                    >
                      {r.delta == null ? '—' : r.delta > 0 ? `+${fmt(r.delta)}` : fmt(r.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
