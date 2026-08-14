import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canSeeIndividualData,
  isInScope,
} from '@/lib/permissions';
import { salaryBand, tenureBandFromHire } from '@/lib/person-bands';

/**
 * Acesso ao salario individual + comp ratio dos ativos (587).
 *
 * Mesma protecao dos desligados: a tabela public.comp_ratio NAO tem policy de
 * SELECT -- nem authenticated nem anon a leem. O unico caminho e esta server
 * function, que roda com service_role e REGISTRA cada consulta em
 * comp_ratio_access_log antes de devolver. Decisao da area (27/07):
 * allowed_emails revisado; os 3 autorizados podem ver, e todo acesso e logado.
 *
 * Nunca exporte um cliente Supabase daqui, nem chame a tabela direto do React.
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

export interface CompRatioRow {
  id: string;
  company: string | null;
  name: string;
  level: string | null;
  area: string | null;
  team: string | null;
  job_title: string | null;
  contract: string | null;
  salary: number | null;
  comp_ratio: number | null;
  quartile: string | null;
  hire: string | null;
}

/**
 * Adaptador fino sobre `resolverEscopo`, que e o unico lugar do sistema que
 * decide quem voce e -- e o unico que sabe do "ver como". Antes cada arquivo
 * tinha sua propria copia desta consulta; treze copias, quatro formatos.
 *
 * A aba declarada ('comp') e permissao, nao decoracao: um perfil que nao a
 * enxerga leva 'Forbidden' aqui, e nao so deixa de ver o item no menu.
 */
async function authorize(userEmail: string | undefined) {
  const { resolverEscopo } = await import('@/lib/escopo.server');
  const e = await resolverEscopo(userEmail, 'comp');
  return { email: e.email, role: e.role, scope: e.scope };
}

const ListInput = z
  .object({
    context: z.string().max(120).optional(),
    // Filtros de tela. Aplicados DEPOIS do escopo de permissao: estreitam o
    // que a pessoa ja pode ver, nunca ampliam (ver dept-filter.ts).
    department: z.string().trim().max(80).optional(),
    level: z.string().trim().max(20).optional(),
    contract: z.string().trim().max(60).optional(),
    jobFamily: z.string().trim().max(120).optional(),
    // Faixas DERIVADAS de salary/hire (person-bands.ts). Nao existem como
    // coluna em comp_ratio; sao calculadas aqui, no servidor, para que o
    // recorte use o mesmo vocabulario dos desligados e da barra de filtros.
    tenureBand: z.string().trim().max(40).optional(),
    salaryBand: z.string().trim().max(40).optional(),
  })
  .optional();


/** 'Todos'/vazio = sem selecao. */
const sel = (v?: string | null): string | null => {
  const t = v?.trim();
  return !t || t === 'Todos' ? null : t;
};

