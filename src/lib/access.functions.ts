import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const RoleSchema = z.enum(['admin', 'viewer']);

type AppSupabaseClient = SupabaseClient<Database>;

async function getAdminRole(
  _supabase: AppSupabaseClient,
  userEmail: string
): Promise<'admin' | 'viewer' | null> {
  // RLS on allowed_emails joins to auth.users, which authenticated users cannot
  // read, so we authorize via the admin client using the JWT-verified email.
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('allowed_emails')
    .select('role')
    .ilike('email', userEmail)
    .maybeSingle();

  if (error || !data) return null;
  return data.role === 'admin' ? 'admin' : data.role === 'viewer' ? 'viewer' : null;
}

export const checkAccess = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userEmail = context.claims.email as string | undefined;
    if (!userEmail) {
      return { allowed: false, role: null };
    }

    // The RLS policy on allowed_emails compares against auth.users.email, but the
    // authenticated role has no SELECT on auth.users, so the subquery returns null
    // and every read is denied. The JWT-verified claims.email is trustworthy here,
    // so look up authorization via the admin client.
    const { supabaseAdmin: lookupClient } = await import('@/integrations/supabase/client.server');
    const { data, error } = await lookupClient
      .from('allowed_emails')
      .select('role')
      .ilike('email', userEmail)
      .maybeSingle();

    const allowed = !!data && !error;
    const role = allowed && (data.role === 'admin' || data.role === 'viewer') ? data.role : null;

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

    return { allowed, role };
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
      .object({ email: z.string().email(), role: RoleSchema })
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
      .insert({ email: data.email.trim().toLowerCase(), role: data.role });

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

export const updateAllowedEmailRole = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ id: z.string().uuid(), role: RoleSchema })
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
      .update({ role: data.role })
      .eq('id', data.id);

    if (error) throw new Error(error.message);
    return { success: true };
  });
