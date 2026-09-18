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

/**
 * A camada do relatório, lida do campo `WorkDay Level` do Convenia.
 *
 * ===========================================================================
 * POR QUE NÃO A CADEIA DE REPORTE
 * ===========================================================================
 * Esta aba era montada com `org_pessoas.camada`, que CALCULA a profundidade
 * contando saltos de gestor. O grupo não usa esse número: quem lê o arquivo
 * identifica a pessoa no organograma pelo `WorkDay Level` do cadastro, e é o
 * campo preenchido no Convenia que dita quem entra na contagem (Carolina,
 * 18/09/2026).
 *
 * As duas réguas não coincidem. Medido em set/2026, sobre as 646 pessoas do
 * organograma: N-3 e N-4 quase batem (9 de 10, 26 de 39), mas a camada
 * derivada N-4 inclui 13 pessoas que o WorkDay põe em outro lugar -- 9 delas
 * em `N-6 Above`. Um terço daquela linha do arquivo entregue.
 *
 * ===========================================================================
 * O BALDE DO FUNDO
 * ===========================================================================
 * `N-6 Above` são as pessoas de N-6 para baixo, juntas -- 612 dos 765
 * cadastros preenchidos. Não é linha do relatório e não deve virar uma: a aba
 * é de liderança, de N a N-4. Mas também NÃO é valor inválido, e é por isso
 * que `entendido` existe separado de `camada`: "está fora do recorte" e "não
 * sei ler isto" são coisas diferentes, e só a segunda merece aviso.
 *
 * `balde` marca os valores com sufixo. Hoje só existe `N-6 Above`, longe do
 * corte. Se um dia aparecer `N-4 Above`, o balde cruzaria a linha de corte e
 * a contagem viraria palpite -- aí quem chama tem de avisar, não adivinhar.
 */
export function camadaWorkday(valor: string | null | undefined): {
  camada: string | null;
  entendido: boolean;
  balde: boolean;
} {
  const s = (valor ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toUpperCase().replace(/\s+/g, ' ');
  if (!s) return { camada: null, entendido: false, balde: false };

  if (s === 'EXCO EA') return { camada: 'EXCO EA', entendido: true, balde: false };
  if (s === 'N' || s === 'CEO') return { camada: 'N', entendido: true, balde: false };

  // `N-6 Above`, `N 6 above`, `N-6`. O sufixo é opcional e não muda o número.
  const m = /^N\s*[-–_ ]\s*(\d{1,2})(?:\s+(ABOVE|E ACIMA))?$/.exec(s);
  if (!m) return { camada: null, entendido: false, balde: false };

  const canonico = `N-${Number(m[1])}`;
  const balde = Boolean(m[2]);
  return {
    camada: (CAMADAS_N4 as readonly string[]).includes(canonico) ? canonico : null,
    entendido: true,
    balde,
  };
}

/** O balde cruza o corte da aba? Hoje nenhum cruza; se cruzar, é aviso. */
export function baldeAmbiguo(valor: string | null | undefined): boolean {
  const r = camadaWorkday(valor);
  return r.balde && r.camada != null;
}

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
