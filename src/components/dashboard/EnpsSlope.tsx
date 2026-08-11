import { useMemo } from 'react';
import { TrendingDown } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import type { EngagementContextRow } from '@/lib/engagement-context';

/**
 * Movimento do eNPS entre as duas ondas, por área.
 *
 * POR QUE UM SLOPE CHART E NÃO A COLUNA "Δ" DA TABELA
 * A tabela já traz o delta, e ainda assim ninguém percebia o padrão: SETE das
 * oito áreas caíram, e a única que subiu foi justamente a de menor eNPS
 * absoluto. Isso é uma história sobre a empresa inteira, não sobre oito áreas
 * separadas -- e uma coluna de números empilhados não conta história nenhuma,
 * porque exige que o leitor compare oito valores de cabeça.
 *
 * Duas linhas verticais e um traço ligando cada área faz o padrão aparecer antes
 * da leitura consciente: o feixe inteiro inclinado para baixo é o achado.
 *
 * POR QUE SVG NA MÃO EM VEZ DE RECHARTS
 * Recharts não tem slope chart. Dava para forjar com LineChart e duas
 * categorias, mas o custo seria brigar com escala, legenda e sobreposição de
 * rótulos -- mais código, e mais frágil, do que 40 linhas de SVG que fazem
 * exatamente o necessário. A escala aqui é uma regra de três.
 */

const H = 300;
const PAD_TOP = 22;
const PAD_BOTTOM = 30;
const LABEL_W = 118;

/**
 * A onda anterior foi aplicada em duas partes, com um mês de diferença: o eNPS
 * saiu em junho/25 e os drivers em julho/25. É uma pesquisa só, e a área trata
 * como "Julho/25" -- é assim que ela é chamada nas reuniões. Rotular "jun/25"
 * aqui e "jul/25" na conversa criaria duas ondas onde existe uma.
 */
export default function EnpsSlope({
  rows,
  ondaAnterior = 'jul/2025',
  ondaAtual = 'jan/2026',
}: {
  rows: EngagementContextRow[];
  ondaAnterior?: string;
  ondaAtual?: string;
}) {
  const dados = useMemo(() => {
    const validas = rows.filter(
      (r) =>
        r.scope.toLowerCase() !== 'company' && r.enps != null && r.enpsPrev != null,
    ) as Array<EngagementContextRow & { enps: number; enpsPrev: number }>;
    // Ordenar pelo valor atual mantém os rótulos da direita sem colisão na
    // maior parte dos casos e deixa a leitura de ranking possível de graça.
    return validas.sort((a, b) => b.enps - a.enps);
  }, [rows]);

  const { min, max } = useMemo(() => {
    const vals = dados.flatMap((d) => [d.enps, d.enpsPrev]);
    if (!vals.length) return { min: 0, max: 100 };
    // Folga de 6 pontos para os rótulos não encostarem na borda.
    return { min: Math.min(...vals) - 6, max: Math.max(...vals) + 6 };
  }, [dados]);

  if (dados.length < 2) return null;

  const y = (v: number) => PAD_TOP + ((max - v) / (max - min)) * (H - PAD_TOP - PAD_BOTTOM);

  const caiu = dados.filter((d) => d.enps < d.enpsPrev);
  const subiu = dados.filter((d) => d.enps > d.enpsPrev);
  const maiorQueda = [...dados].sort((a, b) => (a.enps - a.enpsPrev) - (b.enps - b.enpsPrev))[0];

  return (
    <ChartCard
      title="Movimento do eNPS por área"
      subtitle={`${ondaAnterior} → ${ondaAtual}`}
      icon={TrendingDown}
    >
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 520 ${H}`} className="w-full min-w-[460px]" style={{ height: H }} role="img"
          aria-label={`Variação do eNPS entre ${ondaAnterior} e ${ondaAtual} por área`}>
          {/* Eixos verticais das duas ondas */}
          <line x1={LABEL_W} y1={PAD_TOP - 8} x2={LABEL_W} y2={H - PAD_BOTTOM + 6}
            stroke="var(--border)" strokeWidth={1} />
          <line x1={520 - LABEL_W} y1={PAD_TOP - 8} x2={520 - LABEL_W} y2={H - PAD_BOTTOM + 6}
            stroke="var(--border)" strokeWidth={1} />
          <text x={LABEL_W} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
            {ondaAnterior}
          </text>
          <text x={520 - LABEL_W} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
            {ondaAtual}
          </text>

          {dados.map((d) => {
            const y1 = y(d.enpsPrev);
            const y2 = y(d.enps);
            const desceu = d.enps < d.enpsPrev;
            const cor = desceu ? COLORS.warning : COLORS.success;
            return (
              <g key={d.scope}>
                <line x1={LABEL_W} y1={y1} x2={520 - LABEL_W} y2={y2}
                  stroke={cor} strokeWidth={1.8} strokeOpacity={0.75} />
                <circle cx={LABEL_W} cy={y1} r={3} fill={cor} />
                <circle cx={520 - LABEL_W} cy={y2} r={3.5} fill={cor} />
                {/* Halo na cor do cartão atrás do rótulo: em áreas com eNPS
                    próximo os textos encostavam nas linhas e um no outro. */}
                <text x={LABEL_W - 8} y={y1 + 3.5} textAnchor="end" fontSize={11} fill="var(--muted-foreground)"
                  stroke="var(--card)" strokeWidth={3.5} strokeLinejoin="round" paintOrder="stroke">
                  {d.scope} {d.enpsPrev}
                </text>
                <text x={520 - LABEL_W + 8} y={y2 + 3.5} fontSize={11} fill="var(--foreground)"
                  stroke="var(--card)" strokeWidth={3.5} strokeLinejoin="round" paintOrder="stroke">
                  {d.enps} <tspan fill={cor} stroke="none">({d.enps - d.enpsPrev > 0 ? '+' : ''}{d.enps - d.enpsPrev})</tspan>
                </text>

              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-sm mt-2 leading-relaxed">
        <strong>{caiu.length} de {dados.length} áreas caíram.</strong>
        {subiu.length === 1
          ? ` A única que subiu foi ${subiu[0].scope}, que também tem o menor eNPS absoluto (${subiu[0].enps}).`
          : subiu.length ? ` Subiram ${subiu.map((s) => s.scope).join(', ')}.` : ''}
        {' '}Quando quase todas se movem para o mesmo lado, a causa costuma ser da empresa, não de
        cada gestor.
      </p>
      <p className="text-xs text-muted-foreground mt-1.5">
        Maior queda: {maiorQueda.scope} ({maiorQueda.enps - maiorQueda.enpsPrev} pontos). Quem
        participou pela primeira vez não aparece — não há de onde medir variação.
      </p>
    </ChartCard>
  );
}
