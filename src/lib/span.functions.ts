import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Span de controle calculado da cadeia real de reporte (Talent Mobility).
 * So agregados (gestores, reports, span medio); sem nomes individuais.
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

export interface SpanRow {
  snapshot_month: string;
  scope_type: 'overall' | 'department' | 'distribution';
  scope: string;
  managers: number | null;
  reports: number | null;
  avg_span: number | null;
  actives: number | null;
  ics: number | null;
  position: number;
}

export const getSpanSnapshot = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SpanRow[]> => {
    await authorize(context.claims.email as string | undefined);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;
    const { data, error } = await db
      .from('span_snapshot')
      .select('*')
      .order('position', { ascending: true });
    if (error) throw new Error(`Falha ao carregar span: ${error.message}`);
    return (data ?? []) as SpanRow[];
  });
