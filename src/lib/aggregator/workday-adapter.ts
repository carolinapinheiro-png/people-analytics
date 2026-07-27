/**
 * Adaptador Workday (Brazil_FBe) -> PersonRow para compor Betfair BR.
 *
 * Decisao da area (24/07): o Workday inteiro e Betfair BR. Betfair BR distinta =
 * 86 = 34 do Talent Mobility + 52 so-Workday. Nos 18 duplicados vence o Talent
 * Mobility, entao este adaptador REMOVE do Workday quem ja existe no Talent
 * Mobility (match por nome normalizado -- unica ponte, pois Workday usa
 * Employee ID e o TM usa CPF).
 *
 * LIMITACOES ESTRUTURAIS (declaradas, nao consertaveis pela fonte):
 * - Genero: o Workday nao tem a coluna. As pessoas so-Workday entram no
 *   headcount mas ficam fora de fem/mas -> gender_female_pct passa a ser sobre
 *   a base conhecida (ver monthly-aggregator, gender_base).
 * - Historico de departamento: nao existe. Cada pessoa tem so o cargo atual, e
 *   o "Department" do Workday e uma unidade nomeada por gestor (nao comparavel
 *   a OPERATION/TECH). Por isso NAO geramos HistoryRow: caem em SEM DEPTO.
 * - Vies de sobrevivencia: o arquivo e um retrato de maio/2026. Quem saiu antes
 *   nao aparece. Reconstrucao para meses de 2025 subconta headcount e nao ve
 *   leavers antigos dessa parcela. Recente (2026) e solido.
 * - Salario: ausente -> nao entram em avg_salary.
 *
 * Lido no navegador; nenhuma linha individual sai da maquina.
 */
import { parseBrDate, type PersonRow } from './monthly-aggregator';

/** Empresa canonica que roteia para a BU betfair no COMPANY_TO_BU. */
const BETFAIR_COMPANY = 'NSX BETFAIR BRASIL S.A.';

const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** dd/mm/aa ou dd/mm/aaaa -> Date UTC. Ano de 2 digitos vira 20xx (a base tem
 *  admissoes de 2009 em diante; nenhuma anterior a 2000). */
function parseWorkdayDate(s: string): Date | null {
  const v = (s ?? '').trim();
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return parseBrDate(v);
  let y = +m[3];
  if (y < 100) y += 2000;
  return new Date(Date.UTC(y, +m[2] - 1, +m[1]));
}

export interface WorkdayReport {
  totalRows: number;
  /** Removidos por ja existirem no Talent Mobility (18 duplicados). */
  overlapWithTm: number;
  /** Efetivamente adicionados a Betfair. */
  added: number;
  skippedNoHire: number;
  managers: number;
  locations: Record<string, number>;
  /** Pessoas sem genero (todas, no Workday): tamanho da lacuna declarada. */
  withoutGender: number;
  errors: string[];
}

export interface ParsedWorkday {
  people: PersonRow[];
  report: WorkdayReport;
}

/** Divide uma linha CSV com delimitador ';' respeitando aspas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (c === ';' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * @param text conteudo do Brazil_FBe (CSV ';'). A linha 1 e um titulo de
 *   relatorio ("1001 Daily Employee Report..."); o cabecalho real e a linha 2.
 * @param tmNames nomes normalizados de TODAS as pessoas do Talent Mobility, para
 *   remover os duplicados (TM vence).
 */
export function parseWorkdayBetfair(text: string, tmNames: Set<string>): ParsedWorkday {
  const lines = text.split(/\r?\n/);
  const errors: string[] = [];
  // Acha a linha de cabecalho: a que contem "Employee ID" e "Worker".
  const headerIdx = lines.findIndex((l) => /Employee ID/i.test(l) && /Worker/i.test(l));
  if (headerIdx < 0) {
    return {
      people: [],
      report: {
        totalRows: 0,
        overlapWithTm: 0,
        added: 0,
        skippedNoHire: 0,
        managers: 0,
        locations: {},
        withoutGender: 0,
        errors: ['Cabecalho do Workday nao encontrado (esperado "Employee ID"/"Worker").'],
      },
    };
  }

  const headers = splitCsvLine(lines[headerIdx]);
  const idx = (name: string) => headers.findIndex((h) => norm(h) === norm(name));
  const iWorker = idx('Worker');
  const iHire = idx('Hire Date');
  const iFtc = idx('FTC end date');
  const iLeave = idx('Future leave date');
  const iLoc = idx('Location');
  const iMgr = idx('Is Manager?');

  for (const [label, i] of [
    ['Worker', iWorker],
    ['Hire Date', iHire],
    ['Location', iLoc],
    ['Is Manager?', iMgr],
  ] as const) {
    if (i < 0) errors.push(`Coluna obrigatoria do Workday ausente: ${label}`);
  }

  const report: WorkdayReport = {
    totalRows: 0,
    overlapWithTm: 0,
    added: 0,
    skippedNoHire: 0,
    managers: 0,
    locations: {},
    withoutGender: 0,
    errors,
  };
  if (errors.length) return { people: [], report };

  const people: PersonRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = splitCsvLine(lines[i]);
    const worker = (row[iWorker] ?? '').trim();
    if (!worker) continue;
    report.totalRows++;

    if (tmNames.has(norm(worker))) {
      report.overlapWithTm++;
      continue; // TM vence os duplicados
    }
    const admission = parseWorkdayDate(row[iHire] ?? '');
    if (!admission) {
      report.skippedNoHire++;
      continue;
    }
    // Termino: FTC end date, senao Future leave date; ambos raros.
    const termination =
      parseWorkdayDate(row[iFtc] ?? '') ?? parseWorkdayDate(row[iLeave] ?? '') ?? null;
    const isMgr = (row[iMgr] ?? '').trim().toLowerCase() === 'yes';
    if (isMgr) report.managers++;
    const loc = (row[iLoc] ?? '').trim() || 'Não informado';
    report.locations[loc] = (report.locations[loc] ?? 0) + 1;
    report.withoutGender++;

    people.push({
      company: BETFAIR_COMPANY,
      cpf: `wd:${worker}`, // sem CPF; chave propria, nunca casa com historico (SEM DEPTO)
      admission,
      termination,
      gender: '', // Workday nao tem genero -> fora de fem/mas, dentro do headcount
      state: loc,
      leadership: isMgr ? 'Sim' : 'Não',
    });
  }
  report.added = people.length;
  return { people, report };
}
