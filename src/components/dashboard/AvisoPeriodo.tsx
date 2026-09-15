import { CalendarOff } from 'lucide-react';

/**
 * A frase que diz, em tela, que o filtro de mês/trimestre/ano NÃO recorta
 * aquele dado -- porque a base não guarda histórico dele (ver
 * `src/lib/periodo.ts`).
 *
 * Existe por um motivo específico: um seletor de mês ativo no topo faz o leitor
 * assumir que TODO número da tela é daquele mês. Quando um quadro é foto do
 * presente, essa suposição está errada e nada na tela a corrigia. O silêncio
 * aqui é mais caro que a linha de texto.
 */
export default function AvisoPeriodo({ motivo, className = '' }: { motivo: string; className?: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border border-border/50 bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground ${className}`}
    >
      <CalendarOff className="h-4 w-4 shrink-0 mt-0.5" />
      <span>
        <strong>Foto do presente.</strong> {motivo}
      </span>
    </div>
  );
}
