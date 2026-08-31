import type { MonthRecord, DeptData, DeptBreakdownRecord } from './raw-data';

export function getMonthsOrder(data: MonthRecord[]): string[] {
  return [...new Set(data.map(d => d.month))].sort();
}

export function getQuarterFromMonth(month: string): string {
  const [year, monthNum] = month.split('-').map(Number);
  const quarter = Math.ceil(monthNum / 3);
  return `${year}Q${quarter}`;
}

export function aggregateMonthlyToQuarterly(monthlyData: MonthRecord[]): MonthRecord[] {
  const quarterMap = new Map<string, MonthRecord[]>();
  
  // Group months by quarter
  monthlyData.forEach(record => {
    const quarter = getQuarterFromMonth(record.month);
    if (!quarterMap.has(quarter)) {
      quarterMap.set(quarter, []);
    }
    quarterMap.get(quarter)!.push(record);
  });
  
  // Aggregate each quarter
  const quarterlyData: MonthRecord[] = [];
  quarterMap.forEach((months, quarter) => {
    if (months.length === 0) return;
    
    const firstMonth = months[0];
    const totalHeadcount = months.reduce((sum, m) => sum + (m.headcount || 0), 0);
    const avgHeadcount = Math.round(totalHeadcount / months.length);
    const totalJoiners = months.reduce((sum, m) => sum + (m.joiners || 0), 0);
    const totalLeavers = months.reduce((sum, m) => sum + (m.leavers || 0), 0);
    const totalPromotions = months.reduce((sum, m) => sum + (m.promotions || 0), 0);
    const totalGenderFemale = months.reduce((sum, m) => sum + (m.gender_female || 0), 0);
    const totalGenderMale = months.reduce((sum, m) => sum + (m.gender_male || 0), 0);
    const totalLeaders = months.reduce((sum, m) => sum + (m.leaders || 0), 0);
    const totalLeaderFemale = months.reduce((sum, m) => sum + (m.leader_female || 0), 0);
    
    // Merge dept_data
    const mergedDeptData: Record<string, DeptData> = {};
    months.forEach(m => {
      Object.entries(m.dept_data || {}).forEach(([dept, data]) => {
        if (mergedDeptData[dept]) {
          mergedDeptData[dept].hc += data.hc || 0;
        } else {
          mergedDeptData[dept] = { ...data };
        }
      });
    });
    
    // Average dept hc
    Object.keys(mergedDeptData).forEach(dept => {
      mergedDeptData[dept].hc = Math.round(mergedDeptData[dept].hc / months.length);
    });
    
    const hcForCalc = avgHeadcount + totalLeavers;
    
    quarterlyData.push({
      month: quarter,
      brand: firstMonth.brand,
      headcount: avgHeadcount,
      joiners: totalJoiners,
      leavers: totalLeavers,
      year: firstMonth.year,
      attrition_rate: hcForCalc > 0 ? parseFloat((totalLeavers / hcForCalc * 100).toFixed(2)) : 0,
      gender_female: Math.round(totalGenderFemale / months.length),
      gender_male: Math.round(totalGenderMale / months.length),
      gender_female_pct: avgHeadcount > 0 ? parseFloat(((totalGenderFemale / months.length) / avgHeadcount * 100).toFixed(1)) : 0,
      leaders: Math.round(totalLeaders / months.length),
      leader_female: Math.round(totalLeaderFemale / months.length),
      leader_female_pct: totalLeaders > 0 ? parseFloat(((totalLeaderFemale / months.length) / (totalLeaders / months.length) * 100).toFixed(1)) : 0,
      leaders_pct: avgHeadcount > 0 ? parseFloat(((totalLeaders / months.length) / avgHeadcount * 100).toFixed(1)) : 0,
      avg_salary_leaders: firstMonth.avg_salary_leaders,
      avg_salary_non_leaders: firstMonth.avg_salary_non_leaders,
      state_mix: firstMonth.state_mix || {},
      dept_data: mergedDeptData,
      promotions: totalPromotions,
    });
  });
  
  return quarterlyData.sort((a, b) => a.month.localeCompare(b.month));
}

