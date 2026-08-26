/**
 * O que cada número quer dizer, e o que a cor dele quer dizer.
 *
 * ===========================================================================
 * POR QUE AS FAIXAS FICAM AQUI, E NÃO NO COMPONENTE
 * ===========================================================================
 * Os limiares que pintam um cartão de verde ou âmbar viviam dentro do
 * EngagementTab, como `if (v >= 70) return 'good'`. Escrever um tooltip que
 * dissesse "acima de 70 é alto" criaria uma SEGUNDA cópia do número 70 -- e a
 * partir daí as duas seguem vidas separadas. Alguém ajusta o limiar, a cor
 * muda, o texto continua igual, e a explicação passa a mentir sobre a própria
 * tela que está explicando.
 *
 * Aqui a faixa é dado. A cor sai de `toneDe()`, o texto sai da mesma lista.
 * Não há como discordarem.
 *
 * ===========================================================================
 * O QUE UM VERBETE PRECISA TER
 * ===========================================================================
 * `oQueE` responde "o que é isso". `comoLer` responde "e daí". `cuidado` é o
 * mais importante e o mais raro: a confusão CONCRETA que este número já
 * causou ou causaria. Verbete sem `cuidado` é dicionário; com, é o que evita
 * a leitura errada numa reunião.
 */

export type KpiTone = 'good' | 'warn' | 'bad' | 'neutral';

/**
 * Tom → classe de cor do texto.
 *
 * Vive aqui, junto das faixas que produzem o tom, pelo mesmo motivo do
 * cabeçalho: a faixa e a cor são a mesma decisão. Estava dentro do KpiCard, e o
 * UnwantedTab, que não é cartão, escreveu a sua própria com `text-green-400` --
 * um verde diferente deste, e sem variante para o modo escuro. Dois vereditos
 * iguais saíam em duas cores.
 */
export const TONE_TEXT: Record<KpiTone, string> = {
  good: 'text-emerald-600 dark:text-emerald-500',
  warn: 'text-amber-600 dark:text-amber-500',
  bad: 'text-red-600 dark:text-red-500',
  neutral: 'text-foreground',
};

/**
 * Uma faixa vale do seu `min` para cima, e a lista é lida DE CIMA PARA BAIXO.
 * A última deve ter `min: -Infinity`, que é o "todo o resto".
 */
export interface Faixa {
  min: number;
  tone: KpiTone;
  /** Aparece no cartão como nota curta e no tooltip como nome da faixa. */
  rotulo: string;
}

export interface AjudaMetrica {
  titulo: string;
  oQueE: string;
  comoLer?: string;
  /** A confusão concreta que este verbete evita. */
  cuidado?: string;
  faixas?: Faixa[];
  /** Como escrever o limite da faixa no tooltip. Ex.: (n) => `${n}%`. */
  formatar?: (n: number) => string;
  /** true quando subir é RUIM (risco, atrição). Muda a leitura da seta. */
  inverso?: boolean;
}

const pct = (n: number) => `${n}%`;
const nota = (n: number) => `${n}/10`;
const cru = (n: number) => String(n);

