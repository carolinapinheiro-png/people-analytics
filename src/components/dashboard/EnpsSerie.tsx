import { useMemo } from 'react';
import { Activity } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import type { OndaEnps } from '@/lib/experience.functions';

/**
 * eNPS por área ao longo das ondas.
 *
 * ------------------------------------------------------------------
 * QUANDO ESTE GRÁFICO SUBSTITUI O SLOPE, E POR QUÊ SÓ AÍ
 * ------------------------------------------------------------------
 * Com DUAS ondas, o slope chart é melhor: ele responde "o que mudou desde a
 * última pesquisa", que é a pergunta que abre a reunião, e faz o padrão
 * aparecer antes da leitura consciente -- o feixe inteiro inclinado para baixo
 * é o achado. Uma linha de dois pontos seria a mesma informação com mais tinta.
 *
 * A partir da TERCEIRA onda o slope passa a esconder mais do que mostra: ele
 * só enxerga as duas pontas, e uma área que caiu, subiu e voltou aparece
 * idêntica a uma que ficou parada. Aí a série ganha.
 *
 * A troca é automática (ver EngagementTab): quem decide é quantas ondas com
 * dado existem no banco, não uma constante que alguém precisa lembrar de
 * mudar.
 *
 * ------------------------------------------------------------------
 * SVG NA MÃO, PELO MESMO MOTIVO DO SLOPE
 * ------------------------------------------------------------------
 * A escala aqui é regra de três, e o que o Recharts adicionaria -- legenda,
 * eixo, tooltip -- é justamente o que faria a leitura ficar mais lenta. O
 * rótulo vai na ponta de cada linha, que é onde o olho já está.
 */

const H = 320;
const PAD_TOP = 20;
const PAD_BOTTOM = 34;
const PAD_LEFT = 34;
const LABEL_W = 132;
const W = 640;

/**
 * Uma cor por área, estável entre renderizações.
 *
 * O índice vem da ordem de eNPS na última onda, então a área do topo é sempre
 * a mesma cor dentro de uma sessão. Não tento dar significado à cor: com oito
 * linhas, cor é identidade, não escala.
 */
const PALETA = [
  COLORS.flutter, COLORS.success, COLORS.warning, COLORS.danger,
  COLORS.info, '#a855f7', '#14b8a6', '#f97316', '#84cc16',
];

export default function EnpsSerie({ ondas }: { ondas: OndaEnps[] }) {
  const { areas, min, max } = useMemo(() => {
    const ultima = ondas.at(-1);
    // A ordem sai da última onda: é a leitura de ranking de graça, e mantém os
    // rótulos da direita sem colisão na maioria dos casos.
    const nomes = [...(ultima?.pontos ?? [])]
      .sort((a, b) => b.enps - a.enps)
      .map((p) => p.scope);

    const areas = nomes.map((scope, i) => ({
      scope,
      cor: PALETA[i % PALETA.length],
      // `null` onde a área não respondeu naquela onda -- a linha corta ali em
      // vez de descer até zero. Zero seria uma queda que não aconteceu.
      pontos: ondas.map((o) => o.pontos.find((p) => p.scope === scope)?.enps ?? null),
    }));

    const vals = areas.flatMap((a) => a.pontos).filter((v): v is number => v != null);
    return vals.length
      ? { areas, min: Math.min(...vals) - 6, max: Math.max(...vals) + 6 }
      : { areas, min: 0, max: 100 };
  }, [ondas]);

  if (ondas.length < 3 || areas.length === 0) return null;

  const x = (i: number) =>
    PAD_LEFT + (i / (ondas.length - 1)) * (W - PAD_LEFT - LABEL_W);
  const y = (v: number) =>
    PAD_TOP + ((max - v) / (max - min)) * (H - PAD_TOP - PAD_BOTTOM);

  /** Rótulos da direita com afastamento mínimo, igual ao slope. */
  const finais = areas.map((a) => a.pontos.at(-1));
  const yRot = (() => {
    const GAP = 13;
    const ordenado = finais
      .map((v, i) => ({ i, y: v == null ? Infinity : y(v) }))
      .sort((a, b) => a.y - b.y);
    let anterior = -Infinity;
    for (const o of ordenado) {
      if (!Number.isFinite(o.y)) continue;
      o.y = Math.max(o.y, anterior + GAP);
      anterior = o.y;
    }
    const out: number[] = new Array(finais.length).fill(0);
    for (const o of ordenado) out[o.i] = o.y;
    return out;
  })();

  return (
    <ChartCard
      title="eNPS por área ao longo das pesquisas"
      subtitle={`${ondas.length} ondas · ${ondas[0].label} → ${ondas.at(-1)?.label}`}
      icon={Activity}
    >
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[520px]"
          style={{ height: H }}
          role="img"
          aria-label={`eNPS por área em ${ondas.length} ondas de pesquisa`}
        >
          {/* Guias verticais: uma por onda. */}
          {ondas.map((o, i) => (
            <g key={o.wave}>
              <line
                x1={x(i)} x2={x(i)} y1={PAD_TOP - 8} y2={H - PAD_BOTTOM + 4}
                stroke="var(--chart-grid)" strokeWidth={1}
              />
              <text
                x={x(i)} y={H - PAD_BOTTOM + 20}
                textAnchor="middle" fontSize={11} fill="var(--chart-tick)"
              >
                {o.label}
              </text>
            </g>
          ))}

          {areas.map((a, ai) => {
            // Trechos contínuos: onde falta ponto, a linha interrompe em vez
            // de pular o buraco. Pular ligaria dois números com um traço que
            // afirma uma trajetória que ninguém mediu.
            const trechos: Array<Array<{ x: number; y: number }>> = [];
            let atual: Array<{ x: number; y: number }> = [];
            a.pontos.forEach((v, i) => {
              if (v == null) {
                if (atual.length) trechos.push(atual);
                atual = [];
                return;
              }
              atual.push({ x: x(i), y: y(v) });
            });
            if (atual.length) trechos.push(atual);

            const fim = a.pontos.at(-1);
            return (
              <g key={a.scope}>
                {trechos.map((t, ti) => (
                  <polyline
                    key={ti}
                    points={t.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none" stroke={a.cor} strokeWidth={2}
                    strokeLinejoin="round" strokeLinecap="round"
                    opacity={0.9}
                  />
                ))}
                {a.pontos.map((v, i) =>
                  v == null ? null : (
                    <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={a.cor} />
                  ),
                )}
                {fim != null && (
                  <text
                    x={W - LABEL_W + 8} y={yRot[ai] + 4}
                    fontSize={11} fill="var(--chart-tick)"
                  >
                    <tspan fontWeight={600} fill={a.cor}>{fim}</tspan>
                    <tspan dx={6}>{a.scope}</tspan>
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
        Uma linha por área. Onde a linha interrompe, a área não respondeu naquela
        onda — o traço não atravessa o buraco, porque atravessar afirmaria uma
        trajetória que ninguém mediu.
      </p>
    </ChartCard>
  );
}