export const listCompRatio = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ListInput.parse(input))
  .handler(async ({ context, data }): Promise<CompRatioRow[]> => {
    const { email, scope } = await authorize(context.claims.email as string | undefined);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const { data: rows, error } = await db
      .from('comp_ratio')
      .select('*')
      .order('salary', { ascending: false });
    if (error) throw new Error(`Falha ao carregar comp ratio: ${error.message}`);

    // So a populacao do arquivo de comp (in_comp_scope). Os ativos carregados do
    // historico so para o Perfil Individual (People/diretoria) ficam de fora aqui.
    const fDept = sel(data?.department);
    const fLevel = sel(data?.level);
    const fContract = sel(data?.contract);
    const fFamily = sel(data?.jobFamily);
    const fTenure = sel(data?.tenureBand);
    const fBand = sel(data?.salaryBand);

    const scoped = (rows ?? [])
      .filter((r) => r.in_comp_scope !== false)
      .filter((r) => isInScope(scope, r.area, r.job_type_family))
      // Filtros de tela: comp_ratio e person-level, entao aqui TODOS funcionam
      // de verdade -- ao contrario da serie mensal, que so guarda a quebra por
      // departamento.
      .filter((r) => !fDept || (r.area ?? '').trim().toUpperCase() === fDept.toUpperCase())
      .filter((r) => !fLevel || (r.level ?? '').trim() === fLevel)
      .filter((r) => !fContract || (r.contract ?? '').trim() === fContract)
      .filter((r) => !fFamily || (r.job_type_family ?? '').trim() === fFamily)
      // As duas faixas derivadas. Quem nao tem admissao/salario no cadastro cai
      // em 'Não informado' e sai do recorte -- e o comportamento honesto: nao
      // sabemos a faixa dessa pessoa, entao ela nao entra na faixa escolhida.
      .filter((r) => !fTenure || tenureBandFromHire(r.hire) === fTenure)
      .filter(
        (r) => !fBand || salaryBand(r.salary == null ? null : Number(r.salary)) === fBand,
      );

    const visible = canSeeIndividualData(scope.profile)
      ? scoped
      : scoped.map((r) => ({ ...r, name: 'Confidencial', salary: null }));

    // Log obrigatorio: sem registrar quem viu, nao devolve. Igual aos desligados.
    const { error: logError } = await db.from('comp_ratio_access_log').insert({
      user_email: email,
      rows_returned: visible.length,
      context: data?.context ?? null,
    });
    if (logError) {
      throw new Error(`Falha ao registrar acesso; consulta abortada: ${logError.message}`);
    }

    // Decisao (30/07): o salario individual NAO sai daqui, nem para quem tem
    // acesso no Convenia -- o comp-ratio ja da a leitura relativa sem expor o
    // valor nominal. Fica sempre null; a folha continua disponivel em agregados
    // (getCompAggregates: medias por contrato/nivel/area).
    return visible.map((r) => ({
      ...r,
      salary: null,
      comp_ratio: r.comp_ratio == null ? null : Number(r.comp_ratio),
    })) as CompRatioRow[];
  });

/**
 * Agregados de compensacao (CLT/PJ e comp-ratio por area) para a aba
 * Compensacao. Devolve SO somas/contagens por empresa -- nenhuma linha
 * individual, nenhum nome, nenhum salario de pessoa. Por isso nao passa pelo
 * log de acesso individual (o dado devolvido tem a mesma natureza agregada do
 * dept_data que ja alimenta a serie). A empresa vem junto para o cliente
 * filtrar por marca (mesmo de-para do agregador).
 */
export interface CompContractAgg {
  company: string;
  contract: string;
  n: number;
  sal_sum: number;
  sal_n: number;
}
export interface CompAreaAgg {
  company: string;
  area: string;
  n: number;
  cr_sum: number;
  cr_n: number;
}
export interface CompBandAgg {
  company: string;
  band: string;
  n: number;
}
export interface CompLevelAgg {
  company: string;
  level: string;
  n: number;
  cr_sum: number;
  cr_n: number;
  sal_sum: number;
  sal_n: number;
}
export interface CompMedianAgg {
  /** Grupo: marca ('NSX' | 'Betfair BR') ou 'combined'. */
  group: string;
  med_salary: number | null;
  med_cr: number | null;
}

