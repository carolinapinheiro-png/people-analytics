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
  /** Reconstruidas da aba de historico (Motivo="Promoção"). Nullable por
   *  compatibilidade com series antigas que gravaram null. */
  promotions: z.number().nullable(),
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
  /** Distribuicao por nivel da epoca ({ "L0": n, ..., "NA": n }). Default {}
   *  aceita series antigas sem o campo. */
  level_base: z.record(z.number().int().nonnegative()).default({}),
  /** Movimentacoes salariais por tipo ({ promocao:{n,delta}, ... }). Default {}. */
  raise_events: z
    .record(z.object({ n: z.number().int().nonnegative(), delta: z.number() }))
    .default({}),
  /** Cotas legais e lideranca por depto. Default aceita series antigas. */
  pcd: z.number().int().nonnegative().default(0),
  apprentice: z.number().int().nonnegative().default(0),
  leader_dept: z
    .record(z.object({ leaders: z.number().int().nonnegative(), female: z.number().int().nonnegative() }))
    .default({}),
  /** Distribuicao por tempo de casa ({ "0-3m": n, ..., "5a+": n }). Default {}. */
  tenure_base: z.record(z.number().int().nonnegative()).default({}),
  /** Demograficos ({ age, race, marital, origin }). Default {}. */
  demographics: z
    .object({
      age: z.record(z.number().int().nonnegative()),
      race: z.record(z.number().int().nonnegative()),
      marital: z.record(z.number().int().nonnegative()),
      origin: z.record(z.number().int().nonnegative()),
    })
    .partial()
    .default({}),
  /** Recorte DEI por raca ({ raca: { total, female, leaders, female_leaders } }). */
  race_cross: z
    .record(z.object({
      total: z.number().int().nonnegative(),
      female: z.number().int().nonnegative(),
      leaders: z.number().int().nonnegative(),
      female_leaders: z.number().int().nonnegative(),
    }))
    .default({}),
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

    // Upsert das metricas + log de importacao numa TRANSACAO unica (funcao
    // Postgres import_reconstruido). Antes eram duas chamadas soltas: se o log
    // falhava, as metricas ja tinham entrado e a tela mentia "nada registrado".
    // Agora ou os dois entram ou nenhum. A funcao ja aplica source='reconstruido'
    // e faz upsert por (month, brand, source) -- a serie congelada nunca e tocada.
    const { data: imported, error } = await db.rpc('import_reconstruido', {
      p_rows: data.rows,
      p_user_email: email,
    });

    if (error) throw new Error(`Falha na importacao (nada gravado): ${error.message}`);

    return { imported: (imported as number | null) ?? data.rows.length };
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

/** Linha completa de monthly_metrics para alimentar o dashboard (inclui jsonb). */
export interface MonthlyMetricRow extends MetricSeriesRow {
  leader_female: number | null;
  state_mix: Record<string, number> | null;
  dept_data: Record<string, { hc: number; avg_salary_leaders: number; avg_salary_non_leaders: number }> | null;
  salary_band_attrition:
    | Array<{ band: string; leavers: number; pct_of_leavers: number; avg_tenure_months: number }>
    | null;
  exit_survey:
    | Array<{ reason: string; count: number; pct: number; trend: string; comments?: string[] }>
    | null;
  /** Distribuicao por nivel da epoca ({ "L0": n, ..., "NA": n }). */
  level_base: Record<string, number> | null;
  /** Movimentacoes salariais por tipo ({ promocao:{n,delta}, ... }). */
  raise_events: Record<string, { n: number; delta: number }> | null;
  /** Cotas legais e lideranca por depto. */
  pcd: number | null;
  apprentice: number | null;
  leader_dept: Record<string, { leaders: number; female: number }> | null;
  /** Distribuicao por tempo de casa ({ "0-3m": n, ..., "5a+": n }). */
  tenure_base: Record<string, number> | null;
  /** Demograficos ({ age, race, marital, origin }). */
  demographics: {
    age?: Record<string, number>;
    race?: Record<string, number>;
    marital?: Record<string, number>;
    origin?: Record<string, number>;
  } | null;
  /** Recorte DEI por raca. */
  race_cross: Record<string, { total: number; female: number; leaders: number; female_leaders: number }> | null;
  /** Fase 2: quebras por departamento da epoca (mesmas dimensoes acima). */
  dept_breakdown: Record<string, {
    gender_female: number;
    gender_male: number;
    leaders: number;
    leader_female: number;
    level_base: Record<string, number>;
    tenure_base: Record<string, number>;
    demographics: {
      age: Record<string, number>;
      race: Record<string, number>;
      marital: Record<string, number>;
      origin: Record<string, number>;
    };
    race_cross: Record<string, { total: number; female: number; leaders: number; female_leaders: number }>;
  }> | null;
}

/**
 * Leitura completa para o dashboard: todas as colunas (inclusive state_mix,
 * dept_data, salary_band_attrition, exit_survey), so linhas confiaveis
 * (quality_flag IS NULL). Traz as duas fontes -- a composicao (reconstruida nos
 * escalares, congelada nos 3 campos que ela nao gera) e feita no cliente.
 * Acessivel a qualquer usuario autorizado (viewer inclusive).
 */
export const getMonthlyMetrics = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ListInput.parse(input))
  .handler(async ({ context, data }) => {
    await authorize(context.claims.email as string | undefined);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    let q = db
      .from('monthly_metrics')
      .select(
        'month, brand, source, quality_flag, headcount, joiners, leavers, attrition_rate, promotions, gender_female, gender_male, gender_female_pct, leaders, leader_female, leader_female_pct, leaders_pct, avg_salary_leaders, avg_salary_non_leaders, state_mix, dept_data, salary_band_attrition, exit_survey, level_base, raise_events, pcd, apprentice, leader_dept, tenure_base, demographics, race_cross, dept_breakdown',
      )
      .is('quality_flag', null)
      .order('month', { ascending: true });

    if (data?.sources?.length) q = q.in('source', data.sources);

    const { data: rows, error } = await q;
    if (error) throw new Error(`Falha ao carregar metricas: ${error.message}`);

    return (rows ?? []) as MonthlyMetricRow[];
  });
