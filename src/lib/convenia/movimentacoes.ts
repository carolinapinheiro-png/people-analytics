import { classifyRaise, type RaiseType } from '@/lib/aggregator/monthly-aggregator';
import { ehPromocao } from '@/lib/wil-promocoes';

/**
 * Promoções e movimentações salariais, mês a mês, a partir do histórico do
 * Convenia.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE
 * ===========================================================================
 * A série do Convenia substituiu a reconstruída e não trouxe `promotions` nem
 * `raise_events`. O efeito na tela foi pior que um gráfico vazio: "Promoções"
 * mostrava **0** na Visão geral, e a aba de Movimentações desenhava três séries
 * em zero -- uma afirmação de que ninguém foi promovido, que ninguém pediu ao
 * código para fazer.
 *
 * O dado existe: `/employees/{id}/salaries-historic` devolve um registro por
 * alteração, com o `motive` JÁ CLASSIFICADO pela Convenia. Medido nos 2.457
 * registros da base: Admissão 1289, Dissídio 492, Mérito/Reajuste 463,
 * Promoção 74, Acordo coletivo 49, e mais sete motivos.
 *
 * ===========================================================================
 * AS REGRAS SÃO AS QUE JÁ EXISTIAM -- IMPORTADAS, NÃO REESCRITAS
 * ===========================================================================
 * `classifyRaise` (série reconstruída) e `ehPromocao` (report do WIL) já
 * decidem o que é promoção, mérito e dissídio. Escrever uma terceira versão
 * aqui garantiria que as três divergissem com o tempo -- e a divergência
 * apareceria como "o painel e o WIL discordam", sem ninguém saber qual está
 * certo. Então elas são importadas.
 *
 * ===========================================================================
 * UMA DIFERENÇA DELIBERADA COM A SÉRIE CONGELADA
 * ===========================================================================
 * A série congelada conta REGISTROS de promoção; aqui contam-se PESSOAS. Duas
 * correções lançadas no mesmo mês para a mesma pessoa são um evento de
 * carreira, não dois -- é a regra que o WIL já usa, e é a que responde à
 * pergunta "quantas pessoas foram promovidas".
 *
 * A consequência é que os dois números podem divergir por pouco num mês com
 * relançamento. Está escrito aqui porque alguém vai comparar as duas séries e
 * precisa saber que a diferença é escolha, não erro.
 *
 * `raise_events.n` continua contando EVENTOS: ali a pergunta é quantos
 * reajustes houve e quanto custaram.
 */

export interface MovimentoSalarial {
  conveniaId: string;
  /** `YYYY-MM-DD`, como o Convenia devolve em `date`/`from`. */
  vigencia: string | null;
  /** `motive`, cru. A classificação é feita aqui, não na gravação. */
  motivo: string | null;
  /** Salário que passou a valer nesta alteração. */
  salario: number | null;
}

export interface MesDeMovimentacao {
  /** Pessoas promovidas no mês (não registros -- ver o cabeçalho). */
  promotions: number;
  raise_events: Record<RaiseType, { n: number; delta: number }>;
}

const mesDe = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  const iso = /^(\d{4})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}`;
  // O export do RH escreve dd/mm/aaaa; a API, ISO. As duas formas convivem na
  // casa, e já quebraram uma leitura antes.
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  return br ? `${br[3]}-${br[2]}` : null;
};

const vazio = (): MesDeMovimentacao => ({
  promotions: 0,
  raise_events: {
    promocao: { n: 0, delta: 0 },
    merito: { n: 0, delta: 0 },
    dissidio: { n: 0, delta: 0 },
  },
});

/**
 * Agrupa o histórico de todas as pessoas por mês.
 *
 * O delta de cada evento é `salário do evento menos o último salário conhecido
 * DA MESMA PESSOA` -- por isso o histórico é ordenado por pessoa e por data
 * antes de qualquer conta. Sem isso, o primeiro evento de cada pessoa teria
 * delta igual ao salário inteiro, e o total do mês viraria a folha em vez do
 * reajuste.
 *
 * Devolve SÓ os meses que tiveram movimento. Mês sem chave é "não houve",
 * decidido por quem lê -- e quem lê tem de saber distinguir isso de "a carga
 * não leu o histórico desta pessoa", que é o que `pessoasSemHistorico` mede.
 */
export function movimentacoesPorMes(
  registros: readonly MovimentoSalarial[],
): Map<string, MesDeMovimentacao> {
  const porPessoa = new Map<string, MovimentoSalarial[]>();
  for (const r of registros) {
    if (!r.conveniaId || !r.vigencia) continue;
    const lista = porPessoa.get(r.conveniaId) ?? [];
    lista.push(r);
    porPessoa.set(r.conveniaId, lista);
  }

  const out = new Map<string, MesDeMovimentacao>();
  const doMes = (m: string): MesDeMovimentacao => {
    const a = out.get(m) ?? vazio();
    out.set(m, a);
    return a;
  };
  /** Quem já foi contado como promovido em cada mês -- uma vez por pessoa. */
  const promovidos = new Map<string, Set<string>>();

  for (const [id, lista] of porPessoa) {
    const emOrdem = [...lista].sort((a, b) =>
      (a.vigencia as string).localeCompare(b.vigencia as string));

    let ultimoSalario: number | null = null;
    for (const r of emOrdem) {
      const m = mesDe(r.vigencia);
      if (!m) continue;

      if (ehPromocao(r.motivo)) {
        const set = promovidos.get(m) ?? new Set<string>();
        if (!set.has(id)) {
          set.add(id);
          promovidos.set(m, set);
          doMes(m).promotions++;
        }
      }

      const tipo = classifyRaise(r.motivo);
      // Sem salário anterior não há reajuste a medir: é a admissão, ou a
      // primeira alteração que a carga conseguiu ler. Contar o evento com
      // delta zero inflaria `n` sem inflar o valor, e a média por evento --
      // que é como alguém vai ler isto -- sairia menor que a real.
      if (tipo && ultimoSalario != null && r.salario != null) {
        const a = doMes(m).raise_events[tipo];
        a.n++;
        a.delta += r.salario - ultimoSalario;
      }
      if (r.salario != null) ultimoSalario = r.salario;
    }
  }

  // Centavos acumulados de dezenas de eventos não significam nada e poluem a
  // tela. Mesmo arredondamento da série reconstruída.
  for (const mes of out.values()) {
    for (const t of ['promocao', 'merito', 'dissidio'] as RaiseType[]) {
      mes.raise_events[t].delta = Math.round(mes.raise_events[t].delta);
    }
  }
  return out;
}

/**
 * O mês de um registro, exposto para a carga poder dizer até onde leu.
 *
 * A carga lê o histórico em lotes; enquanto ela não terminar, os meses mais
 * antigos ficam incompletos. Sem saber a cobertura, "3 promoções em março"
 * seria indistinguível de "3 promoções lidas até agora em março".
 */
export const mesDoRegistro = mesDe;
