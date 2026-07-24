import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Serie reconstruida: escrita e leitura de monthly_metrics.
 *
 * A ESCRITA so acontece aqui (service_role) e so recebe AGREGADOS: o
 * Talent_Mobility.xlsx e lido no navegador e nenhuma linha individual chega
 * a este modulo. Toda importacao e registrada em monthly_metrics_import_log
 * -- o log e requisito, nao efeito colateral: se falhar, a importacao falha
 * junto (mesmo padrao do leavers_access_log).
 *
 * A LEITURA da comparacao passa por aqui tambem, para manter um unico padrao
 * de acesso a dados novos (ver leavers.functions.ts).
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

/** Mesmo criterio do resto do app: estar em allowed_emails. */
async function authorize(userEmail: string | undefined) {
  if (!userEmail) throw new Error('Unauthorized');

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('allowed_emails')
    .select('role')
    .ilike('email', userEmail)
    .maybeSingle();

  if (error) throw new Error(`Access check failed: ${error.message}`);
  if (!data) throw new Error('Forbidden');

  return { email: userEmail, role: data.role as 'admin' | 'viewer' };
}

const DeptAggregateSchema = z.object({
  hc: z.number().int().nonnegative(),
  avg_salary_leaders: z.number(),
  avg_salary_non_leaders: z.number(),
});

const MetricRowSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
  brand: z.enum(['NSX', 'Betfair BR', 'Flutter International']),
  business_unit: z.enum(['nsx_br', 'betfair', 'flutter_intl']),
  headcount: z.number().int().nonnegative(),
  joiners: z.number().int().nonnegative(),
  leavers: z.number().int().nonnegative(),
  attrition_rate: z.number(),
  /** Decisao da revisao fria de 24/07: nao reconstruivel de Talent_Mobility. */
  promotions: z.null(),
  gender_female: z.number().int().nonnegative(),
  gender_male: z.number().int().nonnegative(),
  gender_female_pct: z.number(),
  leaders: z.number().int().nonnegative(),
  leader_female: z.number().int().nonnegative(),
  leader_female_pct: z.number(),
  leaders_pct: z.number(),
  avg_salary_leaders: z.number(),
  avg_salary_non_leaders: z.number(),
  state_mix: z.record(z.number().int().nonnegative()),
  dept_data: z.record(DeptAggregateSchema),
});

const ImportInput = z.object({
  rows: z.array(MetricRowSchema).min(1).max(200),
});

export const importReconstruido = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ImportInput.parse(input))
  .handler(async ({ context, data }) => {
    const { email, role } = await authorize(context.claims.email as string | undefined);
    if (role !== 'admin') throw new Error('Forbidden: apenas admin pode importar');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const rows = data.rows.map((r) => ({ ...r, source: 'reconstruido' }));

    // Upsert por (month, brand, source): reimportar o mesmo mes corrige em
    // vez de duplicar, e a serie congelada (source='raw-data.ts') nunca e
    // tocada -- as duas convivem para a comparacao lado a lado.
    const { error, count } = await db
      .from('monthly_metrics')
      .upsert(rows, { onConflict: 'month,brand,source', count: 'exact' });

    if (error) throw new Error(`Falha na importacao: ${error.message}`);

    const { error: logError } = await db.from('monthly_metrics_import_log').insert({
      user_email: email,
      source: 'reconstruido',
      rows_upserted: count ?? rows.length,
      months: new Set(rows.map((r) => r.month)).size,
      brands: [...new Set(rows.map((r) => r.brand))],
    });

    if (logError) {
      throw new Error(`Falha ao registrar importacao; operacao abortada: ${logError.message}`);
    }

    return { imported: count ?? rows.length };
  });

const ListInput = z
  .object({
    sources: z.array(z.string()).max(5).optional(),
  })
  .optional();

export interface MetricSeriesRow {
  month: string;
  brand: string;
  source: string;
  quality_flag: string | null;
  headcount: number;
  joiners: number;
  leavers: number;
  attrition_rate: number | null;
  promotions: number | null;
  gender_female: number | null;
  gender_male: number | null;
  gender_female_pct: number | null;
  leaders: number | null;
  leader_female: number | null;
  leader_female_pct: number | null;
  leaders_pct: number | null;
  avg_salary_leaders: number | null;
  avg_salary_non_leaders: number | null;
}

export const listMetricsBySource = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ListInput.parse(input))
  .handler(async ({ context, data }) => {
    await authorize(context.claims.email as string | undefined);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    let q = db
      .from('monthly_metrics')
      .select(
        'month, brand, source, quality_flag, headcount, joiners, leavers, attrition_rate, promotions, gender_female, gender_male, gender_female_pct, leaders, leader_female, leader_female_pct, leaders_pct, avg_salary_leaders, avg_salary_non_leaders',
      )
      .order('month', { ascending: true });

    if (data?.sources?.length) q = q.in('source', data.sources);

    const { data: rows, error } = await q;
    if (error) throw new Error(`Falha ao carregar series: ${error.message}`);

    return (rows ?? []) as MetricSeriesRow[];
  });
