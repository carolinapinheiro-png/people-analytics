import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isInScope, isGlobalProfile, type AccessProfile, type AccessScope } from '@/lib/permissions';

/**
 * Recrutamento (InHire): serie mensal por departamento + foto das vagas abertas.
 *
 * Escopado igual ao resto: gestor com escopo de departamento so recebe as linhas
 * do time dele. A filtragem acontece AQUI, no servidor -- a tela nunca recebe o
 * que nao pode mostrar.
 *
 * So agregados. Nenhum dado de candidato passa por este modulo.
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

async function authorize(userEmail: string | undefined): Promise<AccessScope> {
  if (!userEmail) throw new Error('Unauthorized');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('allowed_emails')
    .select('role, profile, departments, job_families')
    .ilike('email', userEmail)
    .maybeSingle();
  if (error) throw new Error(`Access check failed: ${error.message}`);
  if (!data) throw new Error('Forbidden');
  const row = data as { profile?: string; departments?: string[]; job_families?: string[] };
  return {
    profile: (row.profile as AccessProfile) ?? 'dept_leader',
    departments: row.departments ?? [],
    jobFamilies: row.job_families ?? [],
  };
}

export interface RecruitmentMonth {
  month: string;
  department: string;
  closed_jobs: number;
  tth_avg: number | null;
  tth_median: number | null;
  applications: number;
}

export interface RecruitmentOpen {
  as_of: string;
  department: string;
  status: string;
  jobs: number;
  positions: number;
  applications: number;
  avg_age_days: number | null;
}

export interface RecruitmentData {
  global: boolean;
  scopeDepartments: string[];
  monthly: RecruitmentMonth[];
  open: RecruitmentOpen[];
  /** Data da foto -- o painel NAO e tempo real, e o InHire e. Sem isto na tela,
   *  alguem compara os dois num intervalo de carga e acha que ha erro. */
  asOf: string | null;
  /** Primeiro mes com fechamento no ATS. Antes disso nao ha dado, e "zero" seria
   *  mentira -- a tela precisa dizer "nao medido", nao desenhar uma linha no chao. */
  seriesStart: string | null;
}

export const getRecruitment = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RecruitmentData> => {
    const scope = await authorize(context.claims.email as string | undefined);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const [{ data: mRows, error: mErr }, { data: oRows, error: oErr }] = await Promise.all([
      db.from('recruitment_monthly')
        .select('month, department, closed_jobs, tth_avg, tth_median, applications')
        .order('month', { ascending: true }),
      db.from('recruitment_open_snapshot')
        .select('as_of, department, status, jobs, positions, applications, avg_age_days')
        .order('department', { ascending: true }),
    ]);
    if (mErr) throw new Error(`Falha ao carregar recrutamento: ${mErr.message}`);
    if (oErr) throw new Error(`Falha ao carregar vagas abertas: ${oErr.message}`);

    const global = isGlobalProfile(scope.profile);
    // BETFAIR nao e departamento nosso -- e marca. Nao entra no escopo de nenhum
    // gestor por departamento; so perfis globais veem.
    const visible = (dept: string) => global || isInScope(scope, dept);

    const monthly = ((mRows ?? []) as RecruitmentMonth[])
      .filter((r) => visible(r.department))
      .map((r) => ({ ...r, month: String(r.month).slice(0, 10) }));
    const open = ((oRows ?? []) as RecruitmentOpen[]).filter((r) => visible(r.department));

    const asOf = open.length ? String(open[0].as_of).slice(0, 10) : null;
    const seriesStart = monthly.length ? monthly[0].month : null;

    return {
      global,
      scopeDepartments: scope.departments,
      monthly,
      open,
      asOf,
      seriesStart,
    };
  });
