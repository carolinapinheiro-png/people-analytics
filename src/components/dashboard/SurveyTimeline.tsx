import { COLORS } from '@/lib/colors';
import { cn } from '@/lib/utils';
import type { OndaResumo } from '@/lib/experience.functions';

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
 * deixam de ser necessárias.
 *
 * ------------------------------------------------------------------
 * ESTA LISTA ERA ESCRITA À MÃO. ENVELHECEU CALADA.
 * ------------------------------------------------------------------
 * Até 18/08/2026 as ondas eram uma constante dentro deste arquivo. A terceira
 * entrada dizia "Julho / 2026 · Em campo · fecha em 13 de agosto" -- e
 * continuou dizendo isso depois de a pesquisa fechar e de a onda seguinte
 * existir. O painel anunciava uma coleta em andamento que já tinha terminado.
 *
 * É exatamente o defeito que o resto da aba evita: a leitura no topo é
 * calculada justamente para que texto fixo não envelheça. Aqui eu tinha
 * deixado um.
 *
 * Agora ela se desenha do banco. Uma onda nova aparece sozinha; uma onda sem
 * dado aparece dizendo que não tem dado.
 *
 * O FORMATO vem do deck que a diretoria já viu (slide "About the survey"), de
 * propósito: quem esteve naquela apresentação reconhece a estrutura.
 */

const COR = {
  passada: COLORS.gray400,
  atual: COLORS.flutter,
  vazia: COLORS.warning,
} as const;

/**
 * Uma onda registrada sem nenhum recorte e nenhum driver não é uma onda que
 * "tem poucos dados" -- é uma onda que nunca foi carregada. jul/25 está assim
 * desde sempre: 295 respostas anotadas e nada por trás.
 *
 * Dizer isso é melhor que exibi-la como as outras: quem lê a série precisa
 * saber que o buraco existe, senão conclui que a pesquisa não foi feita.
 */
const estadoDe = (o: OndaResumo): 'atual' | 'vazia' | 'passada' =>
  o.recortes === 0 && o.drivers === 0 ? 'vazia' : o.atual ? 'atual' : 'passada';

const mesAno = (iso: string): string => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const M = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${M[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`;
};

export default function SurveyTimeline({ ondas }: { ondas?: OndaResumo[] }) {
  const lista = [...(ondas ?? [])].sort((a, b) =>
    a.referenceDate < b.referenceDate ? -1 : 1);

  if (lista.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Nenhuma onda de pesquisa cadastrada ainda.
        </p>
      </div>
    );
  }

  const semDado = lista.filter((o) => estadoDe(o) === 'vazia');

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
        De onde vem este número
      </p>
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
        O questionário mudou de tamanho entre as ondas. É isso que explica por que algumas
        perguntas têm comparação com a onda anterior e outras não.
      </p>

      <div className="relative">
        {/* Trilho contínuo por trás dos marcos. */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" aria-hidden />

        <div className="space-y-5">
          {lista.map((o) => {
            const estado = estadoDe(o);
            return (
              <div key={o.wave} className="relative pl-7">
                <span
                  className={cn(
                    'absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-[3px] border-card',
                    estado === 'vazia' && 'border-dashed',
                  )}
                  style={{
                    background: estado === 'vazia' ? 'transparent' : COR[estado],
                    borderColor: estado === 'vazia' ? COR.vazia : undefined,
                    boxShadow: estado === 'atual' ? `0 0 0 4px ${COLORS.flutter}22` : undefined,
                  }}
                  aria-hidden
                />

                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {mesAno(o.referenceDate)}
                  </span>
                  {estado === 'atual' && (
                    <span
                      className="text-[10px] px-1.5 py-px rounded-full font-medium"
                      style={{ background: `${COLORS.flutter}1f`, color: COLORS.flutter }}
                    >
                      é o que a aba mostra
                    </span>
                  )}
                  {estado === 'vazia' && (
                    <span
                      className="text-[10px] px-1.5 py-px rounded-full font-medium"
                      style={{ background: `${COLORS.warning}22`, color: COLORS.warning }}
                    >
                      registrada, sem dados
                    </span>
                  )}
                </div>

                <p className="text-sm font-semibold">{o.label}</p>

                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  {estado === 'vazia' ? (
                    <>
                      {o.respondents ?? '—'} respostas anotadas, mas nenhum recorte e nenhuma
                      pergunta de driver carregados. Ela não entra em comparação nenhuma.
                    </>
                  ) : (
                    <>
                      {o.respondents ?? '—'} respostas
                      {o.eligible ? ` de ${o.eligible} elegíveis` : ''}
                      {o.participacao != null ? ` · ${o.participacao}% de participação` : ''}
                      {' · '}{o.drivers} perguntas de driver em {o.recortes} recortes
                    </>
                  )}
                </p>

                {/* A ressalva da própria onda, escrita na carga.
                    jul/25 é o caso que trouxe isto até aqui: ela foi aplicada
                    em duas partes, com respondentes anônimos diferentes, e o
                    `n` muda de um painel para o outro. Sem a frase, o número
                    que muda parece defeito de carga -- e a explicação já
                    existia no banco, só não saía de lá. */}
                {o.observacao && (
                  <p className="text-[12px] text-muted-foreground/80 leading-relaxed mt-0.5 italic">
                    {o.observacao}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {semDado.length > 0 && (
        <p className="mt-4 text-[11px] text-muted-foreground leading-relaxed">
          Onda marcada como <strong>registrada, sem dados</strong> aparece na série porque
          aconteceu de verdade — mas nada dela foi carregado, então ela não sustenta nenhuma
          comparação. Escondê-la faria a série parecer completa quando não é.
        </p>
      )}
    </div>
  );
}
