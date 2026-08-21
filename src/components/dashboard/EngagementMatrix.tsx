import { useMemo } from 'react';
import {
  CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis, LabelList,
} from 'recharts';
import { Target } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import { median } from '@/lib/stats';
import type { EngagementContextRow } from '@/lib/engagement-context';

/**
 * Matriz de ação: eNPS no eixo X, risco de retenção no Y, tamanho da bolha pelo
 * headcount.
 *
 * POR QUE ESTA VISÃO EXISTE
 * A tabela por departamento já traz os dois números, mas lado a lado eles não
 * conversam: é preciso ler linha por linha e montar a comparação de cabeça.
 * O que a liderança pergunta primeiro não é "qual o eNPS de Marketing", é "por
 * onde eu começo". Isso é uma pergunta de posição relativa, e posição relativa
 * é o que um plano cartesiano responde de graça.
 *
 * POR QUE O CORTE É A MEDIANA, NÃO UM ALVO FIXO
 * Não existe meta acordada de eNPS nem de risco (decisão de negócio ainda
 * pendente). Inventar um corte -- "eNPS 70 é bom" -- seria fabricar régua e
 * fazer com que áreas fossem chamadas de ruins por um número que ninguém
 * combinou. A mediana é honesta: divide o grupo pela metade e diz exatamente
 * isso na tela. Quando as metas existirem, troca-se a linha e a leitura ganha
 * sentido absoluto.
 *
 * O eixo Y é INVERTIDO de propósito: risco alto embaixo. Assim o canto superior
 * direito é sempre "melhor" -- convenção que a maioria das pessoas já traz de
 * outras matrizes e que evita a leitura invertida na apresentação.
 */

interface Ponto {
  x: number; y: number; z: number; nome: string; quadrante: string;
}

const QUADRANTES = {
  cuidar: {
    label: 'Manter e aprender',
    desc: 'Engajamento acima da mediana e risco abaixo. É onde vale entender o que está funcionando para tentar repetir.',
    color: COLORS.success,
  },
  vigiar: {
    label: 'Engajado, mas de saída',
    desc: 'Gostam da empresa e mesmo assim pensam em sair. Quase sempre é carreira ou remuneração, não clima.',
    color: COLORS.warning,
  },
  agir: {
    label: 'Agir primeiro',
    desc: 'Engajamento abaixo da mediana e risco acima. Combinação que costuma virar saída nos meses seguintes.',
    color: COLORS.danger,
  },
  ouvir: {
    label: 'Baixo engajamento, risco contido',
    desc: 'Insatisfação sem intenção de sair. Tende a aparecer como queda de entrega antes de aparecer como turnover.',
    color: COLORS.info,
  },
} as const;

