import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const ProfileSchema = z.enum(['admin', 'hr_leader', 'hrbp', 'dept_leader']);
const DepartmentsSchema = z.array(z.string().trim().min(1).max(80)).max(50).default([]);
const JobFamiliesSchema = z.array(z.string().trim().min(1).max(120)).max(50).default([]);

/** Departamento e job family so valem para perfis escopados (hrbp/dept_leader). */
function scopedProfile(profile: z.infer<typeof ProfileSchema>): boolean {
  return profile === 'hrbp' || profile === 'dept_leader';
}

/** Perfil admin e o unico que administra usuarios; role fica derivado dele. */
function roleForProfile(profile: z.infer<typeof ProfileSchema>): 'admin' | 'viewer' {
  return profile === 'admin' ? 'admin' : 'viewer';
}

type AppSupabaseClient = SupabaseClient<Database>;

async function getAdminRole(
  _supabase: AppSupabaseClient,
  userEmail: string
): Promise<'admin' | 'viewer' | null> {
  // Mantido: authorize por profile, mas devolvendo o role derivado.
  // RLS on allowed_emails joins to auth.users, which authenticated users cannot
  // read, so we authorize via the admin client using the JWT-verified email.
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('allowed_emails')
    .select('profile')
    .ilike('email', userEmail)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { profile?: string }).profile === 'admin' ? 'admin' : 'viewer';
}

export const checkAccess = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userEmail = context.claims.email as string | undefined;
    if (!userEmail) {
      return { allowed: false, role: null, profile: null, departments: [] as string[], jobFamilies: [] as string[] };
    }

    // The RLS policy on allowed_emails compares against auth.users.email, but the
    // authenticated role has no SELECT on auth.users, so the subquery returns null
    // and every read is denied. The JWT-verified claims.email is trustworthy here,
    // so look up authorization via the admin client.
    const { supabaseAdmin: lookupClient } = await import('@/integrations/supabase/client.server');
    const { data, error } = await lookupClient
      .from('allowed_emails')
      .select('role, profile, departments, job_families')
      .ilike('email', userEmail)
      .maybeSingle();

    // A failed lookup is NOT a denial. Collapsing the two lets a transient
    // database error masquerade as "you are not authorized" and destroy a valid
    // session on the client. Throw instead: the client treats a thrown error as
    // 'error' (access blocked, session preserved) and a clean `data === null`
    // as an authoritative denial.
    if (error) {
      throw new Error(`Access check failed: ${error.message}`);
    }

    const allowed = !!data;
    const row = data as {
      role?: string; profile?: string; departments?: string[]; job_families?: string[];
    } | null;
    const profile =
      (row?.profile as 'admin' | 'hr_leader' | 'hrbp' | 'dept_leader' | undefined) ?? null;
    const role = profile === 'admin' ? 'admin' : row ? 'viewer' : null;
    const departments = row?.departments ?? [];
    const jobFamilies = row?.job_families ?? [];

    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      await supabaseAdmin.from('access_logs').insert({
        email: userEmail,
        user_id: context.userId,
        action: 'check_access',
        allowed,
      });
    } catch (logError) {
      console.error('Failed to log access attempt:', logError);
    }

    return { allowed, role, profile, departments, jobFamilies };
  });

export const getAllowedEmails = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userEmail = context.claims.email as string | undefined;
    if (!userEmail) throw new Error('Unauthorized');

    const role = await getAdminRole(context.supabase, userEmail);
    if (role !== 'admin') throw new Error('Forbidden');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
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
    const userEmail = context.claims.email as string | undefined;
    if (!userEmail) throw new Error('Unauthorized');

    const role = await getAdminRole(context.supabase, userEmail);
    if (role !== 'admin') throw new Error('Forbidden');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
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
  .inputValidator((data) =>
    z
      .object({
        email: z.string().email(),
        profile: ProfileSchema,
        departments: DepartmentsSchema,
        jobFamilies: JobFamiliesSchema,
      })
      .parse(data)
  )
  .handler(async ({ context, data }) => {
    const userEmail = context.claims.email as string | undefined;
    if (!userEmail) throw new Error('Unauthorized');

    const role = await getAdminRole(context.supabase, userEmail);
    if (role !== 'admin') throw new Error('Forbidden');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin
      .from('allowed_emails')
      .insert({
        email: data.email.trim().toLowerCase(),
        role: roleForProfile(data.profile),
        profile: data.profile,
        departments: scopedProfile(data.profile) ? data.departments : [],
        job_families: scopedProfile(data.profile) ? data.jobFamilies : [],
      } as never);

    if (error) throw new Error(error.message);
    return { success: true };
  });

export const removeAllowedEmail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ id: z.string().uuid() })
      .parse(data)
  )
  .handler(async ({ context, data }) => {
    const userEmail = context.claims.email as string | undefined;
    if (!userEmail) throw new Error('Unauthorized');

    const role = await getAdminRole(context.supabase, userEmail);
    if (role !== 'admin') throw new Error('Forbidden');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.from('allowed_emails').delete().eq('id', data.id);

    if (error) throw new Error(error.message);
    return { success: true };
  });

export const updateAllowedEmailProfile = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        profile: ProfileSchema,
        departments: DepartmentsSchema,
        jobFamilies: JobFamiliesSchema,
      })
      .parse(data)
  )
  .handler(async ({ context, data }) => {
    const userEmail = context.claims.email as string | undefined;
    if (!userEmail) throw new Error('Unauthorized');

    const role = await getAdminRole(context.supabase, userEmail);
    if (role !== 'admin') throw new Error('Forbidden');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin
      .from('allowed_emails')
      .update({
        role: roleForProfile(data.profile),
        profile: data.profile,
        departments: scopedProfile(data.profile) ? data.departments : [],
        job_families: scopedProfile(data.profile) ? data.jobFamilies : [],
      } as never)
      .eq('id', data.id);

    if (error) throw new Error(error.message);
    return { success: true };
  });
