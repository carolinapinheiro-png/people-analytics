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
    return (
      [...m.entries()]
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
        // ------------------------------------------------------------------
        // ORDENADO PELA AMPLITUDE, NÃO PELA MÉDIA
        // ------------------------------------------------------------------
        // Este cartão existe para dizer "desconfie da média". Ordená-lo PELA
        // média enterrava exatamente o que ele quer destacar: Colaboração, com a
        // maior amplitude do painel (1,1) e a pior pergunta da pesquisa dentro
        // dela, aparecia em sétimo porque a média dela é boa.
        .sort((a, b) => b.amplitude - a.amplitude || a.media - b.media)
    );
  }, [perguntas]);

  if (!perguntas.length) return null;

  // ------------------------------------------------------------------
  // DRIVER DE UMA PERGUNTA SÓ NÃO TEM DISPERSÃO
  // ------------------------------------------------------------------
  // Carga de Trabalho e Crescimento de Carreira têm uma pergunta cada. A barra
  // virava um ponto e a tela dizia "4,2-4,2 · amplitude 0,0", que se lê como
  // "driver muito homogêneo" -- quando não há nada em que ser homogêneo.
  //
  // Some da lista de barras, mas NÃO some da tela: a nota no rodapé diz quais
  // são. Sumir em silêncio faria alguém procurar o driver e achar que a carga
  // não foi medida.
  const comDispersao = dispersao.filter((d) => d.n >= 2);
  const perguntaUnica = dispersao.filter((d) => d.n < 2);

  const escalaMin = Math.min(...comDispersao.map((d) => d.min)) - 0.15;
  const escalaMax = Math.max(...comDispersao.map((d) => d.max)) + 0.15;
  const pos = (v: number) => ((v - escalaMin) / (escalaMax - escalaMin)) * 100;

  return (
    <div className="space-y-4">
      <ChartCard
        title="Dispersão dentro de cada driver"
        subtitle="da pergunta mais baixa à mais alta · ordenado pela amplitude"
        icon={Layers}
      >
        <div className="space-y-2.5">
          {comDispersao.map((d) => (
            <div key={d.driver} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs truncate" title={d.driver}>
                  {d.driver}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                  {/* Quantas perguntas sustentam a barra. Uma amplitude de 1,1
                      entre DUAS perguntas é a distância entre dois pontos; a
                      mesma amplitude entre seis é uma distribuição. São
                      leituras diferentes e o número decide qual é. */}
                  {d.n} pergunta{d.n === 1 ? "" : "s"} · {fmt(d.min)}–{fmt(d.max)} · média{" "}
                  {fmt(d.media)}
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
                  {d.n === 2 &&
                    " Com duas perguntas, a barra é a distância entre elas, não uma distribuição."}
                </p>
              )}
            </div>
          ))}
        </div>
        {perguntaUnica.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
            Fora da lista porque têm <strong>uma pergunta só</strong>, e uma pergunta não tem
            dispersão:{" "}
            {perguntaUnica.map((d, i) => (
              <span key={d.driver}>
                {i > 0 && (i === perguntaUnica.length - 1 ? " e " : ", ")}
                <span className="text-foreground">{d.driver}</span> ({fmt(d.media)})
              </span>
            ))}
            . A nota delas continua valendo — o que não existe ali é amplitude.
          </p>
        )}

        <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
          A barra vai da pergunta mais baixa à mais alta do driver; o traço vertical é a média.
          Barras curtas são temas homogêneos: a média descreve bem o driver inteiro. Barras longas
          escondem um item ruim atrás de itens bons — nesses, agir no driver como um todo desperdiça
          esforço, e a pergunta apontada abaixo da barra é onde está o problema real.
        </p>
      </ChartCard>

      {/* ------------------------------------------------------------------
          A RESSALVA CERTA, DEPOIS DE UMA ERRADA
          ------------------------------------------------------------------
          Aqui dizia: "os drivers só foram carregados no nível da empresa -- há
          um grupo só, sem variação para correlacionar". Isso era falso em
          agosto/26 e provavelmente já era antes. As NOTAS dos drivers estão
          quebradas em cinco recortes -- 9 áreas, 7 faixas de tempo de casa, 3
          marcas, 2 funções e a empresa --, 748 linhas ao todo. Metade da aba
          depende justamente desse dado.
          
          A confusão foi entre duas tabelas: `survey_driver_scores` guarda as
          notas e é quebrada; `survey_driver_importance` guarda a associação com
          o eNPS e NÃO é. Alguém pegou a limitação da segunda e escreveu como se
          fosse da primeira, e a tela passou a negar um dado que ela própria
          usava três cartões acima. */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        <strong>O limite desta leitura:</strong> a associação com o eNPS é calculada na empresa
        inteira — uma linha por pergunta, sem recorte. Dá para dizer quais perguntas mais acompanham
        o engajamento na Flutter Brazil, e a aba mostra isso logo acima. O que ainda não dá é dizer
        se a alavanca de Marketing é a mesma de Technology: para isso a associação precisaria ser
        calculada dentro de cada área, e ela não é. As notas por área existem; o que falta é o
        cálculo da associação sobre elas.
      </p>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        E vale o de sempre: <strong>&quot;acompanha&quot; não é &quot;causa&quot;</strong>. Todas as
        respostas vêm da mesma pessoa no mesmo momento, e quem está satisfeito marca alto em tudo.
        Isso ordena os temas entre si; não promete que mexer num levanta o eNPS.
      </p>
    </div>
  );
}
