/**
 * Adaptador Talent_Mobility.xlsx -> PersonRow/HistoryRow.
 *
 * PRIVACIDADE (LGPD): o arquivo tem CPF, nascimento, raca e dado de saude.
 * Ele e lido AQUI, no navegador, e so os AGREGADOS saem da maquina. Nenhuma
 * linha individual e enviada ao servidor -- e este modulo nunca deve ser
 * importado por codigo de servidor.
 *
 * O formato exato da planilha nao esta sob nosso controle (export mensal).
 * Por isso o mapeamento de colunas e por deteccao, e o resultado da deteccao
 * e DEVOLVIDO no relatorio para confirmacao visual na tela de importacao:
 * descasamento aparece para a pessoa, nao quebra por dentro.
 *
 * Achado da revisao fria de 24/07 tratado aqui (nao no nucleo):
 * - empresa fora do COMPANY_TO_BU e ACUSADA no relatorio (o nucleo descarta
 *   em silencio, de proposito -- validar e papel do adaptador);
 * - salario sem centavos ("1.234") e detectado e acusado (armadilha do
 *   parseBrNumber documentada nos testes do nucleo).
 */
import * as XLSX from 'xlsx';
import {
  COMPANY_TO_BU,
  parseBrDate,
  parseBrNumber,
  type HistoryRow,
  type PersonRow,
} from './monthly-aggregator';

// ---------------------------------------------------------------- deteccao

const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

interface FieldSpec {
  field: string;
  required: boolean;
  /** true se o header normalizado corresponde ao campo. */
  match: (h: string) => boolean;
}

const PEOPLE_FIELDS: FieldSpec[] = [
  { field: 'company', required: true, match: (h) => h.includes('empresa') },
  { field: 'cpf', required: true, match: (h) => h.includes('cpf') },
  // Chave reserva: estrangeiros (Flutter International) nao tem CPF. Sem a
  // reserva, 21 das 23 pessoas da unidade sumiam da serie em silencio.
  { field: 'rowId', required: false, match: (h) => h.includes('identificador') },
  { field: 'admission', required: true, match: (h) => h.includes('admiss') },
  {
    field: 'termination',
    required: true,
    // "Data de desligamento", nao "Tipo/Motivo do desligamento".
    match: (h) => h.includes('data') && /deslig|demiss|rescis/.test(h),
  },
  { field: 'gender', required: true, match: (h) => h.includes('genero') || h.includes('sexo') },
  {
    field: 'state',
    required: true,
    // "Estado", "UF" -- nunca "Estado civil".
    match: (h) => (h.includes('estado') && !h.includes('civil')) || h === 'uf',
  },
  { field: 'leadership', required: true, match: (h) => h.includes('lider') },
];

const HISTORY_FIELDS: FieldSpec[] = [
  { field: 'cpf', required: true, match: (h) => h.includes('cpf') },
  // Formato real do Talent_Mobility (21/07/2026): colunas "De" e "Até".
  // "Até" = "Não informado" significa registro vigente (parseBrDate -> null).
  { field: 'from', required: true, match: (h) => h.includes('inicio') || h === 'de' },
  {
    field: 'to',
    required: false,
    match: (h) => h.includes('fim') || h.includes('termino') || h === 'ate',
  },
  {
    field: 'department',
    required: true,
    match: (h) => h.includes('departamento') || h.includes('depto') || h.includes('setor'),
  },
  { field: 'salary', required: false, match: (h) => h.includes('salario') },
];

export interface ColumnMatch {
  field: string;
  required: boolean;
  /** Header original escolhido, ou null se nada casou. */
  header: string | null;
  /** Headers alem do escolhido que tambem casariam (ambiguidade a conferir). */
  alternatives: string[];
}

export interface AdapterReport {
  peopleSheet: string | null;
  historySheet: string | null;
  peopleMapping: ColumnMatch[];
  historyMapping: ColumnMatch[];
  peopleRows: number;
  historyRows: number;
  /** Linhas puladas por falta de CPF ou empresa. */
  skippedPeople: number;
  skippedHistory: number;
  /** Empresas presentes na planilha e ausentes do COMPANY_TO_BU. */
  unmappedCompanies: Array<{ company: string; rows: number }>;
  /** CPFs com mais de um vinculo (a regra hibrida da conta; ainda assim, informar). */
  multiLinkCpfs: number;
  /** Admissoes com data futura (caso reportado ao DP em 24/07). */
  futureAdmissions: number;
  /** Salarios em formato milhar sem centavos ("1.234"): parse mil vezes menor. */
  suspiciousSalaries: number;
  /** Problemas que impedem a agregacao. */
  errors: string[];
}

