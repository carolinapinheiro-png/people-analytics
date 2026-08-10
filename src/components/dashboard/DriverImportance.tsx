import { useMemo, useState } from 'react';
import {
  CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Scatter,
  ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Compass } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import { median } from '@/lib/stats';
import { cn } from '@/lib/utils';
import type { SurveyImportance } from '@/lib/survey.functions';

/**
 * Nota × associação com o eNPS, pergunta a pergunta.
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO MUDA A CONCLUSÃO DA ABA
 * ------------------------------------------------------------------
 * Olhando só as notas, a leitura óbvia é "o problema é remuneração": as menores
 * médias da empresa estão todas lá. Mas as perguntas de remuneração ficam no
 * meio do ranking de associação com o eNPS -- quem está insatisfeito com pagamento
 * não é, necessariamente, quem está desengajado.
 *
 * As perguntas que mais andam junto com o eNPS são de COMUNICAÇÃO, e elas têm
 * nota mediana. Não apareciam em lugar nenhum da leitura anterior porque
 * ninguém olha para o meio de uma lista ordenada por nota.
 *
 * Isso não diz que remuneração não importa. Diz que, para mover engajamento,
 * comunicação é o lugar onde o mesmo esforço tende a render mais -- e que a
 * conversa sobre remuneração provavelmente precisa acontecer por outro motivo,
 * com outro indicador.
 *
 * ------------------------------------------------------------------
 * A RESSALVA QUE PRECISA ESTAR NA TELA, NÃO SÓ AQUI
 * ------------------------------------------------------------------
 * Isto não é causa. Todas as respostas vêm da mesma pessoa no mesmo momento, e
 * quem está satisfeito marca alto em tudo. É associação, e serve para ordenar
 * perguntas entre si -- não para prometer que mexer numa levanta o eNPS.
 *
 * O eixo horizontal não começa em zero de propósito: todas as correlações estão
 * entre 0,2 e 0,51, e um eixo de 0 a 1 amassaria tudo num canto. Como o que
 * importa aqui é a posição relativa entre perguntas, e não a magnitude
 * absoluta, o corte é legítimo -- mas fica dito na legenda, porque eixo que não
 * começa em zero merece aviso.
 */

const fmt2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const QUADRANTES = {
  prioridade: {
    label: 'Prioridade',
    desc: 'Nota abaixo da mediana e forte associação com engajamento. É onde um ponto ganho tende a render mais.',
    color: COLORS.danger,
  },
  sustentar: {
    label: 'Sustentar',
    desc: 'Nota alta e forte associação. Está funcionando e importa — perder aqui custa caro.',
    color: COLORS.success,
  },
  observar: {
    label: 'Incomoda, mas não move',
    desc: 'Nota baixa e associação fraca. Problema real, só que não é o que separa engajado de desengajado. Merece conversa própria, com outro indicador.',
    color: COLORS.warning,
  },
  base: {
    label: 'Base tranquila',
    desc: 'Nota alta e associação fraca. Nada a fazer por ora.',
    color: COLORS.info,
  },
} as const;

type QuadKey = keyof typeof QUADRANTES;

interface Ponto {
  x: number; y: number; driver: string; question: string; quad: QuadKey; curta: string;
}

