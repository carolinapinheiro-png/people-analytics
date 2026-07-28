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
