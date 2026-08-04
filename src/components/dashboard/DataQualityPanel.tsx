import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Wrench, Clock, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getDataQuality, type QualityIssue } from '@/lib/data-quality.functions';
import { getDataFreshness, type DatasetFreshness } from '@/lib/freshness.functions';

/**
 * Dois blocos que respondem perguntas diferentes:
 *  - "posso confiar na idade disto?" (atualizacao das fontes)
 *  - "o que precisa ser consertado, por quem?" (qualidade de cadastro)
 *
 * O segundo e uma lista de trabalho, nao um relatorio: cada linha tem dono e
 * diz o que deixa de funcionar enquanto nao for corrigido. Sem isso, achado de
 * qualidade vira nota de rodape que ninguem aciona.
 */

const SEV: Record<QualityIssue['severity'], string> = {
  alta: 'bg-destructive/10 text-destructive',
  média: 'bg-amber-500/10 text-amber-600 dark:text-amber-500',
  baixa: 'bg-muted text-muted-foreground',
};

export default function DataQualityPanel() {
  const [issues, setIssues] = useState<QualityIssue[] | null>(null);
  const [fresh, setFresh] = useState<DatasetFreshness[] | null>(null);
  const qFn = useServerFn(getDataQuality);
  const fFn = useServerFn(getDataFreshness);

  useEffect(() => {
    let alive = true;
    qFn().then((d) => alive && setIssues(d as QualityIssue[])).catch(() => alive && setIssues([]));
    fFn().then((d) => alive && setFresh(d as DatasetFreshness[])).catch(() => alive && setFresh([]));
    return () => {
      alive = false;
    };
  }, [qFn, fFn]);

  return (
    <div className="space-y-4">
      {/* Atualizacao das fontes */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <Clock className="h-4 w-4" />
          Atualização das fontes
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Dashboard raramente morre errado — morre velho. Em âmbar, o que passou do intervalo
          esperado de renovação.
        </p>
        <div className="space-y-1">
          <div className="grid grid-cols-12 gap-2 text-[11px] text-muted-foreground pb-1 border-b border-border">
            <span className="col-span-5">Conjunto</span>
            <span className="col-span-3">Origem</span>
            <span className="col-span-2 text-right">Linhas</span>
            <span className="col-span-2 text-right">Idade</span>
          </div>
          {fresh == null && <p className="text-xs text-muted-foreground py-2">Carregando…</p>}
          {fresh?.map((f) => (
            <div key={f.key} className="grid grid-cols-12 gap-2 items-start py-1 text-xs">
              <span className="col-span-5">
                {f.label}
                {f.note && (
                  <span className="block text-[11px] text-muted-foreground leading-snug">{f.note}</span>
                )}
              </span>
              <span className="col-span-3 text-[11px] text-muted-foreground">{f.source}</span>
              <span className="col-span-2 text-right text-muted-foreground">
                {f.rows.toLocaleString('pt-BR')}
              </span>
              <span
                className={
                  'col-span-2 text-right font-medium ' +
                  (f.stale ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground')
                }
              >
                {f.ageDays == null ? '—' : `${f.ageDays}d`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Qualidade de cadastro */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <Wrench className="h-4 w-4" />
          Qualidade de cadastro — o que corrigir na origem
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Isto não se conserta no dashboard: conserta no sistema onde o dado nasce. Cada item diz o
          que deixa de funcionar enquanto existir.
        </p>

        {issues == null && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {issues?.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma lacuna detectada nas verificações atuais.</p>
        )}

        <div className="space-y-2.5">
          {issues?.map((i) => (
            <div key={i.key} className="border-l-2 border-border pl-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{i.title}</span>
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {i.count.toLocaleString('pt-BR')}
                </Badge>
                <span className={'text-[10px] rounded px-1.5 py-0.5 ' + SEV[i.severity]}>
                  {i.severity}
                </span>
                <span className="text-[10px] text-muted-foreground">→ {i.owner}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{i.where}</p>
              <p className="text-xs mt-0.5 flex items-start gap-1.5">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-600 dark:text-amber-500" />
                <span className="text-muted-foreground">{i.impact}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
