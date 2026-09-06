import { workerType, valorOuVazio } from './talent-mobility';

/**
 * O report mensal do grupo: Women in Leadership / GPA.
 *
 * ===========================================================================
 * TRÊS ABAS, TRÊS PERGUNTAS, UM SÓ ARQUIVO
 * ===========================================================================
 * Diferente do Talent Mobility, que é uma linha por pessoa: aqui tudo é
 * agregado. Location cruza dez Job Families por Regular/Contractor; N-4 cruza
 * camada de liderança por gênero e por vínculo; DEI conta papéis técnicos,
 * nacionalidades e liderança sênior.
 *
 * Função pura, como o outro: recebe as pessoas já lidas e devolve as linhas.
 * O mês de referência entra por parâmetro, e nada de "hoje" mora aqui dentro.
 */

/**
 * As dez Job Families do template, NESTA ordem.
 *
 * Fixas de propósito. Uma família que não existir no mês sai com zeros --
 * "Risk and Trading" está assim no arquivo de setembro. Gerar só as que têm
 * gente faria a planilha mudar de forma todo mês, e quem recebe cola numa
 * estrutura fixa do outro lado.
 */
export const JOB_FAMILIES = [
  'Commercial & Marketing', 'Customer Operations', 'Data & Analytics', 'Finance',
  'HR', 'Leadership (Executive)', 'Legal', 'Other', 'Product & Technology',
  'Risk and Trading',
] as const;

/** As 19 colunas da aba Location, na ordem do arquivo. */
export const COLUNAS_LOCATION = [
  'LOCATION', 'JOB Family', 'Headcount at month end', 'Number of females at month end',
  'Number of contingent workers month end', 'number of FTE month end',
  'average headcount past 12 months', 'Total leavers past 12 months',
  'Total Female leavers past 12 months', 'Number of voluntary leavers past 12 months',
  'Female voluntary leavers past 12 months', 'Total hires past 12 months',
  'Female hires past 12 months', 'Total Leavers this month', 'Total Hires this month',
  'Total open roles', 'Number of Backfill open roles', 'Number of New open roles',
  'FlutterBR Notes',
] as const;

export interface PessoaWil {
  id: string;
  genero: string | null;
  camada: string | null;
  /** Vínculo cru do Convenia. A tradução CLT/PJ é feita aqui. */
  relationship: string | null;
  hiring_date: string | null;
  /** Mês do desligamento, quando houver. */
  saida: string | null;
  /** `voluntary` de `convenia_leavers`: null quando não classificado. */
  voluntaria: boolean | null;
  personalizados: { nome: string; valor: string }[];
}

const campo = (p: PessoaWil, nome: string) =>
  valorOuVazio(p.personalizados.find((c) => c.nome === nome)?.valor ?? null);

export const ehMulher = (p: PessoaWil) => (p.genero ?? '').trim().toUpperCase().startsWith('F');

/**
 * Job Family da pessoa, sempre uma das dez.
 *
 * Quem está sem o campo cai em `Other`, que é uma das famílias do template e
 * não uma invenção. A alternativa seria uma décima primeira linha "sem
 * família", que o template não tem e quem recebe não espera -- e some do
 * total, que é pior: o headcount da planilha deixaria de bater com o do mês.
 */
export function jobFamily(p: PessoaWil): string {
  const v = campo(p, 'Job Type Family');
  return (JOB_FAMILIES as readonly string[]).includes(v) ? v : 'Other';
}

/** 'CLT' vira Regular Employee; 'PJ', Contractor. Vínculo desconhecido fica fora. */
export function regularOuContractor(p: PessoaWil): 'Regular' | 'Contractor' | null {
  const t = workerType(p.relationship);
  return t === 'CLT' ? 'Regular' : t === 'PJ' ? 'Contractor' : null;
}

/**
 * FTE somado. `Força de Trabalho` vem como "0,9" -- vírgula decimal.
 *
 * Quem está sem o campo conta como 1. É o que o arquivo faz: 104 pessoas
 * somam 101,4 FTE, ou seja, quase todo mundo é tempo integral e os parciais
 * são a exceção nomeada. Tratar ausência como zero apagaria a pessoa da conta.
 */
export function somaFte(pessoas: readonly PessoaWil[]): number {
  const total = pessoas.reduce((acc, p) => {
    const v = campo(p, 'Força de Trabalho').replace(',', '.');
    const n = Number(v);
    return acc + (Number.isFinite(n) && n > 0 ? n : 1);
  }, 0);
  return Math.round(total * 10) / 10;
}

