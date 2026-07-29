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

/** Titulos que caracterizam cargo de lideranca. Usado so para DATAR a
 *  transicao para lideranca no historico (nao para (re)classificar quem e
 *  lider hoje -- isso vem da flag "Lideranca?" do snapshot). */
const LEAD_TITLE =
  /manager|head|director|diretor|chief|c[tfmoe]o|cpo|clo|vp|supervisor|coordenad|coordinator|l[ií]der|gerente/i;

/** "L0".."L9" a partir de textos como "L3", "Level 3", "3". null se ausente. */
export function levelBucket(v: string | number | null | undefined): number | null {
  const m = String(v ?? '').toUpperCase().match(/L?\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Faixa de tempo de casa na data de referencia (historico exato: fim do mes
 *  menos a admissao). Sem admissao -> "Não informado". */
export function tenureBucket(admission: Date | null, ref: Date): string {
  if (!admission) return 'Não informado';
  const months = (ref.getTime() - admission.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (months < 3) return '0-3m';
  if (months < 6) return '3-6m';
  if (months < 12) return '6-12m';
  if (months < 24) return '1-2a';
  if (months < 60) return '2-5a';
  return '5a+';
}

/**
 * Reconstrucao historica (decisao 28/07): a serie deixa de aplicar o valor
 * ATUAL para tras em lideranca e nivel; passa a usar o valor DA EPOCA, ancorado
 * no snapshot atual (exato) e recuado so por eventos reais e datados.
 *  - Lideranca: quem e lider hoje deixa de ser lider ANTES da sua transicao
 *    real para um cargo de lideranca (primeiro cargo de lideranca no historico
 *    tendo havido cargo nao-lideranca antes). Sem transicao detectada, mantem
 *    lider (nao fabrica recuo). Exato no mes atual (Δ=0).
 *  - Nivel: nivel atual menos 1 por promocao (Motivo="Promoção") posterior ao
 *    mes. Premissa unica e documentada: 1 nivel por promocao. Exato no mes atual.
 */

/** Data da transicao para lideranca (undefined se a pessoa ja entrou lider ou
 *  nao ha cargo de lideranca no historico). */
export function leadershipStart(rows: HistoryRow[]): Date | null {
  const rs = rows
    .filter((r) => r.from && (r.cargo ?? '').trim())
    .sort((a, b) => (a.from as Date).getTime() - (b.from as Date).getTime());
  const idx = rs.findIndex((r) => LEAD_TITLE.test(r.cargo as string));
  if (idx <= 0) return null; // nao achou, ou ja era lider no 1o registro
  const teveNaoLid = rs.slice(0, idx).some((r) => !LEAD_TITLE.test(r.cargo as string));
  return teveNaoLid ? (rs[idx].from as Date) : null;
}

/** Datas de promocao (Motivo="Promoção") de uma pessoa. */
export function promotionDates(rows: HistoryRow[]): Date[] {
  return rows
    .filter((r) => (r.reason ?? '').trim().toLowerCase().startsWith('promo') && r.from)
    .map((r) => r.from as Date);
}

/**
 * Movimentacoes salariais (decisao 28/07): reconstroi do historico os eventos de
 * reajuste separando promocao x merito x dissidio, com o VALOR do reajuste
 * (salario do evento menos o ultimo salario conhecido da pessoa). Dissidio
 * inclui "Antecipação de dissídio" e "Acordo coletivo" (reajuste coletivo).
 */
export type RaiseType = 'promocao' | 'merito' | 'dissidio';

export function classifyRaise(reason: string | null | undefined): RaiseType | null {
  const r = (reason ?? '').trim().toLowerCase();
  if (r.startsWith('promo')) return 'promocao';
  if (r.startsWith('mérito') || r.startsWith('merito') || r.startsWith('reajuste')) return 'merito';
  if (r.includes('diss') || r.startsWith('acordo coletivo')) return 'dissidio';
  return null;
}

export interface RaiseEvent {
  from: Date;
  type: RaiseType;
  delta: number;
}

/** Eventos de reajuste de uma pessoa, com o delta vs o ultimo salario conhecido. */
export function salaryMovements(rows: HistoryRow[]): RaiseEvent[] {
  const rs = rows
    .filter((r) => r.from)
    .sort((a, b) => (a.from as Date).getTime() - (b.from as Date).getTime());
  const out: RaiseEvent[] = [];
  let lastSal: number | null = null;
  for (const r of rs) {
    const type = classifyRaise(r.reason);
    if (type && lastSal != null && r.salary != null) {
      out.push({ from: r.from as Date, type, delta: r.salary - lastSal });
    }
    if (r.salary != null) lastSal = r.salary;
  }
  return out;
}

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
  /** Nivel ATUAL (L0..L9) do snapshot; ancora da reconstrucao historica de
   *  nivel. null quando a fonte nao traz nivel (ex.: Workday/Betfair). */
  level?: number | null;
  /** Cota legal: pessoa com deficiencia (campo "Considera PCD"). Atributo atual;
   *  o campo e pouco preenchido, entao subconta. */
  pcd?: boolean;
  /** Cota legal: aprendiz (Vinculo = "Aprendiz"). Atributo atual. */
  apprentice?: boolean;
}

export interface HistoryRow {
  cpf: string;
  from: Date | null;
  to: Date | null;
  department: string;
  salary: number | null;
  /** Motivo do registro (coluna "Motivo" do historico): "Admissão",
   *  "Promoção", "Mérito/Reajuste", "Dissídio", etc. Fonte das promocoes. */
  reason?: string | null;
  /** Cargo vigente no registro (coluna "Cargo"). Fonte para DATAR a transicao
   *  para lideranca na reconstrucao historica. */
  cargo?: string | null;
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
  /** Promocoes do mes: registros do historico com Motivo="Promoção" cuja data
   *  de inicio (De) cai no mes, para CPFs da BU. A area confirmou (27/07) que
   *  movimentacoes e promocoes vem desta aba; "Mérito/Reajuste" e "Dissídio"
   *  sao reajustes, NAO promocoes. */
  promotions: number;
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
  /** Distribuicao por nivel DA EPOCA (âncora no atual, recuo por promocao):
   *  { "L0": n, ..., "NA": n }. Base = pessoas com nivel conhecido + "NA". */
  level_base: Record<string, number>;
  /** Movimentacoes salariais do mes por tipo: { promocao:{n,delta}, merito:{...},
   *  dissidio:{...} }. n = nº de eventos; delta = soma dos reajustes (R$). */
  raise_events: Record<RaiseType, { n: number; delta: number }>;
  /** Cotas legais (atributo atual aplicado aos ativos): PCD e aprendizes. */
  pcd: number;
  apprentice: number;
  /** Lideranca DA EPOCA por departamento: { DEPT: { leaders, female } }. */
  leader_dept: Record<string, { leaders: number; female: number }>;
  /** Distribuicao por tempo de casa dos ativos ({ "0-3m": n, ..., "5a+": n }).
   *  Historico exato (fim do mes menos admissao). */
  tenure_base: Record<string, number>;
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

  // Promocoes: registros de historico com Motivo="Promoção" cuja data de inicio
  // cai no mes, para CPFs desta BU. Fonte confirmada pela area (aba de historico
  // do Talent Mobility). Reajuste/dissidio nao contam.
  const isPromotion = (reason: string | null | undefined): boolean =>
    (reason ?? '').trim().toLowerCase().startsWith('promo');
  const poolCpfs = new Set(pool.map((p) => p.cpf));
  let promotions = 0;
  const raiseAgg: Record<RaiseType, { n: number; delta: number }> = {
    promocao: { n: 0, delta: 0 },
    merito: { n: 0, delta: 0 },
    dissidio: { n: 0, delta: 0 },
  };
  for (const [cpf, rows] of historyByCpf) {
    if (!poolCpfs.has(cpf)) continue;
    for (const r of rows) if (isPromotion(r.reason) && inWindow(r.from)) promotions++;
    for (const e of salaryMovements(rows)) {
      if (inWindow(e.from)) {
        raiseAgg[e.type].n++;
        raiseAgg[e.type].delta += e.delta;
      }
    }
  }
  for (const t of ['promocao', 'merito', 'dissidio'] as RaiseType[]) raiseAgg[t].delta = Math.round(raiseAgg[t].delta);

  // Reconstrucao historica por pessoa (valores DA EPOCA, decisao 28/07):
  // lideranca e nivel ancorados no snapshot e recuados so por eventos datados.
  const leadAtOf = (p: PersonRow): boolean => {
    if (!isLeader(p.leadership)) return false;
    const ls = leadershipStart(historyByCpf.get(p.cpf) ?? []);
    return !(ls && ls.getTime() > end.getTime());
  };
  const levelAtOf = (p: PersonRow): number | null => {
    if (p.level == null) return null;
    const promosAfter = promotionDates(historyByCpf.get(p.cpf) ?? []).filter(
      (d) => d.getTime() > end.getTime(),
    ).length;
    return Math.max(0, p.level - promosAfter);
  };
  const recon = active.map((p) => ({ p, lead: leadAtOf(p), level: levelAtOf(p) }));

  const fem = recon.filter((r) => FEM.has(r.p.gender)).length;
  const mas = recon.filter((r) => MASC.has(r.p.gender)).length;
  const leaders = recon.filter((r) => r.lead).length;
  const leaderF = recon.filter((r) => r.lead && FEM.has(r.p.gender)).length;

  // Distribuicao por nivel da epoca (pirâmide de senioridade no tempo).
  const levelBase: Record<string, number> = {};
  for (const r of recon) {
    const key = r.level == null ? 'NA' : `L${r.level}`;
    levelBase[key] = (levelBase[key] ?? 0) + 1;
  }

  const stateMix: Record<string, number> = {};
  for (const p of active) {
    const uf = p.state.trim() || 'Não informado';
    stateMix[uf] = (stateMix[uf] ?? 0) + 1;
  }

  const deptRows: Array<{ dept: string; lead: boolean; salary: number | null }> = [];
  const leaderDept: Record<string, { leaders: number; female: number }> = {};
  for (const r of recon) {
    const vig = departmentAt(historyByCpf.get(r.p.cpf) ?? [], end);
    // Decisao 24/07 (revisao fria): ativo sem registro vigente entra como
    // SEM DEPTO -- a soma dos departamentos passa a bater com o headcount.
    // (Deixa-los fora replicava o prototipo Python apenas para a verificacao
    // de equivalencia, ja concluida.)
    const dept = vig ? normalizeDept(vig.department) : 'SEM DEPTO';
    deptRows.push({ dept, lead: r.lead, salary: vig ? vig.salary : null });
    // Lideranca da epoca por depto (para a quebra de lideranca feminina por area).
    if (r.lead) {
      const ld = (leaderDept[dept] = leaderDept[dept] ?? { leaders: 0, female: 0 });
      ld.leaders++;
      if (FEM.has(r.p.gender)) ld.female++;
    }
  }

  const pcd = active.filter((p) => p.pcd).length;
  const apprentice = active.filter((p) => p.apprentice).length;

  const tenureBase: Record<string, number> = {};
  for (const p of active) {
    const b = tenureBucket(p.admission, end);
    tenureBase[b] = (tenureBase[b] ?? 0) + 1;
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
    promotions,
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
    level_base: levelBase,
    raise_events: raiseAgg,
    pcd,
    apprentice,
    leader_dept: leaderDept,
    tenure_base: tenureBase,
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
