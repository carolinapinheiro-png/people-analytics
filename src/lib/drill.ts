import type { DriverPorRecorte } from '@/lib/survey.functions';

/**
 * ===========================================================================
 * O MESMO DADO, LIDO NOS DOIS EIXOS
 * ===========================================================================
 * `survey_driver_scores` é uma matriz: pergunta × recorte. A reunião faz duas
 * perguntas sobre ela, e são a mesma matriz lida em direções diferentes:
 *
 *   "Como está Marketing?"          -> uma área, todas as perguntas
 *   "Quem tem problema com salário?" -> uma pergunta, todas as áreas
 *
 * As duas leituras moram aqui, juntas, porque partem do mesmo lugar e usam a
 * mesma régua (a linha da empresa). Separadas, divergiriam no primeiro ajuste
 * -- alguém mudaria o critério de "abaixo" em um lado e não no outro, e as
 * duas telas passariam a discordar sobre a mesma área.
 *
 * ---------------------------------------------------------------------------
 * A RÉGUA É A EMPRESA, E A DIFERENÇA É EM PONTOS DE % FAVORÁVEL
 * ---------------------------------------------------------------------------
 * `favoravel` (% que respondeu 4 ou 5) é a leitura que o deck da diretoria já
 * usa, e é a que as pessoas discutem. `score` (média 1-5) fica disponível como
 * detalhe: a diferença entre 4,04 e 3,88 não significa nada para quem lê, mas
 * "74% contra 62%" significa.
 */

export interface LinhaDrill {
  driver: string;
  question: string;
  /** % favorável do recorte. `null` quando suprimido por n baixo. */
  favoravel: number | null;
  /** % favorável da empresa na mesma pergunta. */
  favoravelEmpresa: number | null;
  /** Diferença em pontos percentuais. `null` se faltar qualquer um dos dois. */
  gap: number | null;
  n: number;
  score: number | null;
}

const chave = (d: { driver: string; question: string }) => `${d.driver}||${d.question}`;

const dif = (a: number | null, b: number | null): number | null =>
  a == null || b == null ? null : Math.round((a - b) * 10) / 10;

/** A linha da empresa, indexada por pergunta. É a régua das duas leituras. */
function reguaEmpresa(linhas: readonly DriverPorRecorte[]): Map<string, DriverPorRecorte> {
  const m = new Map<string, DriverPorRecorte>();
  for (const l of linhas) if (l.cutType === 'company') m.set(chave(l), l);
  return m;
}

/**
 * Uma área, todas as perguntas -- da mais abaixo da empresa para a mais acima.
 *
 * A ordem é por distância da régua, e não pela nota absoluta, porque a
 * pergunta que a área responde pior costuma ser a que a empresa inteira
 * responde pior: ordenar por nota traria o mesmo topo para todas as nove
 * áreas, e a tela não diria nada sobre AQUELA área.
 */
export function perfilDaArea(
  linhas: readonly DriverPorRecorte[],
  area: string,
): LinhaDrill[] {
  const regua = reguaEmpresa(linhas);
  const alvo = (area ?? '').trim().toLowerCase();

  return linhas
    .filter((l) => l.cutType === 'area' && l.cutValue.trim().toLowerCase() === alvo)
    .map((l) => {
      const emp = regua.get(chave(l));
      return {
        driver: l.driver,
        question: l.question,
        favoravel: l.favoravel,
        favoravelEmpresa: emp?.favoravel ?? null,
        gap: dif(l.favoravel, emp?.favoravel ?? null),
        n: l.n,
        score: l.score,
      };
    })
    // Sem gap vai para o fim: não é "igual à empresa", é "não dá para dizer".
    .sort((a, b) =>
      a.gap == null ? 1 : b.gap == null ? -1 : a.gap - b.gap);
}

export interface AreaNaPergunta {
  area: string;
  favoravel: number | null;
  gap: number | null;
  n: number;
}

/**
 * Uma pergunta, todas as áreas -- da mais abaixo da empresa para a mais acima.
 *
 * Inverte o eixo da conversa. "Remuneração tem as piores notas da empresa" é
 * um fato sobre a empresa e não leva a lugar nenhum; "remuneração está 17
 * pontos abaixo em Marketing e no nível da empresa em Technology" indica onde
 * a conversa acontece.
 */
export function areasNaPergunta(
  linhas: readonly DriverPorRecorte[],
  driver: string,
  question: string,
): AreaNaPergunta[] {
  const k = chave({ driver, question });
  const empresa = reguaEmpresa(linhas).get(k)?.favoravel ?? null;

  return linhas
    .filter((l) => l.cutType === 'area' && chave(l) === k)
    .map((l) => ({
      area: l.cutValue,
      favoravel: l.favoravel,
      gap: dif(l.favoravel, empresa),
      n: l.n,
    }))
    .sort((a, b) => (a.gap == null ? 1 : b.gap == null ? -1 : a.gap - b.gap));
}

/**
 * A onda mediu por área?
 *
 * jan/26 foi carregada só no nível da empresa. Sem esta pergunta, clicar numa
 * área naquela onda abriria um painel vazio -- e vazio se lê como "esta área
 * não tem problema", que é o oposto do que significa. É a mesma distinção já
 * feita em Salários (camada não importada) e na linha do tempo (onda sem
 * dado); a terceira vez que ela aparece, e a razão de virar função com nome.
 */
export function temQuebraPorArea(linhas: readonly DriverPorRecorte[]): boolean {
  return linhas.some((l) => l.cutType === 'area');
}
