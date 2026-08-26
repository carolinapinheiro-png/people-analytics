import { useMemo, useState } from "react";
import { Layers, ChevronDown } from "lucide-react";
import ChartCard from "@/components/dashboard/ChartCard";
import { COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { EngagementDriver } from "@/lib/experience.functions";
import type { DriverPorRecorte } from "@/lib/survey.functions";
import { linhasDaArea } from "@/lib/drill";

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
}

export default function DriversDeepDive({
  drivers,
  porArea = [],
  departamentoSelecionado = null,
}: {
  drivers: EngagementDriver[];
  /**
   * Notas por recorte. É daqui que sai a dispersão da ÁREA.
   *
   * ------------------------------------------------------------------
   * ESTE BLOCO DIZIA "NÃO TEM RECORTE POR ÁREA"
   * ------------------------------------------------------------------
   * Era a sexta vez que a mesma frase aparecia neste painel sobre uma coisa
   * que existia. A dispersão é min, máx e média das notas das perguntas de um
   * driver -- e as notas por área estão em `survey_driver_scores` desde
   * sempre, 306 linhas em ago/26.
   *
   * O que fazia parecer impossível foi a FONTE: o componente lia
   * `engagement_drivers`, que é carregada só no nível da empresa. Nenhum dado
   * faltava; faltava trocar de tabela.
   */
  porArea?: DriverPorRecorte[];
  departamentoSelecionado?: string | null;
}) {
  const daArea = departamentoSelecionado
    ? linhasDaArea(porArea, departamentoSelecionado)
    : null;

  const perguntas = useMemo<Pergunta[]>(() => {
    // Com filtro, as notas da área substituem as da empresa. A dispersão passa
    // a descrever o que ACONTECE ALI -- que é o ponto do cartão: "a média
    // esconde uma pergunta ruim" só vira ação se a média for a da sua área.
    if (daArea && daArea.size > 0) {
      return [...daArea.values()]
        .filter((l) => l.score != null)
        .map((l) => ({ driver: l.driver, question: l.question, score: Number(l.score) }));
    }
    return drivers
      .filter((d) => d.score_current != null)
      .map((d) => ({
        driver: d.driver,
        question: d.question,
        score: Number(d.score_current),
      }));
  }, [drivers, daArea]);

  const daEmpresa = !daArea || daArea.size === 0;

  // ------------------------------------------------------------------
  // O DRIVER ABRE, E SÓ UM DE CADA VEZ
  // ------------------------------------------------------------------
  // A Marilia propôs este cartão como material de gestor: clicar no driver e
  // ver as notas pergunta a pergunta, para chegar na causa "sem sobrecarregar
  // com excesso de informação". As duas metades da frase são o desenho -- o
  // detalhe precisa existir E precisa estar fechado por padrão.
  //
  // Um por vez, e não vários abertos: com onze drivers, permitir todos abertos
  // recria a lista pergunta a pergunta que este painel acabou de mover para
  // baixo justamente por ser densa demais para entrar por ela.
  const [aberto, setAberto] = useState<string | null>(null);

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
            // Da pior para a melhor: quem abre um driver está atrás da causa,
            // e a causa mora embaixo.
            itens: [...ps].sort((a, b) => a.score - b.score),
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

  // ======================================================================
  // FILTRO SEM NOTAS POR ÁREA: A NOTA, NÃO A DISPERSÃO DA EMPRESA
  // ======================================================================
  // Rotular "· empresa" no subtítulo era honesto e ainda assim entregava a
  // amplitude de 485 pessoas para quem pediu a de 41. Régua da empresa é uma
  // linha de referência ao lado do número da área; isto era o número da
  // empresa NO LUGAR do da área.
  if (departamentoSelecionado && daEmpresa) {
    return (
      <ChartCard
        title="Tema por tema, e o que a média esconde"
        subtitle={departamentoSelecionado}
        icon={Layers}
      >
        <p className="text-sm text-muted-foreground py-5 leading-relaxed">
          As notas por pergunta não foram carregadas com recorte de área nesta onda, então não há
          esta dispersão para{' '}
          <strong className="text-foreground">{departamentoSelecionado}</strong>. Não é limite do
          dado — cada resposta traz área e pergunta juntas —, e reimportar a onda passa a trazer.
          Até lá fica de fora, em vez de mostrar a amplitude da empresa inteira no lugar.
        </p>
      </ChartCard>
    );
  }

  return (
    <div className="space-y-4">
      <ChartCard
        title="Tema por tema, e o que a média esconde"
        subtitle={`da pergunta mais baixa à mais alta · ordenado pela amplitude${
          daEmpresa ? '' : ` · ${departamentoSelecionado}`
        }`}
        icon={Layers}
      >
        <div className="space-y-2.5">
          {comDispersao.map((d) => (
            <div key={d.driver} className="space-y-1">
              <button
                type="button"
                onClick={() => setAberto(aberto === d.driver ? null : d.driver)}
                aria-expanded={aberto === d.driver}
                aria-label={`Ver as ${d.n} perguntas de ${d.driver}`}
                className={cn(
                  'w-full flex items-baseline justify-between gap-3 rounded px-1 -mx-1 py-0.5 text-left transition-colors',
                  aberto === d.driver ? 'bg-muted/60' : 'hover:bg-muted/30',
                )}
              >
                <span className="text-xs truncate flex items-center gap-1" title={d.driver}>
                  <ChevronDown
                    className={cn(
                      'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
                      aberto === d.driver ? 'rotate-0' : '-rotate-90',
                    )}
                  />
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
              </button>
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

              {aberto === d.driver && (
                <ul className="mt-1 mb-2 space-y-1 border-l-2 border-border/60 pl-3">
                  {d.itens.map((q) => (
                    <li key={q.question} className="flex items-baseline gap-2 text-[11px] leading-snug">
                      <span
                        className="tabular-nums font-semibold shrink-0 w-7 text-right"
                        style={{ color: cor(q.score) }}
                      >
                        {fmt(q.score)}
                      </span>
                      <span className="text-muted-foreground">{q.question}</span>
                    </li>
                  ))}
                </ul>
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
          <strong>Clique num driver</strong> para ver as notas pergunta a pergunta, da pior para a
        melhor — é onde a causa costuma estar. A barra vai da pergunta mais baixa à mais alta do
        driver; o traço vertical é a média.
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
      {/* ------------------------------------------------------------------
          ESTA RESSALVA É DA LEITURA GERAL, E SÓ APARECE NELA
          ------------------------------------------------------------------
          Ela explica que a associação existe por área em cinco das nove, e que
          nas menores continua sendo a da empresa. Com uma área ESCOLHIDA, isso
          não é mais uma ressalva -- é uma pergunta já respondida dois cartões
          acima, onde o texto diz qual é o caso daquela área, com o número de
          respostas dela.

          Repetir aqui obriga quem filtrou a ler sobre as outras oito para
          descobrir que não é sobre ela. Ressalva que não muda decisão nenhuma
          naquele contexto compete por atenção com a que muda.

          Este parágrafo, aliás, já terminou em "as notas por área existem; o
          que falta é o cálculo da associação sobre elas" -- descrevendo o
          trabalho que foi feito depois. Estava certo quando escrito e virou
          errado sem ninguém revisitar. */}
      {!departamentoSelecionado && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong>O limite desta leitura:</strong> a associação com o eNPS passou a ser calculada
          dentro de cada área que tem respostas suficientes — cinco das nove em ago/26. Dá para
          dizer se a alavanca de Marketing é a mesma de Technology: filtre por área e a aba mostra
          isso logo acima. Nas quatro áreas menores a associação continua sendo a da empresa,
          porque uma correlação sobre 16 ou 20 respostas ordena perguntas por acaso.
        </p>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        E vale o de sempre: <strong>&quot;acompanha&quot; não é &quot;causa&quot;</strong>. Todas as
        respostas vêm da mesma pessoa no mesmo momento, e quem está satisfeito marca alto em tudo.
        Isso ordena os temas entre si; não promete que mexer num levanta o eNPS.
      </p>
    </div>
  );
}
