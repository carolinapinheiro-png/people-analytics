import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import ChartCard from "@/components/dashboard/ChartCard";
import { COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { OndaEnps, PontoOnda } from "@/lib/experience.functions";

/**
 * Os três indicadores por área ao longo das ondas.
 *
 * ------------------------------------------------------------------
 * ERA UM GRÁFICO SÓ, E NOVE LINHAS NÃO CABEM NUM
 * ------------------------------------------------------------------
 * Este cartão mostrava só o eNPS, com uma linha por área e o nome de cada uma
 * na ponta direita. Lendo a aba pela primeira vez, a Marilia travou aqui: as
 * linhas passam perto demais umas das outras e os rótulos disputam o mesmo
 * espaço vertical. Havia até um algoritmo de afastamento mínimo entre rótulos
 * -- sinal de que o problema já era conhecido e estava sendo remendado em vez
 * de resolvido.
 *
 * Ela pediu três colunas: eNPS, satisfação e retenção. As três resolvem duas
 * coisas de uma vez.
 *
 *   O ESPAÇO. Sem rótulo na ponta, cada painel fica estreito e limpo. A
 *   identidade das áreas migra para a legenda de baixo, que é lida uma vez em
 *   vez de nove vezes por gráfico.
 *
 *   A LEITURA CRUZADA. Passar o mouse numa área a destaca NOS TRÊS painéis ao
 *   mesmo tempo, e apaga as outras. Aí aparece o que um gráfico só nunca
 *   mostrou: a área que cai em eNPS mas não em satisfação, ou a que mantém o
 *   eNPS enquanto o risco de saída sobe. São conversas diferentes, e antes
 *   dependiam de alguém abrir três telas e lembrar dos números.
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
 * eixo, tooltip -- é justamente o que faria a leitura ficar mais lenta.
 */

const H = 226;
const PAD_TOP = 16;
const PAD_BOTTOM = 30;
const PAD_LEFT = 8;
const PAD_RIGHT = 10;
const W = 340;

/**
 * Uma cor por área, estável entre renderizações E entre os três painéis.
 *
 * O índice vem da ordem de eNPS na última onda, então a área do topo é sempre
 * a mesma cor dentro de uma sessão. Com três gráficos lado a lado a cor deixou
 * de ser só identidade e virou a costura entre eles: é ela que deixa seguir
 * Marketing do primeiro painel ao terceiro sem reler a legenda.
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

const fmt1 = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/**
 * As três métricas, e o que cada uma tem de diferente.
 *
 * `inverso` marca a única em que SUBIR é ruim. Sem isso, um leitor que
 * atravessa os três painéis da esquerda para a direita lê a terceira subida
 * como boa notícia -- e ela é o oposto. A nota sob o título diz isso em
 * palavras, porque cor sozinha não sobrevive a um print em preto e branco.
 */
const METRICAS = [
  {
    chave: "enps" as const,
    titulo: "eNPS",
    nota: "maior é melhor",
    valor: (p: PontoOnda) => p.enps as number | null,
    formatar: (v: number) => String(Math.round(v)),
    inverso: false,
  },
  {
    chave: "satisfacao" as const,
    titulo: "Satisfação",
    nota: "média de 0 a 10 · maior é melhor",
    valor: (p: PontoOnda) => p.satisfacao,
    formatar: (v: number) => fmt1(v),
    inverso: false,
  },
  {
    chave: "risco" as const,
    titulo: "Risco de saída",
    nota: "% · menor é melhor",
    valor: (p: PontoOnda) => p.risco,
    formatar: (v: number) => `${fmt1(v)}%`,
    inverso: true,
  },
];

type Metrica = (typeof METRICAS)[number];

interface Alvo {
  area: string;
  cor: string;
  ondaLabel: string;
  ponto: PontoOnda;
  metrica: string;
  x: number;
  y: number;
}

interface AreaSerie {
  scope: string;
  cor: string;
  pontos: Array<PontoOnda | null>;
}

export default function EnpsSerie({
  ondas,
  dimensao = "área",
  dimensaoPlural = "áreas",
  departamentoSelecionado = null,
  daArea = null,
  minimoOndas = 3,
  ondasSemDado = [],
}: {
  ondas: OndaEnps[];
  /**
   * Ondas que existem na pesquisa mas não têm este recorte.
   *
   * Uma série de dois pontos embaixo de uma de três levanta a pergunta na
   * hora, e a resposta some se ninguém a escrever. Aqui ela é do DADO --
   * jul/25 não fez a pergunta de marca --, e não da agregação; a diferença é a
   * que este painel mais errou, então vale dizer de qual lado está.
   */
  ondasSemDado?: string[];
  /**
   * Quantas ondas a série exige para aparecer.
   *
   * ------------------------------------------------------------------
   * TRÊS PARA ÁREA, DUAS PARA O RESTO -- E A DIFERENÇA É REAL
   * ------------------------------------------------------------------
   * Por área o mínimo é três porque existe ALTERNATIVA: com duas ondas a
   * EngagementTab desenha o slope, que responde melhor "o que mudou desde a
   * última pesquisa". Exigir três aqui não esconde nada; troca de desenho.
   *
   * Por marca não há slope. Exigir três significa não mostrar nada -- e foi o
   * que aconteceu: a série de marca nasceu invisível, porque `marca` só existe
   * em ago/26 e jan/26 (jul/25 não coletou a pergunta). O cartão foi entregue
   * hoje e nunca chegou à tela.
   *
   * Peguei olhando o banco depois de pronto, não escrevendo o código. Uma
   * constante que servia a um caso foi aplicada a outro sem que a razão dela
   * fosse revisitada -- exatamente a forma dos outros casos desta semana,
   * desta vez cometida por mim, hoje.
   */
  minimoOndas?: number;
  /**
   * O nome do que cada linha representa: "área", "marca".
   *
   * ------------------------------------------------------------------
   * O MESMO COMPONENTE SERVE ÀS DUAS SÉRIES
   * ------------------------------------------------------------------
   * A série por marca nasceu de uma pergunta da Marilia -- "o painel cruza
   * períodos e marcas?" -- e tem exatamente a forma da série por área: uma
   * linha por recorte, três indicadores, as mesmas ondas.
   *
   * Escrever um segundo componente daria dois lugares para consertar cada bug
   * de leitura e duas chances de divergirem. Este painel já teve dois cartões
   * de risco mostrando ondas diferentes com o mesmo título; a lição custou
   * caro o bastante para valer uma prop.
   */
  dimensao?: string;
  dimensaoPlural?: string;
  /** Só para a nota do que falta. Ver abaixo. */
  departamentoSelecionado?: string | null;
  /** Nome da área quando a série É dela; null quando é a da empresa. */
  daArea?: string | null;
}) {
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  // A área destacada pode vir do ponto (hover no gráfico) ou da legenda. As
  // duas alimentam o mesmo realce nos três painéis.
  const [areaFoco, setAreaFoco] = useState<string | null>(null);
  const foco = alvo?.area ?? areaFoco;

  const areas = useMemo<AreaSerie[]>(() => {
    const ultima = ondas.at(-1);
    // A ordem sai da última onda: é a leitura de ranking de graça, e fixa a
    // correspondência cor -> área para os três painéis e para a legenda.
    const nomes = [...(ultima?.pontos ?? [])]
      .sort((a, b) => b.enps - a.enps)
      .map((p) => p.scope);

    return nomes.map((scope, i) => ({
      scope,
      cor: PALETA[i % PALETA.length],
      // `null` onde a área não respondeu naquela onda -- a linha corta ali em
      // vez de descer até zero. Zero seria uma queda que não aconteceu.
      pontos: ondas.map((o) => o.pontos.find((p) => p.scope === scope) ?? null),
    }));
  }, [ondas]);

  if (ondas.length < minimoOndas || areas.length === 0) return null;

  // ======================================================================
  // FILTRO SEM CRUZAMENTO: A NOTA, NÃO A SÉRIE DA EMPRESA
  // ======================================================================
  // Mesma regra do tempo de casa. Com uma área escolhida, mostrar a série da
  // empresa aqui seria pôr o número dela no lugar da resposta pedida.
  if (departamentoSelecionado && daArea == null && dimensao !== "área") {
    return (
      <ChartCard
        title={`Os três indicadores por ${dimensao} ao longo das pesquisas`}
        subtitle={departamentoSelecionado}
        icon={Activity}
      >
        <p className="text-sm text-muted-foreground py-5 leading-relaxed">
          O cruzamento entre área e {dimensao} não foi calculado nas ondas já carregadas, então não
          há esta série para{" "}
          <strong className="text-foreground">{departamentoSelecionado}</strong>. Não é limite do
          dado — cada resposta traz os dois campos juntos —, e reimportar as ondas passa a trazer.
          Até lá fica de fora, em vez de mostrar as {dimensaoPlural} da empresa inteira no lugar.
        </p>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title={`Os três indicadores por ${dimensao} ao longo das pesquisas`}
      subtitle={`${ondas.length} ondas · ${ondas[0].label} → ${ondas.at(-1)?.label}${
        daArea ? ` · ${daArea}` : ""
      }`}
      icon={Activity}
    >
      <div className="grid gap-x-4 gap-y-5 md:grid-cols-3">
        {METRICAS.map((m) => (
          <Painel
            key={m.chave}
            metrica={m}
            ondas={ondas}
            areas={areas}
            foco={foco}
            alvo={alvo}
            onAlvo={setAlvo}
            dimensao={dimensao}
          />
        ))}
      </div>

      {/* ------------------------------------------------------------------
          A LEGENDA É O QUE SUBSTITUIU OS RÓTULOS DE PONTA
          ------------------------------------------------------------------
          Os nomes repetidos em três gráficos seriam o triplo de textos
          disputando espaço. Aqui são nove, lidos uma vez, com os três números
          finais juntos -- o que também responde ao pedido de ver eNPS, risco e
          satisfação sem precisar guardar de cabeça. */}
      <div className="mt-4 pt-3 border-t border-border/60">
        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((a) => {
            const fim = a.pontos.at(-1);
            const apagada = foco != null && foco !== a.scope;
            return (
              <button
                key={a.scope}
                type="button"
                className={cn(
                  "flex items-center gap-2 rounded px-1 py-0.5 text-left text-[11px] transition-opacity",
                  apagada ? "opacity-35" : "opacity-100",
                  foco === a.scope && "bg-muted/60",
                )}
                onMouseEnter={() => setAreaFoco(a.scope)}
                onMouseLeave={() => setAreaFoco(null)}
                onFocus={() => setAreaFoco(a.scope)}
                onBlur={() => setAreaFoco(null)}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: a.cor }}
                />
                <span className="min-w-0 flex-1 truncate">{a.scope}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {fim == null ? "—" : Math.round(fim.enps)}
                  {" · "}
                  {fim == null ? "—" : fmt1(fim.satisfacao)}
                  {" · "}
                  {fim == null || fim.risco == null ? "—" : `${fmt1(fim.risco)}%`}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          os três números são da última onda, na ordem dos gráficos
        </p>
      </div>

      {ondasSemDado.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
          <strong className="text-foreground">
            {ondasSemDado.join(', ')} {ondasSemDado.length > 1 ? 'ficam' : 'fica'} de fora
          </strong>{' '}
          porque {ondasSemDado.length > 1 ? 'aquelas pesquisas não perguntaram' : 'aquela pesquisa não perguntou'}{' '}
          a {dimensao} de quem respondeu. Não é recorte que deixou de ser calculado: a pergunta não
          foi feita, então não há o que recortar. A série começa na primeira onda que a trouxe.
        </p>
      )}
      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        Passe o mouse numa {dimensao} — no gráfico ou na legenda — e ela se destaca nos três
        painéis ao mesmo tempo. É aí que aparece o que um gráfico sozinho escondia: quem cai em
        eNPS sem cair em satisfação, ou quem mantém o eNPS enquanto o risco de saída sobe. Onde a
        linha interrompe, não houve resposta naquela onda: o traço não atravessa o buraco, porque
        atravessar afirmaria uma trajetória que ninguém mediu.
      </p>
    </ChartCard>
  );
}

/**
 * Um painel: uma métrica, todas as áreas.
 *
 * Cada um tem a SUA escala. Forçar um eixo comum entre eNPS (-100 a 100),
 * satisfação (0 a 10) e risco (0 a 100%) achataria os três até nenhum variar
 * visivelmente -- que é o oposto do que três painéis servem para mostrar.
 */
function Painel({
  metrica,
  ondas,
  areas,
  foco,
  alvo,
  onAlvo,
  dimensao,
}: {
  metrica: Metrica;
  ondas: OndaEnps[];
  areas: AreaSerie[];
  foco: string | null;
  alvo: Alvo | null;
  onAlvo: (a: Alvo | null) => void;
  dimensao: string;
}) {
  const vals = areas
    .flatMap((a) => a.pontos)
    .filter((p): p is PontoOnda => p != null)
    .map((p) => metrica.valor(p))
    .filter((v): v is number => v != null);

  if (!vals.length) return null;

  const bruto = { min: Math.min(...vals), max: Math.max(...vals) };
  // Uma folga proporcional, e nunca zero: com todas as áreas no mesmo valor a
  // divisão por (max - min) explodiria.
  const folga = Math.max((bruto.max - bruto.min) * 0.12, 0.5);
  const min = bruto.min - folga;
  const max = bruto.max + folga;

  const x = (i: number) =>
    PAD_LEFT + (i / (ondas.length - 1)) * (W - PAD_LEFT - PAD_RIGHT);
  const y = (v: number) => PAD_TOP + ((max - v) / (max - min)) * (H - PAD_TOP - PAD_BOTTOM);

  const meu = alvo?.metrica === metrica.chave ? alvo : null;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{metrica.titulo}</span>
        <span className="text-[10px] text-muted-foreground">{metrica.nota}</span>
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: H }}
          role="img"
          aria-label={`${metrica.titulo} por ${dimensao} em ${ondas.length} ondas`}
          onMouseLeave={() => onAlvo(null)}
        >
          {ondas.map((o, i) => (
            <g key={o.wave}>
              <line
                x1={x(i)}
                x2={x(i)}
                y1={PAD_TOP - 6}
                y2={H - PAD_BOTTOM + 4}
                stroke="var(--chart-grid)"
                strokeWidth={1}
              />
              <text
                x={x(i)}
                y={H - PAD_BOTTOM + 18}
                textAnchor="middle"
                fontSize={10}
                fill="var(--chart-tick)"
              >
                {o.label}
              </text>
            </g>
          ))}

          {areas.map((a) => {
            // Trechos contínuos: onde falta ponto, a linha interrompe em vez
            // de pular o buraco. Pular ligaria dois números com um traço que
            // afirma uma trajetória que ninguém mediu.
            const trechos: Array<Array<{ x: number; y: number }>> = [];
            let atual: Array<{ x: number; y: number }> = [];
            a.pontos.forEach((p, i) => {
              const v = p == null ? null : metrica.valor(p);
              if (p == null || v == null) {
                if (atual.length) trechos.push(atual);
                atual = [];
                return;
              }
              atual.push({ x: x(i), y: y(v) });
            });
            if (atual.length) trechos.push(atual);

            const apagada = foco != null && foco !== a.scope;
            const realce = foco === a.scope;
            return (
              <g
                key={a.scope}
                opacity={apagada ? 0.12 : 1}
                style={{ transition: "opacity 120ms" }}
              >
                {trechos.map((t, ti) => (
                  <polyline
                    key={ti}
                    points={t.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={a.cor}
                    strokeWidth={realce ? 3 : 1.8}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={0.9}
                  />
                ))}
                {a.pontos.map((p, i) => {
                  const v = p == null ? null : metrica.valor(p);
                  if (p == null || v == null) return null;
                  return (
                    <circle
                      key={i}
                      cx={x(i)}
                      cy={y(v)}
                      r={realce && meu?.ondaLabel === ondas[i].label ? 5 : realce ? 3.5 : 2.5}
                      fill={a.cor}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* ----------------------------------------------------------------
              AS ÁREAS DE ACERTO VÊM POR ÚLTIMO, E SÃO MAIORES QUE OS PONTOS
              ----------------------------------------------------------------
              Um ponto de raio 2,5 é praticamente impossível de acertar com o
              mouse -- e um gráfico que só responde quando a pessoa mira bem
              parece quebrado, não exigente. Círculos invisíveis de raio 10
              fazem o alvo caber no gesto.

              Depois de todas as linhas para ficarem por cima delas: desenhados
              antes, a própria linha da área ao lado roubaria o evento.
          ---------------------------------------------------------------- */}
          {areas.map((a) =>
            a.pontos.map((p, i) => {
              const v = p == null ? null : metrica.valor(p);
              if (p == null || v == null) return null;
              return (
                <circle
                  key={`${a.scope}-${i}`}
                  cx={x(i)}
                  cy={y(v)}
                  r={10}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() =>
                    onAlvo({
                      area: a.scope,
                      cor: a.cor,
                      ondaLabel: ondas[i].label,
                      ponto: p,
                      metrica: metrica.chave,
                      x: x(i),
                      y: y(v),
                    })
                  }
                />
              );
            }),
          )}
        </svg>

        {meu && <Balao alvo={meu} />}
      </div>
    </div>
  );
}

/**
 * O balão traz os TRÊS indicadores, esteja o mouse em qual painel estiver.
 *
 * Foi o que motivou os três painéis, então seria estranho o detalhe voltar a
 * mostrar um só: quem parou o mouse na queda de satisfação quer saber, ali
 * mesmo, o que o eNPS e o risco daquela área fizeram no mesmo mês.
 */
function Balao({ alvo }: { alvo: Alvo }) {
  return (
    <div
      className="absolute pointer-events-none z-10 rounded-lg border border-border bg-popover px-3 py-2 shadow-lg min-w-[200px]"
      style={{
        // O `x` está em unidades do viewBox e o SVG estica com a largura,
        // então a posição horizontal vira porcentagem. A vertical é direta: a
        // altura do SVG é fixa em H.
        left: `${(alvo.x / W) * 100}%`,
        // Ancorar pela BASE (`bottom`) e não pelo topo é o truque que evita
        // medir: o navegador cresce o balão para cima sozinho, seja qual for o
        // conteúdo. Um `top` calculado precisaria da altura, que muda com o
        // aviso de área pequena.
        ...(alvo.y > H * 0.45 ? { bottom: H - alvo.y + 14 } : { top: alvo.y + 14 }),
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
        <span className="text-2xl font-bold tabular-nums">{Math.round(alvo.ponto.enps)}</span>
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
        <span className="text-muted-foreground">Satisfação</span>
        <span className="tabular-nums">{fmt1(alvo.ponto.satisfacao)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="text-muted-foreground">Risco de saída</span>
        <span className="tabular-nums">
          {alvo.ponto.risco == null ? "—" : `${fmt1(alvo.ponto.risco)}%`}
        </span>
      </div>

      {/* A ressalva que só aparece quando é verdade. Com n pequeno, o
          movimento do índice diz mais sobre o tamanho da área do que
          sobre o que as pessoas acham. */}
      {alvo.ponto.n != null && alvo.ponto.n > 0 && alvo.ponto.n < 30 && (
        <p className="mt-2 text-[10px] leading-snug text-amber-600 dark:text-amber-500">
          Área pequena: uma pessoa move o eNPS em {Math.round((100 / alvo.ponto.n) * 10) / 10} pontos.
        </p>
      )}
    </div>
  );
}
