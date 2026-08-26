import { cn } from '@/lib/utils';
import { HelpCircle, LucideIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AJUDA_GRAFICOS, type ChaveGrafico } from '@/lib/ajuda-graficos';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  icon?: LucideIcon;
  /**
   * Verbete de `lib/ajuda-graficos.ts`. Com ele, o cartão ganha um "?" ao lado
   * do título.
   *
   * ------------------------------------------------------------------
   * A AJUDA ENTRA NO CHARTCARD, E NÃO EM CADA GRÁFICO
   * ------------------------------------------------------------------
   * A Anna pediu explicativos "em diversos gráficos, similar ao que já existe
   * no risco de saída, para auxiliar usuários com menor familiaridade
   * técnica". Pondo no contêiner, todo cartão que existir daqui em diante
   * herda o lugar do "?" -- e ninguém precisa lembrar de desenhá-lo de novo.
   *
   * O conteúdo mora no catálogo pelo motivo de sempre neste painel: onze
   * textos espalhados por onze arquivos envelhecem um a um, e envelhecer em
   * silêncio é como as afirmações falsas chegaram à tela.
   */
  ajuda?: ChaveGrafico;
}

export default function ChartCard({
  title, subtitle, children, className, icon: Icon, ajuda,
}: ChartCardProps) {
  const a = ajuda ? AJUDA_GRAFICOS[ajuda] : null;
  return (
    <div className={cn('bg-card border border-border rounded-lg p-4', className)}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-[hsl(var(--flutter))]" />}
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</span>
          {a && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`O que este gráfico responde: ${title}`}
                  className="shrink-0 rounded-full p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[320px] space-y-2 text-sm">
                <div className="font-semibold normal-case">{title}</div>
                <p className="text-muted-foreground leading-relaxed">{a.responde}</p>
                <p className="text-muted-foreground leading-relaxed border-t border-border/60 pt-2">
                  <strong className="text-foreground">Cuidado:</strong> {a.cuidado}
                </p>
              </PopoverContent>
            </Popover>
          )}
        </div>
        {subtitle && (
          <span className="text-[11px] text-muted-foreground text-right shrink-0">{subtitle}</span>
        )}
      </div>
      {children}
    </div>
  );
}
