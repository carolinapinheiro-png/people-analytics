import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import {
  AddAllowedEmailSchema,
  UpdateAllowedEmailUserSchema,
  RemoveAllowedEmailSchema,
  AddDepartmentSchema,
  SetDepartmentActiveSchema,
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
    const { supabaseAdmin } = await import('./access-rules.server');
    const { data, error } = await supabaseAdmin
      .from('allowed_emails')
      .select('role, profile, departments, job_families')
      .ilike('email', userEmail)
      .maybeSingle();

    // Falha de lookup NAO e negacao: erro transitorio de banco nao pode se
    // disfarcar de "nao autorizado" e derrubar uma sessao valida. Lanca erro
    // (cliente trata como 'error'); data === null e a negacao autoritativa.
    if (error) throw new Error(`Access check failed: ${error.message}`);

    const allowed = !!data;
    const profile = data?.profile ?? null;
    const role = profile === 'admin' ? 'admin' : data ? 'viewer' : null;

    try {
      await supabaseAdmin.from('access_logs').insert({
        email: userEmail,
        user_id: context.userId,
        action: 'check_access',
        allowed,
      });
    } catch (logError) {
      console.error('Failed to log access attempt:', logError);
    }

    return {
      allowed,
      role,
      profile,
      departments: data?.departments ?? [],
      jobFamilies: data?.job_families ?? [],
    };
  });

export const getAllowedEmails = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdmin, supabaseAdmin } = await import('./access-rules.server');
    await requireAdmin(context.claims.email as string | undefined);

    const { data, error } = await supabaseAdmin
      .from('allowed_emails')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
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
      profile: data.profile,
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
        profile: data.profile,
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
