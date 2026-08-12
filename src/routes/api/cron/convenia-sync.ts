import { createFileRoute } from '@tanstack/react-router';

/**
 * A porta do agendador para a carga do Convenia.
 *
 * Mesma autenticação da rota do InHire -- segredo em cabeçalho, lido de
 * `service_secrets`, comparado em tempo constante. A conferência mora em
 * `cron-auth.server.ts` para as duas rotas não divergirem.
 *
 * ------------------------------------------------------------------
 * POR QUE SEMANAL, E POR QUE MEIA HORA DEPOIS DO INHIRE
 * ------------------------------------------------------------------
 * A carga completa custa ~15 requisições, porque os 164 desligados já estão
 * resolvidos em `convenia_leavers` e não são buscados de novo. O peso real é
 * de quem sair na semana: uma pessoa nova desligada custa uma requisição, e
 * some no ruído.
 *
 * Roda depois do InHire por precaução, não por dependência: as duas escrevem
 * em tabelas diferentes. Espaçar evita que um problema de rede pegue as duas
 * ao mesmo tempo e vire uma segunda-feira sem dado nenhum.
 */

async function handler({ request }: { request: Request }): Promise<Response> {
  const { conferirSegredoCron } = await import('@/lib/cron-auth.server');
  const negado = await conferirSegredoCron(request);
  if (negado) return negado;

  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { executarSyncConvenia } = await import('@/lib/convenia/sync.server');

    const resumo = await executarSyncConvenia(supabaseAdmin as never, {
      confirm: true,
      origem: 'cron:pg_cron',
    });

    return new Response(JSON.stringify({ ok: true, ...resumo }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 500 de propósito: o status fica em `net._http_response` e o erro em
    // `integration_sync_log`. Um 200 com `{ok:false}` passaria por sucesso nos
    // dois e falharia em silêncio por semanas.
    return new Response(JSON.stringify({ ok: false, erro: msg.slice(0, 500) }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
}

export const Route = createFileRoute('/api/cron/convenia-sync')({
  server: { handlers: { ANY: handler } },
});
