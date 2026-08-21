import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Layers, ListOrdered } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import { cn } from '@/lib/utils';
import type { EngagementDriver } from '@/lib/experience.functions';

/**
 * Leitura profunda dos drivers.
 *
 * O QUE ESTAVA FALTANDO
 * A aba já tinha os 8 drivers em acordeão, cada um com sua média. Três coisas
 * ficavam invisíveis nesse formato:
 *
 * 1. O RANKING ENTRE PERGUNTAS. As 32 perguntas só apareciam depois de abrir o
 *    driver certo. Ninguém abre oito acordeões para descobrir que "os processos
 *    de remuneração parecem justos" (3,7) é o piso da empresa.
 *
 * 2. A DISPERSÃO DENTRO DO DRIVER. Um driver com média 4,0 e perguntas entre
 *    3,9 e 4,1 é um problema homogêneo. Um driver com média 4,0 e perguntas
 *    entre 3,7 e 4,4 tem um item ruim escondido atrás de itens bons -- e a
 *    ação é completamente diferente. A média sozinha esconde exatamente o
 *    lugar onde agir.
 *
 * 3. O QUE MUDOU. Só 10 das 32 perguntas têm onda anterior; as outras 22 são
 *    novas. Misturar as duas coisas numa lista de "variação" faria 22 perguntas
 *    aparecerem como estáveis quando na verdade nunca foram medidas antes.
 *    Aqui elas são separadas e contadas.
 *
 * POR QUE NÃO TEM "IMPORTÂNCIA DO DRIVER"
 * O padrão de mercado é cruzar cada driver com o eNPS para achar qual mais
 * puxa o engajamento. Não dá para fazer aqui: os drivers só existem no nível
 * da empresa, sem quebra por área. Correlacionar exigiria variação entre
 * grupos, e há um grupo só. Fazer mesmo assim produziria um ranking de
 * prioridade inventado -- o tipo de número que orienta investimento de verdade
 * e não tem como ser auditado. Fica registrado como pendência, não como
 * estimativa.
 */

const ESCALA_MAX = 5;

const cor = (s: number) =>
  s >= 4.5 ? COLORS.success : s >= 4.0 ? COLORS.nsx : s >= 3.8 ? COLORS.warning : COLORS.danger;

const fmt = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

interface Pergunta {
  driver: string;
  question: string;
  score: number;
  prev: number | null;
  delta: number | null;
}

