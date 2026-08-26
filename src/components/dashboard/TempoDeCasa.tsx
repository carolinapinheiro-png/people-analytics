import { useMemo } from 'react';
import { Hourglass } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import { cn } from '@/lib/utils';
import {
  trajetoriaPorFaixa, efeitoComposicao, type FaixaOnda,
} from '@/lib/analise-engajamento';
import { TEMPO_ORDEM } from '@/lib/aggregator/polly-survey';

/**
 * Onde a queda aconteceu.
 *
 * ------------------------------------------------------------------
 * O ACHADO QUE PEDIU ESTE QUADRO
 * ------------------------------------------------------------------
 * A aba mostrava as faixas de tempo de casa da onda atual e nunca as comparava
 * entre ondas. Comparando, aparece a leitura mais útil que a pesquisa produziu
 * até agora: a queda do eNPS da empresa NÃO está distribuída.
 *
 *     0-3 meses ....  83 → 76 → 80    oscila
 *     3-6 meses ....  85 → 87 → 74    oscila
 *     6-9 meses ....  67 → 73 → 72    oscila
 *     9-12 meses ...  71 → 77 → 65    oscila
 *     12-18 meses ..  83 → 69 → 63    cai nas três
 *     18-24 meses ..  83 → 74 → 69    cai nas três
 *     24+ meses ....  84 → 75 → 67    cai nas três
 *
 * ------------------------------------------------------------------
 * POR QUE A TERCEIRA ONDA MUDA A CONCLUSÃO
 * ------------------------------------------------------------------
 * A primeira versão deste quadro comparava só duas ondas -- e duas pontas não
 * distinguem uma queda contínua de uma oscilação que por acaso terminou baixo.
 * As duas produzem o mesmo "−20".
 *
 * Com três medições a diferença aparece, e ela é o argumento inteiro: as
 * faixas iniciais sobem e descem sem direção, enquanto as três faixas acima de
 * um ano caem em TODAS as passagens. Quatro faixas oscilando é o que amostras
 * pequenas fazem; três faixas caindo sem interrupção durante treze meses é um
 * processo.
 *
 * É também o que responde à objeção mais razoável -- "então estamos
 * contratando pior". Se fosse isso, as faixas iniciais mostrariam tendência de
 * queda, porque são elas que acabaram de passar por seleção e integração. Elas
 * não mostram.
 *
 * ------------------------------------------------------------------
 * O TESTE DE COMPOSIÇÃO VEM JUNTO, E NÃO DEPOIS
 * ------------------------------------------------------------------
 * "Mas a empresa dobrou de tamanho" é a primeira objeção da sala, e é
 * legítima. Verificável, então verificada aqui, ao lado do gráfico. Neste dado
 * ela não se sustenta: o mix explica 0,4 ponto de 12,7.
 */

