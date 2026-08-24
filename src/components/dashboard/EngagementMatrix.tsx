import { useMemo } from "react";
import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  LabelList,
} from "recharts";
import { Target } from "lucide-react";
import ChartCard from "@/components/dashboard/ChartCard";
import { COLORS } from "@/lib/colors";
import { classifyAreas, MINIMO_PARA_COMPARAR } from "@/lib/area-priority";
import {
  cruzarAreasComPerguntas,
  type PerguntaPrioritaria,
  type NotaDeArea,
} from "@/lib/cruzamento-area-pergunta";
import type { EngagementContextRow } from "@/lib/engagement-context";

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
  x: number;
  y: number;
  z: number;
  nome: string;
  quadrante: string;
  /** Veredito decidido por margem menor que uma resposta. Ver area-priority. */
  noLimite: boolean;
}

const QUADRANTES = {
  cuidar: {
    label: "Manter e aprender",
    desc: "Engajamento acima da mediana e risco abaixo. É onde vale entender o que está funcionando para tentar repetir.",
    color: COLORS.success,
  },
  vigiar: {
    label: "Engajado, mas de saída",
    desc: "Gostam da empresa e mesmo assim pensam em sair. Quase sempre é carreira ou remuneração, não clima.",
    color: COLORS.warning,
  },
  agir: {
    label: "Agir primeiro",
    desc: "Engajamento abaixo da mediana e risco acima. Combinação que costuma virar saída nos meses seguintes.",
    color: COLORS.danger,
  },
  ouvir: {
    label: "Baixo engajamento, risco contido",
    desc: "Insatisfação sem intenção de sair. Tende a aparecer como queda de entrega antes de aparecer como turnover.",
    color: COLORS.info,
  },
} as const;