export function getMonthData(data: MonthRecord[], month: string, brand: string): MonthRecord {
  if (brand === 'combined') {
    const n = data.find(d => d.month === month && d.brand === 'NSX') || {} as MonthRecord;
    const b = data.find(d => d.month === month && d.brand === 'Betfair BR') || {} as MonthRecord;
    const f = data.find(d => d.month === month && d.brand === 'Flutter International') || {} as MonthRecord;
    const hc = (n.headcount || 0) + (b.headcount || 0) + (f.headcount || 0);
    const j = (n.joiners || 0) + (b.joiners || 0) + (f.joiners || 0);
    const l = (n.leavers || 0) + (b.leavers || 0) + (f.leavers || 0);
    const f_ = (n.gender_female || 0) + (b.gender_female || 0) + (f.gender_female || 0);
    const lead = (n.leaders || 0) + (b.leaders || 0) + (f.leaders || 0);
    const lf = (n.leader_female || 0) + (b.leader_female || 0) + (f.leader_female || 0);
    return {
      month, brand: 'Combined', headcount: hc, joiners: j, leavers: l, year: n.year || b.year || f.year || 2026,
      attrition_rate: hc + l > 0 ? parseFloat((l / (hc + l) * 100).toFixed(2)) : 0,
      gender_female: f_, gender_male: (n.gender_male || 0) + (b.gender_male || 0) + (f.gender_male || 0),
      gender_female_pct: hc > 0 ? parseFloat((f_ / hc * 100).toFixed(1)) : 0,
      leaders: lead, leader_female: lf,
      leader_female_pct: lead > 0 ? parseFloat((lf / lead * 100).toFixed(1)) : 0,
      leaders_pct: hc > 0 ? parseFloat((lead / hc * 100).toFixed(1)) : 0,
      avg_salary_leaders: n.avg_salary_leaders || 0,
      avg_salary_non_leaders: n.avg_salary_non_leaders || 0,
      state_mix: n.state_mix || {},
      dept_data: mergeDepts(mergeDepts(n.dept_data || {}, b.dept_data || {}), f.dept_data || {}),
      promotions: (n.promotions || 0) + (b.promotions || 0) + (f.promotions || 0),
      level_base: mergeLevels(n.level_base, b.level_base, f.level_base),
      raise_events: mergeRaises(n.raise_events, b.raise_events, f.raise_events),
      pcd: (n.pcd || 0) + (b.pcd || 0) + (f.pcd || 0),
      apprentice: (n.apprentice || 0) + (b.apprentice || 0) + (f.apprentice || 0),
      leader_dept: mergeLeaderDept(n.leader_dept, b.leader_dept, f.leader_dept),
      tenure_base: mergeLevels(n.tenure_base, b.tenure_base, f.tenure_base),
      demographics: mergeDemographics(n.demographics, b.demographics, f.demographics),
      race_cross: mergeRaceCross(n.race_cross, b.race_cross, f.race_cross),
      // ------------------------------------------------------------------
      // A QUEBRA POR DEPARTAMENTO TAMBÉM SOMA
      // ------------------------------------------------------------------
      // Faltava aqui, e o efeito era grande e mudo. `applyDeptFilter` usa
      // `dept_breakdown` para recortar gênero, liderança, nível e demografia
      // DE VERDADE; sem ela, cai num rateio proporcional que multiplica os
      // números da empresa pela fatia de headcount do departamento e MANTÉM os
      // percentuais company-wide.
      //
      // Como "Combinado" é a marca padrão do painel, era o caminho de todo
      // mundo: filtrar por Commercial no DEI deixava "Mulheres — Geral" e
      // "Mulheres na liderança" exatamente iguais aos da empresa, enquanto o
      // gráfico de composição de liderança mudava -- porque ele lê as
      // contagens rateadas. Dois números contraditórios na mesma tela, e o
      // rateio arredondando para zero fazia parecer que o Commercial não tem
      // nenhuma mulher na liderança.
      //
      // Somar por departamento é aritmética: cada marca traz a sua quebra, e
      // uma pessoa está em exatamente uma delas.
      dept_breakdown: mergeDeptBreakdown(n.dept_breakdown, b.dept_breakdown, f.dept_breakdown),
    };
  }
  return data.find(d => d.month === month && d.brand === brand) || { month } as MonthRecord;
}

/** Soma distribuicoes de nivel (level_base) das marcas para a visao combinada.
 *  Retorna undefined se nenhuma marca trouxer nivel (a secao some, correto). */
function mergeLevels(
  ...bases: Array<Record<string, number> | undefined>
): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  let any = false;
  for (const base of bases) {
    if (!base) continue;
    for (const [k, v] of Object.entries(base)) {
      out[k] = (out[k] || 0) + (v || 0);
      any = true;
    }
  }
  return any ? out : undefined;
}

/** Soma movimentacoes salariais (raise_events) das marcas para a visao combinada. */
function mergeRaises(
  ...bases: Array<Record<string, { n: number; delta: number }> | undefined>
): Record<string, { n: number; delta: number }> | undefined {
  const out: Record<string, { n: number; delta: number }> = {};
  let any = false;
  for (const base of bases) {
    if (!base) continue;
    for (const [k, v] of Object.entries(base)) {
      const cur = (out[k] = out[k] || { n: 0, delta: 0 });
      cur.n += v.n || 0;
      cur.delta += v.delta || 0;
      any = true;
    }
  }
  return any ? out : undefined;
}

