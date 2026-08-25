import { useMemo, useState } from 'react';
import {
  CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Scatter,
  ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Compass } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import AvisoForaDoFiltro from '@/components/dashboard/AvisoForaDoFiltro';
import { COLORS } from '@/lib/colors';
import { classifyPerguntas, type QuadrantePergunta } from '@/lib/pergunta-priority';
import { N_MINIMO_CORRELACAO } from '@/lib/aggregator/polly-survey';
import { cn } from '@/lib/utils';
import type { SurveyImportance, DriverPorRecorte } from '@/lib/survey.functions';
import { perguntasNoRecorte } from '@/lib/drill';

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
    desc: 'Menos gente concorda que na pergunta mediana, e forte associação com engajamento. É onde um ponto ganho tende a render mais.',
    color: COLORS.danger,
  },
  sustentar: {
    label: 'Sustentar',
    desc: 'Concordância alta e forte associação. Está funcionando e importa — perder aqui custa caro.',
    color: COLORS.success,
  },
  observar: {
    label: 'Incomoda, mas não move',
    desc: 'Concordância baixa e associação fraca. Problema real, só que não é o que separa engajado de desengajado. Merece conversa própria, com outro indicador.',
    color: COLORS.warning,
  },
  base: {
    label: 'Base tranquila',
    desc: 'Concordância alta e associação fraca. Nada a fazer por ora.',
    color: COLORS.info,
  },
} as const;

type QuadKey = QuadrantePergunta;

interface Ponto {
  x: number; y: number; nota: number; driver: string; question: string; quad: QuadKey; curta: string;
}

