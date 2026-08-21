import { useMemo } from "react";
import { Layers } from "lucide-react";
import ChartCard from "@/components/dashboard/ChartCard";
import { COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { EngagementDriver } from "@/lib/experience.functions";

const ESCALA_MAX = 5;

const cor = (s: number) =>
  s >= 4.5 ? COLORS.success : s >= 4.0 ? COLORS.nsx : s >= 3.8 ? COLORS.warning : COLORS.danger;

const fmt = (n: number | null | undefined) =>
  n == null
    ? "—"
    : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Uma pergunta da pesquisa com a nota da onda. */
interface Pergunta {
  driver: string;
  question: string;
  score: number;
  prev: number | null;
  delta: number | null;
}

export default function DriversDeepDive({ drivers }: { drivers: EngagementDriver[] }) {
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
          min,
          max,
          media: vals.reduce((a, b) => a + b, 0) / vals.length,
          amplitude: Math.round((max - min) * 10) / 10,
          pior: ps.reduce((a, b) => (b.score < a.score ? b : a)),
        };
      })
      .sort((a, b) => a.media - b.media);
  }, [perguntas]);

  if (!perguntas.length) return null;

  const escalaMin = Math.min(...dispersao.map((d) => d.min)) - 0.15;
  const escalaMax = Math.max(...dispersao.map((d) => d.max)) + 0.15;
  const pos = (v: number) => ((v - escalaMin) / (escalaMax - escalaMin)) * 100;

  return (
    <div className="space-y-4">
      <ChartCard
        title="Dispersão dentro de cada driver"
        subtitle="da pergunta mais baixa à mais alta · ordenado pela média"
        icon={Layers}
      >
        <div className="space-y-2.5">
          {dispersao.map((d) => (
            <div key={d.driver} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs truncate" title={d.driver}>
                  {d.driver}
                </span>
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
                  Amplitude de {fmt(d.amplitude)} ponto{d.amplitude >= 2 ? "s" : ""} — a média
                  esconde &quot;{d.pior.question}&quot; ({fmt(d.pior.score)}).
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