type Demographics = {
  age?: Record<string, number>;
  race?: Record<string, number>;
  marital?: Record<string, number>;
  origin?: Record<string, number>;
};
/** Soma os demograficos (age/race/marital/origin) das marcas para a combinada. */
function mergeDemographics(...bases: Array<Demographics | undefined>): Demographics | undefined {
  const dims: Array<keyof Demographics> = ['age', 'race', 'marital', 'origin'];
  const out: Demographics = {};
  let any = false;
  for (const base of bases) {
    if (!base) continue;
    for (const dim of dims) {
      const src = base[dim];
      if (!src) continue;
      const target = (out[dim] = out[dim] || {});
      for (const [k, v] of Object.entries(src)) {
        target[k] = (target[k] || 0) + (v || 0);
        any = true;
      }
    }
  }
  return any ? out : undefined;
}

type RaceCross = Record<string, { total: number; female: number; leaders: number; female_leaders: number }>;
/** Soma o recorte DEI por raca das marcas para a visao combinada. */
function mergeRaceCross(...bases: Array<RaceCross | undefined>): RaceCross | undefined {
  const out: RaceCross = {};
  let any = false;
  for (const base of bases) {
    if (!base) continue;
    for (const [race, v] of Object.entries(base)) {
      const cur = (out[race] = out[race] || { total: 0, female: 0, leaders: 0, female_leaders: 0 });
      cur.total += v.total || 0;
      cur.female += v.female || 0;
      cur.leaders += v.leaders || 0;
      cur.female_leaders += v.female_leaders || 0;
      any = true;
    }
  }
  return any ? out : undefined;
}

/**
 * Soma a quebra por departamento das marcas, campo a campo.
 *
 * Devolve `undefined` quando nenhuma marca trouxe quebra -- e aí
 * `applyDeptFilter` marca `dept_filter_exact: false`, que é o sinal de que o
 * recorte é aproximado. Devolver `{}` diria "quebra existe e está vazia", que
 * é diferente e pior: o filtro pensaria que recortou.
 */
function mergeDeptBreakdown(
  ...bases: Array<Record<string, DeptBreakdownRecord> | undefined>
): Record<string, DeptBreakdownRecord> | undefined {
  const out: Record<string, DeptBreakdownRecord> = {};
  let any = false;
  const somarMapa = (alvo: Record<string, number>, fonte?: Record<string, number>) => {
    for (const [k, v] of Object.entries(fonte || {})) alvo[k] = (alvo[k] || 0) + (v || 0);
  };
  for (const base of bases) {
    if (!base) continue;
    for (const [dept, v] of Object.entries(base)) {
      const cur = (out[dept] = out[dept] || {
        gender_female: 0, gender_male: 0, leaders: 0, leader_female: 0,
        level_base: {}, tenure_base: {},
        demographics: { age: {}, race: {}, marital: {}, origin: {} },
        race_cross: {},
      });
      cur.gender_female += v.gender_female || 0;
      cur.gender_male += v.gender_male || 0;
      cur.leaders += v.leaders || 0;
      cur.leader_female += v.leader_female || 0;
      somarMapa(cur.level_base, v.level_base);
      somarMapa(cur.tenure_base, v.tenure_base);
      somarMapa(cur.demographics.age, v.demographics?.age);
      somarMapa(cur.demographics.race, v.demographics?.race);
      somarMapa(cur.demographics.marital, v.demographics?.marital);
      somarMapa(cur.demographics.origin, v.demographics?.origin);
      for (const [raca, r] of Object.entries(v.race_cross || {})) {
        const c = (cur.race_cross[raca] = cur.race_cross[raca]
          || { total: 0, female: 0, leaders: 0, female_leaders: 0 });
        c.total += r.total || 0;
        c.female += r.female || 0;
        c.leaders += r.leaders || 0;
        c.female_leaders += r.female_leaders || 0;
      }
      any = true;
    }
  }
  return any ? out : undefined;
}

/** Soma a lideranca por depto (leaders/female) das marcas para a visao combinada. */
function mergeLeaderDept(
  ...bases: Array<Record<string, { leaders: number; female: number }> | undefined>
): Record<string, { leaders: number; female: number }> | undefined {
  const out: Record<string, { leaders: number; female: number }> = {};
  let any = false;
  for (const base of bases) {
    if (!base) continue;
    for (const [k, v] of Object.entries(base)) {
      const cur = (out[k] = out[k] || { leaders: 0, female: 0 });
      cur.leaders += v.leaders || 0;
      cur.female += v.female || 0;
      any = true;
    }
  }
  return any ? out : undefined;
}