export const AJUDA = {
  // ---------------------------------------------------------------- pesquisa
  enps: {
    titulo: 'eNPS',
    oQueE: '% de promotores menos % de detratores, na pergunta "você recomendaria trabalhar aqui?". Varia de −100 a +100.',
    comoLer: 'Não é uma nota de 0 a 100. Um eNPS de 50 já é alto — metade do time promotor a mais do que detratores.',
    cuidado: 'A média esconde diferença grande entre áreas. Duas áreas em 40 e 90 dão a mesma média que duas em 65 — e pedem conversas opostas.',
    faixas: [
      { min: 70, tone: 'good', rotulo: 'patamar alto' },
      { min: 50, tone: 'neutral', rotulo: 'patamar saudável' },
      { min: 30, tone: 'warn', rotulo: 'patamar baixo' },
      { min: -Infinity, tone: 'bad', rotulo: 'patamar crítico' },
    ],
    formatar: cru,
  },
  satisfacao: {
    titulo: 'Satisfação',
    oQueE: 'Média das respostas de satisfação geral, de 0 a 10.',
    comoLer: 'Anda menos que o eNPS: uma queda de 0,3 aqui costuma corresponder a uma queda bem maior lá.',
    faixas: [
      { min: 8, tone: 'good', rotulo: 'patamar alto' },
      { min: 7, tone: 'neutral', rotulo: 'patamar ok' },
      { min: -Infinity, tone: 'warn', rotulo: 'abaixo do esperado' },
    ],
    formatar: nota,
  },
  riscoSaida: {
    titulo: 'Risco de saída',
    // ------------------------------------------------------------------
    // ESTA DEFINIÇÃO ESTAVA ERRADA, E NÃO ERA IMPRECISÃO
    // ------------------------------------------------------------------
    // Dizia "% de pessoas que declararam não se ver na empresa no próximo
    // ano" -- uma pergunta que a pesquisa NÃO faz. O dado sempre veio de
    // outra: "qual a probabilidade de você permanecer se recebesse uma oferta
    // idêntica", contando quem respondeu 6 ou menos numa escala de 0 a 10.
    // Ver o cabeçalho de aggregator/polly-survey.ts, onde o corte ≤6 foi
    // testado contra os 16,6% publicados.
    //
    // A diferença muda a decisão de quem lê. "Não me vejo aqui" é desligamento
    // afetivo; "sairia por uma oferta igual" é falta de motivo para ficar --
    // e este segundo é o que se responde com contraproposta, carreira e
    // reconhecimento. Duas conversas diferentes com o mesmo gestor.
    oQueE: '% de pessoas que, diante de uma oferta equivalente em outro lugar — mesmo cargo, mesmo pacote —, dizem que a probabilidade de ficar aqui é baixa (6 ou menos, numa escala de 0 a 10).',
    comoLer: 'É intenção declarada, não saída observada. E é sobre o que segura a pessoa, não sobre gostar da empresa: alguém pode elogiar o time e ainda assim não ter motivo para recusar uma oferta igual.',
    cuidado: 'Não confunda com atrição. Atrição é quem JÁ saiu; isto é quem DISSE que pensa em sair. Os dois números não batem, e não deveriam.',
    faixas: [
      { min: 20, tone: 'bad', rotulo: 'acima do confortável' },
      { min: 12, tone: 'warn', rotulo: 'atenção' },
      { min: -Infinity, tone: 'good', rotulo: 'sob controle' },
    ],
    formatar: pct,
    inverso: true,
  },
  participacao: {
    titulo: 'Participação',
    oQueE: 'Quantas pessoas responderam, sobre quantas foram convidadas.',
    comoLer: 'Abaixo de 50%, os resultados passam a refletir quem quis responder — e quem está insatisfeito responde mais.',
    cuidado: 'É da onda inteira, sempre da empresa. A pesquisa não guarda quantos elegíveis cada área tinha, então não existe participação por área.',
    faixas: [
      { min: 70, tone: 'good', rotulo: 'boa cobertura' },
      { min: 50, tone: 'neutral', rotulo: 'cobertura aceitável' },
      { min: -Infinity, tone: 'warn', rotulo: 'cobertura baixa' },
    ],
    formatar: pct,
  },

  // ------------------------------------------------------------------ saídas
  atricao: {
    titulo: 'Atrição (mensal)',
    oQueE: 'Saídas do mês ÷ headcount do fim do mês.',
    comoLer: 'Mede só quem saiu.',
    cuidado: 'Não é turnover. Turnover conta entradas e saídas, e num time que cresce será sempre maior — não são versões do mesmo número.',
    formatar: pct,
    inverso: true,
  },
  /**
   * As três faixas viviam soltas no UnwantedTab como BENCHMARK_TARGET,
   * BENCHMARK_MARKET e BENCHMARK_CRITICAL, pintando o número com
   * `text-green-400` escrito à mão em vez de `toneDe()`. Eram o único lugar do
   * painel com uma segunda régua de cor -- exatamente o que o cabeçalho deste
   * arquivo diz para não fazer.
   *
   * A faixa do meio (4,2%) não virou `Faixa`: ela não muda cor nenhuma, é uma
   * referência de mercado que aparece na tabela ao lado. Vive em `premissas.ts`
   * junto com as outras suposições, porque é isso que ela é.
   */
  atricaoNaoDesejada: {
    titulo: 'Atrição não desejada',
    oQueE: 'A parcela das saídas que a empresa preferia não ter tido, sobre o headcount.',
    comoLer: 'É o número que a meta persegue — sair gente que a empresa queria manter.',
    cuidado:
      'O numerador é ESTIMADO, não classificado: aplica-se um percentual fixo sobre o total de saídas (ver premissas.ts). Enquanto a origem não marcar cada saída como desejada ou não, este número acompanha o total de saídas e não distingue nada por si.',
    faixas: [
      { min: 6.0, tone: 'bad', rotulo: 'acima do limite' },
      { min: 3.5, tone: 'warn', rotulo: 'acima do alvo' },
      { min: -Infinity, tone: 'good', rotulo: 'dentro do alvo' },
    ],
    formatar: pct,
    inverso: true,
  },
  turnover: {
    titulo: 'Turnover (mensal)',
    oQueE: '(entradas + saídas) ÷ 2 ÷ headcount médio do mês.',
    comoLer: 'Mede a movimentação total, não só a perda.',
    cuidado: 'Um time que dobrou de tamanho sem ninguém sair tem turnover alto e atrição zero.',
    formatar: pct,
    inverso: true,
  },

  // ---------------------------------------------------------- comp e estrutura
  compRatio: {
    titulo: 'Comp-ratio',
    oQueE: 'Salário da pessoa ÷ ponto médio da faixa do cargo, em %.',
    comoLer: '100% é exatamente o meio da faixa. Abaixo de 80% ou acima de 120% costuma pedir explicação — tempo de casa, performance, contratação fora de faixa.',
    cuidado: 'Mediana, não média: um C-level fora da curva não desloca o número, e é isso que se quer.',
    formatar: pct,
  },
  spanMedio: {
    titulo: 'Span de controle',
    oQueE: 'Quantas pessoas se reportam, em média, a cada gestor.',
    comoLer: 'Muito baixo sugere camada de gestão a mais; muito alto, gestor sem tempo para as pessoas.',
    cuidado: 'É média. Um gestor com 30 liderados e três com 2 dão span 9 — que não descreve nenhum dos quatro.',
    formatar: cru,
  },
  acimaDaFaixa: {
    titulo: 'Acima da faixa',
    oQueE: 'Pessoas com salário acima do teto da banda do próprio cargo.',
    cuidado: 'Não é erro por si só: pode ser gente sênior demais para o nível cadastrado. Vira problema quando é muita gente da mesma área.',
    formatar: cru,
  },
  abaixoDaFaixa: {
    titulo: 'Abaixo da faixa',
    oQueE: 'Pessoas com salário abaixo do piso da banda do próprio cargo.',
    comoLer: 'É a lista que costuma virar risco de saída e pedido de contraproposta.',
    formatar: cru,
  },

  // -------------------------------------------------------------- demografia
  pcd: {
    titulo: '% PCD',
    oQueE: 'Pessoas com deficiência declaradas, sobre o quadro.',
    cuidado: 'O campo é de preenchimento parcial na origem. O número é piso, não retrato: quem não declarou entra como não-PCD.',
    formatar: pct,
  },
  naoBrancos: {
    titulo: 'Não brancos',
    oQueE: 'Pessoas que não se declararam brancas, sobre a base QUE TEM raça preenchida.',
    cuidado: 'O denominador não é o quadro inteiro — é só quem respondeu. Comparar este % com um % calculado sobre o quadro todo dá diferença que parece movimento e não é.',
    formatar: pct,
  },
  mulheres: {
    titulo: 'Mulheres',
    oQueE: '% de mulheres sobre o quadro com gênero conhecido.',
    cuidado: 'Pessoas sem gênero cadastrado ficam fora do cálculo, não entram como zero.',
    formatar: pct,
  },
} as const satisfies Record<string, AjudaMetrica>;

