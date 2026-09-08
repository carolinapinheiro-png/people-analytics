import { comporCruzamento, CUTS_PADRAO } from '@/lib/aggregator/polly-survey';
import { semFiltro, valorFiltro } from '@/lib/filtro-sentinela';

/**
 * Qual recorte a aba de Engajamento deve mostrar, dados os filtros.
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO SAIU DO COMPONENTE
 * ------------------------------------------------------------------
 * A decisão tem quatro estados -- sem recorte, só perfil, só área, os dois --
 * e monta a chave do banco, que muda de forma no caso cruzado: 'tempo' com
 * valor "24+ meses" vira 'area+tempo' com valor "Marketing || 24+ meses".
 *
 * Enquanto morava dentro do JSX, a única forma de conferir era abrir a tela e
 * olhar. Foi assim que o caso mais importante passou: o recorte era calculado
 * certo e renderizado DEPOIS dos quatro KPIs, que continuavam mostrando a
 * empresa. Chegou como "o filtro de tempo de casa não está funcionando" --
 * ele funcionava, e o resultado aparecia embaixo do que não tinha mudado.
 *
 * Um cartão certo embaixo de quatro cartões errados se lê como quatro cartões
 * certos.
 */

export interface RecorteAtivo {
  /** Como está gravado em `cut_type`: 'tempo', 'modelo', 'area+tempo'... */
  cutType: string;
  /** Como está gravado em `cut_value`, composto quando cruzado. */
  valor: string;
  /** O valor sem a área na frente, para o título não mostrar o separador. */
  soValor: string;
  /** O que escrever antes dos dois-pontos no título. */
  rotulo: string;
  /** `true` quando área e perfil estão juntos. */
  cruzado: boolean;
}

/**
 * Os perfis, na ORDEM em que entram na chave.
 *
 * A ordem não é estética: 'area+tempo+modelo' é o nome gravado, e montar
 * "Marketing || Remoto || 24+ meses" não acharia linha nenhuma. Zero linha
 * aqui chega à tela como "este grupo não respondeu", que é falso.
 */
const PERFIS = [
  { chave: 'tempoCasa', tipo: 'tempo', rotulo: 'Tempo de casa' },
  { chave: 'modeloTrabalho', tipo: 'modelo', rotulo: 'Modelo de trabalho' },
  // ------------------------------------------------------------------
  // MARCA DE PRODUTO, QUE NÃO É A MARCA DO SELETOR DO TOPO
  // ------------------------------------------------------------------
  // O seletor do topo separa ENTIDADE -- NSX, Betfair BR, Flutter
  // International -- que vem da razão social no headcount. A pesquisa é
  // anônima e não coleta entidade; ela coleta MARCA DE PRODUTO: Betnacional,
  // Betfair e Cross Brand. São eixos diferentes, e "NSX BETFAIR BRASIL S.A."
  // é o lembrete de que os nomes se parecem e não coincidem.
  //
  // A confusão entre os dois já chegou duas vezes, de duas pessoas: a Marilia
  // na revisão ("se eu coloco BF ou se eu coloco NSX, ele não faz a troca") e
  // a Thais depois ("o filtro NSX/Betfair/Flutter Int não parece funcionar").
  // As duas queriam a mesma coisa, e a resposta que a tela dava era só por
  // que o seletor NÃO se aplica -- correta e inútil, porque não dizia onde
  // está o que responde.
  //
  // `area+marca` já era calculado e gravado em toda onda desde sempre. O que
  // faltava era a tela oferecer.
  { chave: 'marcaProduto', tipo: 'marca', rotulo: 'Marca de produto' },
] as const;

/**
 * Esta combinação de perfis existe no banco?
 *
 * ------------------------------------------------------------------
 * DERIVADO DE CUTS_PADRAO, E NÃO UMA LISTA À MÃO
 * ------------------------------------------------------------------
 * Marca não cruza com tempo de casa nem com modelo: 'marca+tempo' não é
 * gravado, e pedir por ele devolveria zero linhas -- que a tela leria como
 * "este grupo não respondeu", que é falso. Tempo e modelo, ao contrário,
 * cruzam entre si e com área.
 *
 * A regra podia ser uma lista de pares proibidos. Seria uma segunda cópia do
 * que `CUTS_PADRAO` já diz, e a cópia envelheceria na primeira vez que o
 * agregador passasse a gravar um cruzamento novo -- do mesmo jeito que a
 * exclusão entre tempo e modelo sobreviveu meses depois de deixar de valer.
 *
 * Exige as DUAS formas, com e sem área: a pessoa pode acrescentar um
 * departamento depois de escolher os perfis, e a combinação não pode deixar
 * de existir no meio do caminho.
 */