/**
 * Junta a fatia por departamento de duas marcas.
 *
 * ===========================================================================
 * A MÉDIA SALARIAL É PONDERADA, E ANTES NÃO ERA
 * ===========================================================================
 * Isto fazia `a.avg_salary_leaders || b.avg_salary_leaders`: pegava a média de
 * UMA das marcas e a apresentava como a do conjunto. Média de médias sem peso
 * já seria errada; pegar uma e ignorar a outra é pior.
 *
 * Nunca apareceu porque `dept_data` vinha vazio do banco -- a carga gravava a
 * fatia por área na coluna errada. Assim que ela passou a ser gravada, este
 * caminho passaria a rodar, e a média da NSX (578 pessoas) sairia rotulada
 * como a do combinado com a Flutter (21).
 *
 * Com o `n` de cada média, a ponderação é a conta certa. Sem ele -- linhas
 * antigas, antes da carga nova -- cai no comportamento anterior, porque
 * inventar um peso seria pior que manter o que já estava lá.
 */
function mergeDepts(a: Record<string, DeptData>, b: Record<string, DeptData>): Record<string, DeptData> {
  const r = { ...a };
  const ponderar = (
    va: number | undefined, na: number | undefined,
    vb: number | undefined, nb: number | undefined,
  ): number => {
    // Sem os pesos não dá para combinar: mantém o primeiro que existir.
    if (na == null || nb == null) return (va || vb) as number;
    const pa = va ? na : 0;
    const pb = vb ? nb : 0;
    if (pa + pb === 0) return 0;
    return Math.round((((va || 0) * pa + (vb || 0) * pb) / (pa + pb)) * 100) / 100;
  };
  for (const k of Object.keys(b)) {
    if (!r[k]) { r[k] = b[k]; continue; }
    const x = r[k], y = b[k];
    r[k] = {
      hc: (x.hc || 0) + (y.hc || 0),
      avg_salary_leaders: ponderar(
        x.avg_salary_leaders, x.n_leaders_salario, y.avg_salary_leaders, y.n_leaders_salario),
      avg_salary_non_leaders: ponderar(
        x.avg_salary_non_leaders, x.n_non_leaders_salario,
        y.avg_salary_non_leaders, y.n_non_leaders_salario),
      n_leaders_salario: (x.n_leaders_salario ?? 0) + (y.n_leaders_salario ?? 0),
      n_non_leaders_salario: (x.n_non_leaders_salario ?? 0) + (y.n_non_leaders_salario ?? 0),
      // Contagens: somam. `undefined` de um lado não pode virar zero do outro,
      // então só somam quando ao menos um dos dois trouxe o número.
      joiners: x.joiners == null && y.joiners == null
        ? undefined : (x.joiners ?? 0) + (y.joiners ?? 0),
      leavers: x.leavers == null && y.leavers == null
        ? undefined : (x.leavers ?? 0) + (y.leavers ?? 0),
    };
  }
  return r;
}

export function getAllMonthsForBrand(data: MonthRecord[], brand: string): MonthRecord[] {
  const months = getMonthsOrder(data);
  if (brand === 'combined') return months.map(m => getMonthData(data, m, brand));
  return months.map(m => getMonthData(data, m, brand)).filter(d => (d.headcount || 0) + (d.joiners || 0) + (d.leavers || 0) > 0);
}

export function calcTurnover(curr: MonthRecord, prev?: MonthRecord): number {
  const openHC = prev ? (prev.headcount || 0) : (curr.headcount || 0);
  const avgHC = ((openHC + (curr.headcount || 0)) / 2) || 1;
  return parseFloat((((curr.joiners || 0) + (curr.leavers || 0)) / avgHC * 100).toFixed(2));
}

export function promoRate(d: MonthRecord): number {
  return d.headcount > 0 ? parseFloat(((d.promotions || 0) / d.headcount * 100).toFixed(2)) : 0;
}

export function shortDept(k: string): string {
  return k
    .replace('LEGAL & COMPLIANCE', 'L&C')
    .replace('OPERATIONS', 'OPS')
    .replace('OPERATION', 'OPS')
    .replace('TECHNOLOGY', 'TECH')
    .replace('COMMERCIAL', 'COMM')
    .replace('MARKETING', 'MKT')
    .replace('PRODUCT', 'PROD')
    .replace('TECHNOLOGY GROUP', 'TECH GRP')
    .replace('CW GROUP', 'CW GRP');
}

export function mLabel(m: string): string {
  if (!m) return '—';
  // Check if it's a quarter format (e.g., "2025Q1")
  if (m.includes('Q')) {
    const [year, quarter] = m.split('Q');
    return `${year} Q${quarter}`;
  }
  // Monthly format (e.g., "2025-01")
  const [y, mo] = m.split('-');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return months[parseInt(mo) - 1] + ' ' + y;
}

export function fmt(n: number | null | undefined, d = 0): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtC(n: number): string {
  return n ? 'R$ ' + fmt(Math.round(n)) : '—';
}
