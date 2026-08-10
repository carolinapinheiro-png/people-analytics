import { useMemo } from 'react';
import { Info } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { classifyAreas, type Veredito } from '@/lib/area-priority';
import {
  Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import type { EngagementContextRow } from '@/lib/engagement-context';
import type { SurveyCut } from '@/lib/survey.functions';

/**
 * Uma lista por área, ordenada por prioridade. Substitui três visões.
 *
 * ------------------------------------------------------------------
 * O QUE ISTO SUBSTITUI, E POR QUÊ
 * ------------------------------------------------------------------
 * A aba mostrava o eNPS por área em TRÊS lugares: uma matriz de dispersão, um
 * gráfico de barras e uma tabela de oito colunas. Os três com o mesmo dado, e
 * nenhum dizendo o que fazer.
 *
 * A dispersão era a pior das três para o uso real. Ela é excelente para achar
 * padrão num conjunto grande, e aqui há oito pontos -- não existe padrão a
 * achar em oito pontos, existe uma ordem a estabelecer. Além disso obriga a
 * ler dois eixos e cruzar de cabeça, e o que a pessoa quer saber é simples:
 * quem primeiro.
 *
 * Uma lista ordenada responde isso sem exigir leitura de eixo. A barra dá a
 * grandeza, a cor dá o risco, o rótulo dá o veredito, e a ordem dá a resposta.
 *
 * ------------------------------------------------------------------
 * COMO A ORDEM É DEFINIDA
 * ------------------------------------------------------------------
 * Não é por eNPS. Ordenar por eNPS puro colocaria Legal no topo -- eNPS 47, o
 * pior da empresa -- quando Legal tem o MENOR risco de saída de todas (6,7%) e
 * são 15 pessoas. Agir ali primeiro seria gastar esforço onde ninguém está de
 * saída.
 *
 * A regra de classificação vive em lib/area-priority.ts, compartilhada com a
 * leitura do topo da aba -- as duas precisam dizer a mesma coisa, e duas cópias
 * da mesma regra divergem no primeiro ajuste.
 */

const fmt1 = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

const VEREDITO: Record<Veredito, { label: string; cor: string; explica: string }> = {
  agir: {
    label: 'Agir primeiro',
    cor: COLORS.danger,
    explica: 'Engajamento claramente abaixo do grupo E risco de saída claramente acima. É a combinação que mais vira saída nos meses seguintes.',
  },
  vigiar: {
    label: 'Engajados, mas de saída',
    cor: COLORS.warning,
    explica: 'Risco de saída acima do grupo sem engajamento baixo. Gostam da empresa e ainda assim pensam em sair — costuma ser carreira ou remuneração, não clima.',
  },
  ouvir: {
    label: 'Vale ouvir',
    cor: COLORS.info,
    explica: 'Engajamento abaixo do grupo, mas sem intenção de sair. Tende a aparecer na entrega antes de aparecer como turnover.',
  },
  manter: {
    label: 'Sem sinal de alerta',
    cor: COLORS.success,
    explica: 'Nem engajamento claramente abaixo do grupo, nem risco claramente acima. Não quer dizer que está tudo ótimo — quer dizer que nada aqui se destaca a ponto de pedir ação agora.',
  },
};

export default function AreaPriority({
  areas,
  cuts,
}: {
  areas: EngagementContextRow[];
  /** Recortes por área da carga bruta, só para saber o n de respondentes. */
  cuts: SurveyCut[];
}) {
  const { itens, nPorArea, gapPorArea, medianas } = useMemo(() => {
    const nPorArea = new Map(
      cuts.filter((c) => c.cutType === 'area').map((c) => [c.cutValue, c.n]),
    );
    const c = classifyAreas(areas);
    const gapPorArea = new Map(areas.map((a) => [a.scope, a.gapEntEnps]));
    return {
      itens: c.itens,
      nPorArea,
      gapPorArea,
      medianas: {
        enps: c.medianaEnps, risco: c.medianaRisco,
        margemEnps: c.margemEnps, margemRisco: c.margemRisco,
      },
    };
  }, [areas, cuts]);

  if (!itens.length) return null;

  const maxEnps = Math.max(...itens.map((i) => i.enps), 1);

  return (
    <ChartCard
      title="Por onde começar, área por área"
      subtitle={`ordenado por prioridade · grupo: eNPS ${fmt1(medianas.enps)}, risco ${fmt1(medianas.risco)}%`}
    >
      <div className="space-y-1">
        {itens.map((i, idx) => {
          const v = VEREDITO[i.veredito];
          const primeiroDoGrupo = idx === 0 || itens[idx - 1].veredito !== i.veredito;
          return (
            <div key={i.scope}>
              {primeiroDoGrupo && (
                <div className="flex items-center gap-1.5 pt-2.5 pb-1 first:pt-0">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: v.cor }} />
                  <span className="text-[11px] font-medium">{v.label}</span>
                  <TooltipProvider delayDuration={200}>
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <button aria-label={`O que significa ${v.label}`}>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[260px] text-xs leading-relaxed">
                        {v.explica}
                      </TooltipContent>
                    </UiTooltip>
                  </TooltipProvider>
                </div>
              )}
              <div className="flex items-center gap-3 py-1">
                <span className="w-[118px] shrink-0 text-xs truncate" title={i.scope}>{i.scope}</span>
                <div className="flex-1 min-w-0 h-5 flex items-center">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{ width: `${(i.enps / maxEnps) * 100}%`, background: v.cor, opacity: 0.85 }}
                  />
                </div>
                <span className="text-xs font-semibold tabular-nums w-8 text-right">{i.enps}</span>
                <span className={cn(
                  'text-[11px] tabular-nums w-14 text-right',
                  (i.risco ?? 0) > medianas.risco + medianas.margemRisco
                    ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground',
                )}>
                  {fmt1(i.risco)}%
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums w-12 text-right">
                  n={nPorArea.get(i.scope) ?? '—'}
                </span>
                {/* Segunda régua: como a área está contra a Flutter International.
                    Legal é a de pior eNPS aqui E a mais distante da entidade
                    global (-29) -- as duas leituras concordam, e isso muda a
                    conversa. Onde elas discordam é ainda mais interessante. */}
                <span
                  className={cn(
                    'text-[11px] tabular-nums w-[54px] text-right shrink-0',
                    (gapPorArea.get(i.scope) ?? 0) < 0
                      ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground',
                  )}
                  title="Diferença de eNPS para a Flutter International, informada no deck de jan/26"
                >
                  {gapPorArea.get(i.scope) == null
                    ? '—'
                    : `${(gapPorArea.get(i.scope) as number) > 0 ? '+' : ''}${gapPorArea.get(i.scope)} glob.`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-border/60 text-[11px] text-muted-foreground">
        <span>barra e número = <strong className="text-foreground">eNPS</strong></span>
        <span>coluna do meio = <strong className="text-foreground">risco de saída</strong></span>
        <span>n = respostas</span>
        <span>glob. = <strong className="text-foreground">vs Flutter International</strong></span>
      </div>

      <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
        A ordem não é por eNPS: a área de pior eNPS é também a de menor risco de saída, e agir ali
        primeiro seria gastar esforço onde ninguém está saindo. A fila combina engajamento baixo,
        risco alto e tamanho da área — e só chama de &quot;abaixo&quot; quem está mais distante do
        grupo que o afastamento típico entre as áreas, para diferença de arredondamento não virar
        alarme. Repare no <strong>n</strong>: nas áreas menores, uma pessoa move o eNPS em vários
        pontos.
      </p>
    </ChartCard>
  );
}