export default function EngagementMatrix({
  rows,
  ondaLabel,
}: {
  rows: EngagementContextRow[];
  /**
   * Onda a que os pontos se referem. Vinha escrita "jan/2026" no código
   * enquanto os dados plotados eram os da onda corrente -- quem cruzasse com a
   * tabela de risco declarado, essa sim de jan/26, encontrava contradição.
   */
  ondaLabel?: string | null;
}) {
  const { pontos, corteX, corteY, limX, limY } = useMemo(() => {
    // Só departamentos: "Betfair" é marca e entra em todas as áreas, então
    // posicioná-la ao lado delas compara populações que se sobrepõem. O recorte
    // por marca vive em SurveyCuts.
    const validas = rows.filter(
      (r) => r.dept != null && r.enps != null && r.retentionRisk != null,
    );
    const cx = median(validas.map((r) => r.enps)) ?? 0;
    const cy = median(validas.map((r) => r.retentionRisk)) ?? 0;

    const pontos: Ponto[] = validas.map((r) => {
      const enps = r.enps as number;
      const risco = r.retentionRisk as number;
      const quadrante =
        enps >= cx && risco <= cy ? 'cuidar'
        : enps >= cx && risco > cy ? 'vigiar'
        : enps < cx && risco > cy ? 'agir'
        : 'ouvir';
      return {
        x: enps,
        y: risco,
        // Sem headcount a bolha vira do menor tamanho em vez de sumir: a área
        // continua posicionada, que é a informação principal aqui.
        z: r.headcountMedio ?? 20,
        nome: r.scope,
        quadrante,
      };
    });
    // Domínio explícito: o mesmo que 'dataMin - 8'/'dataMax + 8' produziria,
    // mas em número, para as faixas de quadrante encostarem exatamente na borda.
    const xs = pontos.map((p) => p.x);
    const ys = pontos.map((p) => p.y);
    const limX: [number, number] = [Math.min(...xs) - 8, Math.max(...xs) + 8];
    const limY: [number, number] = [Math.min(...ys) - 3, Math.max(...ys) + 3];

    return { pontos, corteX: cx, corteY: cy, limX, limY };
  }, [rows]);

  if (pontos.length < 3) return null;

  const porQuadrante = (q: string) => pontos.filter((p) => p.quadrante === q);

  return (
    <ChartCard
      title="Matriz de ação"
      subtitle={`eNPS × risco de saída${ondaLabel ? ` · ${ondaLabel}` : ''} · bolha = tamanho da área · canto superior direito é o melhor`}
      icon={Target}
    >
      <ResponsiveContainer width="100%" height={330}>
        <ScatterChart margin={{ top: 16, right: 24, bottom: 28, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis
            type="number" dataKey="x" name="eNPS" domain={limX}
            tick={{ fontSize: 11 }}
            label={{ value: 'eNPS  →  mais promotores', position: 'insideBottom', offset: -16, fontSize: 11 }}
          />
          <YAxis
            type="number" dataKey="y" name="Risco" unit="%" reversed
            domain={limY} tick={{ fontSize: 11 }}
            label={{ value: 'risco de saída  ↑ menos risco', angle: -90, position: 'insideLeft', fontSize: 11 }}
          />
          <ZAxis type="number" dataKey="z" range={[80, 900]} name="Headcount" />

          {/* Os quatro quadrantes pintados por baixo dos pontos. Sem isso é
              preciso descer até os cards para saber em que zona cada bolha
              caiu -- e ninguém faz isso no meio de uma apresentação. */}
          {([
            ['ouvir',  limX[0], corteX,  limY[0], corteY,  'insideTopLeft'],
            ['cuidar', corteX,  limX[1], limY[0], corteY,  'insideTopRight'],
            ['agir',   limX[0], corteX,  corteY,  limY[1], 'insideBottomLeft'],
            ['vigiar', corteX,  limX[1], corteY,  limY[1], 'insideBottomRight'],
          ] as const).map(([q, x1, x2, y1, y2, pos]) => (
            <ReferenceArea
              key={q} x1={x1} x2={x2} y1={y1} y2={y2}
              fill={QUADRANTES[q].color} fillOpacity={0.06} stroke="none"
              label={{
                value: QUADRANTES[q].label,
                position: pos,
                fontSize: 10.5,
                fill: QUADRANTES[q].color,
                offset: 10,
              }}
            />
          ))}

          <ReferenceLine x={corteX} stroke={COLORS.gray400} strokeDasharray="4 4" />
          <ReferenceLine y={corteY} stroke={COLORS.gray400} strokeDasharray="4 4" />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            contentStyle={{ fontSize: 12 }}
            formatter={(value: number, name: string) =>
              name === 'Risco' ? [`${value}%`, 'Risco de retenção']
              : name === 'Headcount' ? [value, 'Headcount médio']
              : [value, name]
            }
            labelFormatter={() => ''}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Ponto;
              const q = QUADRANTES[p.quadrante as keyof typeof QUADRANTES];
              return (
                <div className="rounded-md border border-border bg-popover p-2.5 text-xs shadow-md max-w-[240px]">
                  <div className="font-medium mb-1">{p.nome}</div>
                  <div className="text-muted-foreground">eNPS {p.x} · risco {p.y}%</div>
                  <div className="text-muted-foreground">~{p.z} pessoas</div>
                  <div className="mt-1.5 pt-1.5 border-t border-border/60" style={{ color: q.color }}>
                    {q.label}
                  </div>
                </div>
              );
            }}
          />
          {(Object.keys(QUADRANTES) as Array<keyof typeof QUADRANTES>).map((q) => (
            <Scatter key={q} name={QUADRANTES[q].label} data={porQuadrante(q)} fill={QUADRANTES[q].color} fillOpacity={0.72}>
              <LabelList dataKey="nome" position="top" style={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
            </Scatter>
          ))}
        </ScatterChart>
      </ResponsiveContainer>

      <div className="grid sm:grid-cols-2 gap-2 mt-3">
        {(Object.keys(QUADRANTES) as Array<keyof typeof QUADRANTES>).map((q) => {
          const areas = porQuadrante(q);
          return (
            <div key={q} className="rounded-md border border-border p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: QUADRANTES[q].color }} />
                <span className="text-xs font-medium">{QUADRANTES[q].label}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">{QUADRANTES[q].desc}</p>
              <p className="text-[11px]">
                {areas.length ? areas.map((a) => a.nome).join(', ') : <span className="text-muted-foreground">nenhuma área</span>}
              </p>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        As linhas tracejadas são a <strong>mediana</strong> do grupo (eNPS {corteX}, risco {corteY}%), não uma
        meta. Metade das áreas cai de cada lado por construção — então &quot;abaixo da linha&quot; significa
        &quot;abaixo das outras&quot;, não &quot;ruim&quot;. Quando houver meta acordada, trocamos a linha e a
        leitura passa a ser absoluta.
      </p>
    </ChartCard>
  );
}