export interface ParsedWorkbook {
  people: PersonRow[];
  history: HistoryRow[];
  report: AdapterReport;
}

// ---------------------------------------------------------------- helpers

const mapColumns = (headers: string[], specs: FieldSpec[]): ColumnMatch[] =>
  specs.map((spec) => {
    const hits = headers.filter((h) => spec.match(norm(h)));
    return {
      field: spec.field,
      required: spec.required,
      header: hits[0] ?? null,
      alternatives: hits.slice(1),
    };
  });

const score = (headers: string[], specs: FieldSpec[]): number =>
  specs.filter((s) => headers.some((h) => s.match(norm(h)))).length;

/** Excel serial (1900 date system) -> Date UTC. */
const fromSerial = (n: number): Date =>
  new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000);

/** Celula (Date do cellDates, serial ou texto) -> Date UTC a meia-noite. */
const toDate = (v: unknown): Date | null => {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    return Number.isNaN(v.getTime())
      ? null
      : new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  }
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? fromSerial(v) : null;
  return parseBrDate(String(v));
};

const toStr = (v: unknown): string => (v == null ? '' : String(v).trim());

/** Milhar sem centavos: "1.234" / "12.345.678" -- parse viraria unidade. */
const isThousandsWithoutCents = (v: unknown): boolean =>
  typeof v === 'string' && /^\d{1,3}(\.\d{3})+$/.test(v.trim());

// ---------------------------------------------------------------- parse