const COMPANY_TO_BRAND: Record<string, string> = {
  'NSX BRASIL RECIFE': 'NSX',
  'NSX BRASIL SÃO PAULO': 'NSX',
  'NSX MARECHAL': 'NSX',
  'NSX BETFAIR BRASIL S.A.': 'Betfair BR',
};
export interface CompAggregates {
  contracts: CompContractAgg[];
  areas: CompAreaAgg[];
  /** Mediana de salario e comp-ratio por empresa (visao mais robusta que a
   *  media para distribuicoes puxadas por poucos C-levels). */
  medians: CompMedianAgg[];
  /** Ativos por faixa salarial (mesmos cortes dos desligados) -> denominador
   *  para a taxa de atricao por faixa. */
  bands: CompBandAgg[];
  /** Por nivel (L0..L9): contagem + somas de comp-ratio e salario. Para as
   *  bandas de comparacao (L0-L2, L3-L4, lideres L4-L5/L6-L7, C-level). */
  levels: CompLevelAgg[];
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * Faixa salarial: os cortes vivem em person-bands.ts, compartilhados com Meu
 * Time e com os rotulos da barra de filtros. Reexportado aqui porque outros
 * pontos deste arquivo (perfil individual, agregado por faixa) ja o usavam.
 */
export { salaryBand };



/**
 * Perfil individual do colaborador (pergunta da Marilia, decisoes 30/07):
 *  - Remuneracao: SO faixa + comp-ratio. Nunca o valor nominal.
 *  - Acesso: todos os usuarios logados (allowed_emails). Ainda assim cada
 *    consulta e REGISTRADA em comp_ratio_access_log -- mesma protecao dos
 *    demais dados individuais.
 *  - Conteudo: admissao/tempo de casa, ultima promocao, nivel/senioridade e
 *    comparacao com o cohort (mesmo nivel e mesma area).
 */
export interface EmployeeSearchResult {
  id: string;
  name: string;
  area: string | null;
  level: string | null;
  job_title: string | null;
}

export interface CohortStat {
  n: number;
  med_cr: number | null;
  med_tenure_months: number | null;
}

export interface EmployeeProfile {
  id: string;
  name: string;
  company: string | null;
  area: string | null;
  team: string | null;
  job_title: string | null;
  level: string | null;
  contract: string | null;
  hire: string | null;
  tenure_months: number | null;
  last_promotion: string | null;
  months_since_promotion: number | null;
  band: string;
  comp_ratio: number | null;
  quartile: string | null;
  /** Posicao do comp-ratio da pessoa dentro do nivel (0..100). */
  cr_percentile_level: number | null;
  cohort_level: CohortStat;
  cohort_area: CohortStat;
  /** false = carregado do historico so para o perfil (People/diretoria fora do
   *  arquivo de comp); nesse caso nao ha comp-ratio, so faixa via folha. */
  in_comp_scope: boolean;
}

/** Converte "DD/MM/YY" (formato do Convenia) em meses ate hoje. */
function tenureMonthsFrom(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const m = String(dateStr).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  let yy = Number(m[3]);
  if (yy < 100) yy += 2000;
  const from = new Date(yy, mm - 1, dd);
  if (isNaN(from.getTime())) return null;
  const now = new Date();
  const months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  return Math.max(0, months);
}

/** Meses desde uma data ISO (last_promotion e date -> "YYYY-MM-DD"). */
function monthsSinceIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  return Math.max(0, months);
}

const SearchInput = z.object({ query: z.string().max(80) });

export const searchEmployees = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SearchInput.parse(input))
  .handler(async ({ context, data }): Promise<EmployeeSearchResult[]> => {
    const { email, scope } = await authorize(context.claims.email as string | undefined);
    const q = (data.query ?? '').trim();
    if (q.length < 2) return [];

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const { data: rows, error } = await db
      .from('comp_ratio')
      .select('id, name, area, level, job_title, job_type_family')
      .ilike('name', `%${q}%`)
      .order('name', { ascending: true })
      .limit(20);
    if (error) throw new Error(`Falha na busca: ${error.message}`);

    const scoped = (rows ?? [])
      .filter((r) => isInScope(scope, r.area, r.job_type_family))
      .map(({ job_type_family: _jtf, ...rest }) => rest);

    const { error: logError } = await db.from('comp_ratio_access_log').insert({
      user_email: email,
      rows_returned: scoped.length,
      context: `busca-perfil:${q.slice(0, 40)}`,
    });
    if (logError) throw new Error(`Falha ao registrar acesso; busca abortada: ${logError.message}`);

    return scoped as EmployeeSearchResult[];
  });

const ProfileInput = z.object({ id: z.string().uuid() });

