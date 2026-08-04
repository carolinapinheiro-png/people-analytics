import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Clock, AlertTriangle } from 'lucide-react';
import { getDataFreshness, type DatasetFreshness } from '@/lib/freshness.functions';

/**
 * Selo de idade do dado, para colar no topo de uma aba.
 *
 * Mostra "atualizado ha X" em vez de so a data, porque a conta mental de
 * "22/05 e recente?" e exatamente a que ninguem faz. Quando passa do intervalo
 * esperado, muda de cor e diz que esta atrasado -- a informacao util nao e a
 * data, e o julgamento sobre ela.
 */

let cache: Promise<DatasetFreshness[]> | null = null;

function ageLabel(days: number | null): string {
  if (days == null) return 'sem registro de carga';
  if (days === 0) return 'atualizado hoje';
  if (days === 1) return 'atualizado ontem';
  if (days < 30) return `atualizado há ${days} dias`;
  const meses = Math.round(days / 30);
  return `atualizado há ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
}

export default function FreshnessBadge({ dataset }: { dataset: string }) {
  const [info, setInfo] = useState<DatasetFreshness | null>(null);
  const fn = useServerFn(getDataFreshness);

  useEffect(() => {
    let alive = true;
    // Uma chamada por sessao serve todas as abas: a idade nao muda enquanto a
    // pessoa navega, e uma consulta por aba seria desperdicio.
    if (!cache) cache = fn() as Promise<DatasetFreshness[]>;
    cache
      .then((all) => alive && setInfo(all.find((d) => d.key === dataset) ?? null))
      .catch(() => {
        // Falha aqui nao pode derrubar a aba: o selo e contexto, nao conteudo.
        cache = null;
      });
    return () => {
      alive = false;
    };
  }, [fn, dataset]);

  if (!info) return null;

  return (
    <span
      className={
        'inline-flex items-center gap-1.5 text-[11px] rounded-md px-2 py-1 ' +
        (info.stale
          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-500'
          : 'bg-muted text-muted-foreground')
      }
      title={
        (info.updatedAt ? `Última carga: ${new Date(info.updatedAt).toLocaleString('pt-BR')}. ` : '') +
        `Fonte: ${info.source}.` +
        (info.note ? ` ${info.note}` : '')
      }
    >
      {info.stale ? <AlertTriangle className="h-3 w-3 shrink-0" /> : <Clock className="h-3 w-3 shrink-0" />}
      {ageLabel(info.ageDays)}
      {info.stale && info.ageDays != null && (
        <span className="opacity-80">· esperado a cada {info.expectedDays}d</span>
      )}
    </span>
  );
}
