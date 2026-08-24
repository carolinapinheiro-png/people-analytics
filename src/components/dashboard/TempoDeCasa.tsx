import { useMemo } from 'react';
import { Hourglass } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import AvisoForaDoFiltro from '@/components/dashboard/AvisoForaDoFiltro';
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
}: {
  ondas: Array<{ label: string; faixas: FaixaOnda[] }>;
  /**
   * Só para o aviso. Esta série é carregada no nível da empresa e não muda com
   * o filtro -- e era exatamente isso o problema: filtrada em Marketing, ela
   * mostrava 83/76/80 igualzinho, e quem lia entendia que era o tempo de casa
   * de Marketing. Um bloco que não obedece ao filtro precisa dizer isso.
   */
  departamentoSelecionado?: string | null;
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
      subtitle={`eNPS por tempo de casa · ${ondas.map((o) => o.label).join(' → ')}`}
      icon={Hourglass}
    >
      <AvisoForaDoFiltro
        departamento={departamentoSelecionado}
        motivo="O eNPS por tempo de casa foi carregado só no nível da empresa — não existe a quebra por área nesta série."
      />
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
        {/* A leitura que a terceira onda permite. Só aparece quando há três. */}
        {temTrajetoria && quedas.length > 0 && (
          <p className="text-[13px] leading-relaxed">
            <strong>
              {quedas.length === 1 ? 'Uma faixa cai' : `${quedas.length} faixas caem`} em todas as
              medições: {quedas.map((q) => q.faixa).join(', ')}.
            </strong>{' '}
            As demais sobem e descem sem direção. Queda sem interrupção em três
            medições é um processo; oscilação é o que amostras pequenas fazem — e
            a diferença entre as duas não apareceria comparando só as pontas.
          </p>
        )}

        <p className="text-[13px] leading-relaxed">
          {mixRelevante ? (
            <>
              <strong>Boa parte disso é composição.</strong> Com a distribuição de
              tempo de casa de {ondas[0].label}, o eNPS de hoje seria{' '}
              <strong>{fmt1(comp.contrafactual)}</strong> em vez de {fmt1(comp.atual)} —{' '}
              {fmt1(Math.abs(comp.efeitoMix as number))} dos{' '}
              {fmt1(Math.abs(comp.variacaoTotal))} pontos vêm de mudar quem são as
              pessoas, e não de mudarem de opinião.
            </>
          ) : (
            <>
              <strong>Isso não é composição.</strong> Se a distribuição de tempo de
              casa fosse a de {ondas[0].label}, o eNPS de hoje seria{' '}
              <strong>{fmt1(comp.contrafactual)}</strong> — praticamente o mesmo{' '}
              {fmt1(comp.atual)} de agora. O mix explica{' '}
              {fmt1(Math.abs(comp.efeitoMix as number))} de{' '}
              {fmt1(Math.abs(comp.variacaoTotal))} pontos. A variação é de opinião,
              não de quem respondeu.
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
