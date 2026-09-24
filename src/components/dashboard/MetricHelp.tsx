import { HelpCircle } from 'lucide-react';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  AJUDA, descreverFaixa, faixaDe, type AjudaMetrica, type ChaveMetrica, type KpiTone,
} from '@/lib/metric-help';

import { tx } from '@/lib/i18n';
/**
 * A ajuda de uma métrica: o que é, como ler, em que faixa está agora.
 *
 * ===========================================================================
 * POR QUE CLIQUE, E NÃO HOVER
 * ===========================================================================
 * "Tooltip" normalmente quer dizer hover, e hover não existe em touch. Num
 * painel que as pessoas abrem no celular durante a reunião -- que é
 * exatamente quando alguém pergunta "o que é comp-ratio?" -- uma explicação
 * só acessível com mouse é uma explicação que não está lá.
 *
 * Um Popover abre por clique, por toque e por teclado, com o mesmo código.
 * Custa um clique a mais no desktop e funciona para todo mundo.
 *
 * ===========================================================================
 * A FAIXA ATUAL VEM MARCADA
 * ===========================================================================
 * Listar as faixas responde "o que a cor significa" em geral. Marcar em qual
 * delas o número está AGORA responde "por que ESTE cartão está âmbar", que é
 * a pergunta que a pessoa realmente tem quando abre isto.
 */

const PONTO: Record<KpiTone, string> = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
  neutral: 'bg-muted-foreground/40',
};

export default function MetricHelp({
  metrica, valor, rotulo, nota,
}: {
  metrica: ChaveMetrica;
  /** Valor atual, para destacar a faixa em que ele cai. */
  valor?: number | null;
  /** Sobrescreve o título — útil quando o cartão usa outro nome na tela. */
  rotulo?: string;
  /**
   * Explicação que vale só para o recorte atual (ex.: por que a taxa não
   * aparece com filtro de entidade). O cartão fica curto e o porquê mora aqui.
   */
  nota?: string;
}) {
  const a = AJUDA[metrica] as AjudaMetrica;
  const atual = faixaDe(metrica, valor);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={tx("O que é {0}", [rotulo ?? a.titulo])}
          className="rounded-full p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-secondary transition-colors"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] space-y-2 text-sm">
        <div className="font-semibold">{tx(rotulo) ?? tx(a.titulo)}</div>
        <p className="text-muted-foreground leading-relaxed">{tx(a.oQueE)}</p>

        {nota && (
          <p className="rounded-md bg-secondary/60 p-2 text-[12px] leading-relaxed">
            <strong>{tx("Neste recorte:")}</strong> {tx(nota)}
          </p>
        )}

        {a.comoLer && <p className="text-muted-foreground leading-relaxed">{tx(a.comoLer)}</p>}

        {a.faixas && (
          <div className="space-y-1 pt-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {tx("O que a cor diz")}
            </div>
            {a.faixas.map((f, i) => {
              const ehAtual = atual === f;
              return (
                <div
                  key={f.rotulo}
                  className={`flex items-center gap-2 text-[12px] ${ehAtual ? 'font-medium' : 'text-muted-foreground'}`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${PONTO[f.tone]}`} />
                  <span className="shrink-0">{tx(descreverFaixa(metrica, i))}</span>
                  <span className="truncate">— {tx(f.rotulo)}</span>
                  {ehAtual && <span className="ml-auto shrink-0 text-[10px] uppercase">{tx("agora")}</span>}
                </div>
              );
            })}
            {a.inverso && (
              <p className="pt-1 text-[11px] text-muted-foreground">
                {tx("Aqui")}{" "}<strong>{tx("subir é ruim")}</strong>{tx(": as cores são invertidas em relação aos outros cartões.")}
              </p>
            )}
          </div>
        )}

        {a.cuidado && (
          <p className="rounded-md bg-secondary/60 p-2 text-[12px] leading-relaxed">
            <strong>{tx("Atenção:")}</strong> {tx(a.cuidado)}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