export default function DriverImportance({
  rows,
  drivers = [],
  departamentoSelecionado = null,
}: {
  rows: SurveyImportance[];
  /** Notas por recorte, para o eixo vertical seguir o filtro. Ver abaixo. */
  drivers?: DriverPorRecorte[];
  departamentoSelecionado?: string | null;
}) {
  const [detalhe, setDetalhe] = useState<QuadKey | null>('prioridade');

  // ------------------------------------------------------------------
  // OS DOIS EIXOS, E O QUE JÁ SE DISSE DE ERRADO SOBRE ELES
  // ------------------------------------------------------------------
  // Vertical: % que concorda. Horizontal: associação com o eNPS.
  //
  // Este comentário já afirmou, em duas versões seguidas, que a associação "só
  // existe na empresa" e "é a única medida que existe". As duas eram falsas
  // pelo mesmo motivo: ela nunca tinha sido agrupada por área, e isso virou
  // impossibilidade na cabeça de quem escreveu -- eu.
  //
  // Hoje os dois eixos seguem o filtro quando a área tem respostas suficientes
  // para uma correlação. Quando não tem, só o vertical segue, e o texto na tela
  // diz qual é o caso COM o número, em vez de alegar que o dado não existe.
  //
  // A troca vive em `drill.ts` e a lista "Por onde começar" chama a MESMA
  // função. Enquanto ela esteve copiada aqui dentro, os dois cartões voltaram
  // a discordar sob filtro -- a mesma pergunta em quadrantes diferentes.
  const escopo = useMemo(
    () => perguntasNoRecorte(rows, drivers, departamentoSelecionado),
    [rows, drivers, departamentoSelecionado],
  );

  const { pontos, corteR, corteNota } = useMemo(() => {
    // ------------------------------------------------------------------
    // O EIXO VERTICAL É % FAVORÁVEL, NÃO A MÉDIA
    // ------------------------------------------------------------------
    // Este cartão plotava a média (1 a 5) e cortava na mediana das médias. O
    // cartão logo abaixo, "Por onde começar", cortava na mediana do % favorável.
    // Duas réguas, os mesmos quatro quadrantes, as mesmas perguntas: mudar de
    // cartão podia mudar o quadrante de uma pergunta sem nada ter mudado no dado.
    //
    // A régua agora é uma só, em `pergunta-priority.ts`, e é o % favorável --
    // que é o número que a tela mostra e a diretoria usa. Como o corte passou a
    // vir de lá, o eixo veio junto: desenhar a linha do % sobre pontos plotados
    // pela média deixaria pontos "de nota baixa" acima da linha de nota.
    // A classificação sai da MESMA população que os pontos: com a mediana da
    // empresa sobre notas da área, quase tudo cairia de um lado só numa área
    // que responde abaixo, e o quadrante deixaria de separar nada.
    const { itens, corteR, corteFavoravel } = classifyPerguntas(escopo.linhas);
    const pontos: Ponto[] = itens.map((r) => ({
      x: r.r,
      y: r.favEfetivo,
      nota: r.score,
      driver: r.driver,
      question: r.question,
      // Rótulo curto para o gráfico: a pergunta inteira tem até 150 caracteres.
      curta: r.question.length > 34 ? `${r.question.slice(0, 32)}…` : r.question,
      quad: r.quadrante,
    }));
    return { pontos, corteR, corteNota: corteFavoravel };
  }, [escopo]);

  if (rows.length < 6) return null;

  const doQuadrante = (q: QuadKey) => pontos.filter((p) => p.quad === q);
  const nMin = Math.min(...rows.map((r) => r.n));
  const nMax = Math.max(...rows.map((r) => r.n));

  return (
    <ChartCard
      title="O que anda junto com o engajamento"
      subtitle={
        departamentoSelecionado
          ? `${pontos.length} perguntas · ${escopo.assocDaEmpresa ? `nota de ${departamentoSelecionado} × associação da empresa` : `tudo de ${departamentoSelecionado}`}`
          : `${rows.length} perguntas · ${nMin === nMax ? `n=${nMax}` : `n de ${nMin} a ${nMax}`} pessoas`
      }
      icon={Compass}
    >
      {/* Não é mais "este bloco não segue o filtro": metade dele segue. O aviso
          que estava aqui dizia que o dado não existia por área, quando o que
          não existe por área é só a associação -- o % que concorda existe, e
          agora é ele que está plotado. */}
      {departamentoSelecionado && (
        <p className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed">
          {escopo.assocDaEmpresa ? (
            <>
              <strong>Os dois eixos têm origens diferentes.</strong> A altura é o que{' '}
              <strong>{departamentoSelecionado}</strong> respondeu. A posição horizontal é a
              associação com o eNPS medida na <strong>empresa inteira</strong>, porque{' '}
              {departamentoSelecionado} tem menos que as {N_MINIMO_CORRELACAO} respostas que uma
              correlação precisa. Então o gráfico responde: entre as perguntas que movem
              engajamento na Flutter Brazil, quais {departamentoSelecionado} responde pior.
            </>
          ) : (
            <>
              <strong>Os dois eixos são de {departamentoSelecionado}.</strong> A altura é o que a
              área respondeu; a posição horizontal é a associação com o eNPS calculada{' '}
              <strong>dentro dela</strong>. Então o gráfico responde: o que move engajamento nesta
              área — que pode não ser o que move na empresa.
            </>
          )}
          {escopo.suprimidas > 0 && (
            <>
              {' '}
              {escopo.suprimidas} pergunta{escopo.suprimidas === 1 ? '' : 's'} ficou de fora por ter a nota da área
              suprimida (grupo pequeno demais).
            </>
          )}
        </p>
      )}
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 12, right: 20, bottom: 30, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis
            type="number" dataKey="x" domain={['dataMin - 0.03', 'dataMax + 0.03']}
            tick={{ fontSize: 11 }} tickFormatter={(v: number) => fmt2(v)}
            label={{ value: 'anda mais junto com o eNPS →', position: 'insideBottom', offset: -18, fontSize: 11 }}
          />
          <YAxis
            type="number" dataKey="y" domain={['dataMin - 3', 'dataMax + 3']}
            tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v)}%`}
            label={{ value: '% que concorda →', angle: -90, position: 'insideLeft', fontSize: 11 }}
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
                    {Math.round(p.y)}% concordam · nota {fmt2(p.nota)} · associação {fmt2(p.x)}
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
                          {Math.round(p.y)}%
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
          respostas dela acompanham o eNPS da mesma pessoa. Quanto mais acima, maior a parcela que
          concorda (respondeu 4 ou 5). As linhas tracejadas são as medianas das {pontos.length}{' '}
          perguntas — clique num quadrante para ver quais caem nele.{' '}
          {/* Esta frase chegou a ser condicional por meia hora, quando só este
              cartão tinha passado a usar a nota da área e "Por onde começar"
              continuava na da empresa. Voltou a ser incondicional porque a
              troca virou uma função só (`perguntasNoRecorte`) que os dois
              chamam -- com ou sem filtro, a promessa se sustenta. */}
          É a <strong>mesma régua</strong> usada em &quot;Por onde começar&quot;, logo abaixo, e
          sobre a <strong>mesma população</strong>: uma pergunta cai no mesmo quadrante nos dois
          cartões, filtrado ou não.
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