export const getEmployeeProfile = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ProfileInput.parse(input))
  .handler(async ({ context, data }): Promise<EmployeeProfile | null> => {
    const { email, scope } = await authorize(context.claims.email as string | undefined);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const { data: person, error } = await db
      .from('comp_ratio')
      .select('id, company, name, area, team, job_title, level, contract, hire, salary, comp_ratio, quartile, last_promotion, in_comp_scope, job_type_family')
      .eq('id', data.id)
      .maybeSingle();
    if (error) throw new Error(`Falha ao carregar perfil: ${error.message}`);
    if (!person || !isInScope(scope, person.area, person.job_type_family)) {
      // Loga a tentativa mesmo sem retorno.
      await db.from('comp_ratio_access_log').insert({
        user_email: email, rows_returned: 0, context: `perfil:${data.id}`,
      });
      return null;
    }

    // Cohort: mesmo nivel e mesma area (para comparacao relativa).
    const level = (person.level ?? '').trim();
    const area = (person.area ?? '').trim();
    const { data: cohort, error: cErr } = await db
      .from('comp_ratio')
      .select('area, level, comp_ratio, hire');
    if (cErr) throw new Error(`Falha ao carregar cohort: ${cErr.message}`);

    const byLevel = (cohort ?? []).filter((r) => (r.level ?? '').trim() === level && level !== '');
    const byArea = (cohort ?? []).filter((r) => (r.area ?? '').trim() === area && area !== '');

    const crLevel = byLevel.map((r) => (r.comp_ratio == null ? null : Number(r.comp_ratio))).filter((v): v is number => v != null);
    const crArea = byArea.map((r) => (r.comp_ratio == null ? null : Number(r.comp_ratio))).filter((v): v is number => v != null);
    const tenLevel = byLevel.map((r) => tenureMonthsFrom(r.hire)).filter((v): v is number => v != null);
    const tenArea = byArea.map((r) => tenureMonthsFrom(r.hire)).filter((v): v is number => v != null);

    const myCr = person.comp_ratio == null ? null : Number(person.comp_ratio);
    const crPct =
      myCr != null && crLevel.length
        ? Math.round((crLevel.filter((v) => v <= myCr).length / crLevel.length) * 100)
        : null;

    const profile: EmployeeProfile = {
      id: person.id,
      name: person.name,
      company: person.company ?? null,
      area: person.area ?? null,
      team: person.team ?? null,
      job_title: person.job_title ?? null,
      level: person.level ?? null,
      contract: person.contract ?? null,
      hire: person.hire ?? null,
      tenure_months: tenureMonthsFrom(person.hire),
      last_promotion: person.last_promotion ?? null,
      months_since_promotion: monthsSinceIso(person.last_promotion),
      band: salaryBand(person.salary == null ? null : Number(person.salary)),
      comp_ratio: myCr,
      quartile: person.quartile ?? null,
      cr_percentile_level: crPct,
      cohort_level: { n: byLevel.length, med_cr: median(crLevel), med_tenure_months: median(tenLevel) },
      cohort_area: { n: byArea.length, med_cr: median(crArea), med_tenure_months: median(tenArea) },
      in_comp_scope: person.in_comp_scope !== false,
    };

    const { error: logError } = await db.from('comp_ratio_access_log').insert({
      user_email: email, rows_returned: 1, context: `perfil:${person.name.slice(0, 40)}`,
    });
    if (logError) throw new Error(`Falha ao registrar acesso; consulta abortada: ${logError.message}`);

    return profile;
  });

/**
 * Split salarial por nivel x papel (Caio #13). Dois eixos independentes:
 *  - gestao: "Gestor de pessoas" (tem reporte) vs "Contribuidor individual".
 *  - lideranca: "Líder" (flag do cadastro) vs "Não-líder".
 * So agregados por nivel (mediana de salario e comp-ratio + n). Nenhuma linha
 * individual sai; mesma natureza de getCompAggregates (sem log).
 */
export interface CompRoleCell {
  level: string;
  group: string;
  n: number;
  med_salary: number | null;
  med_cr: number | null;
}
export interface CompByRole {
  gestao: CompRoleCell[];
  lideranca: CompRoleCell[];
}

export const getCompByLevelRole = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompByRole> => {
    await authorize(context.claims.email as string | undefined);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const { data: rows, error } = await db
      .from('comp_ratio')
      .select('level, salary, comp_ratio, is_leader, is_people_manager, in_comp_scope');
    if (error) throw new Error(`Falha ao carregar split por papel: ${error.message}`);

    const active = (rows ?? []).filter(
      (r) => r.in_comp_scope !== false && (r.level ?? '').trim() !== '',
    );

    // Acumula salarios/comp-ratio por (nivel, grupo) e tira a mediana no fim.
    type Acc = { sal: number[]; cr: number[] };
    const bucket = new Map<string, Acc>();
    const add = (key: string, sal: number | null, cr: number | null) => {
      const a = bucket.get(key) ?? { sal: [], cr: [] };
      if (sal != null) a.sal.push(sal);
      if (cr != null) a.cr.push(cr);
      bucket.set(key, a);
    };
    for (const r of active) {
      const level = (r.level as string).trim();
      const sal = r.salary == null ? null : Number(r.salary);
      const cr = r.comp_ratio == null ? null : Number(r.comp_ratio);
      const gGrp = r.is_people_manager ? 'Gestor de pessoas' : 'Contribuidor individual';
      const lGrp = r.is_leader ? 'Líder' : 'Não-líder';
      add(`g|${level}|${gGrp}`, sal, cr);
      add(`l|${level}|${lGrp}`, sal, cr);
    }

    const cells = (prefix: string): CompRoleCell[] => {
      const out: CompRoleCell[] = [];
      for (const [key, a] of bucket) {
        if (!key.startsWith(prefix)) continue;
        const [, level, group] = key.split('|');
        out.push({ level, group, n: a.sal.length, med_salary: median(a.sal), med_cr: median(a.cr) });
      }
      return out.sort((x, y) => (x.level < y.level ? -1 : x.level > y.level ? 1 : x.group.localeCompare(y.group)));
    };

    return { gestao: cells('g|'), lideranca: cells('l|') };
  });

