/**
 * As linhas mensais do report de headcount da Controladoria.
 *
 * ===========================================================================
 * O QUE ESTE ARQUIVO É
 * ===========================================================================
 * A aba `dados` da planilha "[Controladoria] NSX headcount" tem uma linha por
 * pessoa por mês, com 17 colunas. Todo mês alguém exporta do Convenia e cola.
 * Este módulo monta essas linhas a partir do que a carga já traz.
 *
 * É função pura de propósito: recebe o que veio do banco e devolve a matriz.
 * A parte que fala com o banco fica em `controladoria.functions.ts`, e assim o
 * mapeamento -- que é onde os erros moram -- dá para testar sem banco nenhum.
 *
 * ===========================================================================
 * A COLUNA COMPANY É A ÚNICA QUE NÃO FECHA SOZINHA
 * ===========================================================================
 * Até julho, `Company` vinha da BASE: cada empresa do grupo era um token do
 * Convenia, e a pessoa pertencia à empresa cujo token a devolveu. A unificação
 * acabou com isso -- uma base só -- e a empresa passou a ser o campo `Empresa`
 * do cadastro, que em 03/09 estava preenchido para 61% das pessoas.
 *
 * Para os outros 39% este módulo NÃO inventa. Deixa vazio e conta quantos
 * ficaram, porque uma empresa errada no report da Controladoria é pior do que
 * uma célula em branco: a planilha é cortada por Company, e a pessoa apareceria
 * inteira no lugar errado sem nada indicar.
 *
 * O preenchimento do que falta é feito na planilha, com PROCV contra o mês
 * anterior, por quem sabe conferir nome por nome.
 */

export interface PessoaDoMes {
  nome: string | null;
  status: string | null;
  department: string | null;
  cost_center: string | null;
  hiring_date: string | null;
  empresa: string | null;
  escritorio: string | null;
  /** Nome do gestor, já resolvido pelo supervisor_id. */
  gestor: string | null;
  /** Campos personalizados, como vieram: [{nome, valor}]. */
  personalizados: Array<{ nome: string; valor: string }>;
}

/** As 17 colunas da aba `dados`, na ordem exata em que ela está hoje. */
export const COLUNAS = [
  'Mês', 'Nome', 'Status', 'Job Type Family', 'Time', 'Department',
  'Direct Manager', 'Work Day Level', 'Career Band', 'CC', 'TECHNICAL ROLE',
  'Admission Date', 'Type of contract', 'Type of contract Flutter', 'Company',
  'Way of Work', 'Office',
] as const;

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * O valor de um campo personalizado, pelo nome.
 *
 * Casa por igualdade depois de tirar acento e caixa -- e NÃO por pedaço, ao
 * contrário da busca de escritório. Aqui os nomes são conhecidos e exatos, e
 * casar por pedaço faria "Level" pegar "WorkDay Level" e "Career Band Level",
 * devolvendo o que viesse primeiro na lista. A ordem de `custom_fields` não é
 * contrato.
 */
const campo = (p: PessoaDoMes, nome: string): string =>
  p.personalizados.find((c) => semAcento(c.nome) === semAcento(nome))?.valor ?? '';

/** dd/mm/aaaa, como a planilha usa. Entra ISO, sai brasileiro. */
export function dataBR(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  // Já veio dd/mm/aaaa: devolve como está em vez de estragar.
  return /^\d{2}\/\d{2}\/\d{4}$/.test(iso.trim()) ? iso.trim() : '';
}

/**
 * "ago./2026", que é como a coluna `Mês` está escrita na planilha.
 *
 * O rótulo TEM de bater caractere a caractere com os meses que já estão lá: a
 * aba de cada mês filtra por igualdade. "Ago/2026" ou "ago/2026" criariam um
 * mês novo, com o pivô do mês certo vindo vazio e nada dando erro.
 */
const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.',
  'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

export function rotuloDoMes(ano: number, mes1a12: number): string {
  return `${MESES[mes1a12 - 1]}/${ano}`;
}

export function montarLinhas(pessoas: readonly PessoaDoMes[], rotulo: string): string[][] {
  return pessoas.map((p) => [
    rotulo,
    p.nome ?? '',
    p.status ?? '',
    campo(p, 'Job Type Family'),
    campo(p, 'Time'),
    p.department ?? '',
    p.gestor ?? '',
    campo(p, 'WorkDay Level'),
    campo(p, 'Career Band'),
    p.cost_center ?? '',
    campo(p, 'Role'),
    dataBR(p.hiring_date),
    campo(p, 'Tipo de contrato'),
    campo(p, 'Type of contract Flutter'),
    // Vazio quando o cadastro ainda não tem. Ver o cabeçalho: inventar aqui
    // põe a pessoa inteira na empresa errada num report cortado por empresa.
    p.empresa ?? '',
    campo(p, 'Modelo de Jornada de Trabalho'),
    p.escritorio ?? '',
  ]);
}

/** Quantas linhas ficaram sem Company -- o número que decide se dá para usar. */
export const semEmpresa = (linhas: readonly string[][]): number =>
  linhas.filter((l) => !l[14]).length;
