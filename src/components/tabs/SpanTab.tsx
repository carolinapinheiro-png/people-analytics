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
import { useDashboard } from '@/data/DashboardContext';
import AvisoPeriodo from '@/components/dashboard/AvisoPeriodo';
import { PERIODO_INDISPONIVEL } from '@/lib/periodo';

import { tx, numLocale } from '@/lib/i18n';
/**
 * Span de controle calculado AO VIVO da cadeia real de reporte
 * (org_pessoas), a cada carregamento da aba -- ver span.functions.ts.
 * So agregados; sem nomes individuais.
 */

const fmt1 = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString(numLocale(), { maximumFractionDigits: 1 });

// Referencia (nao meta), decisao Carolina (30/07): ate ~8 reports e considerado
// saudavel; times operacionais/repetitivos podem acumular mais de forma saudavel.
// A cor e so um sinalizador visual para olhar, nunca um alvo.
const spanColor = (s: number | null) =>
  s == null ? COLORS.info : s > 8 ? COLORS.warning : s < 3 ? COLORS.info : COLORS.success;

export default function SpanTab() {
  const { filters } = useDashboard();
  const [rows, setRows] = useState<SpanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchSpan = useServerFn(getSpanSnapshot);

  useEffect(() => {
    let cancelled = false;
    fetchSpan({ data: { department: filters.departamento } })
      .then((d) => { if (!cancelled) setRows(d as SpanRow[]); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar'); });
    return () => { cancelled = true; };
  }, [fetchSpan, filters.departamento]);

  if (error) return <p className="text-sm text-muted-foreground text-center py-24">{tx("Não foi possível carregar o Span:")}{" "}{tx(error)}</p>;
  if (!rows) return <div className="flex items-center justify-center py-24"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const overall = rows.find((r) => r.scope_type === 'overall');
  const depts = rows.filter((r) => r.scope_type === 'department');
  const dist = rows.filter((r) => r.scope_type === 'distribution');
  const distMax = Math.max(...dist.map((d) => d.managers ?? 0), 1);

  // Total de gestores e faixa onde cai a mediana (aproximada da distribuicao,
  // ja que a serie nao guarda reports por gestor individual).
  const totalMgr = dist.reduce((s, d) => s + (d.managers ?? 0), 0) || (overall?.managers ?? 0);
  let cum = 0;
  let medianBucket = '';
  for (const d of dist) {
    cum += d.managers ?? 0;
    if (cum >= totalMgr / 2) { medianBucket = d.scope; break; }
  }
  const pctMgr = (n: number | null) => (totalMgr > 0 ? ((n ?? 0) / totalMgr) * 100 : 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Network className="h-5 w-5 text-[hsl(var(--flutter))]" />
          {tx("Span de Controle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {tx("Calculado ao vivo, direto da cadeia de reporte do Convenia — atualiza sozinho a cada sincronização. Só agregados — sem nomes.")}
        </p>
      </div>

      <AvisoPeriodo motivo={PERIODO_INDISPONIVEL.span} />

      <div className="rounded-lg border border-border/50 bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
        <strong>{tx("Gestor ≠ Líder.")}</strong>{" "}{tx("Aqui \"gestor\" é quem tem pelo menos um reporte direto na cadeia (")}{tx(fmt1(overall?.managers))}{" "}{tx("pessoas, sobre")}{" "}{tx(fmt1(overall?.actives))}{" "}{tx("ativos). No DEI/Overview, \"líder\" é quem está marcado como liderança no cadastro (flag \"Liderança?\") — populações e critérios diferentes, por isso os números não batem (ex.: ~130 líderes marcados no consolidado ×")}{" "}{tx(fmt1(overall?.managers))}{" "}{tx("gestores com reportes).")}
      </div>

      {overall && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label={tx("Ativos")} value={fmt1(overall.actives)} color={COLORS.flutter} icon={Users} />
          <KpiCard label={tx("Gestores")} value={fmt1(overall.managers)} color={COLORS.nsx} icon={UserCog} />
          <KpiCard label={tx("Span médio")} value={fmt1(overall.avg_span)} color={COLORS.success} icon={GitBranch} help="spanMedio" />
          <KpiCard label={tx("Contribuidores individuais")} value={fmt1(overall.ics)} color={COLORS.info} icon={Users} />
        </div>
      )}

      <ChartCard title={tx("Span médio por departamento")} subtitle={tx("reports por gestor · cor = faixa")} icon={Network}>
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
        <ChartCard title={tx("Distribuição do tamanho de time")} subtitle={tx("gestores por faixa · mediana na faixa {0}", [medianBucket || '—'])} icon={UserCog}>
          <div className="space-y-2 pt-1">
            {dist.map((d) => (
              <div key={d.scope} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{tx(d.scope)}</span>
                  <span className="font-semibold tabular-nums">{d.managers} · {tx(pctMgr(d.managers).toFixed(0))}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${((d.managers ?? 0) / distMax) * 100}%`, background: COLORS.flutter }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {tx("% sobre")}{" "}{totalMgr}{" "}{tx("gestores.")}{" "}<strong>{tx("Até ~8 reports é uma referência de span saudável — não uma meta.")}</strong>{" "}{tx("Times com trabalho mais operacional e repetitivo podem acumular mais reports de forma saudável; a cor é só um sinalizador para olhar, não um alvo.")}
          </p>
        </ChartCard>

        <ChartCard title={tx("Detalhe por departamento")} icon={Network}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2">{tx("Departamento")}</th>
                  <th className="p-2 text-right">{tx("Gestores")}</th>
                  <th className="p-2 text-right">{tx("Reports")}</th>
                  <th className="p-2 text-right">{tx("Span médio")}</th>
                </tr>
              </thead>
              <tbody>
                {depts.map((d) => (
                  <tr key={d.scope} className="border-b border-border/50">
                    <td className="p-2 font-medium">{tx(d.scope)}</td>
                    <td className="p-2 text-right tabular-nums">{d.managers}</td>
                    <td className="p-2 text-right tabular-nums">{d.reports}</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{tx(fmt1(d.avg_span))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      <p className="text-xs text-muted-foreground">
        {tx("Span médio geral de")}{" "}{tx(fmt1(overall?.avg_span))}{" "}{tx("reports por gestor.")}
        {depts.length > 1 && depts[0].scope !== depts[depts.length - 1].scope && (
          <>
            {' '}{tx(depts[0].scope)}{" "}{tx("concentra os maiores times;")}{" "}{tx(depts[depts.length - 1].scope)}{tx(", os mais enxutos.")}
          </>
        )}
      </p>
    </div>
  );
}
