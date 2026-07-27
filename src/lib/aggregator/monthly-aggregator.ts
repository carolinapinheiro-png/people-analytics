/**
 * Agregador mensal: Talent_Mobility -> monthly_metrics (source='reconstruido').
 *
 * ================== REVISADO EM LEITURA FRIA (24/07/2026) ==================
 * Revisao linha a linha em sessao independente, decisoes da area aplicadas
 * (ver RASCUNHO.md): dedup hibrido por CPF, SEM DEPTO, attrition por headcount
 * de fim de mes, promotions null. NAO mesclar na main antes dos testes
 * sinteticos (monthly-aggregator.test.ts).
 * =========================================================================
 *
 * Nucleo puro: sem IO, sem dependencias. Adaptadores (XLSX no navegador,
 * CSV em linha de comando) ficam fora deste arquivo.
 */

export type BusinessUnit = 'nsx_br' | 'betfair' | 'flutter_intl';

/** De-para explicito empresa -> unidade de negocio (plano-dados.md).
 *  Nunca usar prefixo: "NSX BETFAIR BRASIL S.A." comeca com NSX mas e Betfair. */
export const COMPANY_TO_BU: Record<string, BusinessUnit> = {
  'NSX BRASIL RECIFE': 'nsx_br',
  'NSX BRASIL SÃO PAULO': 'nsx_br',
  'NSX MARECHAL': 'nsx_br',
  'NSX BETFAIR BRASIL S.A.': 'betfair',
  'FLUTTER INTERNATIONAL': 'flutter_intl',
};

/** Normalizacao de departamento (decisoes da etapa 2.5). */
export const DEPT_NORM: Record<string, string> = {
  '-': 'SEM DEPTO',
  '': 'SEM DEPTO',
  'nan': 'SEM DEPTO',
  'Geral': 'SEM DEPTO',
  'NSX': 'SEM DEPTO',
  'PR': 'SEM DEPTO',
  'OPERATIONS': 'OPERATION',
  'COMPLIANCE': 'LEGAL & COMPLIANCE',
  'LEGAL': 'LEGAL & COMPLIANCE',
};

export const normalizeDept = (raw: string | null | undefined): string => {
  const d = (raw ?? '').trim();
  return DEPT_NORM[d] ?? d;
};

/** Regra da area (plano-dados.md, decisao 4): lider e exclusivamente "Sim". */
export const isLeader = (v: string | null | undefined): boolean =>
  (v ?? '').trim() === 'Sim';

/** Regra de genero espelha a serie congelada (validado: 2026-03 bate exato).
 *  Mulher Trans conta como mulher, Homem Trans como homem; demais respostas
 *  ficam fora dos dois grupos mas DENTRO do headcount (denominador). */
const FEM = new Set(['Mulher', 'Mulher Trans']);
const MASC = new Set(['Homem', 'Homem Trans']);

export interface PersonRow {
  company: string;
  cpf: string;
  admission: Date | null;
  termination: Date | null;
  gender: string;
  state: string;
  leadership: string;
}

export interface HistoryRow {
  cpf: string;
  from: Date | null;
  to: Date | null;
  department: string;
  salary: number | null;
}

export interface DeptAggregate {
  hc: number;
  avg_salary_leaders: number;
  avg_salary_non_leaders: number;
}

export interface MonthAggregate {
  month: string; // YYYY-MM-01
  business_unit: BusinessUnit;
  headcount: number;
  joiners: number;
  leavers: number;
  attrition_rate: number;
  /** Nao reconstruivel de Talent_Mobility (a base nao distingue promocao de
   *  reajuste por merito). null de proposito: 0 seria uma afirmacao. Fonte
   *  original da serie congelada a descobrir com a area. */
  promotions: number | null;
  gender_female: number;
  gender_male: number;
  /** Base com genero conhecido (fem+mas). Menor que headcount quando a fonte
   *  nao traz genero (Workday/Betfair) ou ha "Nao informado". Denominador de
   *  gender_female_pct e a declaracao da base parcial. */
  gender_base: number;
  gender_female_pct: number;
  leaders: number;
  leader_female: number;
  leader_female_pct: number;
  leaders_pct: number;
  avg_salary_leaders: number;
  avg_salary_non_leaders: number;
  state_mix: Record<string, number>;
  dept_data: Record<string, DeptAggregate>;
}

