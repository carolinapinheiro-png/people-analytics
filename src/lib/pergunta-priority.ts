import { median } from "@/lib/stats";

/**
 * Classificação das perguntas em quadrantes: nota × associação com o eNPS.
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO VIROU UM LUGAR SÓ
 * ------------------------------------------------------------------
 * Três cartões classificavam as MESMAS perguntas nos MESMOS quatro quadrantes,
 * cada um calculando a própria mediana no próprio arquivo:
 *
 *   DriverImportance    median(score)      escala 1 a 5
 *   EngagementReading   median(score)      escala 1 a 5
 *   DriverPriority      median(favoravel)  escala 0 a 100
 *
 * E `favoravel` -- o % que respondeu 4 ou 5 -- não é a média convertida. São
 * duas estatísticas diferentes do mesmo dado: em ago/26 os cortes caem em 79,8
 * e 84,8 na mesma escala.
 *
 * O mais revelador é que alguém JÁ tinha percebido. O comentário em
 * DriverPriority dizia, com todas as letras, que a mediana da média "daria um
 * recorte ligeiramente diferente para a mesma pergunta -- duas verdades para o
 * mesmo dado na mesma tela". A correção foi aplicada naquele cartão e não nos
 * outros dois, então as duas verdades continuaram existindo; só mudaram de
 * lugar. Corrigir localmente uma regra compartilhada não corrige nada.
 *
 * É a mesma história de `area-priority.ts`, que a matriz de ação duplicou até
 * discordar da fila na mesma rolagem.
 *
 * ------------------------------------------------------------------
 * A ESCOLHA: % FAVORÁVEL, NÃO A MÉDIA
 * ------------------------------------------------------------------
 * O raciocínio herdado do DriverPriority está certo e vale para todos: o % que
 * concorda é a leitura que a tela mostra e que a diretoria usa. Cortar pela
 * média enquanto se exibe o percentual coloca o leitor para conferir uma conta
 * com o número errado.
 *
 * Quando `favoravel` falta, a média entra convertida (×20) -- aproximação
 * assumida, e melhor que descartar a linha.
 */

export type QuadrantePergunta = "prioridade" | "sustentar" | "observar" | "base";

export interface PerguntaEntrada {
  driver: string;
  question: string;
  /** Associação com o eNPS da mesma pessoa. */
  r: number;
  /** Média de 1 a 5. */
  score: number;
  /** % que respondeu 4 ou 5. Quando falta, cai para score × 20. */
  favoravel?: number | null;
}

/**
 * A classificação preserva o tipo de entrada em vez de achatar para
 * `PerguntaEntrada`. Os cartões passam `SurveyImportance`, que carrega `n`,
 * `favoravel` e outros campos que eles exibem depois -- achatar obrigaria cada
 * um a recasar o resultado com a linha original pelo texto da pergunta.
 */
export type PerguntaClassificada<T extends PerguntaEntrada = PerguntaEntrada> = T & {
  quadrante: QuadrantePergunta;
  /** O valor efetivamente usado no corte, em % — o mesmo que a tela exibe. */
  favEfetivo: number;
};

export interface ClassificacaoPerguntas<T extends PerguntaEntrada = PerguntaEntrada> {
  itens: PerguntaClassificada<T>[];
  corteR: number;
  /** Corte de nota, em % favorável. */
  corteFavoravel: number;
  /** O mesmo corte na escala 1 a 5, para quem plota nela. */
  corteFavoravelEmNota: number;
}

/** % favorável, com a média convertida como reserva. */
export function favoravelDe(p: PerguntaEntrada): number {
  return p.favoravel ?? p.score * 20;
}

