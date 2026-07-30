import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Evolucao CLT/PJ mensal (NSX), reconstruida do historico (vinculo da epoca) +
 * Talent Mobility (ativos), ancorada no HC oficial. So agregados por mes.
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

export interface ContractMixRow {
  month: string;
  brand: string;
  contract: string;
  n: number;
  position: number;
}

export const getContractMix = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ContractMixRow[]> => {
    await authorize(context.claims.email as string | undefined);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;
    const { data, error } = await db
      .from('contract_mix_monthly')
      .select('*')
      .order('position', { ascending: true });
    if (error) throw new Error(`Falha ao carregar evolução CLT/PJ: ${error.message}`);
    return (data ?? []) as ContractMixRow[];
  });
