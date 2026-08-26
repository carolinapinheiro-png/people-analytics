import { useMemo, useState } from 'react';
import { Grid3x3 } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import { matrizAreaDriver, perfilUniforme, type CelulaAreaDriver } from '@/lib/drill';
import { cn } from '@/lib/utils';
import type { DriverPorRecorte } from '@/lib/survey.functions';

/**
 * A grade área × driver.
 *
 * ------------------------------------------------------------------
 * O QUE ELA MOSTRA QUE AS OUTRAS TELAS NÃO MOSTRAVAM
 * ------------------------------------------------------------------
 * A aba já respondia "como está Marketing?" e "quem tem problema com salário?".
 * As duas exigem saber a pergunta antes de fazê-la, e por isso escondiam o que
 * só aparece comparando as áreas entre si:
 *
 *   - áreas ABAIXO EM TUDO, que não têm 11 problemas temáticos e sim um
 *     problema de time;
 *   - áreas POLARIZADAS, muito abaixo num driver e muito acima em outro, onde
 *     a média da área não descreve nada;
 *   - drivers que separam as áreas de drivers iguais em todo lugar -- os
 *     primeiros são conversa de gestor, os segundos são decisão de empresa.
 *
 * Chegar a qualquer um desses lendo área por área custava nove aberturas e uma
 * planilha ao lado.
 *
 * ------------------------------------------------------------------
 * A COR É A DISTÂNCIA DA EMPRESA, NÃO A NOTA
 * ------------------------------------------------------------------
 * Pintar pela nota absoluta deixaria a coluna de remuneração vermelha inteira e
 * a de propósito verde inteira, em todas as áreas -- um retrato de quais temas
 * a empresa responde melhor, que já está em outro cartão, e nada sobre as áreas.
 * Contra a régua da empresa, a célula responde "aqui é diferente do resto?", que
 * é a pergunta que faz alguém procurar um gestor.
 *
 * Consequência a dizer em voz alta: metade das células fica em tom frio por
 * construção. Uma área "abaixo da empresa" em remuneração pode ter 70% de
 * concordância. A grade ordena, não reprova.
 */

/** Pontos de % a partir dos quais a diferença ganha cor cheia. */
const FORTE = 10;
const LEVE = 4;

function corDaCelula(gap: number | null): { bg: string; fg: string } {
  if (gap == null) return { bg: 'transparent', fg: 'var(--muted-foreground)' };
  const a = Math.abs(gap);
  const intensidade = a >= FORTE ? 0.22 : a >= LEVE ? 0.12 : 0.05;
  const base = gap < 0 ? COLORS.danger : COLORS.success;
  return {
    bg: `color-mix(in srgb, ${base} ${intensidade * 100}%, transparent)`,
    fg: a >= FORTE ? base : 'var(--foreground)',
  };
}

/**
 * `+0` aparecia quando o gap era 0,4: sinal de positivo sobre um zero, que se lê
 * como erro. Diferença que arredonda para zero é "igual à empresa", e é isso que
 * a célula deve dizer.
 */
const sinal = (g: number) => {
  const r = Math.round(g);
  return r === 0 ? '0' : `${r > 0 ? '+' : ''}${r}`;
};

/** "Comunicação e Transparência Organizacional" não cabe numa coluna. */
/**
 * O nome do tema, inteiro.
 *
 * ------------------------------------------------------------------
 * CORTAR EM 24 CARACTERES APAGAVA A INFORMAÇÃO
 * ------------------------------------------------------------------
 * Havia um `curto()` que truncava tudo acima de 26 caracteres. Na tela isso
 * virava "Desempenho, Responsabili…", "Propósito, Clareza de Pa…" e
 * "Comunicação e Transparên…" -- e a Anna apontou os textos cortados.
 *
 * O problema não é estético. Os temas desta pesquisa são frases, e a parte que
 * distingue um do outro costuma estar no fim: "Apoio de RH e Processos de
 * Gestão de Pessoas" some inteiro depois de "Apoio de RH e Proces…". Truncar
 * pela esquerda mantém o começo, que é a parte genérica.
 *
 * A coluna é sticky e a tabela rola na horizontal, então o nome inteiro cabe
 * sem empurrar as células para fora do alcance.
 */
const NOME_DO_TEMA = 'whitespace-nowrap';