export const getCompAggregates = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompAggregates> => {
    await authorize(context.claims.email as string | undefined);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const { data: allRows, error } = await db
      .from('comp_ratio')
      .select('company, area, contract, level, salary, comp_ratio, in_comp_scope');
    if (error) throw new Error(`Falha ao carregar agregados de comp: ${error.message}`);

    // Agregados de compensacao usam SO a populacao do arquivo de comp.
    const rows = (allRows ?? []).filter((r) => r.in_comp_scope !== false);

    const cMap = new Map<string, CompContractAgg>();
    const aMap = new Map<string, CompAreaAgg>();
    const bMap = new Map<string, CompBandAgg>();
    const lMap = new Map<string, CompLevelAgg>();
    const salByCo = new Map<string, number[]>();
    const crByCo = new Map<string, number[]>();
    for (const r of rows ?? []) {
      const company = (r.company ?? '—') as string;
      const contract = (r.contract ?? '—') as string;
      const area = (r.area ?? '—') as string;
      const level = ((r.level ?? '—') as string).trim() || '—';
      const sal = r.salary == null ? null : Number(r.salary);
      const cr = r.comp_ratio == null ? null : Number(r.comp_ratio);
      const brandGroup = COMPANY_TO_BRAND[company];
      const groups = brandGroup ? [brandGroup, 'combined'] : ['combined'];
      for (const g of groups) {
        if (sal != null) (salByCo.get(g) ?? salByCo.set(g, []).get(g)!).push(sal);
        if (cr != null) (crByCo.get(g) ?? crByCo.set(g, []).get(g)!).push(cr);
      }

      const ck = `${company}||${contract}`;
      const c = cMap.get(ck) ?? { company, contract, n: 0, sal_sum: 0, sal_n: 0 };
      c.n++;
      if (sal != null) { c.sal_sum += sal; c.sal_n++; }
      cMap.set(ck, c);

      const ak = `${company}||${area}`;
      const a = aMap.get(ak) ?? { company, area, n: 0, cr_sum: 0, cr_n: 0 };
      a.n++;
      if (cr != null) { a.cr_sum += cr; a.cr_n++; }
      aMap.set(ak, a);

      const band = salaryBand(sal);
      const bk = `${company}||${band}`;
      const b = bMap.get(bk) ?? { company, band, n: 0 };
      b.n++;
      bMap.set(bk, b);

      const lk = `${company}||${level}`;
      const l = lMap.get(lk) ?? { company, level, n: 0, cr_sum: 0, cr_n: 0, sal_sum: 0, sal_n: 0 };
      l.n++;
      if (cr != null) { l.cr_sum += cr; l.cr_n++; }
      if (sal != null) { l.sal_sum += sal; l.sal_n++; }
      lMap.set(lk, l);
    }

    const groups = new Set<string>([...salByCo.keys(), ...crByCo.keys()]);
    const medians: CompMedianAgg[] = [...groups].map((group) => ({
      group,
      med_salary: median(salByCo.get(group) ?? []),
      med_cr: median(crByCo.get(group) ?? []),
    }));

    return {
      contracts: [...cMap.values()],
      areas: [...aMap.values()],
      bands: [...bMap.values()],
      levels: [...lMap.values()],
      medians,
    };
  });
