import { ehNSX, type PessoaWIL } from './wil-location';

/**
 * A aba "DEI Metrics" do report do WIL.
 *
 * Duas linhas -- Regular e Contractors -- e quinze colunas. Tudo sai do
 * cadastro do Convenia, menos as duas de promoção, que dependem do histórico
 * salarial: um endpoint que a lista de caminhos permitidos ainda não inclui.
 */
export interface PessoaDEI extends PessoaWIL {
  /** Id no Convenia. Cruza com o conjunto de promovidos. */
  id: string;
  /** Campo `Role`: 'TECHNICAL ROLE' ou 'NO TECH'. */
  role: string | null;
  /** Campo `Career Band`: 'A - Entry level...', 'F - ...'. */
  careerBand: string | null;
  /** Nacionalidades declaradas. Vazio quando o cadastro não diz. */
  nacionalidades: string[];
  /** Tem deficiência declarada no cadastro. */
  pcd: boolean;
}

export interface LinhaDEI {
  bloco: 'Regular' | 'Contractors';
  cargosTecnicos: number;
  mulheresEmTecnicos: number;
  nacionalidadesUnicas: number;
  pcd: number;
  liderancaSenior: number;
  mulheresLiderancaSenior: number;
  saidasSenior: number;
  saidasSeniorMulheres: number;
  entradasSenior: number;
  entradasSeniorMulheres: number;
  entradasNivelInicial: number;
  entradasNivelInicialMulheres: number;
  promocoesSenior: number;
  promocoesSeniorMulheres: number;
}

/**
 * Sênior é Career Band F, G ou H -- a letra antes do hífen.
 *
 * O valor vem como "F - Senior Leadership". Comparar a string inteira
 * quebraria no dia em que alguém editasse a descrição depois do hífen, que é
 * texto livre e muda sem avisar ninguém.
 */
export function ehSenior(careerBand: string | null | undefined): boolean {
  const letra = (careerBand ?? '').trim().charAt(0).toUpperCase();
  return letra === 'F' || letra === 'G' || letra === 'H';
}

/** Nível inicial é Career Band A. */
export function ehNivelInicial(careerBand: string | null | undefined): boolean {
  return (careerBand ?? '').trim().charAt(0).toUpperCase() === 'A';
}

/** `Role` = TECHNICAL ROLE. 'NO TECH' e vazio não contam. */
export function ehTecnico(role: string | null | undefined): boolean {
  return (role ?? '').trim().toUpperCase() === 'TECHNICAL ROLE';
}

const mes = (iso: string | null | undefined) =>
  /^(\d{4}-\d{2})/.exec((iso ?? '').trim())?.[1] ?? null;

export function montarDEI(
  pessoas: readonly PessoaDEI[],
  ref: string,
  /** Ids promovidos no mês, do histórico salarial. Vazio quando não foi lido. */
  promovidos: ReadonlySet<string> = new Set(),
): LinhaDEI[] {
  const daNSX = pessoas.filter((p) => ehNSX(p.empresa));

  return (['Regular', 'Contractors'] as const).map((bloco) => {
    const g = daNSX.filter((p) => (bloco === 'Regular' ? p.tipo === 'CLT' : p.tipo === 'PJ'));
    const dentro = g.filter((p) => {
      const a = mes(p.admissao);
      if (a && a > ref) return false;
      if (p.saida && p.saida < ref) return false;
      return true;
    });
    const senior = dentro.filter((p) => ehSenior(p.careerBand));
    const tecnicos = dentro.filter((p) => ehTecnico(p.role));
    const saiuNoMes = g.filter((p) => p.saida === ref);
    const entrouNoMes = g.filter((p) => mes(p.admissao) === ref);

    return {
      bloco,
      cargosTecnicos: tecnicos.length,
      mulheresEmTecnicos: tecnicos.filter((p) => p.genero === 'F').length,
      // DISTINTAS, e não pessoas com nacionalidade. A coluna pergunta quantas
      // nacionalidades existem no time -- 5 no arquivo entregue, num time de
      // 352. Contar pessoas daria 352 e passaria despercebido.
      nacionalidadesUnicas: new Set(
        dentro.flatMap((p) => p.nacionalidades.map((n) => n.trim().toLowerCase())).filter(Boolean),
      ).size,
      pcd: dentro.filter((p) => p.pcd).length,
      liderancaSenior: senior.length,
      mulheresLiderancaSenior: senior.filter((p) => p.genero === 'F').length,
      saidasSenior: saiuNoMes.filter((p) => ehSenior(p.careerBand)).length,
      saidasSeniorMulheres:
        saiuNoMes.filter((p) => ehSenior(p.careerBand) && p.genero === 'F').length,
      entradasSenior: entrouNoMes.filter((p) => ehSenior(p.careerBand)).length,
      entradasSeniorMulheres:
        entrouNoMes.filter((p) => ehSenior(p.careerBand) && p.genero === 'F').length,
      entradasNivelInicial: entrouNoMes.filter((p) => ehNivelInicial(p.careerBand)).length,
      entradasNivelInicialMulheres:
        entrouNoMes.filter((p) => ehNivelInicial(p.careerBand) && p.genero === 'F').length,
      // Promovido E sênior E dentro no mês. Alguém promovido PARA sênior conta
      // aqui, porque o Career Band já é o de depois da promoção -- que é o que
      // o report quer saber.
      promocoesSenior: senior.filter((p) => promovidos.has(p.id)).length,
      promocoesSeniorMulheres:
        senior.filter((p) => promovidos.has(p.id) && p.genero === 'F').length,
    };
  });
}
