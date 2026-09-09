/**
 * O que cada série mensal PRODUZ, comparado campo a campo.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE
 * ===========================================================================
 * O painel tem mais de uma série mensal para as mesmas telas: a congelada
 * (digitada de planilha, em `raw-data.ts`) e a do Convenia (calculada pela
 * carga). Quando a segunda substituiu a primeira, ela herdou o LUGAR e não o
 * CONTEÚDO -- e nada no sistema comparava as duas.
 *
 * O resultado apareceu em 09/09, quatro vezes no mesmo dia, sempre pela boca
 * da Carolina e não pelo código:
 *
 *   level_base ............ "Senioridade (nível)" em branco
 *   demographics.marital .. "Estado civil" em branco
 *   demographics.origin ... "Origem (UF natal)" em branco
 *   promotions ............ "Promoções" mostrando 0 em todas as abas
 *
 * Nenhum deles deu erro. O gráfico simplesmente não desenhava, ou desenhava
 * zero -- que é pior, porque zero é uma afirmação sobre a empresa.
 *
 * ===========================================================================
 * A REGRA
 * ===========================================================================
 * Todo campo que a série congelada produz tem de estar num de dois lugares:
 *
 *   1. produzido também pela série do Convenia, ou
 *   2. declarado aqui, com o MOTIVO de não existir lá.
 *
 * Não há terceira opção, e é isso que o teste cobra. Um campo novo de um lado
 * quebra a verificação até alguém decidir a qual dos dois grupos ele pertence
 * -- em vez de aparecer como um gráfico vazio semanas depois.
 *
 * A declaração é uma DECISÃO registrada, não uma desculpa: cada linha abaixo
 * diz o que falta para o campo passar a existir.
 */

/**
 * Campos que a série do Convenia não produz, e por quê.
 *
 * Tirar uma linha daqui sem fazer a carga produzir o campo quebra o teste --
 * de propósito. Fazer a carga produzir e esquecer de tirar a linha também.
 */
export const AUSENTES_NA_SERIE_CONVENIA: Record<string, string> = {
  pcd:
    'Cota legal. O campo personalizado "Considera PCD" existe no cadastro e é pouco preenchido; '
    + 'a carga ainda não o conta, e contar mal aqui subestimaria uma cota legal.',
  apprentice:
    'Cota legal, derivável do vínculo "Aprendiz" (que a carga já guarda). Ainda não é contada por mês.',
  leader_dept:
    'Liderança por área já existe dentro de `dept_breakdown` (leaders, leader_female). '
    + 'Esta coluna é a forma antiga da mesma informação e não foi replicada de propósito.',
  salary_band_attrition:
    'Faixa salarial dos desligados. Vem da base de desligados por pessoa, não da série -- '
    + 'a aba de Desligamentos a lê direto de `leavers`.',
  exit_survey:
    'Pesquisa de desligamento. Não existe no Convenia: é coleta à parte, ainda em planilha.',
  quality_flag: 'Marca da própria carga, não é métrica.',
  dept_filter_exact: 'Marca posta pelo filtro de departamento em tempo de leitura.',
  source: 'Identifica a série; não é conteúdo dela.',
};

/**
 * Campos que a série produz FORA de `reconstruirSerie`.
 *
 * `promotions` e `raise_events` saem do histórico salarial, que é uma
 * requisição por pessoa e vive em tabela própria: a carga os calcula e os
 * pendura na linha depois. A reconstrução, sozinha, não os produz -- e fingir
 * que produz (devolvendo zero) foi exatamente o que fez a tela dizer
 * "0 promoções" durante semanas.
 *
 * Ficam fora da comparação porque o cenário de teste não tem histórico. O que
 * garante que eles existem de verdade é `movimentacoes.test.ts`, que testa o
 * cálculo, e a cobertura que a carga imprime a cada execução.
 */
export const PRODUZIDOS_FORA_DA_RECONSTRUCAO = new Set(['promotions', 'raise_events']);

/**
 * Campos que a série NÃO produz porque a COMPOSIÇÃO os deriva.
 *
 * `year` sai de `month` em `compose-metrics.ts`. Nenhuma das duas séries o
 * calcula, e cobrá-lo da carga faria a verificação apontar para o lugar errado.
 *
 * Vive separado das ausências de verdade de propósito: aquelas são dívida
 * ("falta ler o histórico salarial"), esta é arquitetura ("é derivado depois").
 * Misturar as duas listas transformaria a primeira num depósito.
 */
export const DERIVADOS_NA_COMPOSICAO = new Set(['year']);

/**
 * As chaves que um registro de fato PREENCHEU.
 *
 * Presença não basta: `{}`, `[]` e `null` são o jeito mais comum de um campo
 * existir e não dizer nada -- foi exatamente assim que `level_base` passou
 * despercebido, presente na estrutura e vazio em toda linha.
 */
export function camposComValor(registro: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(registro)) {
    if (v == null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    out.add(k);
  }
  return out;
}

export interface Cobertura {
  /** Campos da referência que a outra série não produz NEM declara. */
  naoDeclarados: string[];
  /** Campos declarados como ausentes que, no entanto, aparecem produzidos. */
  declaracoesObsoletas: string[];
}

/**
 * Compara duas séries e devolve as duas formas de divergência.
 *
 * As duas importam, e por motivos opostos: a primeira é um gráfico que vai
 * ficar vazio; a segunda é uma nota no código que virou mentira -- e nota
 * errada é pior que nota nenhuma, porque a próxima pessoa acredita nela.
 */
export function compararSeries(
  referencia: ReadonlyArray<Record<string, unknown>>,
  produzida: ReadonlyArray<Record<string, unknown>>,
  declaradas: Record<string, string> = AUSENTES_NA_SERIE_CONVENIA,
): Cobertura {
  const uniao = (linhas: ReadonlyArray<Record<string, unknown>>): Set<string> => {
    const s = new Set<string>();
    // UNIÃO, e não a primeira linha: um mês sem nenhuma promoção tem
    // `promotions: 0`, e um mês sem desligado não tem `salary_band_attrition`.
    // Olhar só a primeira linha confundiria "o mês não teve" com "a série não
    // produz" -- a mesma confusão que este arquivo existe para acabar.
    for (const l of linhas) for (const k of camposComValor(l)) s.add(k);
    return s;
  };

  const ref = uniao(referencia);
  const prod = uniao(produzida);

  const naoDeclarados = [...ref]
    .filter((k) => !prod.has(k)
      && !(k in declaradas)
      && !DERIVADOS_NA_COMPOSICAO.has(k)
      && !PRODUZIDOS_FORA_DA_RECONSTRUCAO.has(k))
    .sort();
  const declaracoesObsoletas = Object.keys(declaradas)
    .filter((k) => prod.has(k))
    .sort();

  return { naoDeclarados, declaracoesObsoletas };
}
