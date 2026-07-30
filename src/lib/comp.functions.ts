import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canSeeIndividualData,
  isInScope,
  type AccessProfile,
  type AccessScope,
} from '@/lib/permissions';

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

async function authorize(userEmail: string | undefined) {
  if (!userEmail) throw new Error('Unauthorized');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('allowed_emails')
    .select('role, profile, departments')
    .ilike('email', userEmail)
    .maybeSingle();
  if (error) throw new Error(`Access check failed: ${error.message}`);
  if (!data) throw new Error('Forbidden');
  const row = data as { role?: string; profile?: string; departments?: string[] };
  const scope: AccessScope = {
    profile: (row.profile as AccessProfile) ?? 'dept_leader',
    departments: row.departments ?? [],
  };
  return { email: userEmail, role: (row.role as 'admin' | 'viewer') ?? 'viewer', scope };
}

const ListInput = z
  .object({ context: z.string().max(120).optional() })
  .optional();

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

    const scoped = (rows ?? []).filter((r) => isInScope(scope, r.area));
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

    return visible.map((r) => ({
      ...r,
      salary: r.salary == null ? null : Number(r.salary),
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
export interface CompAggregates {
  contracts: CompContractAgg[];
  areas: CompAreaAgg[];
  /** Ativos por faixa salarial (mesmos cortes dos desligados) -> denominador
   *  para a taxa de atricao por faixa. */
  bands: CompBandAgg[];
  /** Por nivel (L0..L9): contagem + somas de comp-ratio e salario. Para as
   *  bandas de comparacao (L0-L2, L3-L4, lideres L4-L5/L6-L7, C-level). */
  levels: CompLevelAgg[];
}

/** Mesmos cortes de faixa salarial usados nos desligados (LeaverRecord). */
export function salaryBand(salary: number | null): string {
  if (salary == null) return 'Não informado';
  if (salary < 3000) return 'Até 3k';
  if (salary < 5000) return '3k-5k';
  if (salary < 8000) return '5k-8k';
  if (salary < 12000) return '8k-12k';
  if (salary < 20000) return '12k-20k';
  if (salary < 50000) return '20k-50k';
  return '50k+';
}

export const getCompAggregates = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompAggregates> => {
    await authorize(context.claims.email as string | undefined);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const { data: rows, error } = await db
      .from('comp_ratio')
      .select('company, area, contract, level, salary, comp_ratio');
    if (error) throw new Error(`Falha ao carregar agregados de comp: ${error.message}`);

    const cMap = new Map<string, CompContractAgg>();
    const aMap = new Map<string, CompAreaAgg>();
    const bMap = new Map<string, CompBandAgg>();
    const lMap = new Map<string, CompLevelAgg>();
    for (const r of rows ?? []) {
      const company = (r.company ?? '—') as string;
      const contract = (r.contract ?? '—') as string;
      const area = (r.area ?? '—') as string;
      const level = ((r.level ?? '—') as string).trim() || '—';
      const sal = r.salary == null ? null : Number(r.salary);
      const cr = r.comp_ratio == null ? null : Number(r.comp_ratio);

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

    return {
      contracts: [...cMap.values()],
      areas: [...aMap.values()],
      bands: [...bMap.values()],
      levels: [...lMap.values()],
    };
  });
