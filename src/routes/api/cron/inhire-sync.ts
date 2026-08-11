import { createFileRoute } from '@tanstack/react-router';

/**
 * A porta do AGENDADOR para a sincronização com o InHire.
 *
 * ------------------------------------------------------------------
 * POR QUE UMA ROTA, E NÃO UM CRON NO BANCO
 * ------------------------------------------------------------------
 * O caminho natural seria `pg_cron` chamando a API pelo `pg_net`. Conferi as
 * extensões instaladas neste projeto Supabase: nenhuma das duas existe, nem
 * `http`. Sem elas, o Postgres não tem como disparar nada sozinho.
 *
 * A alternativa é um agendador externo bater numa rota. O GitHub Actions faz
 * isso de graça, roda no servidor deles, e o histórico de execuções fica
 * visível para qualquer pessoa do time -- não depende de máquina ligada nem de
 * ninguém em particular estar por perto.
 *
 * ------------------------------------------------------------------
 * POR QUE SEGREDO NO CABEÇALHO, E NUNCA NA URL
 * ------------------------------------------------------------------
 * Um cron não tem sessão de usuário, então a autenticação normal do painel não
 * serve aqui. O que resta é um segredo compartilhado -- e ele vai no cabeçalho
 * `X-Cron-Secret`, jamais na query string.
 *
 * A diferença não é estética: URLs vazam por toda parte. Ficam no log de acesso
 * do servidor, no histórico do navegador, no cabeçalho `Referer` enviado a
 * terceiros. Um segredo em query string é um segredo publicado em vários
 * lugares que ninguém pensa em auditar. Cabeçalho não aparece em nenhum deles.
 *
 * É por isso, também, que a rota é POST: agendador nenhum precisa que ela seja
 * GET, e GET convida a colar a URL no navegador "só para testar" -- levando o
 * segredo justo para o histórico.
 *
 * ------------------------------------------------------------------
 * COMPARAÇÃO EM TEMPO CONSTANTE
 * ------------------------------------------------------------------
 * `a === b` em strings sai no primeiro caractere diferente. Quem chama a rota
 * repetidamente consegue, em tese, descobrir o segredo caractere a caractere
 * medindo o tempo de resposta. O custo de evitar isso é uma função de dez
 * linhas, então não há razão para não evitar.
 */

/** Compara sem revelar, pelo tempo gasto, quantos caracteres bateram. */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  // Comprimentos diferentes já vazam pelo tamanho; o que não pode vazar é
  // ONDE a diferença está.
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

async function handler({ request }: { request: Request }): Promise<Response> {
  const json = (corpo: unknown, status: number) =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  if (request.method !== 'POST') {
    return json({ erro: 'Use POST. O segredo vai no cabeçalho X-Cron-Secret, nunca na URL.' }, 405);
  }

  const esperado = process.env.CRON_SECRET?.trim();
  if (!esperado || esperado.length < 32) {
    // Falha FECHADA. Se o segredo não estiver configurado, a rota não roda --
    // o oposto (rodar sem exigir segredo) deixaria a sincronização aberta a
    // qualquer pessoa da internet no dia em que alguém esquecesse o secret.
    return json({ erro: 'CRON_SECRET ausente ou curto demais nos secrets do servidor.' }, 503);
  }

  const recebido = request.headers.get('x-cron-secret')?.trim() ?? '';
  if (!iguaisEmTempoConstante(recebido, esperado)) {
    return json({ erro: 'Segredo inválido.' }, 401);
  }

  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { executarSyncInhire } = await import('@/lib/inhire/sync.server');

    const resumo = await executarSyncInhire(supabaseAdmin as never, {
      confirm: true,
      // Marca a origem no log. Quando um número parecer estranho numa
      // segunda-feira, dá para saber na hora se veio do agendador ou de alguém.
      origem: 'cron:github-actions',
    });

    return json({ ok: true, ...resumo }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 500 de propósito: o GitHub Actions marca a execução como falha e manda
    // e-mail. Um 200 com `{ok:false}` falharia em silêncio por semanas.
    return json({ ok: false, erro: msg.slice(0, 500) }, 500);
  }
}

export const Route = createFileRoute('/api/cron/inhire-sync')({
  server: { handlers: { ANY: handler } },
});