export function combinacaoGravada(tipos: readonly string[]): boolean {
  if (!tipos.length) return true;
  const lista = CUTS_PADRAO as readonly string[];
  return lista.includes(tipos.join('+')) && lista.includes(['area', ...tipos].join('+'));
}

/** As chaves de perfil, na ordem em que entram no nome do recorte. */
export const CHAVES_DE_PERFIL = PERFIS.map((p) => p.chave);

/**
 * Quais outros perfis precisam sair para `chave` poder entrar.
 *
 * Devolve as chaves a limpar, e não um booleano, porque quem chama precisa
 * DIZER o que apagou -- apagar uma seleção em silêncio é como a barra chegou
 * a "os filtros não estão se cruzando".
 */
export function perfisIncompativeis(
  filtros: { tempoCasa?: string | null; modeloTrabalho?: string | null; marcaProduto?: string | null },
  chave: string,
): string[] {
  const ativos = PERFIS.filter((p) => !semFiltro(filtros[p.chave]));
  const meu = ativos.find((p) => p.chave === chave);
  // Quem não está ativo não desaloja ninguém -- inclusive quando o valor que
  // chegou é o sentinela "Todos", que é DESLIGAR o filtro.
  if (!meu) return [];

  // O recém-escolhido fica sempre: ele é a intenção mais recente. Os outros
  // entram por cima, na ordem em que compõem o nome do recorte, enquanto a
  // combinação continuar existindo no banco.
  const mantidos = [meu.tipo as string];
  const fora: string[] = [];
  for (const p of PERFIS) {
    if (p.chave === chave) continue;
    if (!ativos.some((a) => a.chave === p.chave)) continue;
    const tentativa = PERFIS
      .filter((x) => mantidos.includes(x.tipo) || x.tipo === p.tipo)
      .map((x) => x.tipo as string);
    if (combinacaoGravada(tentativa)) mantidos.push(p.tipo);
    else fora.push(p.chave);
  }
  return fora;
}

export function recorteAtivo(
  filtros: {
    tempoCasa?: string | null;
    modeloTrabalho?: string | null;
    marcaProduto?: string | null;
  },
  /**
   * A área selecionada, com o nome COMO ESTÁ GRAVADO -- "Marketing", não
   * "MARKETING". O filtro guarda em caixa alta e o banco não; montar a chave
   * com o valor do filtro devolveria zero linhas, e zero linha aqui se lê como
   * "este grupo não respondeu", que é falso.
   */
  areaGravada: string | null,
): RecorteAtivo | null {
  const ativos = PERFIS.map((p) => ({ ...p, bruto: filtros[p.chave] }))
    .filter((p) => !semFiltro(p.bruto))
    .map((p) => ({ ...p, valor: valorFiltro(p.bruto) as string }));
  if (!ativos.length) return null;

  // ------------------------------------------------------------------
  // DOIS PERFIS AO MESMO TEMPO
  // ------------------------------------------------------------------
  // Tempo de casa e modelo se excluíam porque 'tempo+modelo' não era gravado.
  // Passou a ser, e medido em ago/26 é o cruzamento com MELHOR aproveitamento
  // do painel: 20 de 20 combinações acima do mínimo de cinco respostas. A
  // exclusão era a única coisa impedindo o melhor recorte disponível.
  //
  // O triplo, com área, é o oposto: 29 de 106 (27%), cobrindo 69% das
  // pessoas. Vale, e quem lê isto avisa quando a combinação escolhida é uma
  // das que não passam -- "existe e é pequeno demais", não "não existe".
  const tipos = ativos.map((p) => p.tipo);
  const valores = ativos.map((p) => p.valor);
  const soValor = valores.join(' · ');

  if (!areaGravada) {
    return {
      cutType: tipos.join('+'),
      valor: comporCruzamento(...valores),
      soValor,
      rotulo: ativos.map((p) => p.rotulo).join(' e '),
      // `cruzado` quer dizer "TEM ÁREA JUNTO", e não "tem mais de um campo".
      // Quem lê isto decide se explica a ausência da fila por área.
      cruzado: false,
    };
  }
  return {
    cutType: ['area', ...tipos].join('+'),
    valor: comporCruzamento(areaGravada, ...valores),
    soValor,
    rotulo: `${areaGravada} · ${ativos.map((p) => p.rotulo).join(' e ')}`,
    cruzado: true,
  };
}
