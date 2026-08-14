import { TrendingDown, TrendingUp } from 'lucide-react';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';

/**
 * A variação vs. o período anterior.
 *
 * ===========================================================================
 * A SUTILEZA QUE NINGUÉM ADIVINHA
 * ===========================================================================
 * A SETA aponta o movimento real: subiu, subiu. A COR diz se o movimento é
 * bom. Nos indicadores em que subir é ruim -- risco de saída, atrição --
 * as duas coisas se separam: um `+5` aparece com seta para cima e cor de
 * alerta.
 *
 * Isso é deliberado. Se a seta seguisse a cor, um risco que subiu apareceria
 * com seta para baixo, e a pessoa leria "o risco caiu". Mas ninguém deduz a
 * regra olhando -- por isso ela está escrita aqui, ao alcance de um clique
 * em cima do próprio número.
 *
 * Estava duplicado dentro do EngagementTab. Virou componente porque a mesma
 * explicação vale em toda aba que mostra variação.
 */
export default function Delta({
  v, invertido = false, periodo = 'o período anterior',
}: {
  v: number | null | undefined;
  /** true quando subir é ruim (risco, atrição). */
  invertido?: boolean;
  /** Contra o que se compara. "a onda anterior", "o mês anterior". */
  periodo?: string;
}) {
  if (v == null) return <span className="text-[11px] text-muted-foreground">—</span>;

  const Icon = v > 0 ? TrendingUp : TrendingDown;
  const bom = invertido ? v < 0 : v > 0;
  const cor = v === 0
    ? 'text-muted-foreground'
    : bom ? 'text-emerald-600 dark:text-emerald-500' : 'text-amber-600 dark:text-amber-500';
  const fmt = Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Variação de ${fmt} contra ${periodo}. O que isto significa?`}
          className={`inline-flex items-center gap-0.5 rounded px-0.5 text-[11px] hover:bg-secondary transition-colors ${cor}`}
        >
          {v !== 0 && <Icon className="h-3 w-3" />}
          {v > 0 ? '+' : ''}{fmt}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] space-y-2 text-sm">
        <div className="font-semibold">Δ — variação</div>
        <p className="text-muted-foreground leading-relaxed">
          Quanto o indicador mudou contra {periodo}. Aqui, {v > 0 ? 'subiu' : v < 0 ? 'caiu' : 'ficou igual'}
          {v !== 0 ? ` ${Math.abs(Number(v)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}` : ''}.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          A <strong>seta</strong> aponta o movimento real. A <strong>cor</strong> diz se o
          movimento é bom: verde melhorou, âmbar piorou.
        </p>
        {invertido && (
          <p className="rounded-md bg-secondary/60 p-2 text-[12px] leading-relaxed">
            Neste indicador <strong>subir é ruim</strong> — por isso uma seta para cima
            pode aparecer em âmbar.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