export default function EngagementMatrix({
  rows,
  ondaLabel,
  prioritarias = [],
  notasPorArea = [],
  notaDaEmpresa,
  onEscolherArea,
}: {
  rows: EngagementContextRow[];
  /** As perguntas que mais rendem, do card de importância. */
  prioritarias?: PerguntaPrioritaria[];
  /** Nota por pergunta e por área, para o cruzamento. */
  notasPorArea?: NotaDeArea[];
  /** Régua da empresa por pergunta. */
  notaDaEmpresa?: ReadonlyMap<string, number | null>;
  /** Clicar numa bolha abre aquela área na fila logo acima. */
  onEscolherArea?: (area: string) => void;
  /**
   * Onda a que os pontos se referem. Vinha escrita "jan/2026" no código
   * enquanto os dados plotados eram os da onda corrente -- quem cruzasse com a
   * tabela de risco declarado, essa sim de jan/26, encontrava contradição.
   */
  ondaLabel?: string | null;
}) {
  const { pontos, corteX, corteY, limX, limY } = useMemo(() => {
    // ------------------------------------------------------------------
    // A MESMA REGRA DA FILA, E NÃO UMA CÓPIA
    // ------------------------------------------------------------------
    // Esta matriz calculava a própria mediana aqui dentro enquanto a fila por
    // área usava `classifyAreas`, que tinha outra regra. As duas classificavam
    // as MESMAS oito áreas e discordavam na mesma rolagem -- Product saía
    // "agir primeiro" aqui e "sem sinal de alerta" lá.
    //
    // Agora as duas chamam o mesmo classificador. Se a régua mudar de novo,
    // muda nos dois lugares por construção, não por disciplina.
    //
    // "Betfair" é marca e entra em todas as áreas; `classifyAreas` já a
    // descarta pelo `dept == null`, então não há filtro duplicado aqui.
    const c = classifyAreas(rows);
    const cx = c.medianaEnps;
    const cy = c.medianaRisco;

    const porScope = new Map(c.itens.map((i) => [i.scope, i]));
    const pontos: Ponto[] = rows
      .filter((r) => porScope.has(r.scope) && r.retentionRisk != null)
      .map((r) => {
        const cl = porScope.get(r.scope)!;
        return {
          x: cl.enps,
          y: r.retentionRisk as number,
          // Sem headcount a bolha vira do menor tamanho em vez de sumir: a área
          // continua posicionada, que é a informação principal aqui.
          z: r.headcountMedio ?? 20,
          nome: r.scope,
          quadrante:
            cl.veredito === "agir"
              ? "agir"
              : cl.veredito === "vigiar"
                ? "vigiar"
                : cl.veredito === "ouvir"
                  ? "ouvir"
                  : "cuidar",
          noLimite: cl.noLimite,
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

  // O cruzamento: para cada área que a régua marcou como prioritária, quais
  // perguntas que mais rendem estão especialmente mal ALI.
  const achados = useMemo(() => {
    const prioritariasDaMatriz = pontos.filter((p) => p.quadrante === "agir").map((p) => p.nome);
    if (!prioritariasDaMatriz.length || !notaDaEmpresa) return [];
    return cruzarAreasComPerguntas(prioritariasDaMatriz, prioritarias, notasPorArea, notaDaEmpresa);
  }, [pontos, prioritarias, notasPorArea, notaDaEmpresa]);

  // O mesmo mínimo do classificador, e não um 3 escrito à mão aqui. Com menos
  // áreas que isso a mediana é a própria área, e a matriz desenharia quadrantes
  // em volta de um ponto só -- ver o topo de `area-priority.ts`. Amarrado na
  // constante para os dois não divergirem no dia em que o número mudar.
  if (pontos.length < MINIMO_PARA_COMPARAR) return null;

  const porQuadrante = (q: string) => pontos.filter((p) => p.quadrante === q);

  return (
    <ChartCard
      title="Matriz de ação"
      subtitle={`eNPS × risco de saída${ondaLabel ? ` · ${ondaLabel}` : ""} · bolha = tamanho da área · canto superior direito é o melhor`}
      icon={Target}
    >
      <ResponsiveContainer width="100%" height={330}>
        <ScatterChart margin={{ top: 16, right: 24, bottom: 28, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis
            type="number"
            dataKey="x"
            name="eNPS"
            domain={limX}
            tick={{ fontSize: 11 }}
            label={{
              value: "eNPS  →  mais promotores",
              position: "insideBottom",
              offset: -16,
              fontSize: 11,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Risco"
            unit="%"
            reversed
            domain={limY}
            tick={{ fontSize: 11 }}
            label={{
              value: "risco de saída  ↑ menos risco",
              angle: -90,
              position: "insideLeft",
              fontSize: 11,
            }}
          />
          <ZAxis type="number" dataKey="z" range={[80, 900]} name="Headcount" />

          {/* Os quatro quadrantes pintados por baixo dos pontos. Sem isso é
              preciso descer até os cards para saber em que zona cada bolha
              caiu -- e ninguém faz isso no meio de uma apresentação. */}
          {(
            [
              ["ouvir", limX[0], corteX, limY[0], corteY, "insideTopLeft"],
              ["cuidar", corteX, limX[1], limY[0], corteY, "insideTopRight"],
              ["agir", limX[0], corteX, corteY, limY[1], "insideBottomLeft"],
              ["vigiar", corteX, limX[1], corteY, limY[1], "insideBottomRight"],
            ] as const
          ).map(([q, x1, x2, y1, y2, pos]) => (
            <ReferenceArea
              key={q}
              x1={x1}
              x2={x2}
              y1={y1}
              y2={y2}
              fill={QUADRANTES[q].color}
              fillOpacity={0.06}
              stroke="none"
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
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={{ fontSize: 12 }}
            formatter={(value: number, name: string) =>
              name === "Risco"
                ? [`${value}%`, "Risco de retenção"]
                : name === "Headcount"
                  ? [value, "Headcount médio"]
                  : [value, name]
            }
            labelFormatter={() => ""}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Ponto;
              const q = QUADRANTES[p.quadrante as keyof typeof QUADRANTES];
              return (
                <div className="rounded-md border border-border bg-popover p-2.5 text-xs shadow-md max-w-[240px]">
                  <div className="font-medium mb-1">{p.nome}</div>
                  <div className="text-muted-foreground">
                    eNPS {p.x} · risco {p.y}%
                  </div>
                  <div className="text-muted-foreground">~{p.z} pessoas</div>
                  <div
                    className="mt-1.5 pt-1.5 border-t border-border/60"
                    style={{ color: q.color }}
                  >
                    {q.label}
                  </div>
                  {onEscolherArea && (
                    <div className="mt-1.5 text-[11px] text-muted-foreground">
                      Clique para ver as perguntas desta área.
                    </div>
                  )}
                  {p.noLimite && (
                    <div className="mt-1.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-500">
                      No limite: este veredito foi decidido por uma distância menor do que uma única
                      resposta moveria. Pode virar sozinho na próxima onda.
                    </div>
                  )}
                </div>
              );
            }}
          />
          {(Object.keys(QUADRANTES) as Array<keyof typeof QUADRANTES>).map((q) => (
            <Scatter
              key={q}
              name={QUADRANTES[q].label}
              data={porQuadrante(q)}
              fill={QUADRANTES[q].color}
              fillOpacity={0.72}
              // O clique fica AQUI, e não só no <circle> do shape. O payload
              // chega certinho dentro do shape (é o que desenha o contorno
              // tracejado), mas o evento de clique não atravessa até lá -- a
              // Recharts monta uma camada própria para tooltip por cima. No
              // Scatter ela entrega o dado e o clique junto.
              cursor={onEscolherArea ? "pointer" : undefined}
              onClick={(d: unknown) => {
                const p = d as { nome?: string; payload?: { nome?: string } };
                const nome = p?.nome ?? p?.payload?.nome;
                if (nome) onEscolherArea?.(nome);
              }}
              // Contorno tracejado = veredito no limite. Preenchimento sólido
              // afirma; tracejado deixa a borda "aberta", que é a leitura certa
              // para um rótulo que uma pessoa a mais viraria.
              shape={(props: { cx?: number; cy?: number; payload?: Ponto; r?: number }) => {
                const { cx, cy, payload } = props;
                const raio = Math.max(5, Math.sqrt((payload?.z ?? 20) / Math.PI) * 2.2);
                return (
                  <g>
                    <circle
                      onClick={() => payload && onEscolherArea?.(payload.nome)}
                      style={{ cursor: onEscolherArea ? "pointer" : undefined }}
                      cx={cx}
                      cy={cy}
                      r={raio}
                      fill={QUADRANTES[q].color}
                      fillOpacity={0.72}
                      stroke={payload?.noLimite ? QUADRANTES[q].color : "none"}
                      strokeWidth={payload?.noLimite ? 1.5 : 0}
                      strokeDasharray={payload?.noLimite ? "3 2" : undefined}
                    />
                  </g>
                );
              }}
            >
              <LabelList
                dataKey="nome"
                position="top"
                style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              />
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
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ background: QUADRANTES[q].color }}
                />
                <span className="text-xs font-medium">{QUADRANTES[q].label}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5">
                {QUADRANTES[q].desc}
              </p>
              <p className="text-[11px]">
                {areas.length ? (
                  areas.map((a) => a.nome).join(", ")
                ) : (
                  <span className="text-muted-foreground">nenhuma área</span>
                )}
              </p>
            </div>
          );
        })}
      </div>

      {/* ------------------------------------------------------------------
          A METADE QUE FALTAVA
          ------------------------------------------------------------------
          A matriz dizia onde agir e parava aí. Quem lia precisava descer até o
          gráfico de perguntas, decorar quais rendem mais, e cruzar de cabeça
          com as áreas daqui. Agora a conta vem feita. */}
      {achados.length > 0 && (
        <div className="mt-3 rounded-md border border-border bg-secondary/40 p-3">
          <p className="text-xs font-medium mb-2">Onde agir primeiro, e em quê</p>
          <div className="space-y-2">
            {achados.map((a) => (
              <p key={a.area} className="text-[11.5px] leading-relaxed text-muted-foreground">
                Em <strong className="text-foreground">{a.area}</strong>, das perguntas que mais
                rendem, {a.perguntas.length === 1 ? "uma está" : `${a.perguntas.length} estão`} bem
                abaixo da empresa:{" "}
                {a.perguntas.map((q, idx) => (
                  <span key={q.question}>
                    {idx > 0 && (idx === a.perguntas.length - 1 ? " e " : ", ")}
                    <span className="text-foreground">“{q.question.replace(/\.$/, "")}”</span>{" "}
                    <span className="tabular-nums text-amber-600 dark:text-amber-500">
                      {q.area}% contra {q.empresa}%
                    </span>
                  </span>
                ))}
                .
              </p>
            ))}
          </div>
          <p className="text-[10.5px] text-muted-foreground/80 mt-2 leading-relaxed">
            Só perguntas com pelo menos 8 pontos percentuais de diferença e cinco respostas na área.
            Área que aparece na matriz e não aqui está mal pela combinação de eNPS e risco, não por
            uma pergunta específica — o problema dela não está nesta lista.
          </p>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        Bolha com <strong>contorno tracejado</strong> teve o veredito decidido por uma margem menor
        do que uma única resposta moveria — o rótulo vale, mas não é estável. Passe o mouse para ver
        de quanto foi. As linhas tracejadas são a <strong>mediana</strong> do grupo (eNPS {corteX},
        risco {corteY}%), não uma meta. Metade das áreas cai de cada lado por construção — então
        &quot;abaixo da linha&quot; significa &quot;abaixo das outras&quot;, não &quot;ruim&quot;.
        Quando houver meta acordada, trocamos a linha e a leitura passa a ser absoluta.
      </p>
    </ChartCard>
  );
}