export default function MatrizAreaDriver({
  linhas,
  ondaLabel,
}: {
  linhas: DriverPorRecorte[];
  ondaLabel?: string;
}) {
  const [celula, setCelula] = useState<CelulaAreaDriver | null>(null);
  const m = useMemo(() => matrizAreaDriver(linhas), [linhas]);
  const uniformes = useMemo(() => perfilUniforme(m), [m]);

  if (!m.areas.length || !m.drivers.length) return null;

  const comValor = m.celulas.filter((c) => c.favoravel != null).length;
  const suprimidas = m.celulas.length - comValor;
  // Várias frases abaixo comparam as áreas entre si. Com uma só -- o que o
  // filtro de departamento produz -- elas descrevem um cálculo que não houve.
  const varias = m.areas.length > 1;

  return (
    <ChartCard
      title="Cada área, tema por tema"
      subtitle={`${m.drivers.length} temas × ${m.areas.length} ${
        m.areas.length === 1 ? 'área' : 'áreas'
      }${ondaLabel ? ` · ${ondaLabel}` : ''} · distância da empresa, em pontos de % que concorda`}
      icon={Grid3x3}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0.5 text-[11px]">
          <thead>
            <tr>
              <th className="text-left font-normal text-muted-foreground pb-1 pr-2 sticky left-0 bg-background z-10">
                tema
              </th>
              {m.areas.map((a) => (
                <th
                  key={a}
                  className="font-normal text-muted-foreground pb-1 px-1 align-bottom"
                  title={a}
                >
                  <span className="block text-[10px] leading-tight">{a}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.drivers.map((d) => (
              <tr key={d}>
                <td
                  className={`pr-3 py-0.5 ${NOME_DO_TEMA} sticky left-0 bg-background z-10`}
                  title={d}
                >
                  {d}
                </td>
                {m.areas.map((a) => {
                  const c = m.mapa.get(`${a}||${d}`);
                  const cor = corDaCelula(c?.gap ?? null);
                  const ativa = celula?.area === a && celula?.driver === d;
                  return (
                    <td key={a} className="p-0">
                      <button
                        type="button"
                        disabled={!c || c.favoravel == null}
                        onClick={() => setCelula(ativa ? null : (c ?? null))}
                        className={cn(
                          'w-full h-7 rounded tabular-nums transition-all',
                          c?.favoravel != null && 'hover:ring-1 hover:ring-foreground/30',
                          ativa && 'ring-2 ring-foreground/60',
                        )}
                        style={{ background: cor.bg, color: cor.fg }}
                        title={
                          c?.favoravel == null
                            ? `${a} · ${d}: sem dado suficiente`
                            : `${a} · ${d}: ${c.favoravel}% concordam (empresa ${c.favoravelEmpresa}%)`
                        }
                      >
                        {c?.gap == null ? '·' : sinal(c.gap)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {celula && celula.favoravel != null && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1.5">
          <div className="font-medium">
            {celula.area} · {celula.driver}
          </div>
          <div className="text-muted-foreground">
            <strong className="text-foreground tabular-nums">{celula.favoravel}%</strong> concordam,
            contra {celula.favoravelEmpresa}% na empresa —{' '}
            <strong style={{ color: celula.gap! < 0 ? COLORS.danger : COLORS.success }}>
              {sinal(celula.gap!)} pontos
            </strong>
            . Média de {celula.perguntas} pergunta{celula.perguntas === 1 ? '' : 's'}, a menor com{' '}
            {celula.nMinimo} respostas.
          </div>
          {/* A média do tema esconde a pergunta ruim -- é a mesma advertência de
              "Tema por tema, e o que a média esconde", e aqui ela pesa mais, porque na
              grade nem o intervalo aparece. */}
          {celula.pior && (
            <div className="text-muted-foreground pt-1 border-t border-border/60">
              A que mais pesa: &quot;{celula.pior.question}&quot; —{' '}
              <span className="tabular-nums">{celula.pior.favoravel}%</span> (
              {sinal(celula.pior.gap!)} contra a empresa).
            </div>
          )}
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {uniformes.length > 0 && (
          <p className="text-[11px] leading-relaxed">
            <strong>O que a grade mostra e a leitura área a área não mostrava:</strong>{' '}
            {uniformes.map((u, i) => (
              <span key={u.area}>
                {i > 0 && (i === uniformes.length - 1 ? ' e ' : '; ')}
                <strong>{u.area}</strong> está {u.direcao} da empresa em{' '}
                {Math.round(u.proporcao * u.drivers)} dos {u.drivers} temas
              </span>
            ))}
            .{' '}
            {uniformes.some((u) => u.direcao === 'abaixo') &&
              'Uma área abaixo em quase tudo raramente tem um problema por tema — é mais provável que seja um só, e que ele apareça em todas as respostas daquele time.'}
          </p>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong>Como ler:</strong> cada célula é a distância daquela área para a empresa, em
          pontos de % que concorda. Vermelho é abaixo, verde é acima; o tom forte começa em{' '}
          {FORTE} pontos. Clique numa célula para ver a pergunta que mais pesa nela.
          {/* A ordem das linhas é a amplitude ENTRE áreas. Com uma área só na
              tela não há amplitude nenhuma -- a ordem vira arbitrária, e
              anunciá-la como "os temas que mais separam as áreas" seria
              descrever um cálculo que não aconteceu. */}
          {varias ? (
            <>
              {' '}As linhas estão ordenadas pelos temas que{' '}
              <strong>mais separam as áreas</strong> — os de baixo são parecidos em todo lugar, e
              por isso são decisão de empresa, não conversa de gestor.
            </>
          ) : (
            <>
              {' '}A ordem das linhas vem da comparação entre as áreas, que o filtro tirou da
              tela — aqui ela não quer dizer nada. Tire o filtro de departamento para ver a grade
              inteira.
            </>
          )}
        </p>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {/* "Metade fica em vermelho" descreve a GRADE INTEIRA, onde as áreas
              se distribuem em volta da mediana. Filtrada em Marketing, a tela
              mostrava 11 células vermelhas de 11 embaixo de uma frase dizendo
              que metade fica assim por construção -- a ressalva contradizia o
              que estava logo acima dela. */}
          A régua é a empresa
          {varias ? (
            <>
              , então <strong>metade das células fica em vermelho por construção</strong> — é assim
              que uma comparação com a média funciona.
            </>
          ) : (
            <>, e não esta área — o vermelho mede distância do resto da casa, não do bom.</>
          )}{' '}
          Vermelho aqui significa &quot;abaixo do resto da casa&quot;, não &quot;ruim&quot;: uma
          área pode estar −8 num tema em que ela própria tem 78% de concordância.
          {suprimidas > 0 && (
            <>
              {' '}
              {suprimidas} célula{suprimidas === 1 ? '' : 's'} aparece{suprimidas === 1 ? '' : 'm'}{' '}
              como &quot;·&quot;: o grupo era pequeno demais para publicar sem identificar quem
              respondeu.
            </>
          )}
        </p>
      </div>
    </ChartCard>
  );
}
