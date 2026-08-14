import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Evolucao CLT/PJ mensal (NSX), reconstruida do historico (vinculo da epoca) +
 * Talent Mobility (ativos), ancorada no HC oficial. So agregados por mes.
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

/**
 * Adaptador fino sobre `resolverEscopo`, que e o unico lugar do sistema que
 * decide quem voce e -- e o unico que sabe do "ver como". Antes cada arquivo
 * tinha sua propria copia desta consulta; treze copias, quatro formatos.
 *
 * A aba declarada ('demographics') e permissao, nao decoracao: um perfil que nao a
 * enxerga leva 'Forbidden' aqui, e nao so deixa de ver o item no menu.
 */
async function authorize(userEmail: string | undefined) {
  const { resolverEscopo } = await import('@/lib/escopo.server');
  await resolverEscopo(userEmail, 'demographics');
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
