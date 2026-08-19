import { useMemo } from 'react';
import { perfilDaArea, temQuebraPorArea } from '@/lib/drill';
import type { DriverPorRecorte } from '@/lib/survey.functions';
import { COLORS } from '@/lib/colors';

/**
 * O perfil de drivers de uma área, aberto ao clicar nela.
 *
 * ------------------------------------------------------------------
 * ORDENADO PELA DISTÂNCIA DA EMPRESA, NÃO PELA NOTA
 * ------------------------------------------------------------------
 * Ordenar por nota absoluta traria o mesmo topo para as nove áreas: as
 * perguntas que uma área responde pior costumam ser as que a empresa inteira
 * responde pior. A tela ficaria bonita e não diria nada sobre AQUELA área.
 *
 * A distância da régua da empresa é o que separa "problema da empresa" de
 * "problema daqui" -- e só o segundo é acionável por quem lidera a área.
 *
 * ------------------------------------------------------------------
 * MOSTRA AS DUAS PONTAS, NÃO SÓ AS PIORES
 * ------------------------------------------------------------------
 * Uma lista só de problemas convida à leitura de que a área é um desastre.
 * Ver que ela está 12 pontos acima em "meu gestor se comunica" ao lado de 17
 * abaixo em remuneração muda a conversa de "o que há de errado com vocês" para
 * "onde vocês são fortes e onde não são".
 */

const fmt = (v: number | null) => (v == null ? '—' : `${Math.round(v)}%`);
const sinal = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}`);

/** Quantas perguntas de cada ponta. O meio quase nunca muda decisão. */
const PONTAS = 5;

export default function AreaDriverPanel({
  area, drivers, minimoExibicao,
}: {
  area: string;
  drivers: DriverPorRecorte[];
  minimoExibicao: number;
}) {
  const { abaixo, acima, semQuebra, total } = useMemo(() => {
    const semQuebra = !temQuebraPorArea(drivers);
    const linhas = perfilDaArea(drivers, area).filter((l) => l.gap != null);
    return {
      semQuebra,
      total: linhas.length,
      abaixo: linhas.slice(0, PONTAS),
      acima: [...linhas].reverse().slice(0, PONTAS).filter((l) => (l.gap ?? 0) > 0),
    };
  }, [drivers, area]);

  // Onda carregada só no nível da empresa -- jan/26 é assim. Painel vazio se
  // leria como "esta área não tem problema", que é o oposto do que significa.
  if (semQuebra) {
    return (
      <div className="mt-1 mb-2 ml-[130px] rounded-md border border-dashed border-border px-3 py-2.5">
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Esta onda foi carregada só no nível da empresa — as notas por pergunta
          não foram quebradas por área. Não é que <strong>{area}</strong> não
          tenha nada a mostrar: é que essa medição não existe nesta onda.
        </p>
      </div>
    );
  }

  if (!total) {
    return (
      <div className="mt-1 mb-2 ml-[130px] rounded-md border border-dashed border-border px-3 py-2.5">
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Sem notas comparáveis para <strong>{area}</strong> nesta onda. Com menos
          de {minimoExibicao} respostas num recorte, a nota não é exibida — o
          número existe, mas identificaria quem respondeu.
        </p>
      </div>
    );
  }

  const Linha = ({ l }: { l: ReturnType<typeof perfilDaArea>[number] }) => (
    <div className="flex items-start gap-2 py-[3px]">
      <span
        className="tabular-nums text-[11px] font-semibold w-11 shrink-0 text-right"
        style={{ color: (l.gap ?? 0) < 0 ? COLORS.danger : COLORS.success }}
      >
        {sinal(l.gap)}
      </span>
      <span className="text-[12px] leading-snug min-w-0">
        {l.question}
        <span className="text-muted-foreground">
          {' '}· {fmt(l.favoravel)} aqui contra {fmt(l.favoravelEmpresa)} na empresa
        </span>
      </span>
    </div>
  );

  return (
    <div className="mt-1 mb-2 ml-[130px] rounded-md border border-border bg-secondary/30 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
        {area} · distância da empresa, em pontos de % que concorda
      </p>

      <div className="space-y-0.5">
        {abaixo.map((l) => <Linha key={l.question} l={l} />)}
      </div>

      {acima.length > 0 && (
        <>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-2.5 mb-1.5">
            Onde está acima
          </p>
          <div className="space-y-0.5">
            {acima.map((l) => <Linha key={l.question} l={l} />)}
          </div>
        </>
      )}

      <p className="text-[11px] text-muted-foreground mt-2.5 leading-relaxed">
        {total} perguntas comparáveis. A ordem é pela distância da empresa, e não
        pela nota: a pergunta que esta área responde pior costuma ser a que a
        empresa inteira responde pior — o que separa problema daqui de problema
        de todo mundo é o afastamento.
      </p>
    </div>
  );
}