export function parseTalentMobility(data: ArrayBuffer | Uint8Array): ParsedWorkbook {
  const wb = XLSX.read(data, { cellDates: true });

  // Deteccao de abas: pontua cada aba contra os dois conjuntos de campos e
  // fica com a melhor de cada. Nome e dica ("Worksheet", "Historico..."),
  // nao contrato.
  let peopleSheet: string | null = null;
  let historySheet: string | null = null;
  let bestPeople = 0;
  let bestHistory = 0;
  const headersBySheet = new Map<string, string[]>();

  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], {
      defval: null,
    });
    const headers = rows.length ? Object.keys(rows[0]) : [];
    headersBySheet.set(name, headers);
    const p = score(headers, PEOPLE_FIELDS) + (norm(name) === 'worksheet' ? 1 : 0);
    const h = score(headers, HISTORY_FIELDS) + (norm(name).includes('historico') ? 1 : 0);
    if (p > bestPeople && p >= h) {
      bestPeople = p;
      peopleSheet = name;
    } else if (h > bestHistory) {
      bestHistory = h;
      historySheet = name;
    }
  }

  const errors: string[] = [];
  if (!peopleSheet) errors.push('Nenhuma aba com as colunas de pessoas (Worksheet) encontrada.');
  if (!historySheet) errors.push('Nenhuma aba de historico de cargos e salarios encontrada.');

  const peopleMapping = peopleSheet
    ? mapColumns(headersBySheet.get(peopleSheet) ?? [], PEOPLE_FIELDS)
    : [];
  const historyMapping = historySheet
    ? mapColumns(headersBySheet.get(historySheet) ?? [], HISTORY_FIELDS)
    : [];

  for (const m of [...peopleMapping, ...historyMapping]) {
    if (m.required && !m.header) {
      errors.push(`Coluna obrigatoria nao encontrada: ${m.field}`);
    }
  }

  const report: AdapterReport = {
    peopleSheet,
    historySheet,
    peopleMapping,
    historyMapping,
    peopleRows: 0,
    historyRows: 0,
    skippedPeople: 0,
    skippedHistory: 0,
    unmappedCompanies: [],
    multiLinkCpfs: 0,
    futureAdmissions: 0,
    suspiciousSalaries: 0,
    errors,
  };

  if (errors.length) return { people: [], history: [], report };

  const col = (mapping: ColumnMatch[], field: string): string | null =>
    mapping.find((m) => m.field === field)?.header ?? null;

  // -------- pessoas
  const people: PersonRow[] = [];
  const unmapped = new Map<string, number>();
  const cpfLinks = new Map<string, number>();
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

  const pRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[peopleSheet!], {
    defval: null,
  });
  const pc = {
    company: col(peopleMapping, 'company')!,
    cpf: col(peopleMapping, 'cpf')!,
    rowId: col(peopleMapping, 'rowId'),
    admission: col(peopleMapping, 'admission')!,
    termination: col(peopleMapping, 'termination')!,
    gender: col(peopleMapping, 'gender')!,
    state: col(peopleMapping, 'state')!,
    leadership: col(peopleMapping, 'leadership')!,
  };

  // "Lideranca ?" existe em CINCO colunas, uma por bloco de unidade (Recife,
  // Betfair, SP, Flutter, Marechal); cada pessoa tem no maximo uma preenchida.
  // Ler so a primeira subcontava lideres (~108 de ~140). Coalesce: vale o
  // primeiro valor real (nem vazio, nem "Nao informado") entre os blocos.
  const leadMatch = peopleMapping.find((m) => m.field === 'leadership');
  const leadHeaders = leadMatch?.header ? [leadMatch.header, ...leadMatch.alternatives] : [];
  const coalesceLeadership = (row: Record<string, unknown>): string =>
    leadHeaders.map((h) => toStr(row[h])).find((v) => v && v !== 'Não informado') ?? '';

  for (const row of pRows) {
    const cpfDigits = toStr(row[pc.cpf]).replace(/\D/g, '');
    const rowId = pc.rowId ? toStr(row[pc.rowId]) : '';
    // Sem CPF, a pessoa entra com a chave reserva ("id:..."): conta no
    // headcount, mas nao casa com o historico (que so tem CPF) -- cai em
    // SEM DEPTO, o que e o retrato honesto do dado.
    const cpf = cpfDigits || (rowId ? `id:${rowId}` : '');
    const company = toStr(row[pc.company]);
    if (!cpf || !company) {
      report.skippedPeople++;
      continue;
    }
    if (!(company in COMPANY_TO_BU)) {
      unmapped.set(company, (unmapped.get(company) ?? 0) + 1);
    }
    const admission = toDate(row[pc.admission]);
    if (admission && admission.getTime() > todayUtc.getTime()) report.futureAdmissions++;
    cpfLinks.set(cpf, (cpfLinks.get(cpf) ?? 0) + 1);
    people.push({
      company,
      cpf,
      admission,
      termination: toDate(row[pc.termination]),
      gender: toStr(row[pc.gender]),
      state: toStr(row[pc.state]),
      leadership: coalesceLeadership(row),
    });
  }

  // -------- historico
  const history: HistoryRow[] = [];
  const hRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[historySheet!], {
    defval: null,
  });
  const hcCol = {
    cpf: col(historyMapping, 'cpf')!,
    from: col(historyMapping, 'from')!,
    to: col(historyMapping, 'to'),
    department: col(historyMapping, 'department')!,
    salary: col(historyMapping, 'salary'),
  };

  for (const row of hRows) {
    const cpf = toStr(row[hcCol.cpf]).replace(/\D/g, '');
    if (!cpf) {
      report.skippedHistory++;
      continue;
    }
    const rawSalary = hcCol.salary ? row[hcCol.salary] : null;
    if (isThousandsWithoutCents(rawSalary)) report.suspiciousSalaries++;
    history.push({
      cpf,
      from: toDate(row[hcCol.from]),
      to: hcCol.to ? toDate(row[hcCol.to]) : null,
      department: toStr(row[hcCol.department]),
      salary: parseBrNumber(rawSalary as string | number | null),
    });
  }

  report.peopleRows = people.length;
  report.historyRows = history.length;
  report.unmappedCompanies = [...unmapped.entries()]
    .map(([company, rows]) => ({ company, rows }))
    .sort((a, b) => b.rows - a.rows);
  report.multiLinkCpfs = [...cpfLinks.values()].filter((n) => n > 1).length;

  return { people, history, report };
}
