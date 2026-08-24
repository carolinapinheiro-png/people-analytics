import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import AvisoForaDoFiltro from '@/components/dashboard/AvisoForaDoFiltro';
import { COLORS } from '@/lib/colors';
import { classifyPerguntas, temaDominante as temaDeLista } from '@/lib/pergunta-priority';
import { cn } from '@/lib/utils';
import {
  Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import type { SurveyImportance, DriverPorRecorte } from '@/lib/survey.functions';
import { areasNaPergunta, temQuebraPorArea, perguntasNoRecorte } from '@/lib/drill';

/**
 * As perguntas onde mexer tende a render mais, como lista.
 *
 * ------------------------------------------------------------------
 * POR QUE LISTA E NÃO A DISPERSÃO QUE ESTAVA AQUI
 * ------------------------------------------------------------------
 * A versão anterior era um gráfico de nota × associação com quatro quadrantes.
 * Estatisticamente é a representação certa: mostra todas as perguntas de uma vez e
 * deixa a estrutura aparecer.
 *
 * Só que exige três leituras encadeadas antes de virar decisão -- entender o
 * eixo X, entender o eixo Y, cruzar os dois -- e a decisão que sai é uma lista
 * de seis perguntas. Quando o produto final de um gráfico é uma lista curta,
 * mostrar a lista é mais honesto que fazer a pessoa derivá-la.
 *
 * A dispersão continua disponível num botão, porque para quem já entendeu ela
 * mostra uma coisa que a lista não mostra: que não existe uma divisão limpa
 * entre "importa" e "não importa" -- as perguntas se espalham num gradiente.
 *
 * ------------------------------------------------------------------
 * A RESSALVA, EM UMA FRASE
 * ------------------------------------------------------------------
 * "Acompanha" não é "causa". Todas as respostas vêm da mesma pessoa no mesmo
 * momento, e quem está satisfeito marca alto em tudo. Isto ordena perguntas
 * entre si; não promete que mexer numa levanta o eNPS. A versão longa dessa
 * ressalva vive no tooltip -- na tela, uma linha, senão vira papel de parede
 * como as outras vinte que estavam aqui.
 */

const fmt2 = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmt0 = (n: number | null) => (n == null ? '—' : Math.round(n).toString());

/**
 * A cor sai do % FAVORÁVEL, não da média. Os cortes vêm da linguagem que o deck
 * da diretoria já usa: "mid-90%" é forte, "low-60%" é o problema. Colorir pela
 * média obrigaria a manter duas escalas mentais para o mesmo dado.
 */
const corFav = (f: number | null) =>
  f == null ? COLORS.gray400
  : f >= 90 ? COLORS.success
  : f >= 80 ? COLORS.nsx
  : f >= 70 ? COLORS.warning
  : COLORS.danger;

/** Força da associação em palavra. O número exato fica no tooltip. */
function forca(r: number, cortes: { alto: number; medio: number }): string {
  return r >= cortes.alto ? 'puxa muito' : r >= cortes.medio ? 'puxa' : 'puxa pouco';
}

/**
 * As áreas mais distantes da empresa numa pergunta, nas duas direções.
 *
 * Mostra as duas pontas e não a lista inteira: com nove áreas, o meio quase
 * nunca muda decisão, e a lista completa aqui viraria uma segunda tabela
 * dentro da primeira -- justamente o que a versão em lista veio resolver.
 */
function PorArea({ drivers, p }: { drivers: DriverPorRecorte[]; p: SurveyImportance }) {
  const linhas = areasNaPergunta(drivers, p.driver, p.question).filter((a) => a.gap != null);

  // Onda medida só no nível da empresa (jan/26). Silêncio aqui seria lido como
  // "todas as áreas iguais", que é afirmação -- e ninguém mediu isso.
  if (!temQuebraPorArea(drivers)) {
    return (
      <p className="mt-1 ml-[74px] text-[11px] text-muted-foreground italic">
        Esta onda não foi quebrada por área.
      </p>
    );
  }
  if (!linhas.length) return null;

  const Chip = ({ a }: { a: (typeof linhas)[number] }) => (
    <span className="inline-flex items-baseline gap-1 rounded px-1.5 py-0.5 bg-background border border-border/60">
      <span
        className="tabular-nums font-semibold"
        style={{ color: (a.gap ?? 0) < 0 ? COLORS.danger : COLORS.success }}
      >
        {(a.gap ?? 0) > 0 ? '+' : ''}{a.gap}
      </span>
      <span>{a.area}</span>
      <span className="text-muted-foreground">n={a.n}</span>
    </span>
  );

  // "Puxa para baixo" tem que significar gap NEGATIVO. Sem este filtro a lista
  // pegava as tres primeiras linhas fossem quais fossem, e uma area acima da
  // empresa (+17,4) aparecia rotulada como quem puxa para baixo.
  const piores = linhas.filter((a) => (a.gap ?? 0) < 0).slice(0, 3);
  // E uma area nao pode estar nos dois lados. Quando a supressao por n<5 deixa
  // uma unica area de pe -- em ago/26 sobra so "Outros" na maioria das
  // perguntas -- os dois lados caiam na MESMA linha, e a tela dizia que a area
  // puxava para baixo e sustentava ao mesmo tempo.
  const jaUsadas = new Set(piores.map((a) => a.area));
  const melhores = [...linhas]
    .reverse()
    .filter((a) => (a.gap ?? 0) > 0 && !jaUsadas.has(a.area))
    .slice(0, 2);

  // Nada a dizer é melhor que dizer errado: sem area de um lado nem do outro,
  // a linha inteira sai.
  if (!piores.length && !melhores.length) return null;

  return (
    <div className="mt-1 ml-[74px] flex flex-wrap items-center gap-1.5 text-[11px]">
      {piores.length > 0 && (
        <>
          <span className="text-muted-foreground">puxam para baixo:</span>
          {piores.map((a) => <Chip key={a.area} a={a} />)}
        </>
      )}
      {melhores.length > 0 && (
        <>
          <span className={cn('text-muted-foreground', piores.length > 0 && 'ml-1')}>sustentam:</span>
          {melhores.map((a) => <Chip key={a.area} a={a} />)}
        </>
      )}
      <span className="text-muted-foreground">· pontos de % contra a empresa</span>
    </div>
  );
}

export default function DriverPriority({
  rows,
  drivers = [],
  departamentoSelecionado = null,
}: {
  rows: SurveyImportance[];
  /**
   * Área escolhida no filtro. Não é mais só para o aviso: com ela, o % de cada
   * linha passa a ser o da área. A associação continua sendo a da empresa,
   * porque `survey_driver_importance` guarda uma linha por pergunta, sem coluna
   * de recorte -- essa parte não tem versão por área e não terá.
   */
  departamentoSelecionado?: string | null;
  /**
   * Notas por área, para o hover inverter o eixo da leitura.
   *
   * "Remuneração tem as piores notas da empresa" é um fato sobre a empresa e
   * não leva a lugar nenhum -- não há com quem conversar. "Remuneração está 17
   * pontos abaixo em Marketing e no nível da empresa em Technology" indica
   * onde a conversa acontece. É a MESMA matriz que o painel de área usa, lida
   * pelo outro eixo (ver lib/drill.ts).
   */
  drivers?: DriverPorRecorte[];
}) {
  const [verTodas, setVerTodas] = useState(false);
  const [sobre, setSobre] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // O % PASSA A SER O DA ÁREA QUANDO HÁ FILTRO
  // ------------------------------------------------------------------
  // A associação com o eNPS continua sendo a da empresa -- é a única medida que
  // existe. O que muda é o alvo: a lista deixa de ordenar "as perguntas que a
  // EMPRESA responde pior entre as que movem engajamento" e passa a ordenar "as
  // que ESTA ÁREA responde pior entre elas".
  //
  // A mesma função do gráfico logo acima, de propósito. Por meia hora a troca
  // esteve só no gráfico, e os dois cartões voltaram a poder colocar a mesma
  // pergunta em quadrantes diferentes -- exatamente o defeito que a régua única
  // tinha acabado de eliminar.
  const escopo = useMemo(
    () => perguntasNoRecorte(rows, drivers, departamentoSelecionado),
    [rows, drivers, departamentoSelecionado],
  );

  const { prioridade, sustentar, cortes, temaDominante } = useMemo(() => {
    // A régua é a de `pergunta-priority.ts`, a mesma do gráfico de quadrantes
    // logo acima. Este cartão já cortava pelo % favorável e explicava por quê;
    // o que faltava era os outros dois cartões cortarem igual. Agora a regra
    // mora num lugar só, com teste, e o comentário virou documentação de lá.
    const { itens, corteR } = classifyPerguntas(escopo.linhas);
    const ordenado = [...itens].sort((a, b) => b.r - a.r);
    const prioridade = ordenado.filter((i) => i.quadrante === 'prioridade');
    const sustentar = ordenado.filter((i) => i.quadrante === 'sustentar').slice(0, 4);

    const t = temaDeLista(prioridade);

    const rs = escopo.linhas.map((i) => i.r).sort((a, b) => b - a);
    return {
      prioridade, sustentar,
      cortes: { alto: rs[Math.floor(rs.length * 0.25)] ?? 0, medio: corteR },
      // Duas perguntas do mesmo driver já bastam para a moda; só vira "tema" se
      // ainda houver mais de uma categoria de onde ela pudesse ter vindo.
      temaDominante: t.tema && t.quantas >= 2 ? { tema: t.tema, qtd: t.quantas } : null,
    };
  }, [escopo]);

  if (rows.length < 6) return null;

  const lista = verTodas ? [...escopo.linhas].sort((a, b) => b.r - a.r) : prioridade;

  return (
    <ChartCard
      title="Por onde começar, pergunta por pergunta"
      subtitle={
        // O `n` acompanha o % : sob filtro os dois são da área. Trocar um sem o
        // outro poria a nota de 81 pessoas com o rótulo de 485 -- foi o que a
        // tela fez por um tempo, escrevendo "485 respostas" ao lado do painel
        // filtrado em Marketing.
        departamentoSelecionado
          ? `% que ${departamentoSelecionado} concorda · ${escopo.linhas.length} perguntas · ${escopo.linhas[0]?.n ?? 0} respostas`
          : `% que concorda · ${escopo.linhas.length} perguntas · ${escopo.linhas[0]?.n ?? 0} respostas da empresa`
      }
    >
      {/* Deixou de ser "este bloco não segue o filtro". Metade segue: o % é da
          área. O que não tem versão por área é a associação -- e é isso, e só
          isso, que o texto pode alegar. */}
      {departamentoSelecionado && (
        <p className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed">
          <strong>A coluna de % é de {departamentoSelecionado}.</strong> A ordem da lista vem da
          associação com o eNPS, que é medida uma vez na <strong>empresa inteira</strong> — não
          existe versão dela por área. Então a lista responde: entre as perguntas que movem
          engajamento na Flutter Brazil, quais {departamentoSelecionado} responde pior.
          {escopo.suprimidas > 0 && (
            <>
              {' '}
              {escopo.suprimidas} pergunta{escopo.suprimidas === 1 ? '' : 's'} ficou de fora por
              ter a nota da área suprimida (grupo pequeno demais).
            </>
          )}
        </p>
      )}
      {temaDominante && (
        <p className="text-sm leading-relaxed mb-3">
          Das {prioridade.length} perguntas que {departamentoSelecionado ?? 'a empresa'} responde
          com menor concordância entre as que mais acompanham o engajamento,{' '}
          <strong>{temaDominante.qtd} são de {temaDominante.tema.toLowerCase()}</strong>.{' '}
          {/* A observação sobre remuneração é sobre a EMPRESA -- as piores notas
              da Flutter Brazil. Sob filtro ela pode simplesmente não valer para
              a área, e afirmá-la assim mesmo seria pôr um fato da empresa na
              boca de uma leitura de área. */}
          {departamentoSelecionado
            ? 'A ordem vem da associação medida na empresa; a concordância, desta área.'
            : 'Remuneração tem as piores notas da empresa, mas acompanha menos — é problema real, e não é o que separa quem está engajado de quem não está.'}
        </p>
      )}

      <div className="space-y-0.5">
        {lista.map((p) => {
          const alta = p.r >= cortes.alto;
          return (
            <div
              key={p.question}
              className={cn(
                'py-1.5 border-b border-border/40 last:border-0 -mx-1 px-1 rounded transition-colors',
                sobre === p.question && 'bg-secondary/60',
              )}
              onMouseEnter={() => setSobre(p.question)}
              onMouseLeave={() => setSobre(null)}
            >
            <div className="flex items-start gap-3">
              <span
                className="tabular-nums w-[62px] shrink-0 text-right"
                title={`média ${fmt2(p.score)} de 5`}
              >
                <span className="text-sm font-semibold" style={{ color: corFav(p.favoravel) }}>
                  {fmt0(p.favoravel)}%
                </span>
                <span className="text-[10px] text-muted-foreground ml-1">{fmt2(p.score)}</span>
              </span>
              <span className="flex-1 text-xs leading-snug min-w-0">
                {p.question}
                <span className="text-muted-foreground"> · {p.driver}</span>
              </span>
              <span
                className={cn(
                  'text-[11px] shrink-0 w-[74px] text-right',
                  alta ? 'font-medium' : 'text-muted-foreground',
                )}
                style={alta ? { color: COLORS.flutter } : undefined}
                title={`correlação com o eNPS individual: ${fmt2(p.r)}`}
              >
                {forca(p.r, cortes)}
              </span>
            </div>

            {/* O outro eixo da mesma matriz: quem puxa esta pergunta para
                baixo e quem a sustenta. Só as duas pontas -- o meio raramente
                muda decisão, e a lista inteira aqui viraria uma segunda tabela
                dentro da primeira. */}
            {sobre === p.question && <PorArea drivers={drivers} p={p} />}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 mt-3">
        <button
          onClick={() => setVerTodas((v) => !v)}
          className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {verTodas ? `mostrar só as ${prioridade.length} de maior prioridade` : `ver todas as ${escopo.linhas.length} perguntas`}
        </button>
        <TooltipProvider delayDuration={200}>
          <UiTooltip>
            <TooltipTrigger asChild>
              <button className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <Info className="h-3 w-3" />
                o que &quot;puxa&quot; quer dizer
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[320px] text-xs leading-relaxed space-y-1.5">
              <p>
                Mede o quanto a resposta da pergunta acompanha o eNPS <strong>da mesma pessoa</strong>.
                É calculado uma vez, sobre as respostas da empresa inteira — não existe versão por
                área desta medida, e por isso ela não muda com o filtro.
              </p>
              <p>
                O número grande é o <strong>% que respondeu 4 ou 5</strong> — a mesma leitura do
                deck da diretoria. O número pequeno ao lado é a média de 1 a 5, que capta movimento
                menor entre ondas.
              </p>
              <p>
                <strong>Não é relação de causa.</strong> Todas as respostas vêm da mesma pessoa no
                mesmo momento, e quem está satisfeito tende a marcar alto em tudo. Serve para
                ordenar as perguntas entre si, não para prometer que mexer numa levanta o eNPS.
              </p>
            </TooltipContent>
          </UiTooltip>
        </TooltipProvider>
      </div>

      {!verTodas && sustentar.length > 0 && (
        <p className="text-[11px] text-muted-foreground mt-2.5 leading-relaxed">
          <strong className="text-foreground">O que já funciona e importa:</strong>{' '}
          {sustentar.map((s) => s.question.replace(/\.$/, '')).join('; ')}. Perder aqui custa caro.
        </p>
      )}
    </ChartCard>
  );
}