/**
 * A força da associação, em palavra.
 *
 * ===========================================================================
 * CORRELAÇÃO NEGATIVA NÃO É "POUCA" CORRELAÇÃO
 * ===========================================================================
 * A escala era `r >= alto ? 'puxa muito' : r >= medio ? 'puxa' : 'puxa pouco'`
 * -- uma reta, com o pior rótulo no fim. Um `r` negativo cairia em "puxa
 * pouco", e isso é falso de um jeito específico: relação inversa é uma relação
 * FORTE andando ao contrário, não uma relação fraca.
 *
 * Uma pergunta com r = -0,30 separa engajado de não engajado tanto quanto uma
 * com +0,30. Chamá-la de "puxa pouco" a esconderia no fim da lista, que é
 * exatamente onde ninguém olha.
 *
 * Não sei se existe alguma hoje -- o banco estava fora quando fui conferir.
 * Isso é parte do motivo de consertar: o rótulo não deve depender de o dado
 * de hoje ser bem comportado.
 *
 * A palavra "puxa" também carrega direção, e a associação não tem direção
 * nenhuma. O tooltip do cartão já diz isso; aqui o que se garante é que o
 * sinal não seja perdido no caminho.
 */
/**
 * Abaixo disto, `r` é indistinguível de zero e não tem direção.
 *
 * Sem este piso, a checagem de sinal exagerava para o outro lado: um
 * `r = -0,001` virava "anda ao contrário", que promete uma relação inversa
 * onde não há relação nenhuma. Trocar "relação fraca lida como forte" por
 * "ruído lido como achado" é a mesma classe de erro na direção oposta.
 *
 * Conferido no banco: das 359 correlações gravadas, cinco são negativas, e
 * TODAS entre -0,09 e 0. Ou seja, o caso que existe hoje é exatamente o que
 * este piso cobre -- nenhuma delas é uma relação inversa de verdade.
 *
 * 0,10 não é um número mágico da estatística: é onde uma correlação deixa de
 * mover a ordem da lista de forma perceptível. O piso vale para os DOIS
 * lados, então "puxa pouco" passa a significar "não acompanha", que é o que
 * ele sempre deveria ter significado.
 */
export const R_INDISTINGUIVEL_DE_ZERO = 0.1;

export function forcaDaAssociacao(
  r: number,
  cortes: { alto: number; medio: number },
): string {
  // Perto de zero, dos dois lados: sem direção. Vem ANTES da checagem de
  // sinal, senão -0,001 seria classificado como inverso.
  if (Math.abs(r) < R_INDISTINGUIVEL_DE_ZERO) return 'puxa pouco';
  if (r < 0) return 'anda ao contrário';
  return r >= cortes.alto ? 'puxa muito' : r >= cortes.medio ? 'puxa' : 'puxa pouco';
}

export function classifyPerguntas<T extends PerguntaEntrada>(
  rows: readonly T[],
): ClassificacaoPerguntas<T> {
  const corteR = median(rows.map((r) => r.r)) ?? 0;
  const corteFavoravel = median(rows.map(favoravelDe)) ?? 0;

  const itens: PerguntaClassificada<T>[] = rows.map((p) => {
    const favEfetivo = favoravelDe(p);
    const puxaMuito = p.r >= corteR;
    const notaBaixa = favEfetivo < corteFavoravel;

    return {
      ...p,
      favEfetivo,
      // Prioridade = nota baixa E associação alta: é onde um ponto ganho rende
      // mais. Nota baixa com associação fraca é problema real que não separa
      // quem está engajado de quem não está -- por isso "observar", não "agir".
      quadrante: puxaMuito && notaBaixa
        ? "prioridade"
        : puxaMuito
          ? "sustentar"
          : notaBaixa
            ? "observar"
            : "base",
    };
  });

  return {
    itens,
    corteR,
    corteFavoravel,
    corteFavoravelEmNota: corteFavoravel / 20,
  };
}

/**
 * O tema que mais aparece numa lista de perguntas.
 *
 * Devolve a contagem junto para quem escreve a frase decidir se ela sustenta a
 * palavra "tema". Duas perguntas de cinco categorias diferentes é a moda por
 * acaso, não um tema -- afirmação que já foi para a tela uma vez.
 */
export function temaDominante(lista: readonly PerguntaEntrada[]): {
  tema: string | null;
  quantas: number;
  categorias: number;
} {
  const contagem = new Map<string, number>();
  for (const p of lista) contagem.set(p.driver, (contagem.get(p.driver) ?? 0) + 1);
  const [tema, quantas] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return { tema: tema ?? null, quantas, categorias: contagem.size };
}
