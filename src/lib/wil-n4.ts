import { ehNSX, type PessoaWIL } from './wil-location';

/**
 * A aba "N-4" do WIL: Women in Leadership, das camadas N a N-4.
 *
 * ===========================================================================
 * SÓ ATÉ N-4, E É O NOME DA ABA
 * ===========================================================================
 * O organograma vai até N-9 -- 210 pessoas em N-7, 12 em N-8. A aba pede N a
 * N-4, e somar as camadas de baixo transformaria "mulheres na liderança" em
 * "mulheres na empresa", que é outra medida e daria outro número.
 *
 * `N` e `N-1` saem zerados, e o arquivo entregue explica por quê: "Brazil has
 * no N or N-1 population (group roles)" -- são cargos do grupo, fora do Brasil.
 * As linhas existem mesmo assim, porque o template as espera e linha faltando
 * desalinha a colagem.
 *
 * `EXCO EA` também sai zerado: assistentes executivos, que a definição manda
 * contar à parte da liderança. O Brasil não tem.
 */
export const CAMADAS_WIL = ['N', 'N-1', 'N-2', 'N-3', 'N-4', 'EXCO EA'] as const;

export interface PessoaN4 extends PessoaWIL {
  /** A camada do organograma: 'N-2', 'N-3'... Null para quem está fora dele. */
  camada: string | null;
}

export interface LinhaN4 {
  camada: string;
  homensEmpregados: number;
  homensContractors: number;
  mulheresEmpregadas: number;
  mulheresContractors: number;
  /**
   * Gênero em branco tem coluna PRÓPRIA no template, e não some nem vira
   * homem. Percentual de mulheres sobre denominador que inclui desconhecido é
   * afirmação sobre quem ninguém perguntou.
   */
  semGenero: number;
}

/** Estava dentro no fim do mês de referência? Mesma regra da aba Location. */
const dentro = (p: PessoaN4, ref: string) => {
  const adm = /^(\d{4}-\d{2})/.exec((p.admissao ?? '').trim())?.[1] ?? null;
  if (adm && adm > ref) return false;
  if (p.saida && p.saida < ref) return false;
  return true;
};

export function montarN4(pessoas: readonly PessoaN4[], ref: string): LinhaN4[] {
  const elegiveis = pessoas.filter((p) => ehNSX(p.empresa) && dentro(p, ref));

  return CAMADAS_WIL.map((camada) => {
    // `N`, `N-1` e `EXCO EA` não existem no organograma brasileiro: as linhas
    // saem zeradas por construção, e não por acaso de filtro.
    const g = elegiveis.filter((p) => p.camada === camada);
    const pj = (p: PessoaN4) => p.tipo === 'PJ';
    return {
      camada,
      homensEmpregados: g.filter((p) => p.genero === 'M' && !pj(p)).length,
      homensContractors: g.filter((p) => p.genero === 'M' && pj(p)).length,
      mulheresEmpregadas: g.filter((p) => p.genero === 'F' && !pj(p)).length,
      mulheresContractors: g.filter((p) => p.genero === 'F' && pj(p)).length,
      semGenero: g.filter((p) => p.genero !== 'M' && p.genero !== 'F').length,
    };
  });
}

/**
 * Pessoas em camada mais funda que N-4, que a aba não conta.
 *
 * Dito no resumo porque é a maior exclusão do report -- 588 das 637 -- e um
 * total de 49 na aba, sem explicação, parece erro de carga.
 */
export function abaixoDeN4(pessoas: readonly PessoaN4[], ref: string): number {
  return pessoas.filter(
    (p) => ehNSX(p.empresa) && dentro(p, ref)
      && p.camada != null && !(CAMADAS_WIL as readonly string[]).includes(p.camada),
  ).length;
}
