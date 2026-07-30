import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Modelo de trabalho (remoto / hibrido / presencial) dos ativos, consolidado do
 * Talent Mobility. So agregados (contagem por modelo, total e por departamento);
 * sem nomes individuais. Mesmo padrao do span.
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

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
}

export interface WorkModelRow {
  snapshot_month: string;
  scope_type: 'overall' | 'department';
  scope: string;
  model: string;
  n: number;
  position: number;
}

export const getWorkModel = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkModelRow[]> => {
    await authorize(context.claims.email as string | undefined);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;
    const { data, error } = await db
      .from('work_model_snapshot')
      .select('*')
      .order('position', { ascending: true });
    if (error) throw new Error(`Falha ao carregar modelo de trabalho: ${error.message}`);
    return (data ?? []) as WorkModelRow[];
  });
