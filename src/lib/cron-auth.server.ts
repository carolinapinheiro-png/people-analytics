/**
 * Autenticação das rotas de agendamento.
 *
 * Extraído quando a segunda integração (Convenia) precisou do mesmo cron que a
 * primeira (InHire). Duas cópias da conferência de segredo divergiriam no
 * primeiro ajuste, e uma delas ficaria para trás em silêncio -- que é a pior
 * forma de uma verificação de segurança envelhecer.
 */

/** Compara sem revelar, pelo tempo gasto, quantos caracteres bateram. */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

/**
 * Devolve `null` se o pedido está autorizado, ou a resposta de erro pronta.
 *
 * O segredo vive em `service_secrets`, uma tabela sem política de RLS -- uma
 * cópia só, lida tanto por quem envia (o `pg_cron`) quanto por quem confere
 * (esta rota). Duas cópias em lugares diferentes sairiam de sincronia na
 * primeira rotação, e a sincronização pararia sem ninguém perceber.
 */
export async function conferirSegredoCron(request: Request): Promise<Response | null> {
  const json = (corpo: unknown, status: number) =>
    new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

  if (request.method !== 'POST') {
    return json({ erro: 'Use POST. O segredo vai no cabeçalho X-Cron-Secret, nunca na URL.' }, 405);
  }

  const recebido = request.headers.get('x-cron-secret')?.trim() ?? '';
  if (!recebido) return json({ erro: 'Falta o cabeçalho X-Cron-Secret.' }, 401);

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await (supabaseAdmin as never as {
    from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => {
      maybeSingle: () => Promise<{ data: { value?: string } | null }>;
    } } };
  }).from('service_secrets').select('value').eq('name', 'cron_secret').maybeSingle();

  const esperado = data?.value?.trim();

  // Falha FECHADA. Sem segredo cadastrado a rota não roda -- o oposto deixaria
  // a sincronização aberta para qualquer pessoa da internet.
  if (!esperado || esperado.length < 32) {
    return json({ erro: 'Segredo do cron ausente ou curto demais no banco.' }, 503);
  }
  if (!iguaisEmTempoConstante(recebido, esperado)) {
    return json({ erro: 'Segredo inválido.' }, 401);
  }
  return null;
}