export type ChaveMetrica = keyof typeof AJUDA;

/** Faixa em que o valor cai. `null` quando não há faixas ou não há valor. */
export function faixaDe(chave: ChaveMetrica, valor: number | null | undefined): Faixa | null {
  const faixas = (AJUDA[chave] as AjudaMetrica).faixas;
  if (!faixas || valor == null || !Number.isFinite(valor)) return null;
  return faixas.find((f) => valor >= f.min) ?? null;
}

/** A cor do cartão. Mesma fonte que o texto do tooltip -- ver o topo do arquivo. */
export function toneDe(chave: ChaveMetrica, valor: number | null | undefined): KpiTone {
  return faixaDe(chave, valor)?.tone ?? 'neutral';
}

/** A nota curta sob o valor ("patamar alto"). */
export function rotuloDe(chave: ChaveMetrica, valor: number | null | undefined): string | undefined {
  return faixaDe(chave, valor)?.rotulo;
}

/**
 * "70 ou mais", "de 50 até menos de 70", "abaixo de 30" -- escrito a partir da
 * própria lista, para o tooltip não repetir os limites à mão.
 *
 * O "até menos de" é feio e é de propósito. "de 50 a 70" deixaria dúvida sobre
 * onde exatamente o 70 cai, e essa dúvida é justamente sobre a fronteira entre
 * duas cores.
 */
export function descreverFaixa(chave: ChaveMetrica, i: number): string {
  const a = AJUDA[chave] as AjudaMetrica;
  const faixas = a.faixas ?? [];
  const f = faixas[i];
  if (!f) return '';
  const fmt = a.formatar ?? cru;
  const anterior = faixas[i - 1];
  if (f.min === -Infinity) return anterior ? `abaixo de ${fmt(anterior.min)}` : 'qualquer valor';
  if (!anterior) return `${fmt(f.min)} ou mais`;
  return `de ${fmt(f.min)} até menos de ${fmt(anterior.min)}`;
}