/** dd/mm/aaaa ou ISO aaaa-mm-dd -> Date em UTC (evita armadilha de fuso). */
export function parseBrDate(s: string | null | undefined): Date | null {
  const v = (s ?? '').trim();
  if (!v || v === 'Não informado' || v === 'nan') return null;
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}

/** "1.234,56" ou "1234.56" -> numero. */
export function parseBrNumber(s: string | number | null | undefined): number | null {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const v = (s ?? '').trim();
  if (!v || v === 'nan') return null;
  const norm = /,\d{1,2}$/.test(v) ? v.replace(/\./g, '').replace(',', '.') : v;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

export const monthStart = (y: number, m: number): Date => new Date(Date.UTC(y, m - 1, 1));
export const monthEnd = (y: number, m: number): Date => new Date(Date.UTC(y, m, 0));

export function isActiveAt(p: PersonRow, ref: Date): boolean {
  // Decisao 24/07 (revisao fria): manter ambos os cortes como estao ate a
  // comparacao lado a lado -- admissao no dia do corte CONTA como ativo;
  // desligamento no dia do corte JA EXCLUI. Os +-1 contra a serie congelada
  // sao a evidencia que vai revelar a convencao da origem; decisao oficial
  // vem dai, nao de palpite.
  if (!p.admission || p.admission.getTime() > ref.getTime()) return false;
  if (p.termination && p.termination.getTime() <= ref.getTime()) return false;
  return true;
}

const mean1 = (vals: number[]): number =>
  vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;
const round1 = (x: number): number => Math.round(x * 10) / 10;
const round2 = (x: number): number => Math.round(x * 100) / 100;

/** Registro vigente na data: from <= ref e (sem fim ou fim >= ref);
 *  em sobreposicao, vence o inicio mais recente (mesma regra do prototipo). */
export function departmentAt(rows: HistoryRow[], ref: Date): HistoryRow | null {
  let best: HistoryRow | null = null;
  for (const r of rows) {
    if (!r.from || r.from.getTime() > ref.getTime()) continue;
    if (r.to && r.to.getTime() < ref.getTime()) continue;
    if (!best || (best.from && r.from.getTime() >= best.from.getTime())) best = r;
  }
  return best;
}

export function aggregateMonth(
  people: PersonRow[],
  historyByCpf: Map<string, HistoryRow[]>,
  year: number,
  month: number,
  bu: BusinessUnit,
): MonthAggregate {
  const start = monthStart(year, month);
  const end = monthEnd(year, month);
  const pool = people.filter((p) => COMPANY_TO_BU[p.company.trim()] === bu);
  // Decisao 24/07 (revisao fria): regra HIBRIDA para multiplos vinculos.
  // FOTO por pessoa: headcount, genero, lideranca, estados e deptos deduplicam
  // por CPF -- o vinculo ativo de admissao mais recente representa a pessoa
  // (empate de admissao: vence o primeiro na ordem de entrada).
  // FLUXO por evento: joiners/leavers contam cada admissao/desligamento;
  // recontratacao e entrada real. Caso motivador: 1 CPF com 6 vinculos, 3
  // ativos simultaneos em out/2025 (ver RASCUNHO.md; correcao reportada ao DP).
  const activeLinks = pool.filter((p) => isActiveAt(p, end));
  const byCpf = new Map<string, PersonRow>();
  for (const p of activeLinks) {
    const cur = byCpf.get(p.cpf);
    if (!cur || (p.admission?.getTime() ?? 0) > (cur.admission?.getTime() ?? 0)) {
      byCpf.set(p.cpf, p);
    }
  }
  const active = [...byCpf.values()];

  const inWindow = (d: Date | null) =>
    !!d && d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
  const joiners = pool.filter((p) => inWindow(p.admission)).length;
  const leavers = pool.filter((p) => inWindow(p.termination)).length;

  const fem = active.filter((p) => FEM.has(p.gender)).length;
  const mas = active.filter((p) => MASC.has(p.gender)).length;
  const leaders = active.filter((p) => isLeader(p.leadership)).length;
  const leaderF = active.filter((p) => isLeader(p.leadership) && FEM.has(p.gender)).length;

  const stateMix: Record<string, number> = {};
  for (const p of active) {
    const uf = p.state.trim() || 'Não informado';
    stateMix[uf] = (stateMix[uf] ?? 0) + 1;
  }

  const deptRows: Array<{ dept: string; lead: boolean; salary: number | null }> = [];
  for (const p of active) {
    const vig = departmentAt(historyByCpf.get(p.cpf) ?? [], end);
    // Decisao 24/07 (revisao fria): ativo sem registro vigente entra como
    // SEM DEPTO -- a soma dos departamentos passa a bater com o headcount.
    // (Deixa-los fora replicava o prototipo Python apenas para a verificacao
    // de equivalencia, ja concluida.)
    deptRows.push({
      dept: vig ? normalizeDept(vig.department) : 'SEM DEPTO',
      lead: isLeader(p.leadership),
      salary: vig ? vig.salary : null,
    });
  }

  const deptData: Record<string, DeptAggregate> = {};
  for (const dept of [...new Set(deptRows.map((r) => r.dept))].sort()) {
    const g = deptRows.filter((r) => r.dept === dept);
    deptData[dept] = {
      hc: g.length,
      avg_salary_leaders: mean1(g.filter((r) => r.lead && r.salary != null).map((r) => r.salary as number)),
      avg_salary_non_leaders: mean1(g.filter((r) => !r.lead && r.salary != null).map((r) => r.salary as number)),
    };
  }

  const salLead = deptRows.filter((r) => r.lead && r.salary != null).map((r) => r.salary as number);
  const salNon = deptRows.filter((r) => !r.lead && r.salary != null).map((r) => r.salary as number);
  const hc = active.length;

  return {
    month: `${year}-${String(month).padStart(2, '0')}-01`,
    business_unit: bu,
    headcount: hc,
    joiners,
    leavers,
    // Decisao 24/07 (revisao fria): denominador = headcount de fim de mes,
    // mantido ate a comparacao com a serie congelada. Reabrir (headcount
    // medio?) quando a serie oficial for escolhida.
    attrition_rate: hc ? round2((leavers / hc) * 100) : 0,
    promotions: null,
    gender_female: fem,
    gender_male: mas,
    // % de mulheres sobre a base com genero CONHECIDO (fem+mas), nao sobre o
    // headcount. Motivo: a fonte Workday (Betfair) nao traz genero, entao
    // dividir por headcount deflacionaria o indicador em ate 3x conforme a
    // participacao do Workday. Sobre a base conhecida, o numero segue honesto
    // e gender_base declara o tamanho dessa base (ver decisao 11).
    gender_base: fem + mas,
    gender_female_pct: fem + mas ? round1((fem / (fem + mas)) * 100) : 0,
    leaders,
    leader_female: leaderF,
    leader_female_pct: leaders ? round1((leaderF / leaders) * 100) : 0,
    leaders_pct: hc ? round1((leaders / hc) * 100) : 0,
    avg_salary_leaders: mean1(salLead),
    avg_salary_non_leaders: mean1(salNon),
    state_mix: stateMix,
    dept_data: deptData,
  };
}

export function aggregateRange(
  people: PersonRow[],
  history: HistoryRow[],
  fromYm: string,
  toYm: string,
  bu: BusinessUnit,
): MonthAggregate[] {
  const historyByCpf = new Map<string, HistoryRow[]>();
  for (const r of history) {
    const arr = historyByCpf.get(r.cpf);
    if (arr) arr.push(r);
    else historyByCpf.set(r.cpf, [r]);
  }
  const [fy, fm] = fromYm.split('-').map(Number);
  const [ty, tm] = toYm.split('-').map(Number);
  const out: MonthAggregate[] = [];
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, (m = 1)) : m++) {
    out.push(aggregateMonth(people, historyByCpf, y, m, bu));
  }
  return out;
}
