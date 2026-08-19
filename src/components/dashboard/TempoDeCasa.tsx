import { useMemo } from 'react';
import { Hourglass } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { variacaoPorFaixa, efeitoComposicao, type FaixaOnda } from '@/lib/analise-engajamento';
import { TEMPO_ORDEM } from '@/lib/aggregator/polly-survey';

/**
 * Onde a queda aconteceu.
 *
 * ------------------------------------------------------------------
 * O ACHADO QUE PEDIU ESTE QUADRO
 * ------------------------------------------------------------------
 * A aba mostrava as faixas de tempo de casa da onda atual e nunca as comparava
 * entre ondas. Foi comparando que apareceu, em 19/08/2026, a leitura mais útil
 * que a pesquisa produziu até agora: a queda de 13 pontos do eNPS da empresa
 * NÃO está distribuída.
 *
 *     0-3 meses ....... -3      quem chega continua chegando animado
 *     6-9 meses ....... +5      esta faixa até melhorou
 *     12-18 meses ..... -20
 *     18-24 meses ..... -14
 *     24+ meses ....... -17
 *
 * Uma queda de 13 pontos lida como "a empresa piorou" leva a agir em todo
 * lugar. Lida assim, aponta para longe de contratação e de onboarding -- e
 * para o que acontece depois do primeiro ano.
 *
 * ------------------------------------------------------------------
 * O TESTE DE COMPOSIÇÃO VEM JUNTO, E NÃO DEPOIS
 * ------------------------------------------------------------------
 * "Mas a empresa dobrou de tamanho" é a primeira objeção que aparece na sala,
 * e é legítima: se entrou muita gente nova e gente nova responde melhor, a
 * média sobe sem ninguém mudar de opinião -- e o contrário também.
 *
 * A objeção é verificável, então ela é verificada aqui, ao lado do gráfico, em
 * vez de encerrar a conversa por autoridade. Neste dado ela não se sustenta: o
 * mix explica 0,4 ponto de 12,7.
 *
 * Eu mesmo errei essa leitura antes neste projeto -- afirmei que parte de uma
 * queda era composição e, ao refazer, o efeito ia na direção contrária. É
 * conta que não pode ficar na cabeça de ninguém.
 */

const fmt1 = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const sinal = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${fmt1(v)}`);

export default function TempoDeCasa({
  atual, anterior, atualLabel, anteriorLabel,
}: {
  atual: FaixaOnda[];
  anterior: FaixaOnda[];
  atualLabel: string;
  anteriorLabel: string;
}) {
  const { linhas, comp, maiorQueda } = useMemo(() => {
    const linhas = variacaoPorFaixa(atual, anterior, TEMPO_ORDEM);
    const comp = efeitoComposicao(atual, anterior);
    const comVar = linhas.filter((l) => l.variacao != null);
    const maiorQueda = comVar.length
      ? [...comVar].sort((a, b) => (a.variacao as number) - (b.variacao as number))[0]
      : null;
    return { linhas, comp, maiorQueda };
  }, [atual, anterior]);

  if (linhas.length < 3 || comp.variacaoTotal == null) return null;

  const maxAbs = Math.max(...linhas.map((l) => Math.abs(l.variacao ?? 0)), 1);

  // O mix é "pouco" quando explica menos de um quinto da variação. Abaixo
  // disso, dizer que a composição explica seria dar peso a um resíduo.
  const mixRelevante = comp.efeitoMix != null && comp.variacaoTotal !== 0
    && Math.abs(comp.efeitoMix) > Math.abs(comp.variacaoTotal) * 0.2;

  return (
    <ChartCard
      title="Onde a queda aconteceu"
      subtitle={`eNPS por tempo de casa · ${anteriorLabel} → ${atualLabel}`}
      icon={Hourglass}
    >
      <div className="space-y-0.5">
        {linhas.map((l) => {
          const v = l.variacao;
          const cor = v == null ? COLORS.gray400 : v < 0 ? COLORS.danger : COLORS.success;
          return (
            <div key={l.faixa} className="flex items-center gap-2 py-1 text-[12px]">
              <span className="w-[92px] shrink-0 truncate">{l.faixa}</span>

              <span className="tabular-nums w-8 text-right text-muted-foreground">
                {l.enpsAntes ?? '—'}
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="tabular-nums w-8 text-right font-semibold">
                {l.enpsAgora ?? '—'}
              </span>

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

              <span className="tabular-nums w-11 text-right font-semibold" style={{ color: cor }}>
                {sinal(v)}
              </span>
              <span className="tabular-nums w-16 text-right text-[11px] text-muted-foreground">
                n {l.nAntes}→{l.nAgora}
              </span>
            </div>
          );
        })}
      </div>

      {/* ----------------------------------------------------------------
          O TESTE DA OBJEÇÃO, ESCRITO
          ----------------------------------------------------------------
          Não é um número solto: é a resposta a uma frase específica que
          alguém vai dizer. Por isso está em prosa e cita os dois cenários. */}
      <div className="mt-3 pt-2.5 border-t border-border/60">
        <p className="text-[13px] leading-relaxed">
          {mixRelevante ? (
            <>
              <strong>Boa parte disso é composição.</strong> Com a distribuição de
              tempo de casa de {anteriorLabel}, o eNPS de hoje seria{' '}
              <strong>{fmt1(comp.contrafactual)}</strong> em vez de {fmt1(comp.atual)} —
              ou seja, {fmt1(Math.abs(comp.efeitoMix as number))} dos{' '}
              {fmt1(Math.abs(comp.variacaoTotal))} pontos vêm de mudar quem são as
              pessoas, e não de mudarem de opinião.
            </>
          ) : (
            <>
              <strong>Isso não é composição.</strong> Se a distribuição de tempo de
              casa fosse a de {anteriorLabel}, o eNPS de hoje seria{' '}
              <strong>{fmt1(comp.contrafactual)}</strong> — praticamente o mesmo{' '}
              {fmt1(comp.atual)} de agora. O mix explica{' '}
              {fmt1(Math.abs(comp.efeitoMix as number))} de{' '}
              {fmt1(Math.abs(comp.variacaoTotal))} pontos. A variação é de opinião,
              não de quem respondeu.
            </>
          )}
        </p>

        {maiorQueda && (maiorQueda.variacao as number) < 0 && (
          <p className="text-[12px] text-muted-foreground mt-1.5 leading-relaxed">
            Maior queda: <strong className="text-foreground">{maiorQueda.faixa}</strong>{' '}
            ({sinal(maiorQueda.variacao)}). As faixas não são as mesmas pessoas — quem
            estava em 12-18 meses na onda anterior está em 24+ agora — então isto é um
            retrato de faixas, não o acompanhamento de uma coorte. A direção se
            sustenta; a precisão de cada linha, menos.
          </p>
        )}
      </div>
    </ChartCard>
  );
}
