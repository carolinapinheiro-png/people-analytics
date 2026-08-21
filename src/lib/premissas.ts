/**
 * Números que o painel USA para calcular mas não MEDIU.
 *
 * ===========================================================================
 * POR QUE ISTO É UM ARQUIVO, E NÃO uma constante em cada componente
 * ===========================================================================
 * Um painel de dados tem duas espécies de número, e a diferença entre elas é a
 * coisa mais importante que a tela comunica:
 *
 *   MEDIDO   veio do banco, dá para rastrear até a pessoa e o mês
 *   SUPOSTO  alguém escolheu, e o painel multiplica como se fosse fato
 *
 * Os supostos estavam misturados aos componentes como constantes no topo do
 * arquivo -- `const REPLACEMENT_COST = 45000` --, indistinguíveis de qualquer
 * outra configuração. Aí a tela mostra "R$ 1.755.000 de custo estimado" e o
 * número entra na reunião com a mesma autoridade do headcount, que é contado.
 *
 * Juntos e nomeados, dá para responder de uma vez: quais números desta tela
 * alguém arbitrou? E `DataTab` já avisa que as metas são provisórias, à espera
 * de validação da liderança -- o aviso existia, os números não estavam onde
 * quem lesse o aviso pudesse encontrá-los.
 *
 * ===========================================================================
 * O QUE CADA VERBETE PRECISA DIZER
 * ===========================================================================
 * `origem` é o campo que importa: de onde saiu este número. Quando a resposta
 * honesta é "não sabemos", é isso que fica escrito. Premissa sem origem
 * declarada é chute com cara de referência de mercado.
 */

export interface Premissa {
  valor: number;
  /** Como escrever na tela. */
  rotulo: string;
  /** De onde veio o número. "Não rastreada" é resposta válida — e comum. */
  origem: string;
  /** O que destravaria a substituição por dado real. */
  paraSubstituir?: string;
}

export const PREMISSAS = {
  /**
   * Multiplica o total de saídas para estimar quantas eram indesejadas.
   *
   * Enquanto for um percentual fixo, "atrição não desejada" é o total de saídas
   * numa escala diferente: sobe e desce junto, nunca separa uma área com muita
   * saída desejada de outra com pouca. A conclusão que ele parece sustentar --
   * "estamos perdendo gente que queríamos manter" -- não está no dado.
   */
  pctSaidasNaoDesejadas: {
    valor: 0.65,
    rotulo: '65% das saídas',
    origem: 'Não rastreada. Estava no código como heurística, sem fonte anotada.',
    paraSubstituir:
      'Marcar cada desligamento como desejado ou não na origem (Convenia). Um campo por saída substitui a estimativa inteira.',
  },

  /** Entra no cálculo do custo total de reposição. */
  custoReposicao: {
    valor: 45_000,
    rotulo: 'R$ 45.000 por pessoa',
    origem: 'Não rastreada. Não distingue nível, área nem tempo de recrutamento.',
    paraSubstituir:
      'Custo real por contratação (agência, tempo de recrutador, bônus de entrada), idealmente por faixa de nível.',
  },

  /** Meses até a pessoa nova render como a que saiu. */
  mesesRampUp: {
    valor: 6,
    rotulo: '6 meses',
    origem: 'Não rastreada.',
    paraSubstituir: 'Tempo até a primeira avaliação positiva, por família de cargo.',
  },

  /**
   * Referência de mercado da atrição não desejada. Fica AQUI e não nas faixas
   * de `metric-help` porque não pinta nada: é uma linha de comparação na
   * tabela. As faixas que mudam cor (3,5% e 6,0%) são decisão interna e vivem
   * em `AJUDA.atricaoNaoDesejada`.
   */
  atricaoMercado: {
    valor: 4.2,
    rotulo: '4,2% ao mês',
    origem: 'Não rastreada. Não há nota de qual pesquisa, ano ou setor.',
    paraSubstituir: 'Uma fonte nomeada e datada, com o setor a que se refere.',
  },
} as const satisfies Record<string, Premissa>;

export type ChavePremissa = keyof typeof PREMISSAS;

/** Toda premissa cuja origem não foi rastreada — para a nota de rodapé. */
export function premissasSemOrigem(): Array<{ chave: ChavePremissa } & Premissa> {
  return (Object.keys(PREMISSAS) as ChavePremissa[])
    .map((chave) => ({ chave, ...PREMISSAS[chave] }))
    .filter((p) => p.origem.toLowerCase().startsWith('não rastreada'));
}