const fmt1 = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const sinal = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${fmt1(v)}`);

/**
 * O que as faixas que caem têm em comum, dito como uma pessoa diria.
 *
 * Listar "12-18 meses, 18-24 meses, 24+ meses" obriga quem lê a perceber
 * sozinho que são todas as faixas acima de um ano -- e essa percepção É o
 * achado. Quando as faixas que caem são exatamente as de mais tempo de casa,
 * a frase diz isso; quando não são, cai na lista, que aí é mesmo a informação.
 */
function sujeitoDaQueda(faixas: string[]): string {
  const acimaDeUmAno = ['12-18 meses', '18-24 meses', '24+ meses'];
  const todasLongas =
    faixas.length === acimaDeUmAno.length && acimaDeUmAno.every((f) => faixas.includes(f));
  if (todasLongas) return 'Quem está há mais de um ano na empresa piorou em todas as pesquisas';
  if (faixas.length === 1) return `Quem tem ${faixas[0]} de casa piorou em todas as pesquisas`;
  return `Estas faixas pioraram em todas as pesquisas: ${faixas.join(', ')}`;
}

const ROTULO = {
  queda: 'cai em todas',
  subida: 'sobe em todas',
  oscila: 'oscila',
  indefinida: '',
} as const;

/**
 * "Julho/25" -> "jul/25". O cabecalho reserva uma coluna estreita, do tamanho
 * de um eNPS de dois digitos; os rotulos por extenso transbordavam e os tres
 * apareciam colados ("JULHO/25JANEIRO/26AGOSTO/26").
 */
function rotuloCompacto(label: string): string {
  const [mes, ano] = label.split('/');
  if (!ano || mes.length <= 4) return label;
  return `${mes.slice(0, 3).toLowerCase()}/${ano}`;
}

export default function TempoDeCasa({
  ondas,
  departamentoSelecionado = null,
  daArea = null,
}: {
  ondas: Array<{ label: string; faixas: FaixaOnda[] }>;
  departamentoSelecionado?: string | null;
  /**
   * Nome da área quando a série É dela, null quando é a da empresa.
   *
   * ------------------------------------------------------------------
   * TRÊS ESTADOS, E O TERCEIRO NÃO É A SÉRIE DA EMPRESA
   * ------------------------------------------------------------------
   *   sem filtro          -> série da empresa
   *   filtro + cruzamento -> série da área
   *   filtro sem carga    -> a nota do que falta, e nada mais
   *
   * O terceiro estado já mostrou a série da empresa com um aviso por cima. O
   * aviso era verdadeiro e mesmo assim o desenho errava: quem filtrou uma área
   * pediu a queda DELA, e recebeu sete faixas de eNPS da empresa inteira no
   * lugar da resposta -- com "cai em todas" ao lado, que é uma conclusão sobre
   * gente de fora da área.
   *
   * O texto do aviso continua valendo e é o ponto: isto não é limite do dado.
   * Cada resposta sempre trouxe área e tempo de casa juntos. O que falta é a
   * onda ter sido carregada com o cruzamento, e isso se resolve reimportando.
   */
  daArea?: string | null;
}) {
  const { linhas, comp, quedas } = useMemo(() => {
    const linhas = trajetoriaPorFaixa(ondas, TEMPO_ORDEM);
    const primeira = ondas[0]?.faixas ?? [];
    const ultima = ondas[ondas.length - 1]?.faixas ?? [];
    return {
      linhas,
      comp: efeitoComposicao(ultima, primeira),
      quedas: linhas.filter((l) => l.trajetoria === 'queda'),
    };
  }, [ondas]);

  // ======================================================================
  // FILTRO SEM CRUZAMENTO: A NOTA, NÃO A SÉRIE DA EMPRESA
  // ======================================================================
  if (departamentoSelecionado && daArea == null) {
    return (
      <ChartCard
        title="Onde a queda aconteceu"
        subtitle={`eNPS por tempo de casa · ${departamentoSelecionado}`}
        icon={Hourglass}
      >
        <p className="text-sm text-muted-foreground py-5 leading-relaxed">
          O cruzamento entre área e tempo de casa não foi calculado nas ondas já carregadas, então
          não há esta série para <strong className="text-foreground">{departamentoSelecionado}</strong>.
          Não é limite do dado — cada resposta traz os dois campos juntos —, e reimportar as ondas
          passa a trazer a série desta área. Até lá ela fica de fora, em vez de aparecer com as
          faixas da empresa inteira no lugar.
        </p>
      </ChartCard>
    );
  }

  if (ondas.length < 2 || linhas.length < 3 || comp.variacaoTotal == null) return null;

  const maxAbs = Math.max(...linhas.map((l) => Math.abs(l.variacaoTotal ?? 0)), 1);
  const temTrajetoria = ondas.length >= 3;

  // O mix é "pouco" quando explica menos de um quinto da variação. Abaixo
  // disso, dizer que a composição explica seria dar peso a um resíduo.
  const mixRelevante = comp.efeitoMix != null && comp.variacaoTotal !== 0
    && Math.abs(comp.efeitoMix) > Math.abs(comp.variacaoTotal) * 0.2;

  return (
    <ChartCard
      title="Onde a queda aconteceu"
      subtitle={`eNPS por tempo de casa${daArea ? ` em ${daArea}` : ''} · ${ondas
        .map((o) => o.label)
        .join(' → ')}`}
      icon={Hourglass}
    >
      <div className="flex items-center gap-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="w-[92px] shrink-0">Tempo de casa</span>
        {ondas.map((o) => (
          <span key={o.label} className="w-14 text-right shrink-0">{rotuloCompacto(o.label)}</span>
        ))}
        <span className="flex-1" />
        <span className="w-11 text-right shrink-0">total</span>
        {temTrajetoria && <span className="w-[74px] text-right shrink-0">trajetória</span>}
      </div>

      <div className="space-y-0.5">
        {linhas.map((l) => {
          const v = l.variacaoTotal;
          const cor = v == null ? COLORS.gray400 : v < 0 ? COLORS.danger : COLORS.success;
          const continua = l.trajetoria === 'queda' || l.trajetoria === 'subida';
          return (
            <div key={l.faixa} className="flex items-center gap-2 py-1 text-[12px]">
              <span className="w-[92px] shrink-0 truncate">{l.faixa}</span>

              {l.valores.map((x, i) => (
                <span
                  key={i}
                  className={cn(
                    'tabular-nums w-14 text-right shrink-0',
                    i === l.valores.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {x ?? '—'}
                </span>
              ))}

              {/* Barra a partir do centro: a direção é o que se lê primeiro. */}
              <div className="flex-1 min-w-0 h-4 flex items-center">
                <div className="w-1/2 flex justify-end">
                  {v != null && v < 0 && (
                    <div className="h-2 rounded-l-full" style={{
                      width: `${(Math.abs(v) / maxAbs) * 100}%`, background: cor,
                    }} />
                  )}
                </div>
                <div className="w-px h-3 bg-border shrink-0" />
                <div className="w-1/2">
                  {v != null && v > 0 && (
                    <div className="h-2 rounded-r-full" style={{
                      width: `${(v / maxAbs) * 100}%`, background: cor,
                    }} />
                  )}
                </div>
              </div>

              <span className="tabular-nums w-11 text-right font-semibold shrink-0" style={{ color: cor }}>
                {sinal(v)}
              </span>

              {temTrajetoria && (
                <span
                  className={cn(
                    'w-[74px] text-right text-[11px] shrink-0',
                    continua ? 'font-medium' : 'text-muted-foreground',
                  )}
                  style={continua ? { color: cor } : undefined}
                >
                  {ROTULO[l.trajetoria]}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-2.5 border-t border-border/60 space-y-1.5">
        {/* A leitura que a terceira onda permite. Só aparece quando há três.

            REESCRITO PORQUE NINGUÉM DE FORA ENTENDEU. Dizia "3 faixas caem em
            todas as medições". Três palavras, três problemas: "faixa" é como o
            CÓDIGO chama a linha, não como uma pessoa chama; "medições" não diz
            que são as pesquisas, que estão nomeadas no cabeçalho ali em cima; e
            a frase pedia que o leitor montasse sozinho o que as três faixas têm
            em comum -- que é o achado inteiro, e por isso deveria estar escrito.

            Agora o grupo vem nomeado ("quem está há mais de um ano"), as
            medições viram as ondas pelo nome, e a conclusão vem antes da
            estatística que a sustenta.

            (O comentário mora AQUI, acima do `&&`, e não dentro dele: um
            comentário JSX logo depois de `{cond && (` é lido como o filho
            único da expressão. Terceira vez que erro isso nesta semana.) */}
        {temTrajetoria && quedas.length > 0 && (
          <>
          <p className="text-[13px] leading-relaxed">
            <strong>{sujeitoDaQueda(quedas.map((q) => q.faixa))}</strong> — e isso aconteceu de{' '}
            {ondas.map((o) => o.label).join(' para ')}, sem uma única vez em que tenha melhorado.
            Quem tem menos tempo de casa sobe e desce sem direção clara.
          </p>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            A diferença importa: piorar em toda pesquisa seguida é tendência; subir e descer é o
            que grupos pequenos costumam fazer por acaso. Comparando só a primeira pesquisa com a
            última, as duas coisas teriam exatamente a mesma cara.
          </p>
          </>
        )}

        <p className="text-[13px] leading-relaxed">
          {/* ------------------------------------------------------------------
              "COMPOSIÇÃO" E "MIX" SÃO PALAVRAS NOSSAS
              ------------------------------------------------------------------
              O texto abria em "Isso não é composição" e seguia em "o mix
              explica 0,4 de 12,7" -- respondendo uma objeção que ainda não
              tinha sido feita, com dois termos que só significam algo para
              quem já sabia a resposta.

              A objeção agora vem primeiro e em português ("a empresa cresceu,
              será que é só isso?"), e a conta aparece como o teste dela. É a
              mesma aritmética; muda quem consegue segui-la. */}
          <strong>A empresa contratou muita gente nova no período.</strong> Dá para desconfiar,
          então, que o eNPS caiu só porque mudou quem responde — e não porque alguém mudou de
          ideia. Dá para testar: refazendo a conta como se a empresa ainda tivesse hoje a mesma
          mistura de tempo de casa de {ondas[0].label}, o eNPS seria{' '}
          <strong>{fmt1(comp.contrafactual)}</strong> em vez de {fmt1(comp.atual)}.{' '}
          {mixRelevante ? (
            <>
              A diferença é grande: {fmt1(Math.abs(comp.efeitoMix as number))} dos{' '}
              {fmt1(Math.abs(comp.variacaoTotal))} pontos de variação vêm de ter mudado quem são as
              pessoas. Boa parte do movimento é quadro novo, não opinião nova.
            </>
          ) : (
            <>
              É praticamente o mesmo número — só {fmt1(Math.abs(comp.efeitoMix as number))} dos{' '}
              {fmt1(Math.abs(comp.variacaoTotal))} pontos vêm da mudança de quadro. Os outros{' '}
              {fmt1(Math.abs(comp.variacaoTotal) - Math.abs(comp.efeitoMix as number))} são pessoas
              que passaram a responder diferente.
            </>
          )}
        </p>

        <p className="text-[12px] text-muted-foreground leading-relaxed">
          As faixas não são as mesmas pessoas: quem estava em 12-18 meses na primeira
          onda está em 24+ agora. Isto compara quem tinha X de casa então com quem tem
          X de casa hoje — é um retrato de faixas, não o acompanhamento de uma coorte.
        </p>
      </div>
    </ChartCard>
  );
}