/** Meses "AAAA-MM" de uma janela de 12 meses terminando no mês pedido. */
export function doze(mesRef: string): string[] {
  const [a, m] = mesRef.split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (11 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

const mesDe = (iso: string | null) => (iso ?? '').slice(0, 7);

/**
 * Uma linha da aba Location, para um recorte de pessoas.
 *
 * As colunas de recrutamento (open roles, backfill, new) ficam VAZIAS: elas
 * vêm do InHire, não do cadastro, e a nota do próprio arquivo de agosto diz
 * que viriam do Talent Acquisition depois. Vazio é o que o arquivo entregue
 * traz para a maioria das famílias -- inventar zero diria "não há vaga aberta",
 * que é afirmação diferente de "não sei".
 */
export function linhaLocation(
  familia: string,
  noMes: readonly PessoaWil[],
  /** Todo mundo da janela, inclusive quem já saiu. */
  janela: readonly PessoaWil[],
  mesRef: string,
  notas: string,
): string[] {
  const meses = doze(mesRef);
  const dentroDaJanela = (m: string) => meses.includes(m);

  const saidas = janela.filter((p) => p.saida && dentroDaJanela(p.saida));
  const entradas = janela.filter((p) => dentroDaJanela(mesDe(p.hiring_date)));
  const saidasDoMes = janela.filter((p) => p.saida === mesRef);
  const entradasDoMes = janela.filter((p) => mesDe(p.hiring_date) === mesRef);

  return [
    'BRAZIL',
    familia,
    String(noMes.length),
    String(noMes.filter(ehMulher).length),
    '',
    String(somaFte(noMes)),
    '',
    String(saidas.length),
    String(saidas.filter(ehMulher).length),
    // `voluntary` é do registro, não estimativa. Null não conta como
    // voluntária: a coluna pergunta quantas FORAM, e não-classificada não foi.
    String(saidas.filter((p) => p.voluntaria === true).length),
    String(saidas.filter((p) => p.voluntaria === true && ehMulher(p)).length),
    String(entradas.length),
    String(entradas.filter(ehMulher).length),
    String(saidasDoMes.length),
    String(entradasDoMes.length),
    '', '', '',
    notas,
  ];
}

/** A aba Location inteira: dez famílias por Regular, dez por Contractor. */
export function montarLocation(
  noMes: readonly PessoaWil[],
  janela: readonly PessoaWil[],
  mesRef: string,
): string[][] {
  const linhas: string[][] = [];
  for (const tipo of ['Regular', 'Contractor'] as const) {
    const nota = tipo === 'Regular'
      ? 'Regular Employee = CLT, Aprendiz, Contrato Intermitente, Diretor Estatutario'
      : 'Contractor = Pessoa Juridica, Associado';
    for (const familia of JOB_FAMILIES) {
      linhas.push(linhaLocation(
        familia,
        noMes.filter((p) => regularOuContractor(p) === tipo && jobFamily(p) === familia),
        janela.filter((p) => regularOuContractor(p) === tipo && jobFamily(p) === familia),
        mesRef,
        `${tipo === 'Regular' ? 'Regular Employee' : 'Contractor'} - ${nota}`,
      ));
    }
  }
  return linhas;
}

/** As camadas da aba N-4, na ordem do arquivo. */
export const CAMADAS_N4 = ['N', 'N-1', 'N-2', 'N-3', 'N-4'] as const;

/**
 * A aba N-4: camada de liderança por gênero e por vínculo.
 *
 * N e N-1 são papéis de grupo -- Peter Jackson e Dan Taylor -- e o Brasil não
 * tem população neles. Saem com zero, como no arquivo, em vez de sumirem: a
 * linha existir com zero é a resposta "não temos", e a linha faltar seria
 * "esqueci de contar".
 *
 * `Number of Blank Gender` é coluna do template e conta quem está sem gênero
 * resolvido. Ela é a medida de honestidade das outras duas: a soma de homens
 * e mulheres só quer dizer alguma coisa se esta estiver perto de zero.
 */
export function montarN4(noMes: readonly PessoaWil[]): string[][] {
  return CAMADAS_N4.map((camada) => {
    const daCamada = noMes.filter((p) => (p.camada ?? '').trim() === camada);
    const conta = (tipo: 'Regular' | 'Contractor', f: (p: PessoaWil) => boolean) =>
      String(daCamada.filter((p) => regularOuContractor(p) === tipo && f(p)).length);
    const homem = (p: PessoaWil) => (p.genero ?? '').trim().toUpperCase().startsWith('M');
    const semGenero = (p: PessoaWil) => !(p.genero ?? '').trim();
    return [
      camada,
      conta('Regular', homem), conta('Contractor', homem),
      conta('Regular', ehMulher), conta('Contractor', ehMulher),
      String(daCamada.filter(semGenero).length),
    ];
  });
}

export const COLUNAS_N4 = [
  'month end', 'Males - Employee', 'Males - Contractor',
  'Females - Employee', 'Females - Contractor', 'Blank Gender',
] as const;
