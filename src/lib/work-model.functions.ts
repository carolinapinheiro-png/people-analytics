import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Modelo de trabalho (remoto / hibrido / presencial) dos ativos, consolidado do
 * Talent Mobility. So agregados (contagem por modelo, total e por departamento);
 * sem nomes individuais. Mesmo padrao do span.
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
