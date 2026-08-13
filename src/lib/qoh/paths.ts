/**
 * Caminhos permitidos no app de Qualidade da Contratação.
 *
 * A lista é curta porque só um endpoint foi entregue até agora. Ela existe
 * mesmo assim, pelo mesmo motivo das outras duas integrações: ampliar o
 * alcance passa a ser uma linha de diff que alguém revisa, em vez de uma
 * chamada nova que ninguém percebe.
 */

export const QOH_BASE = 'https://monitor-avaliacoes-tooling.nsx.services';

/** Avaliações respondidas pelos gestores, 60 dias após o Dia 1. */
export const AVALIACOES = '/API/v1/cadastros/avaliacoes';

const PERMITIDOS: readonly string[] = [AVALIACOES];

export function isPathPermitido(path: string): boolean {
  const semQuery = path.split('?')[0].replace(/\/+$/, '') || '/';
  return PERMITIDOS.includes(semQuery);
}

/**
 * Os pesos da pontuação, exatamente como o TI definiu.
 *
 * ===========================================================================
 * DOIS PROBLEMAS CONHECIDOS, MANTIDOS DE PROPÓSITO ATÉ ALGUÉM DECIDIR
 * ===========================================================================
 *
 * 1. A P3 pontua "contrataria para um cargo SUPERIOR" (=1) igual a
 *    "contrataria para um cargo INFERIOR" (=1), e abaixo de "mesmo cargo"
 *    (=2). Superar a expectativa da vaga pontua como ficar abaixo dela, e
 *    menos que caber exatamente. Se a pergunta mede acerto da contratação,
 *    o cargo superior deveria ser o teto.
 *
 * 2. P1 e P2 vão de 0,1667 a 1; a P3 vai de 0 a 2. Com `(P1+P2+P3)/3` o
 *    máximo é 1,33 e o mínimo 0,06 -- não é uma escala que alguém leia de
 *    cabeça, e a divisão por 3 sugere pesos iguais quando a P3 pesa o dobro.
 *
 * Reproduzo a fórmula deles porque o painel precisa bater com o que o gestor
 * vê no Appsmith. Divergir em silêncio seria pior que herdar o problema.
 * A versão normalizada 0-100 anda ao lado, para leitura, sem substituir.
 */
export const PESOS_ESCALA_6: Record<number, number> = {
  1: 0.1667, 2: 0.3333, 3: 0.5, 4: 0.6667, 5: 0.8333, 6: 1,
};

export const PESOS_RECONTRATACAO: Record<string, number> = {
  'nao': 0,
  'cargo superior': 1,
  'cargo inferior': 1,
  'mesmo cargo': 2,
};
