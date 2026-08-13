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
export const SIMULANDO_SEM_ADMIN =
  'Você está vendo o painel como outra pessoa. Saia da simulação para executar ações de admin.';

/**
 * Enquanto a sessão simula alguém, nenhuma ação de admin passa.
 *
 * Duas razões, e a segunda pesa mais:
 *
 *   1. A prévia mentiria. Conferir o acesso de um líder de área numa tela em
 *      que os botões de admin ainda funcionam não confere nada.
 *   2. Escrever "de dentro" de outra identidade -- importar dado, mexer em
 *      usuário, disparar sincronização -- é o tipo de coisa que ninguém quer
 *      ter que explicar depois, mesmo que o log registre o e-mail certo.
 */
export async function recusarSeSimulando(userEmail: string | undefined): Promise<void> {
  const { estaSimulando } = await import('./escopo.server');
  if (await estaSimulando(userEmail)) throw new Error(SIMULANDO_SEM_ADMIN);
}

export async function requireAdmin(userEmail: string | undefined): Promise<void> {
  if (!userEmail) throw new Error('Unauthorized');
  await recusarSeSimulando(userEmail);

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
