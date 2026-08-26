/**
 * O que cada gráfico responde, em três frases.
 *
 * ------------------------------------------------------------------
 * POR QUE UM CATÁLOGO, E NÃO TEXTO SOLTO EM CADA COMPONENTE
 * ------------------------------------------------------------------
 * A Anna pediu "indicadores explicativos em diversos gráficos, similar ao que
 * já existe no item risco de saída, para auxiliar usuários com menor
 * familiaridade técnica". O pedido é claro; o risco de atendê-lo mal também.
 *
 * Escrever a explicação dentro de cada componente espalharia onze textos por
 * onze arquivos, e este painel já provou o que acontece depois: a explicação
 * envelhece separada do gráfico e vira afirmação falsa. Num catálogo, uma
 * revisão passa por todos de uma vez.
 *
 * ------------------------------------------------------------------
 * O TOOLTIP NÃO REPETE O RODAPÉ
 * ------------------------------------------------------------------
 * Quase todo cartão já tem um parágrafo de "como ler" embaixo. Copiar aquilo
 * para cá criaria duas versões da mesma frase, que divergem na primeira
 * correção -- o padrão que custou caro nesta semana.
 *
 * Então a divisão é: aqui fica o que o gráfico RESPONDE (a pergunta, em uma
 * linha) e o erro de leitura mais provável. O rodapé continua com a mecânica
 * -- o que é cada eixo, cada cor, cada corte.
 */

export interface AjudaGrafico {
  /** A pergunta que o gráfico responde, em uma frase. */
  responde: string;
  /** O erro de leitura mais provável, dito antes que aconteça. */
  cuidado: string;
}

export const AJUDA_GRAFICOS = {
  filaPorArea: {
    responde:
      'Em qual área começar, considerando engajamento e risco de saída ao mesmo tempo.',
    cuidado:
      'A ordem NÃO é por eNPS. Uma área pode ter o pior eNPS e não ser a primeira da fila, porque quase ninguém ali pensa em sair — e o contrário também acontece.',
  },
  areaPorTema: {
    responde:
      'Quais áreas destoam da empresa, em quais temas, e quais destoam em quase tudo.',
    cuidado:
      'Vermelho quer dizer "abaixo do resto da casa", não "ruim". Uma área pode estar abaixo num tema em que ela própria tem 78% de concordância.',
  },
  serieIndicadores: {
    responde:
      'Como cada recorte se moveu ao longo das pesquisas, nos três indicadores lado a lado.',
    cuidado:
      'Em área pequena, uma pessoa move o índice vários pontos. A altura de uma linha diz menos que a direção dela, e o número de respostas está no balão.',
  },
  ondeAQuedaAconteceu: {
    responde:
      'Se a variação do eNPS está espalhada ou concentrada em quem tem mais tempo de casa.',
    cuidado:
      'As faixas não são as mesmas pessoas entre ondas: quem estava em 12-18 meses na primeira está em 24+ agora. É retrato de faixas, não acompanhamento de coorte.',
  },
  temaPorTema: {
    responde:
      'Quanto as perguntas de um mesmo tema discordam entre si — e onde a média engana.',
    cuidado:
      'Barra curta é tema homogêneo, e aí a média descreve bem. Barra longa esconde uma pergunta ruim atrás de boas: agir no tema inteiro desperdiça esforço.',
  },
  oQueMaisPesa: {
    responde:
      'Quais perguntas mais acompanham o eNPS de quem respondeu, e como a área vai em cada uma.',
    cuidado:
      '"Acompanha" não é "causa". Todas as respostas vêm da mesma pessoa no mesmo momento, e quem está satisfeito marca alto em tudo.',
  },
  empresaOuArea: {
    responde:
      'Se uma nota baixa é igual em todo lugar ou depende de onde a pessoa está.',
    cuidado:
      'Quando a variação é baixa, cobrar o líder da pior área não resolve: ele não tem alavanca, e a nota dele é a de todo mundo.',
  },
  maisDistanteDaMedia: {
    responde:
      'Quais grupos — gestão, marca, tempo de casa, modelo — estão mais longe da média da empresa.',
    cuidado:
      'Metade das barras fica em vermelho por construção: a régua é a média, e sempre há alguém abaixo dela.',
  },
  matrizDeAcao: {
    responde:
      'Onde cada área cai no cruzamento de engajamento e risco de saída.',
    cuidado:
      'Os dois eixos crescem, então o melhor lugar é o canto inferior direito — eNPS alto com risco baixo. A linha tracejada é a mediana, não uma meta acordada.',
  },
  andaJuntoComEngajamento: {
    responde:
      'Quais perguntas movem o engajamento e, entre elas, quais estão com nota baixa.',
    cuidado:
      'O eixo horizontal não começa em zero. As correlações são todas próximas, e o que interessa é a posição relativa, não o valor.',
  },
  riscoPreviuSaidas: {
    responde:
      'Se o risco declarado numa onda anteciparia quem de fato pediu demissão depois.',
    cuidado:
      'São poucas áreas e poucas saídas. Ausência de relação aqui não é prova de que não existe relação — é falta de volume para testar.',
  },
} as const;

export type ChaveGrafico = keyof typeof AJUDA_GRAFICOS;
