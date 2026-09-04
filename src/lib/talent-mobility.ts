/**
 * De onde sai cada coluna dos reports do Sandeep.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE ANTES DO BOTÃO
 * ===========================================================================
 * O Talent Mobility Data Model tem 51 colunas no vocabulário do Workday. O
 * cadastro do Convenia tem os dados -- mas com nomes dados pelo RH, não pela
 * API, e nenhum padrão meu adivinha nome que gente escolheu.
 *
 * A lição está fresca: `cargoDe` tentou sete nomes de campo, acertou zero em
 * 638, e a tela passou a afirmar que o Convenia não tinha cargo. Um mapa
 * errado aqui é pior: sai um CSV inteiro, plausível, com Career Band no lugar
 * de Compensation Grade, e ninguém tem como ver.
 *
 * Este módulo não decide nada. Casa nome com nome, diz a força do casamento e
 * mostra os valores -- e deixa a escolha ser feita olhando.
 *
 * É função pura: recebe os campos que a sonda viu e devolve o mapa. Sem banco
 * e sem API, dá para testar o casamento, que é onde os erros moram.
 */

/** As 51 colunas do Talent Mobility Data Model, na ordem do arquivo. */
export const COLUNAS_TALENT = [
  'Employee ID', 'Full Legal Name', 'Preferred Name', "Worker's Manager",
  'Manager - Level 02', 'Manager - Level 03', 'Date of Birth',
  'On Leave (e.g. Mat/pat etc)', 'Leave Type', 'Worker Type',
  'Supervisory Org Level 2', 'Supervisory Org Level 3', 'Supervisory Org Level 4',
  'Supervisory Org Level 5', 'Supervisory Org Level 6', 'Supervisory Org Level 7',
  'Supervisory Org Level 8', 'Supervisory Organization', 'Job Title',
  'Job Family', 'Job Family Group', 'Email - Primary Work', 'Original Hire Date',
  'Hire Date', 'Continuous Service Date', 'Employee Type', 'End Employment Date',
  'Length of Service', 'Is Manager', 'Location', 'Work Address - Country',
  'Company', 'Cost Center', 'Cost Center - ID', 'Cost centre Hierarchy Level 1',
  'Cost centre Hierarchy Level 2', 'Cost centre Hierarchy Level 3',
  'Cost Centre Hierarchy Level 4', 'Cost Centre Hierarchy Level 5',
  'Line Manager Email', 'Compensation Grade', 'Career Band',
  'Compensation Grade Profile', 'FTE %', 'Scheduled Weekly Hours',
  'Default Weekly Hours', 'Leaver Date (exit the organisation)', 'Leaver Reason',
  'Basic Salary', 'Currency', 'On Secondment',
] as const;

/**
 * As colunas que NÃO precisam de campo no Convenia.
 *
 * Saem do organograma, da tabela de desligados ou de conta -- e procurar campo
 * para elas só produziria falso positivo. `Company` casaria com o campo
 * `Empresa`, que é de onde ela já vem; `Currency` casaria com qualquer coisa.
 */
export const JA_TEMOS: Partial<Record<(typeof COLUNAS_TALENT)[number], string>> = {
  'Employee ID': 'convenia_id',
  'Full Legal Name': 'org_pessoas.nome',
  "Worker's Manager": 'organograma (supervisor_id)',
  'Manager - Level 02': 'organograma, um nível acima',
  'Manager - Level 03': 'organograma, dois níveis acima',
  'Supervisory Organization': 'org_pessoas.department',
  'Job Title': 'convenia_pessoas.job_title',
  'Email - Primary Work': 'org_pessoas.email',
  'Hire Date': 'convenia_pessoas.hiring_date',
  'Original Hire Date': 'convenia_pessoas.hiring_date',
  'Employee Type': 'convenia_pessoas.status',
  'End Employment Date': 'convenia_leavers.dismissal_month',
  'Length of Service': 'meses desde a admissão',
  'Is Manager': 'tem subordinado no organograma',
  'Location': 'convenia_pessoas.escritorio',
  'Company': 'convenia_pessoas.empresa',
  'Cost Center': 'convenia_pessoas.cost_center',
  'Cost Center - ID': 'o código entre parênteses do cost center',
  'Line Manager Email': 'e-mail do gestor, pelo organograma',
  'Leaver Date (exit the organisation)': 'convenia_leavers.dismissal_month',
  'Leaver Reason': 'convenia_leavers.dismissal_type',
  'Currency': 'constante BRL',
};

/** Campo visto no cadastro: nome, de onde veio, cobertura e amostra de valores. */
export interface CampoVisto {
  nome: string;
  origem: 'listagem' | 'detalhe' | 'personalizado';
  preenchidos: number;
  valores: string[];
}

export interface Casamento {
  coluna: string;
  /** Preenchida quando a coluna já sai do que temos, sem campo do Convenia. */
  jaTemos?: string;
  campo?: CampoVisto;
  /** `exata` casa nome com nome; `parcial` casa por pedaço e pede conferência. */
  forca?: 'exata' | 'parcial';
}

/** Sem acento, sem caixa, sem pontuação e sem espaço: "FTE %" vira "fte". */
export const chave = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Casa as 51 colunas com os campos vistos no cadastro.
 *
 * Exata primeiro, em todos os campos, ANTES de qualquer parcial: senão
 * `Career Band` casaria por pedaço com `Career Band Level` só porque este veio
 * antes na lista, e a coluna certa ficaria órfã. A ordem de `custom_fields`
 * não é contrato.
 */
export function casarCampos(campos: readonly CampoVisto[]): Casamento[] {
  const usados = new Set<string>();
  const porChave = new Map<string, CampoVisto>();
  for (const c of campos) if (!porChave.has(chave(c.nome))) porChave.set(chave(c.nome), c);

  const exatas = new Map<string, CampoVisto>();
  for (const col of COLUNAS_TALENT) {
    if (JA_TEMOS[col]) continue;
    const achado = porChave.get(chave(col));
    if (achado) { exatas.set(col, achado); usados.add(achado.nome); }
  }
  return COLUNAS_TALENT.map((coluna) => {
    if (JA_TEMOS[coluna]) return { coluna, jaTemos: JA_TEMOS[coluna] };
    const exata = exatas.get(coluna);
    if (exata) return { coluna, campo: exata, forca: 'exata' as const };
    const k = chave(coluna);
    const parcial = campos.find(
      (c) => !usados.has(c.nome) && (chave(c.nome).includes(k) || k.includes(chave(c.nome))),
    );
    return parcial ? { coluna, campo: parcial, forca: 'parcial' as const } : { coluna };
  });
}

/** Os campos que nenhuma coluna reivindicou -- onde mora o que eu não previ. */
export function sobraram(campos: readonly CampoVisto[], mapa: readonly Casamento[]): CampoVisto[] {
  const usados = new Set(mapa.map((m) => m.campo?.nome).filter(Boolean));
  return campos.filter((c) => !usados.has(c.nome));
}
