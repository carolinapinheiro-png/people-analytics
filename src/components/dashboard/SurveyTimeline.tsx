import { COLORS } from '@/lib/colors';
import { cn } from '@/lib/utils';

/**
 * A história do instrumento: como a pesquisa virou o que é hoje.
 *
 * ------------------------------------------------------------------
 * POR QUE UMA LINHA DO TEMPO RESOLVE UM PROBLEMA REAL
 * ------------------------------------------------------------------
 * Metade das ressalvas espalhadas por esta aba são consequência de uma coisa
 * só: o questionário mudou entre as ondas. "Só 9 das 31 perguntas têm
 * comparação", "Betfair não aparece no movimento", "a onda anterior foi
 * aplicada em duas partes", "esta pergunta é nova" -- são quatro frases
 * diferentes contando o mesmo fato quatro vezes, em quatro lugares.
 *
 * Contado uma vez, como história, o fato fica entendido e as quatro frases
 * deixam de ser necessárias. É a diferença entre pedir desculpa por um limite e
 * explicar de onde ele vem.
 *
 * ------------------------------------------------------------------
 * POR QUE FICA NO DETALHE E NÃO NO TOPO
 * ------------------------------------------------------------------
 * Isto responde "de onde vem esse número", não "o que eu faço com ele". Quem
 * abre o painel para decidir não precisa disso; quem abre para conferir, ou
 * para apresentar, precisa muito -- e é a primeira pergunta que aparece numa
 * sala quando alguém desconfia do dado.
 *
 * O formato vem do deck que a diretoria já viu (slide "About the survey"), de
 * propósito: quem esteve naquela apresentação reconhece a estrutura e não
 * precisa reaprender nada.
 */

interface Onda {
  periodo: string;
  titulo: string;
  descricao: string;
  metricas: string[];
  respostas: number | null;
  participacao: number | null;
  estado: 'passada' | 'atual' | 'futura';
}

const ONDAS: Onda[] = [
  {
    periodo: 'Junho e Julho / 2025',
    titulo: 'A primeira régua',
    descricao:
      'Aplicada em duas partes, com um mês de diferença: o eNPS em junho, os drivers em julho. É tratada como uma onda só, e chamada de Julho/25.',
    metricas: ['3 métricas de engajamento', '10 perguntas de driver'],
    respostas: 295,
    participacao: 76,
    estado: 'passada',
  },
  {
    periodo: 'Janeiro / 2026',
    titulo: 'O questionário completo',
    descricao:
      'Tudo num instrumento só, e o triplo de perguntas. É a onda que o painel mostra hoje — e a primeira em que Betfair participou, por isso ela não tem comparação com a anterior.',
    metricas: ['3 métricas de engajamento', '31 perguntas em 8 drivers', 'função, marca e tempo de casa'],
    respostas: 367,
    participacao: 79,
    estado: 'atual',
  },
  {
    periodo: 'Julho / 2026',
    titulo: 'Em campo',
    descricao:
      'Fecha em 13 de agosto. Com o mesmo questionário de janeiro, quase tudo passa a ter comparação — inclusive as 22 perguntas que hoje estão sem.',
    metricas: ['mesma estrutura de janeiro'],
    respostas: null,
    participacao: null,
    estado: 'futura',
  },
];

const COR: Record<Onda['estado'], string> = {
  passada: COLORS.gray400,
  atual: COLORS.flutter,
  futura: COLORS.nsx,
};

export default function SurveyTimeline() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
        De onde vem este número
      </p>
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
        A pesquisa mudou de tamanho duas vezes em um ano. É isso que explica por que algumas
        perguntas têm comparação com a onda anterior e outras não.
      </p>

      <div className="relative">
        {/* Trilho contínuo por trás dos marcos. */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" aria-hidden />

        <div className="space-y-5">
          {ONDAS.map((o) => (
            <div key={o.periodo} className="relative pl-7">
              <span
                className={cn(
                  'absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-[3px] border-card',
                  o.estado === 'futura' && 'border-dashed',
                )}
                style={{
                  background: o.estado === 'futura' ? 'transparent' : COR[o.estado],
                  borderColor: o.estado === 'futura' ? COR[o.estado] : undefined,
                  boxShadow: o.estado === 'atual' ? `0 0 0 4px ${COLORS.flutter}22` : undefined,
                }}
                aria-hidden
              />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {o.periodo}
                </span>
                {o.estado === 'atual' && (
                  <span
                    className="text-[10px] px-1.5 py-px rounded-full font-medium"
                    style={{ background: `${COLORS.flutter}1f`, color: COLORS.flutter }}
                  >
                    no painel
                  </span>
                )}
                {o.estado === 'futura' && (
                  <span
                    className="text-[10px] px-1.5 py-px rounded-full font-medium"
                    style={{ background: `${COLORS.nsx}1f`, color: COLORS.nsx }}
                  >
                    respondendo agora
                  </span>
                )}
              </div>
              <p className="text-sm font-medium mt-0.5">{o.titulo}</p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{o.descricao}</p>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                {o.metricas.map((m) => (
                  <span
                    key={m}
                    className="text-[11px] px-1.5 py-0.5 rounded border border-border text-muted-foreground"
                  >
                    {m}
                  </span>
                ))}
                {o.respostas != null && (
                  <span className="text-[11px] text-muted-foreground">
                    <strong className="text-foreground">{o.respostas}</strong> responderam
                    {o.participacao != null && ` · ${o.participacao}% de participação`}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground mt-4 pt-3 border-t border-border/60 leading-relaxed">
        <strong className="text-foreground">Como cada número é calculado.</strong>{' '}
        eNPS = % de quem deu 9 ou 10 na pergunta de recomendação, menos % de quem deu 6 ou menos.
        Risco de saída = % que respondeu 6 ou menos em &quot;permaneceria se recebesse uma oferta
        idêntica&quot;. Nas perguntas de 1 a 5, <strong className="text-foreground">% favorável</strong> conta
        quem respondeu 4 ou 5 — é a leitura do deck da diretoria; a média aparece ao lado como
        detalhe. Todos os números do painel são recalculados do arquivo original da pesquisa, não
        digitados.
      </p>
    </div>
  );
}
