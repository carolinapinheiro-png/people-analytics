import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import {
  AddAllowedEmailSchema,
  UpdateAllowedEmailUserSchema,
  RemoveAllowedEmailSchema,
  AddDepartmentSchema,
  SetDepartmentActiveSchema,
  GetAllowedEmailsSchema,
  type AllowedEmailRow,
  isScopedProfileValue,
  roleForProfile,
  SCOPED_REQUIRES_SCOPE_MESSAGE,
} from '@/lib/access-rules';

export const checkAccess = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userEmail = context.claims.email as string | undefined;
    if (!userEmail) {
      return {
        allowed: false,
        role: null,
        profile: null,
        departments: [] as string[],
        jobFamilies: [] as string[],
      };
    }

    // A policy de allowed_emails faz join com auth.users, que o papel
    // authenticated nao le — o subselect volta nulo e tudo seria negado.
    // O claims.email ja vem verificado pelo JWT, entao a consulta de
    // autorizacao usa o admin client.
    //
    // A resolucao passa por `resolverEscopo` -- o MESMO ponto que todas as
    // outras server functions usam. E o que garante que a tela e os dados
    // concordem sobre quem esta olhando. Se a UI se desenhasse pelo perfil
    // real enquanto os dados viessem pelo perfil simulado (ou o contrario), a
    // divergencia nao apareceria como erro: apareceria como um grafico vazio,
    // que qualquer um leria como "essa area nao tem dado".
    const { supabaseAdmin } = await import('./access-rules.server');
    const { resolverEscopo } = await import('./escopo.server');

    const negado = {
      allowed: false,
      role: null as 'admin' | 'viewer' | null,
      profile: null as string | null,
      departments: [] as string[],
      jobFamilies: [] as string[],
      verComo: null as { email: string; profile: string } | null,
    };

    const logar = async (allowed: boolean) => {
      try {
        await supabaseAdmin.from('access_logs').insert({
          email: userEmail, user_id: context.userId, action: 'check_access', allowed,
        });
      } catch (logError) {
        console.error('Failed to log access attempt:', logError);
      }
    };

    let e: Awaited<ReturnType<typeof resolverEscopo>>;
    try {
      e = await resolverEscopo(userEmail);
    } catch (err) {
      // 'Forbidden' e a negacao autoritativa: o e-mail nao esta na lista.
      // Qualquer outra falha (banco fora do ar, alvo de simulacao inexistente)
      // NAO e negacao e nao pode derrubar uma sessao valida -- propaga como
      // erro, que o cliente trata como 'error' e permite tentar de novo.
      if ((err instanceof Error ? err.message : String(err)) !== 'Forbidden') throw err;
      await logar(false);
      return negado;
    }

    await logar(true);

    return {
      allowed: true,
      role: e.role,
      profile: e.profile as string | null,
      departments: e.departments,
      jobFamilies: e.jobFamilies,
      /** Preenchido = a tela inteira esta desenhada pelos olhos de outra pessoa. */
      verComo: e.verComo as { email: string; profile: string } | null,
    };
  });

export const getAllowedEmails = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => GetAllowedEmailsSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);

    const search = data.search.trim().toLowerCase();
    const hasSearch = search.length > 0;

    let countQuery = supabaseAdmin
      .from('allowed_emails')
      .select('*', { count: 'exact', head: true });

    let itemsQuery = supabaseAdmin
      .from('allowed_emails')
      .select('*')
      .order('created_at', { ascending: false });

    if (hasSearch) {
      const pattern = `%${search}%`;
      const filter = `email.ilike.${pattern},job_title.ilike.${pattern}`;
      countQuery = countQuery.or(filter);
      itemsQuery = itemsQuery.or(filter);
    }

    const from = (data.page - 1) * data.limit;
    const to = from + data.limit - 1;

    const { count, error: countError } = await countQuery;
    if (countError) throw new Error(countError.message);

    const { data: items, error } = await itemsQuery.range(from, to);
    if (error) throw new Error(error.message);

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / data.limit));

    return {
      items: items as AllowedEmailRow[],
      count: total,
      page: data.page,
      limit: data.limit,
      totalPages,
    };
  });

export const getAccessLogs = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);

    const { data, error } = await supabaseAdmin
      .from('access_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);
    return data || [];
  });

export const addAllowedEmail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => AddAllowedEmailSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);

    if (
      isScopedProfileValue(data.profile) &&
      data.departments.length === 0 &&
      data.jobFamilies.length === 0
    ) {
      throw new Error(SCOPED_REQUIRES_SCOPE_MESSAGE);
    }

    const scoped = isScopedProfileValue(data.profile);
    const { error } = await supabaseAdmin.from('allowed_emails').insert({
      email: data.email.toLowerCase(),
      role: roleForProfile(data.profile),
      // `profile` e text no banco. Os tipos gerados do Supabase ainda listam a
      // uniao antiga de perfis -- somem na proxima geracao. O valor ja foi
      // validado por ProfileSchema no inputValidator.
      profile: data.profile as unknown as never,
      departments: scoped ? data.departments : [],
      job_families: scoped ? data.jobFamilies : [],
      job_title: data.jobTitle || null,
      job_level: data.jobLevel || null,
      responsibilities: data.responsibilities,
    });

    if (error) throw new Error(error.message);
    return { success: true };
  });

/** Atualiza perfil, escopo, cargo, level e responsabilidades de um usuario. */
export const updateAllowedEmailUser = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => UpdateAllowedEmailUserSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);

    if (
      isScopedProfileValue(data.profile) &&
      data.departments.length === 0 &&
      data.jobFamilies.length === 0
    ) {
      throw new Error(SCOPED_REQUIRES_SCOPE_MESSAGE);
    }

    const scoped = isScopedProfileValue(data.profile);
    const { error } = await supabaseAdmin
      .from('allowed_emails')
      .update({
        role: roleForProfile(data.profile),
        // Ver nota em addAllowedEmail: tipos gerados desatualizados.
        profile: data.profile as unknown as never,
        departments: scoped ? data.departments : [],
        job_families: scoped ? data.jobFamilies : [],
        job_title: data.jobTitle || null,
        job_level: data.jobLevel || null,
        responsibilities: data.responsibilities,
      })
      .eq('id', data.id);

    if (error) throw new Error(error.message);
    return { success: true };
  });

export const removeAllowedEmail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => RemoveAllowedEmailSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);

    const { error } = await supabaseAdmin.from('allowed_emails').delete().eq('id', data.id);

    if (error) throw new Error(error.message);
    return { success: true };
  });

/** Catalogo de departamentos — leitura para qualquer usuario autenticado. */
export const getDepartments = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from('departments')
      .select('id, name, aliases, active')
      .order('name');

    if (error) throw new Error(error.message);
    return data || [];
  });

export const addDepartment = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => AddDepartmentSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);

    const { error } = await supabaseAdmin.from('departments').insert({
      name: data.name.toUpperCase(),
      aliases: data.aliases,
    });

    if (error) throw new Error(error.message);
    return { success: true };
  });

export const setDepartmentActive = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => SetDepartmentActiveSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);

    const { error } = await supabaseAdmin
      .from('departments')
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq('id', data.id);

    if (error) throw new Error(error.message);
    return { success: true };
  });