function Linha({ p, mostrarDriver = true }: { p: Pergunta; mostrarDriver?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex-1 min-w-0">
        <p className="text-xs truncate" title={p.question}>{p.question}</p>
        {mostrarDriver && (
          <p className="text-[10px] text-muted-foreground truncate">{p.driver}</p>
        )}
      </div>
      {p.delta != null && (
        <span
          className={cn(
            'text-[11px] tabular-nums shrink-0 inline-flex items-center gap-0.5',
            p.delta > 0 ? 'text-emerald-500' : p.delta < 0 ? 'text-amber-500' : 'text-muted-foreground',
          )}
        >
          {p.delta > 0 ? <ArrowUp className="h-3 w-3" /> : p.delta < 0 ? <ArrowDown className="h-3 w-3" /> : null}
          {p.delta > 0 ? '+' : ''}{fmt(p.delta)}
        </span>
      )}
      <div className="w-20 hidden sm:block shrink-0">
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${(p.score / ESCALA_MAX) * 100}%`, background: cor(p.score) }} />
        </div>
      </div>
      <span className="text-xs font-semibold tabular-nums w-8 text-right shrink-0" style={{ color: cor(p.score) }}>
        {fmt(p.score)}
      </span>
    </div>
  );
}

export default function DriversDeepDive({
  drivers,
  ondaLabel,
}: {
  drivers: EngagementDriver[];
  /** Onda a que as perguntas se referem, para o subtitulo nao mentir. */
  ondaLabel?: string | null;
}) {
  const [aba, setAba] = useState<'alavancas' | 'forcas' | 'movimento'>('alavancas');

  const perguntas = useMemo<Pergunta[]>(
    () =>
      drivers
        .filter((d) => d.score_current != null)
        .map((d) => ({
          driver: d.driver,
          question: d.question,
          score: Number(d.score_current),
          prev: d.score_prev == null ? null : Number(d.score_prev),
          delta:
            d.score_prev == null || d.score_current == null
              ? null
              : Math.round((Number(d.score_current) - Number(d.score_prev)) * 10) / 10,
        })),
    [drivers],
  );

  const dispersao = useMemo(() => {
    const m = new Map<string, Pergunta[]>();
    for (const p of perguntas) {
      if (!m.has(p.driver)) m.set(p.driver, []);
      m.get(p.driver)!.push(p);
    }
    return [...m.entries()]
      .map(([driver, ps]) => {
        const vals = ps.map((p) => p.score);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        return {
          driver,
          n: ps.length,
          min, max,
          media: vals.reduce((a, b) => a + b, 0) / vals.length,
          amplitude: Math.round((max - min) * 10) / 10,
          pior: ps.reduce((a, b) => (b.score < a.score ? b : a)),
        };
      })
      .sort((a, b) => a.media - b.media);
  }, [perguntas]);

  if (!perguntas.length) return null;

  const ordenadas = [...perguntas].sort((a, b) => a.score - b.score);
  const alavancas = ordenadas.slice(0, 6);
  const forcas = [...ordenadas].reverse().slice(0, 6);
  const comHistorico = perguntas.filter((p) => p.delta != null).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));
  const novas = perguntas.length - comHistorico.length;

  /**
   * O texto abaixo de cada aba era prosa fixa, escrita quando a onda era a de
   * jan/26: afirmava "cinco delas estao em reconhecimento e remuneracao" e
   * "consistentemente abaixo de 4,0". Em ago/26 as seis piores vem de cinco
   * categorias, nenhuma delas remuneracao, e duas marcam exatamente 4,0 -- ou
   * seja, a frase contradizia as linhas logo acima dela.
   *
   * O topo desta aba promete que "cada frase sai dos graficos abaixo e muda
   * sozinha quando o dado mudar". Estas duas nao mudavam. Agora mudam.
   */
  const temaDominante = (lista: Pergunta[]) => {
    const contagem = new Map<string, number>();
    for (const q of lista) contagem.set(q.driver, (contagem.get(q.driver) ?? 0) + 1);
    const [nome, quantas] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    return { nome, quantas, categorias: contagem.size };
  };
  const temaBaixo = temaDominante(alavancas);
  const temaAlto = temaDominante(forcas);
  const abaixoDe4 = alavancas.filter((q) => q.score < 4).length;

  const escalaMin = Math.min(...dispersao.map((d) => d.min)) - 0.15;
  const escalaMax = Math.max(...dispersao.map((d) => d.max)) + 0.15;
  const pos = (v: number) => ((v - escalaMin) / (escalaMax - escalaMin)) * 100;

  const ABAS = [
    { id: 'alavancas' as const, label: 'Onde agir', n: alavancas.length },
    { id: 'forcas' as const, label: 'O que sustentar', n: forcas.length },
    { id: 'movimento' as const, label: 'O que mudou', n: comHistorico.length },
  ];

  return (
    <div className="space-y-4">
      <ChartCard
        title={`As ${perguntas.length} perguntas, ordenadas`}
        subtitle={`escala de 1 a 5${ondaLabel ? ` · ${ondaLabel}` : ''} · as abas mostram os extremos, não a lista toda`}
        icon={ListOrdered}
      >
        <div className="flex gap-1 mb-2 border-b border-border">
          {ABAS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={cn(
                'px-2.5 py-1.5 text-xs border-b-2 -mb-px transition-colors',
                aba === a.id
                  ? 'border-[hsl(var(--flutter))] text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {a.label} <span className="text-[10px] text-muted-foreground">({a.n})</span>
            </button>
          ))}
        </div>

        {aba === 'alavancas' && (
          <>
            <div className="divide-y divide-border/50">
              {alavancas.map((p) => <Linha key={p.question} p={p} />)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2.5 leading-relaxed">
              As {alavancas.length} notas mais baixas da empresa.{' '}
              {temaBaixo.quantas > 1 ? (
                <>
                  {temaBaixo.quantas} delas estão em <strong>{temaBaixo.nome}</strong> — é um tema,
                  não perguntas soltas.
                </>
              ) : (
                <>
                  Vêm de {temaBaixo.categorias} categorias diferentes — aqui não há um tema único, e
                  sim perguntas soltas que caem por motivos distintos.
                </>
              )}{' '}
              {abaixoDe4 === 0
                ? 'Nenhuma fica abaixo de 4,0.'
                : abaixoDe4 === alavancas.length
                  ? 'Todas ficam abaixo de 4,0.'
                  : `${abaixoDe4} de ${alavancas.length} ficam abaixo de 4,0.`}{' '}
              Notas nesta faixa não indicam crise; indicam o lugar onde um ponto ganho custa menos
              esforço.
            </p>
          </>
        )}

        {aba === 'forcas' && (
          <>
            <div className="divide-y divide-border/50">
              {forcas.map((p) => <Linha key={p.question} p={p} />)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2.5 leading-relaxed">
              {temaAlto.quantas > 1 ? (
                <>O topo se concentra em <strong>{temaAlto.nome}</strong>.</>
              ) : (
                <>O topo vem de {temaAlto.categorias} categorias diferentes.</>
              )}{' '}
              Vale como contexto ao ler o risco de retenção: quando as pessoas pensam em sair apesar
              de avaliarem bem estes pontos, o motivo está em outro lugar.
            </p>
          </>
        )}

        {aba === 'movimento' && (
          <>
            <div className="divide-y divide-border/50">
              {comHistorico.map((p) => <Linha key={p.question} p={p} />)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2.5 leading-relaxed">
              Só {comHistorico.length} das {perguntas.length} perguntas existiam na onda de jul/25 —
              as outras {novas} entraram agora e por isso não têm variação. Elas não estão estáveis,
              estão sem comparação: é a primeira medição delas.
            </p>
          </>
        )}
      </ChartCard>

      <ChartCard
        title="Dispersão dentro de cada driver"
        subtitle="da pergunta mais baixa à mais alta · ordenado pela média"
        icon={Layers}
      >
        <div className="space-y-2.5">
          {dispersao.map((d) => (
            <div key={d.driver} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs truncate" title={d.driver}>{d.driver}</span>
                <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                  {fmt(d.min)}–{fmt(d.max)} · média {fmt(d.media)}
                </span>
              </div>
              <div className="relative h-4">
                <div className="absolute inset-y-[7px] left-0 right-0 rounded-full bg-muted" />
                <div
                  className="absolute inset-y-[6px] rounded-full"
                  style={{
                    left: `${pos(d.min)}%`,
                    width: `${Math.max(pos(d.max) - pos(d.min), 0.8)}%`,
                    background: `linear-gradient(90deg, ${cor(d.min)}, ${cor(d.max)})`,
                  }}
                />
                <div
                  className="absolute h-4 w-[2px] rounded-full bg-foreground/70"
                  style={{ left: `${pos(d.media)}%` }}
                  title={`média ${fmt(d.media)}`}
                />
              </div>
              {d.amplitude >= 0.5 && (
                <p className="text-[10px] text-muted-foreground">
                  Amplitude de {fmt(d.amplitude)} ponto{d.amplitude >= 2 ? 's' : ''} — a média esconde
                  &quot;{d.pior.question}&quot; ({fmt(d.pior.score)}).
                </p>
              )}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
          A barra vai da pergunta mais baixa à mais alta do driver; o traço vertical é a média.
          Barras curtas são temas homogêneos: a média descreve bem o driver inteiro. Barras longas
          escondem um item ruim atrás de itens bons — nesses, agir no driver como um todo desperdiça
          esforço, e a pergunta apontada abaixo da barra é onde está o problema real.
        </p>
      </ChartCard>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        <strong>O que ainda não dá para responder:</strong> qual driver mais puxa o eNPS. Isso exige
        comparar áreas com engajamento diferente, e os drivers só foram carregados no nível da
        empresa — há um grupo só, sem variação para correlacionar. Quando a próxima onda vier
        quebrada por área, esta seção ganha um ranking de prioridade de verdade. Até lá, a ordem
        acima é por nota, não por impacto.
      </p>
    </div>
  );
}
