import { useMemo } from 'react';
import { perfilDaArea, temQuebraPorArea, aderenciaDasPiores } from '@/lib/drill';
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
  const aderencia = useMemo(() => aderenciaDasPiores(drivers), [drivers]);
  const { abaixo, acima, semQuebra, total } = useMemo(() => {
    const semQuebra = !temQuebraPorArea(drivers);
    const linhas = perfilDaArea(drivers, area).filter((l) => l.gap != null);
    return {
      semQuebra,
      total: linhas.length,
      // ------------------------------------------------------------------
      // "ABAIXO" TEM QUE SIGNIFICAR GAP NEGATIVO
      // ------------------------------------------------------------------
      // `acima` sempre filtrou por gap > 0. `abaixo` não filtrava nada: pegava
      // as cinco primeiras linhas fossem quais fossem. Numa área que está acima
      // da empresa em quase tudo -- Technology está acima nos onze temas -- a
      // lista que promete mostrar onde a área vai pior exibia valores
      // POSITIVOS. Foi o "+3" que a Marilia apontou na revisão.
      //
      // O DriverPriority tinha exatamente este bug e foi corrigido, com o
      // comentário "sem este filtro uma área acima da empresa (+17,4) aparecia
      // rotulada como quem puxa para baixo". O irmão ficou para trás. Terceira
      // vez nesta semana que dois componentes fazem o mesmo juízo e só um
      // recebe a correção.
      abaixo: linhas.slice(0, PONTAS).filter((l) => (l.gap ?? 0) < 0),
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

      {/* A primeira lista não tinha título próprio: o cabeçalho acima servia
          para ela, e só a segunda dizia "onde está acima". Quem lia inferia o
          sentido da primeira pelo contraste com a segunda -- o que funciona
          até a primeira aparecer com um número positivo dentro. */}
      {abaixo.length > 0 ? (
        <>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Onde está abaixo
          </p>
          <div className="space-y-0.5">
            {abaixo.map((l) => <Linha key={l.question} l={l} />)}
          </div>
        </>
      ) : (
        // Lista vazia aqui é achado, não ausência -- e some se não for dita.
        <p className="text-[12px] leading-relaxed" style={{ color: COLORS.success }}>
          {area} não está abaixo da empresa em nenhuma das {total} perguntas comparáveis.
        </p>
      )}

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

      {/* ------------------------------------------------------------------
          A JUSTIFICATIVA VIRA NÚMERO, E O NÚMERO SAI DESTA ONDA
          ------------------------------------------------------------------
          Dizia "a pergunta que esta área responde pior COSTUMA SER a que a
          empresa inteira responde pior". A Marilia leu, olhou a lista acima,
          viu perguntas bem diferentes entre as áreas e desconfiou.

          Ela tinha razão sobre o que via, e a frase também estava certa: as
          duas falam de coisas diferentes. A lista mostra DISTÂNCIA, que varia
          muito. A frase falava de NOTA, que quase não varia. Nada na tela
          fazia essa separação.

          Agora os dois números aparecem juntos, calculados da onda que está
          sendo mostrada. "Costuma ser" era do tipo de afirmação que ninguém
          consegue conferir -- e este painel já carregou várias dessas que
          envelheceram para mentira. */}
      <p className="text-[11px] text-muted-foreground mt-2.5 leading-relaxed">
        {total} perguntas comparáveis. A ordem é pela <strong>distância</strong> até a empresa, e
        não pela nota — e as duas listas seriam bem diferentes.
        {aderencia && aderencia.areas > 1 && (
          <>
            {' '}
            Por nota, o topo seria quase o mesmo para todo mundo: em{' '}
            <strong>
              {aderencia.seguemAEmpresa} das {aderencia.areas} áreas
            </strong>{' '}
            desta onda, a pergunta de pior nota está entre as três piores da empresa inteira. Por
            distância, o topo muda: são <strong>{aderencia.distanciasDistintas}</strong> perguntas
            diferentes encabeçando as {aderencia.areas} áreas.
          </>
        )}{' '}
        É o afastamento que separa problema daqui de problema de todo mundo.
      </p>
    </div>
  );
}
