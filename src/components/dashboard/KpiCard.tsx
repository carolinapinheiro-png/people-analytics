import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import MetricHelp from '@/components/dashboard/MetricHelp';
import type { ChaveMetrica, KpiTone } from '@/lib/metric-help';

/**
 * Cartão de KPI.
 *
 * `delta` e `tone` foram adicionados em 11/08/2026: um número sozinho ("eNPS
 * 61") não diz se é bom, se caiu, ou se está no patamar. Com a variação ao lado
 * e a cor do patamar, o cartão deixa de ser "número" e passa a ser "número com
 * veredito" -- a mesma filosofia do bloco de leitura da aba de engajamento.
 */

/**
 * O tipo mora em `lib/metric-help.ts`, junto das faixas que o produzem.
 * Reexportado aqui porque muitas abas ja o importavam deste arquivo.
 */
export type { KpiTone };

const TONE_TEXT: Record<KpiTone, string> = {
  good: 'text-emerald-600 dark:text-emerald-500',
  warn: 'text-amber-600 dark:text-amber-500',
  bad: 'text-red-600 dark:text-red-500',
  neutral: 'text-foreground',
};

const TONE_RING: Record<KpiTone, string> = {
  good: 'ring-1 ring-emerald-500/25',
  warn: 'ring-1 ring-amber-500/30',
  bad: 'ring-1 ring-red-500/30',
  neutral: '',
};

interface KpiCardProps {
  label: string;
  value: string | number;
  color: string;
  sub?: string;
  icon?: LucideIcon;
  /** Variação vs. período anterior, já formatada (ex.: <Delta v={-4} />). */
  delta?: ReactNode;
  /** Patamar do indicador — colore o valor e dá um anel sutil ao cartão. */
  tone?: KpiTone;
  /** Nota curta de patamar, ex.: "patamar saudável". */
  hint?: string;
  /**
   * Verbete de `lib/metric-help.ts`. Quando presente, o cartao ganha um "?"
   * discreto ao lado do rotulo com a definicao, a leitura e o que a cor
   * significa.
   *
   * Nem todo cartao leva um. "Ativos" nao precisa de explicacao, e um icone em
   * cada cartao vira ruido -- o "?" perde o sentido de "aqui tem sutileza"
   * quando esta em toda parte.
   */
  help?: ChaveMetrica;
  /** Valor numerico cru, so para o tooltip destacar a faixa atual. */
  helpValue?: number | null;
}

export default function KpiCard({
  label, value, color, sub, icon: Icon, delta, tone = 'neutral', hint, help, helpValue,
}: KpiCardProps) {
  return (
    <div className={cn(
      'bg-card border border-border rounded-lg p-3.5 relative overflow-hidden hover:shadow-md transition-shadow',
      TONE_RING[tone],
    )}>
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: color }} />
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-1 mb-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
            {help && <MetricHelp metrica={help} valor={helpValue} rotulo={label} />}
          </div>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <div className={cn(
              'font-extrabold tracking-tight',
              TONE_TEXT[tone],
              String(value).length > 10 ? 'text-sm' : 'text-xl',
            )}>
              {value}
            </div>
            {delta}
          </div>
          {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
          {sub && <div className="text-[11px] text-muted-foreground mt-0.5" dangerouslySetInnerHTML={{ __html: sub }} />}
        </div>
        {Icon && (
          <div
            className="p-1.5 rounded-md opacity-20"
            style={{ backgroundColor: color }}
          >
            <Icon className="w-4 h-4 text-white" />
          </div>
        )}
      </div>
    </div>
  );
}
