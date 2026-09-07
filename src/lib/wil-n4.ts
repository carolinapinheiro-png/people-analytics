import { ehNSX, type PessoaWIL } from './wil-location';

/**
 * A aba "N-4" do report do WIL: Women in Leadership, de N a N-4.
 *
 * ===========================================================================
 * SEIS LINHAS, SEMPRE
 * ===========================================================================
 * O arquivo entregue traz N e N-1 zerados, com a nota "Brazil has no N or N-1
 * population (group roles)" -- são papéis do grupo, não do Brasil. As linhas
 * existem mesmo assim: o template é colado inteiro, e linha faltando desalinha
 * as de baixo.
 *
 * `EXCO EA` são assistentes executivos que sentam nessa camada. O organograma
 * não os distingue, e o arquivo entregue traz zero com a nota "No EAs/PAs" --
 * então sai zero, e não um palpite.
 *
 * Camadas abaixo de N-4 ficam de fora por definição: o report é de liderança.
 * As 588 pessoas de N-5 para baixo não são omissão.
 */
export const CAMADAS_N4 = ['N', 'N-1', 'N-2', 'N-3', 'N-4', 'EXCO EA'] as const;

export interface LinhaN4 {
  camada: string;
  homensEmpregado: number;
  homensContractor: number;
  mulheresEmpregado: number;
  mulheresContractor: number;
  semGenero: number;
}

/** A pessoa, com a camada do organograma. */
export type PessoaN4 = PessoaWIL & { camada: string | null };

export function montarN4(pessoas: readonly PessoaN4[], ref: string): LinhaN4[] {
  const dentro = pessoas.filter((p) => {
    if (!ehNSX(p.empresa)) return false;
    const adm = /^(\d{4}-\d{2})/.exec((p.admissao ?? '').trim())?.[1] ?? null;
    if (adm && adm > ref) return false;
    if (p.saida && p.saida < ref) return false;
    return true;
  });

  return CAMADAS_N4.map((camada) => {
    // `EXCO EA` não é camada do organograma: é um recorte que não sabemos
    // fazer. Sai zero em vez de receber gente de N-4 por engano.
    const g = camada === 'EXCO EA' ? [] : dentro.filter((p) => p.camada === camada);
    return {
      camada,
      homensEmpregado: g.filter((p) => p.genero === 'M' && p.tipo === 'CLT').length,
      homensContractor: g.filter((p) => p.genero === 'M' && p.tipo === 'PJ').length,
      mulheresEmpregado: g.filter((p) => p.genero === 'F' && p.tipo === 'CLT').length,
      mulheresContractor: g.filter((p) => p.genero === 'F' && p.tipo === 'PJ').length,
      // Gênero desconhecido tem coluna própria no template, e é assim que se
      // evita que "não sei" vire "homem" na conta de mulheres em liderança.
      semGenero: g.filter((p) => p.genero !== 'M' && p.genero !== 'F').length,
    };
  });
}

/**
 * Quantas pessoas ficaram abaixo de N-4.
 *
 * Dito no resumo para que o número pequeno da aba -- umas cinquenta pessoas --
 * não se leia como perda de dado. O report é de liderança: as outras 588 estão
 * fora por definição, e não por falha.
 */
export function abaixoDeN4(pessoas: readonly PessoaN4[]): number {
  const fundas = ['N-5', 'N-6', 'N-7', 'N-8', 'N-9'];
  return pessoas.filter((p) => ehNSX(p.empresa) && p.camada && fundas.includes(p.camada)).length;
}
