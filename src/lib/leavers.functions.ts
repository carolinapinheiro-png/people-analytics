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
 * O types.ts do Supabase e gerado automaticamente e ainda nao conhece as
 * tabelas criadas nesta etapa (leavers, leavers_access_log, monthly_metrics,
 * salary_bands, company_bu_map). Enquanto ele nao for regenerado, tipar as
 * linhas aqui e melhor do que espalhar `as any` pelas chamadas: a forma da
 * linha continua verificada, so o nome da tabela deixa de ser.
 */
export interface LeaverRow {
  id: string;
  nome: string;
  genero: string | null;
  raca: string | null;
  salario: number | null;
  vinculo: string | null;
  cargo: string | null;
  departamento: string | null;
  time: string | null;
  level: string | null;
  job_family: string | null;
  career_band: string | null;
  workday_level: string | null;
  data_desligamento_str: string | null;
  tipo_desligamento: string | null;
  motivo_desligamento: string | null;
  data_desligamento: string | null;
  data_admissao: string | null;
  tempo_casa_dias: number | null;
  faixa_salarial: string | null;
  tempo_casa_faixa: string | null;
  mes_desligamento: string | null;
  ano_desligamento: string | null;
  tipo_desligamento_agrupado: string | null;
}

/** Cliente sem o generic de Database, so para as tabelas ainda nao geradas. */
type UntypedClient = SupabaseClient<any, 'public', any>;

/**
 * Acesso a dado individual de pessoas desligadas.
 *
 * A tabela public.leavers nao tem policy de SELECT: nem `authenticated` nem
 * `anon` conseguem le-la. O unico caminho e este modulo, que roda no servidor
 * com service_role. Isso existe por dois motivos:
 *
 *   1. O dado nao vai mais para o bundle do navegador. Antes, um import de
 *      leavers-data.ts entregava as 152 pessoas -- com nome, raca e salario --
 *      a qualquer um que abrisse o DevTools, independentemente do que a tela
 *      mostrava.
 *   2. Decisao da area: toda consulta e registrada. Registrar exige um ponto
 *      unico de passagem, e este e ele.
 *
 * Nunca exporte um cliente Supabase daqui, nem chame a tabela direto do React.
 */

/** Autoriza pelo mesmo criterio do resto do app: estar em allowed_emails. */
async function authorize(userEmail: string | undefined) {
  if (!userEmail) throw new Error('Unauthorized');

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('allowed_emails')
    .select('role, profile, departments, job_families')
    .ilike('email', userEmail)
    .maybeSingle();

  // Mesma distincao usada em checkAccess: falha de consulta nao e negacao.
  if (error) throw new Error(`Access check failed: ${error.message}`);
  if (!data) throw new Error('Forbidden');

  const row = data as { role?: string; profile?: string; departments?: string[]; job_families?: string[] };
  const scope: AccessScope = {
    profile: (row.profile as AccessProfile) ?? 'dept_leader',
    departments: row.departments ?? [],
    jobFamilies: row.job_families ?? [],
  };
  return { email: userEmail, role: (row.role as 'admin' | 'viewer') ?? 'viewer', scope };
}

const ListLeaversInput = z
  .object({
    /** Rotulo do que motivou a consulta, gravado no log. Ex: 'aba leavers'. */
    context: z.string().max(120).optional(),
  })
  .optional();

export const listLeavers = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ListLeaversInput.parse(input))
  .handler(async ({ context, data }) => {
    const { email, scope } = await authorize(context.claims.email as string | undefined);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;
    const { data: rows, error } = await db
      .from('leavers')
      .select('*')
      .order('data_desligamento', { ascending: false });

    if (error) throw new Error(`Falha ao carregar desligados: ${error.message}`);

    // Escopo e mascaramento aplicados no servidor: o perfil nunca recebe linha
    // fora dos seus departamentos, nem nome/salario quando nao tem direito.
    const scoped = (rows ?? []).filter((r) => isInScope(scope, r.departamento, r.job_family));
    const visible = canSeeIndividualData(scope.profile)
      ? scoped
      : scoped.map((r) => ({ ...r, nome: 'Confidencial', salario: null, faixa_salarial: null }));

    // O log e requisito, nao efeito colateral opcional: se ele falhar, a
    // consulta falha junto. Devolver o dado sem registrar quem o viu
    // derrotaria o proposito de ter tirado o arquivo do bundle.
    const { error: logError } = await db.from('leavers_access_log').insert({
      user_email: email,
      rows_returned: visible.length,
      context: data?.context ?? null,
    });

    if (logError) {
      throw new Error(`Falha ao registrar acesso; consulta abortada: ${logError.message}`);
    }

    return visible as LeaverRow[];
  });

const SeedInput = z.object({
  records: z.array(z.record(z.unknown())).min(1).max(5000),
});

/**
 * Carga unica: move os registros que hoje vivem em leavers-data.ts para o
 * banco. Roda a partir da tela de admin, uma vez, e depois o arquivo pode ser
 * removido do repositorio.
 *
 * Restrito a admin. Usa upsert por id, entao rodar duas vezes nao duplica.
 */
export const seedLeavers = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SeedInput.parse(input))
  .handler(async ({ context, data }) => {
    const { role } = await authorize(context.claims.email as string | undefined);
    if (role !== 'admin') throw new Error('Forbidden: apenas admin pode importar');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;
    const { error, count } = await db
      .from('leavers')
      .upsert(data.records, { onConflict: 'id', count: 'exact' });

    if (error) throw new Error(`Falha na carga: ${error.message}`);

    return { imported: count ?? data.records.length };
  });
