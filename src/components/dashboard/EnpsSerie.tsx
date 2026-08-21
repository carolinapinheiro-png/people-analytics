import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import ChartCard from "@/components/dashboard/ChartCard";
import { COLORS } from "@/lib/colors";
import type { OndaEnps, PontoOnda } from "@/lib/experience.functions";

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
 * O HOVER EXISTE PORQUE O eNPS É UMA SUBTRAÇÃO
 * ------------------------------------------------------------------
 * eNPS 60 pode ser "80% promotores, 20% detratores" ou "60% promotores, 40%
 * passivos e nenhum detrator". O mesmo número, e duas conversas diferentes: a
 * primeira tem gente ativamente insatisfeita, a segunda tem gente morna.
 *
 * E o tamanho muda tudo: Finance caiu 34 pontos com 24 respostas -- ali uma
 * pessoa move o índice em 4 pontos. Uma queda grande numa área pequena e uma
 * numa área grande desenham o mesmo traço e significam coisas muito
 * diferentes.
 *
 * Nada disso cabe no gráfico sem poluí-lo. Cabe no hover.
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
  COLORS.flutter,
  COLORS.success,
  COLORS.warning,
  COLORS.danger,
  COLORS.info,
  "#a855f7",
  "#14b8a6",
  "#f97316",
  "#84cc16",
];

const pct = (parte: number | null, total: number | null) =>
  parte == null || !total ? null : Math.round((parte / total) * 100);

interface Alvo {
  area: string;
  cor: string;
  ondaLabel: string;
  ponto: PontoOnda;
  x: number;
  y: number;
}

