import { useMemo } from 'react';
import { SplitSquareHorizontal } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import { dispersaoEntreAreas } from '@/lib/analise-engajamento';
import type { DriverPorRecorte } from '@/lib/survey.functions';
import { ehResidual } from '@/lib/engagement-context';

/**
 * Problema da empresa, ou de alguém?
 *
 * ------------------------------------------------------------------
 * A DISTINÇÃO QUE MUDA QUEM É CHAMADO NA REUNIÃO
 * ------------------------------------------------------------------
 * Duas perguntas com a mesma nota baixa na empresa pedem ações opostas, e o
 * painel não separava as duas:
 *
 *   Todo mundo responde igual  -> é política, processo, estrutura. Chamar o
 *   líder da área de pior nota não resolve: ele não tem alavanca, e a nota
 *   dele é a nota de todo mundo. Cobrar ali é injusto e ineficaz ao mesmo
 *   tempo.
 *
 *   As áreas respondem muito diferente -> a mesma empresa está produzindo
 *   experiências diferentes conforme onde a pessoa está. Aí existe algo local
 *   a fazer -- e existe de quem aprender, porque alguém já resolveu.
 *
 * A aba mostrava a nota da empresa e mostrava a nota por área. Nunca mostrava
 * a DIFERENÇA entre as áreas, que é onde essa distinção mora.
 *
 * ------------------------------------------------------------------
 * AMPLITUDE, E NÃO DESVIO PADRÃO
 * ------------------------------------------------------------------
 * Com oito ou nove áreas, desvio padrão é uma estatística que ninguém lê e que
 * esconde justamente o que interessa: QUAIS áreas estão nas pontas. "Technology
 * 95%, Marketing 55%" resolve a conversa; "desvio 12,4" exige uma segunda
 * pergunta para virar decisão.
 */

const fmt0 = (v: number | null) => (v == null ? '—' : `${Math.round(v)}%`);

/** Acima disto a experiência é claramente diferente conforme a área. */
const CORTE_LOCAL = 20;
/** Abaixo disto, todas as áreas praticamente empatam. */
const CORTE_EMPRESA = 10;

export default function DispersaoAreas({
  drivers, quantas = 5,
}: {
  drivers: DriverPorRecorte[];
  quantas?: number;
}) {
  const { locais, daEmpresa } = useMemo(() => {
    const empresa = new Map<string, number | null>();
    for (const d of drivers) {
      if (d.cutType === 'company') empresa.set(`${d.driver}||${d.question}`, d.favoravel);
    }
    const notas = drivers
      // Mesmo motivo do drill: o balde residual não é uma área de quem
      // aprender nem a quem cobrar, e a amplitude "melhor menos pior" fica
      // inflada quando uma das pontas é um grupo sem dono.
      .filter((d) => d.cutType === 'area' && !ehResidual(d.cutValue))
      .map((d) => ({
        driver: d.driver, question: d.question, area: d.cutValue,
        favoravel: d.favoravel, n: d.n,
      }));
    const todas = dispersaoEntreAreas(notas, empresa);
    return {
      locais: todas.filter((d) => d.amplitude >= CORTE_LOCAL).slice(0, quantas),
      // As mais parelhas primeiro, e só as que também têm nota baixa: uma
      // pergunta em que todo mundo vai bem e vai igual não é problema de
      // ninguém, e ocuparia a lista sem dizer nada.
      daEmpresa: [...todas].reverse()
        .filter((d) => d.amplitude <= CORTE_EMPRESA && (d.empresa ?? 100) < 80)
        .slice(0, quantas),
    };
  }, [drivers, quantas]);

  if (!locais.length && !daEmpresa.length) return null;

  const Linha = ({ d, local }: { d: typeof locais[number]; local: boolean }) => (
    <div className="py-1.5 border-b border-border/40 last:border-0">
      <div className="flex items-start gap-2">
        <span
          className="tabular-nums text-[11px] font-semibold w-9 shrink-0 text-right"
          style={{ color: local ? COLORS.warning : COLORS.info }}
        >
          {local ? `${Math.round(d.amplitude)}pp` : '≈'}
        </span>
        <span className="text-[12px] leading-snug min-w-0 flex-1">
          {d.question}
          <span className="text-muted-foreground"> · {d.driver}</span>
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
          empresa {fmt0(d.empresa)}
        </span>
      </div>
      {local && (
        <p className="text-[11px] text-muted-foreground mt-0.5 ml-11">
          <strong className="text-emerald-600 dark:text-emerald-500">{d.melhor.area} {fmt0(d.melhor.favoravel)}</strong>
          {' · '}
          <strong className="text-red-600 dark:text-red-500">{d.pior.area} {fmt0(d.pior.favoravel)}</strong>
        </p>
      )}
    </div>
  );

  return (
    <ChartCard
      title="Problema da empresa, ou de alguém?"
      subtitle="quanto cada pergunta varia entre as áreas"
      icon={SplitSquareHorizontal}
    >
      {locais.length > 0 && (
        <>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Depende de onde a pessoa está
          </p>
          <p className="text-[12px] text-muted-foreground mb-1.5 leading-relaxed">
            A mesma empresa produz experiências muito diferentes aqui. Existe algo
            local a fazer — e alguém de quem aprender.
          </p>
          <div>{locais.map((d) => <Linha key={d.question} d={d} local />)}</div>
        </>
      )}

      {daEmpresa.length > 0 && (
        <>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 mt-4">
            Igual em todo lugar, e com nota baixa
          </p>
          <p className="text-[12px] text-muted-foreground mb-1.5 leading-relaxed">
            Todas as áreas respondem parecido. Cobrar o líder da pior nota não
            resolve: ele não tem alavanca, e a nota dele é a de todo mundo. Isto é
            política, processo ou estrutura.
          </p>
          <div>{daEmpresa.map((d) => <Linha key={d.question} d={d} local={false} />)}</div>
        </>
      )}

      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        A medida é a distância em pontos percentuais entre a área que mais concorda e
        a que menos concorda. Áreas com poucas respostas ficam de fora — com três
        pessoas, a diferença diz mais sobre quem respondeu que sobre a área.
      </p>
    </ChartCard>
  );
}
