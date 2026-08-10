import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import ChartCard from '@/components/dashboard/ChartCard';
import { COLORS } from '@/lib/colors';
import { median } from '@/lib/stats';
import { cn } from '@/lib/utils';
import {
  Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import type { SurveyImportance } from '@/lib/survey.functions';

/**
 * As perguntas onde mexer tende a render mais, como lista.
 *
 * ------------------------------------------------------------------
 * POR QUE LISTA E NÃO A DISPERSÃO QUE ESTAVA AQUI
 * ------------------------------------------------------------------
 * A versão anterior era um gráfico de nota × associação com quatro quadrantes.
 * Estatisticamente é a representação certa: mostra as 31 perguntas de uma vez e
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

export default function DriverPriority({ rows }: { rows: SurveyImportance[] }) {
  const [verTodas, setVerTodas] = useState(false);

  const { prioridade, sustentar, cortes, temaDominante } = useMemo(() => {
    const cr = median(rows.map((i) => i.r)) ?? 0;
    // O corte de "nota baixa" passa a ser em % favorável: é a leitura principal,
    // e a mediana da média daria um recorte ligeiramente diferente para a mesma
    // pergunta -- duas verdades para o mesmo dado na mesma tela.
    const cn = median(rows.map((i) => i.favoravel ?? i.score * 20)) ?? 0;
    const ordenado = [...rows].sort((a, b) => b.r - a.r);
    const fav = (i: SurveyImportance) => i.favoravel ?? i.score * 20;
    const prioridade = ordenado.filter((i) => i.r >= cr && fav(i) < cn);
    const sustentar = ordenado.filter((i) => i.r >= cr && fav(i) >= cn).slice(0, 4);

    const porTema = new Map<string, number>();
    for (const p of prioridade) porTema.set(p.driver, (porTema.get(p.driver) ?? 0) + 1);
    const [tema, qtd] = [...porTema.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];

    const rs = rows.map((i) => i.r).sort((a, b) => b - a);
    return {
      prioridade, sustentar,
      cortes: { alto: rs[Math.floor(rs.length * 0.25)] ?? 0, medio: cr },
      temaDominante: qtd >= 2 ? { tema, qtd } : null,
    };
  }, [rows]);

  if (rows.length < 6) return null;

  const lista = verTodas ? [...rows].sort((a, b) => b.r - a.r) : prioridade;

  return (
    <ChartCard
      title="Por onde começar, pergunta por pergunta"
      subtitle={`% que concorda · ${rows.length} perguntas · ${rows[0]?.n ?? 0} respostas`}
    >
      {temaDominante && (
        <p className="text-sm leading-relaxed mb-3">
          Das {prioridade.length} perguntas com menor concordância que mais acompanham o
          engajamento,{' '}
          <strong>{temaDominante.qtd} são de {temaDominante.tema.toLowerCase()}</strong>. Remuneração
          tem as piores notas da empresa, mas acompanha menos — é problema real, e não é o que
          separa quem está engajado de quem não está.
        </p>
      )}

      <div className="space-y-0.5">
        {lista.map((p) => {
          const alta = p.r >= cortes.alto;
          return (
            <div key={p.question} className="flex items-start gap-3 py-1.5 border-b border-border/40 last:border-0">
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
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 mt-3">
        <button
          onClick={() => setVerTodas((v) => !v)}
          className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          {verTodas ? `mostrar só as ${prioridade.length} de maior prioridade` : `ver todas as ${rows.length} perguntas`}
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
                Mede o quanto a resposta da pergunta acompanha o eNPS <strong>da mesma pessoa</strong>,
                entre as {rows[0]?.n ?? 0} que responderam.
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