export default function DriverImportance({ rows }: { rows: SurveyImportance[] }) {
  const [detalhe, setDetalhe] = useState<QuadKey | null>('prioridade');

  const { pontos, corteR, corteNota } = useMemo(() => {
    const cr = median(rows.map((r) => r.r)) ?? 0;
    const cn = median(rows.map((r) => r.score)) ?? 0;
    const pontos: Ponto[] = rows.map((r) => ({
      x: r.r,
      y: r.score,
      driver: r.driver,
      question: r.question,
      // Rótulo curto para o gráfico: a pergunta inteira tem até 150 caracteres.
      curta: r.question.length > 34 ? `${r.question.slice(0, 32)}…` : r.question,
      quad:
        r.r >= cr && r.score < cn ? 'prioridade'
        : r.r >= cr ? 'sustentar'
        : r.score < cn ? 'observar'
        : 'base',
    }));
    return { pontos, corteR: cr, corteNota: cn };
  }, [rows]);

  if (rows.length < 6) return null;

  const doQuadrante = (q: QuadKey) => pontos.filter((p) => p.quad === q);
  const nMin = Math.min(...rows.map((r) => r.n));
  const nMax = Math.max(...rows.map((r) => r.n));

  return (
    <ChartCard
      title="O que anda junto com o engajamento"
      subtitle={`${rows.length} perguntas · ${nMin === nMax ? `n=${nMax}` : `n de ${nMin} a ${nMax}`} pessoas`}
      icon={Compass}
    >
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 12, right: 20, bottom: 30, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis
            type="number" dataKey="x" domain={['dataMin - 0.03', 'dataMax + 0.03']}
            tick={{ fontSize: 11 }} tickFormatter={(v: number) => fmt2(v)}
            label={{ value: 'anda mais junto com o eNPS →', position: 'insideBottom', offset: -18, fontSize: 11 }}
          />
          <YAxis
            type="number" dataKey="y" domain={['dataMin - 0.12', 'dataMax + 0.12']}
            tick={{ fontSize: 11 }} tickFormatter={(v: number) => fmt2(v)}
            label={{ value: 'nota (1-5) →', angle: -90, position: 'insideLeft', fontSize: 11 }}
          />
          <ReferenceLine x={corteR} stroke={COLORS.gray400} strokeDasharray="4 4" />
          <ReferenceLine y={corteNota} stroke={COLORS.gray400} strokeDasharray="4 4" />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Ponto;
              const q = QUADRANTES[p.quad];
              return (
                <div className="rounded-md border border-border bg-popover p-2.5 text-xs shadow-md max-w-[280px]">
                  <div className="font-medium mb-1 leading-snug">{p.question}</div>
                  <div className="text-muted-foreground">{p.driver}</div>
                  <div className="text-muted-foreground mt-1">
                    nota {fmt2(p.y)} · associação {fmt2(p.x)}
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t border-border/60" style={{ color: q.color }}>
                    {q.label}
                  </div>
                </div>
              );
            }}
          />
          {(Object.keys(QUADRANTES) as QuadKey[]).map((q) => (
            <Scatter key={q} data={doQuadrante(q)} fill={QUADRANTES[q].color} fillOpacity={0.8}>
              {q === 'prioridade' && (
                <LabelList dataKey="curta" position="right" style={{ fontSize: 9, fill: 'var(--muted-foreground)' }} />
              )}
            </Scatter>
          ))}
        </ScatterChart>
      </ResponsiveContainer>

      <div className="grid sm:grid-cols-2 gap-2 mt-2">
        {(Object.keys(QUADRANTES) as QuadKey[]).map((q) => {
          const itens = doQuadrante(q);
          const aberto = detalhe === q;
          return (
            <button
              key={q}
              onClick={() => setDetalhe(aberto ? null : q)}
              className={cn(
                'text-left rounded-md border p-2.5 transition-colors',
                aberto ? 'border-border bg-muted/50' : 'border-border hover:bg-muted/30',
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: QUADRANTES[q].color }} />
                <span className="text-xs font-medium">{QUADRANTES[q].label}</span>
                <span className="text-[10px] text-muted-foreground">({itens.length})</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{QUADRANTES[q].desc}</p>
              {aberto && (
                <ul className="mt-2 space-y-1">
                  {itens
                    .sort((a, b) => b.x - a.x)
                    .map((p) => (
                      <li key={p.question} className="text-[11px] leading-snug flex gap-1.5">
                        <span className="tabular-nums text-muted-foreground shrink-0">
                          {fmt2(p.y)}
                        </span>
                        <span>{p.question}</span>
                      </li>
                    ))}
                </ul>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 space-y-1.5">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong>Como ler:</strong> cada ponto é uma pergunta. Quanto mais à direita, mais as
          respostas dela acompanham o eNPS da mesma pessoa. Quanto mais acima, melhor a nota. As
          linhas tracejadas são as medianas das 31 perguntas — clique num quadrante para ver quais
          caem nele.
        </p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong>Isto não é relação de causa.</strong> Todas as respostas vêm da mesma pessoa no
          mesmo momento, e quem está satisfeito tende a marcar alto em tudo. Serve para ordenar as
          perguntas entre si — não para prometer que mexer numa delas levanta o eNPS. O eixo
          horizontal também não começa em zero: as correlações estão todas entre {fmt2(Math.min(...rows.map((r) => r.r)))} e{' '}
          {fmt2(Math.max(...rows.map((r) => r.r)))}, e o que interessa é a posição relativa.
        </p>
      </div>
    </ChartCard>
  );
}