export default function EnpsSerie({ ondas }: { ondas: OndaEnps[] }) {
  const [alvo, setAlvo] = useState<Alvo | null>(null);

  const { areas, min, max } = useMemo(() => {
    const ultima = ondas.at(-1);
    // A ordem sai da última onda: é a leitura de ranking de graça, e mantém os
    // rótulos da direita sem colisão na maioria dos casos.
    const nomes = [...(ultima?.pontos ?? [])].sort((a, b) => b.enps - a.enps).map((p) => p.scope);

    const areas = nomes.map((scope, i) => ({
      scope,
      cor: PALETA[i % PALETA.length],
      // `null` onde a área não respondeu naquela onda -- a linha corta ali em
      // vez de descer até zero. Zero seria uma queda que não aconteceu.
      pontos: ondas.map((o) => o.pontos.find((p) => p.scope === scope) ?? null),
    }));

    const vals = areas
      .flatMap((a) => a.pontos)
      .filter((p): p is PontoOnda => p != null)
      .map((p) => p.enps);
    return vals.length
      ? { areas, min: Math.min(...vals) - 6, max: Math.max(...vals) + 6 }
      : { areas, min: 0, max: 100 };
  }, [ondas]);

  if (ondas.length < 3 || areas.length === 0) return null;

  const x = (i: number) => PAD_LEFT + (i / (ondas.length - 1)) * (W - PAD_LEFT - LABEL_W);
  const y = (v: number) => PAD_TOP + ((max - v) / (max - min)) * (H - PAD_TOP - PAD_BOTTOM);

  /** Rótulos da direita com afastamento mínimo, igual ao slope. */
  const finais = areas.map((a) => a.pontos.at(-1)?.enps ?? null);
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
      {/* ------------------------------------------------------------------
          POR QUE DOIS CONTÊINERES
          ------------------------------------------------------------------
          `overflow-x-auto` estava no mesmo div que ancora o balão. Só que em
          CSS, quando um eixo deixa de ser `visible`, o outro vira `auto`
          junto -- não existe "corta só na horizontal". O div tinha exatamente
          a altura do SVG (320px) e o balão tem 224px, então num ponto baixo
          ele era cortado em 177px: aparecia menos de um quarto dele.

          Agora o `overflow` vive num wrapper interno, que só embrulha o SVG e
          existe para o gráfico rolar na horizontal em tela estreita. O balão
          fica no contêiner de fora, que não corta nada. */}
      <div className="w-full relative">
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full min-w-[520px]"
            style={{ height: H }}
            role="img"
            aria-label={`eNPS por área em ${ondas.length} ondas de pesquisa`}
            onMouseLeave={() => setAlvo(null)}
          >
            {/* Guias verticais: uma por onda. */}
            {ondas.map((o, i) => (
              <g key={o.wave}>
                <line
                  x1={x(i)}
                  x2={x(i)}
                  y1={PAD_TOP - 8}
                  y2={H - PAD_BOTTOM + 4}
                  stroke="var(--chart-grid)"
                  strokeWidth={1}
                />
                <text
                  x={x(i)}
                  y={H - PAD_BOTTOM + 20}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--chart-tick)"
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
              a.pontos.forEach((p, i) => {
                if (p == null) {
                  if (atual.length) trechos.push(atual);
                  atual = [];
                  return;
                }
                atual.push({ x: x(i), y: y(p.enps) });
              });
              if (atual.length) trechos.push(atual);

              const fim = a.pontos.at(-1);
              // Com o mouse numa área, as outras recuam. Oito linhas cruzando é
              // exatamente onde o olho perde a que interessa -- e a que interessa
              // é a que a pessoa apontou.
              const apagada = alvo != null && alvo.area !== a.scope;
              return (
                <g
                  key={a.scope}
                  opacity={apagada ? 0.18 : 1}
                  style={{ transition: "opacity 120ms" }}
                >
                  {trechos.map((t, ti) => (
                    <polyline
                      key={ti}
                      points={t.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke={a.cor}
                      strokeWidth={alvo?.area === a.scope ? 3 : 2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      opacity={0.9}
                    />
                  ))}
                  {a.pontos.map((p, i) =>
                    p == null ? null : (
                      <circle
                        key={i}
                        cx={x(i)}
                        cy={y(p.enps)}
                        r={alvo?.area === a.scope && alvo.ondaLabel === ondas[i].label ? 5 : 3}
                        fill={a.cor}
                      />
                    ),
                  )}
                  {fim != null && (
                    <text
                      x={W - LABEL_W + 8}
                      y={yRot[ai] + 4}
                      fontSize={11}
                      fill="var(--chart-tick)"
                    >
                      <tspan fontWeight={600} fill={a.cor}>
                        {fim.enps}
                      </tspan>
                      <tspan dx={6}>{a.scope}</tspan>
                    </text>
                  )}
                </g>
              );
            })}

            {/* ----------------------------------------------------------------
              AS ÁREAS DE ACERTO VÊM POR ÚLTIMO, E SÃO MAIORES QUE OS PONTOS
              ----------------------------------------------------------------
              Um ponto de raio 3 é praticamente impossível de acertar com o
              mouse -- e um gráfico que só responde quando a pessoa mira bem
              parece quebrado, não exigente. Círculos invisíveis de raio 11
              fazem o alvo caber no gesto.

              Depois de todas as linhas para ficarem por cima delas: desenhados
              antes, a própria linha da área ao lado roubaria o evento.
          ---------------------------------------------------------------- */}
            {areas.map((a) =>
              a.pontos.map((p, i) =>
                p == null ? null : (
                  <circle
                    key={`${a.scope}-${i}`}
                    cx={x(i)}
                    cy={y(p.enps)}
                    r={11}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() =>
                      setAlvo({
                        area: a.scope,
                        cor: a.cor,
                        ondaLabel: ondas[i].label,
                        ponto: p,
                        x: x(i),
                        y: y(p.enps),
                      })
                    }
                  />
                ),
              ),
            )}
          </svg>
        </div>

        {alvo && (
          <div
            className="absolute pointer-events-none z-10 rounded-lg border border-border bg-popover px-3 py-2 shadow-lg min-w-[210px]"
            style={{
              // O `x` está em unidades do viewBox e o SVG estica com a
              // largura, então a posição horizontal vira porcentagem. A
              // vertical é direta: a altura do SVG é fixa em H.
              left: `${(alvo.x / W) * 100}%`,
              // ------------------------------------------------------------
              // ABAIXO DO PONTO, OU ACIMA QUANDO NÃO CABE
              // ------------------------------------------------------------
              // O balão ia sempre para baixo. Com 224px de altura num gráfico
              // de 320, qualquer ponto da metade de baixo o jogava para fora.
              //
              // Ancorar pela BASE (`bottom`) e não pelo topo é o truque que
              // evita medir: o navegador cresce o balão para cima sozinho,
              // seja qual for o conteúdo. Um `top` calculado precisaria da
              // altura, que muda com o aviso de área pequena.
              ...(alvo.y > H * 0.45 ? { bottom: H - alvo.y + 14 } : { top: alvo.y + 14 }),
              // Perto da borda direita o balão viraria para dentro da tela.
              transform: alvo.x > W * 0.62 ? "translateX(-100%)" : "translateX(-40%)",
            }}
          >
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {alvo.ondaLabel}
            </p>
            <p className="text-sm font-semibold" style={{ color: alvo.cor }}>
              {alvo.area}
            </p>

            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">{alvo.ponto.enps}</span>
              <span className="text-[11px] text-muted-foreground">
                eNPS · {alvo.ponto.n ?? "—"} respostas
              </span>
            </div>

            {/* A composição por trás da subtração. Absoluto E porcentagem:
                "17 de 24" e "71%" respondem perguntas diferentes, e quem lê
                usa as duas. */}
            <div className="mt-2 space-y-0.5 text-[11px]">
              {(
                [
                  ["Promotores", alvo.ponto.promotores, COLORS.success],
                  ["Passivos", alvo.ponto.passivos, COLORS.gray400],
                  ["Detratores", alvo.ponto.detratores, COLORS.danger],
                ] as const
              ).map(([rotulo, valor, cor]) => (
                <div key={rotulo} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ background: cor }} />
                    {rotulo}
                  </span>
                  <span className="tabular-nums">
                    {valor ?? "—"}
                    {pct(valor, alvo.ponto.n) != null && (
                      <span className="text-muted-foreground"> · {pct(valor, alvo.ponto.n)}%</span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-2 pt-1.5 border-t border-border/60 flex items-center justify-between gap-3 text-[11px]">
              <span className="text-muted-foreground">Risco de saída</span>
              <span className="tabular-nums">
                {alvo.ponto.risco == null ? "—" : `${alvo.ponto.risco}%`}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="text-muted-foreground">Satisfação</span>
              <span className="tabular-nums">{alvo.ponto.satisfacao ?? "—"}</span>
            </div>

            {/* A ressalva que só aparece quando é verdade. Com n pequeno, o
                movimento do índice diz mais sobre o tamanho da área do que
                sobre o que as pessoas acham. */}
            {alvo.ponto.n != null && alvo.ponto.n > 0 && alvo.ponto.n < 30 && (
              <p className="mt-2 text-[10px] leading-snug text-amber-600 dark:text-amber-500">
                Área pequena: uma pessoa move o eNPS em {Math.round((100 / alvo.ponto.n) * 10) / 10}{" "}
                pontos.
              </p>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
        Uma linha por área — passe o mouse num ponto para ver a composição por trás do número. Onde
        a linha interrompe, a área não respondeu naquela onda: o traço não atravessa o buraco,
        porque atravessar afirmaria uma trajetória que ninguém mediu.
      </p>
    </ChartCard>
  );
}
