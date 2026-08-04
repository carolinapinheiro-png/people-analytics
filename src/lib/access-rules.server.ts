import { supabaseAdmin } from '@/integrations/supabase/client.server';

/**
 * Helpers server-only do controle de acesso. Importados dinamicamente dentro
 * dos handlers das server functions — nunca no module scope de *.functions.ts.
 */

export { supabaseAdmin };

/**
 * Garante que o email (verificado via JWT) pertence a um admin.
 * Lanca 'Unauthorized' sem email e 'Forbidden' se nao for admin.
 *
 * RLS on allowed_emails joins to auth.users, which authenticated users cannot
 * read, so a autorizacao usa o admin client com o email verificado do JWT.
 */
export async function requireAdmin(userEmail: string | undefined): Promise<void> {
  if (!userEmail) throw new Error('Unauthorized');

  const { data, error } = await supabaseAdmin
    .from('allowed_emails')
    .select('profile')
    .ilike('email', userEmail)
    .maybeSingle();

  // Falha de lookup NAO e negacao: erro transitorio nao pode se disfarcar
  // de "nao autorizado". Propaga como erro para o cliente tratar.
  if (error) throw new Error(`Access check failed: ${error.message}`);
  if (data?.profile !== 'admin') throw new Error('Forbidden');
}
