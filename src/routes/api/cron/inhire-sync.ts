import { createFileRoute } from '@tanstack/react-router';

/**
 * A porta do AGENDADOR para a sincronização com o InHire.
 *
 * ------------------------------------------------------------------
 * QUEM CHAMA ESTA ROTA
 * ------------------------------------------------------------------
 * O `pg_cron` do próprio Supabase, toda segunda de manhã, via `pg_net`.
 *
 * Eu quase montei isto no GitHub Actions. Consultei `pg_extension` -- as
 * extensões INSTALADAS -- não achei `pg_cron` nem `pg_net`, e concluí que o
 * Postgres não tinha como se agendar. A consulta certa era
 * `pg_available_extensions`: as duas estavam disponíveis o tempo todo, só não
 * instaladas. Instalar é uma linha.
 *
 * Fica a lição, que é a mesma do `statusHistory` do InHire: **ausente de onde
 * eu olhei não é ausente.** Vale conferir se a pergunta que fiz é a pergunta
 * que eu queria fazer.
 *
 * ------------------------------------------------------------------
 * POR QUE O SEGREDO VEM DO BANCO, E NÃO DE UMA VARIÁVEL DE AMBIENTE
 * ------------------------------------------------------------------
 * Um segredo em variável de ambiente teria que ser cadastrado à mão em dois
 * lugares -- aqui e no agendador -- e os dois teriam que continuar iguais para
 * sempre. Toda rotação viraria uma operação manual coordenada, e o modo de
 * falha é péssimo: a sincronização para de rodar em silêncio, e ninguém
 * percebe até alguém reparar que o painel está velho.
 *
 * Com o segredo numa tabela protegida, existe **uma única cópia**. Quem chama e
 * quem confere leem a mesma linha; não há como divergirem. A tabela não tem
 * política de RLS nenhuma, então só a chave de serviço a enxerga -- é o mesmo
 * padrão já usado para os dados sensíveis deste projeto.
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

async function handler({ request }: { request: Request }): Promise<Response> {
  const json = (corpo: unknown, status: number) =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  // A conferência mora em cron-auth.server.ts, compartilhada com a rota do
  // Convenia. Duas cópias divergiriam no primeiro ajuste, e uma ficaria para
  // trás em silêncio -- péssimo jeito de uma verificação de segurança envelhecer.
  const { conferirSegredoCron } = await import('@/lib/cron-auth.server');
  const negado = await conferirSegredoCron(request);
  if (negado) return negado;

  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { executarSyncInhire } = await import('@/lib/inhire/sync.server');

    const resumo = await executarSyncInhire(supabaseAdmin as never, {
      confirm: true,
      // Marca a origem no log. Quando um número parecer estranho numa
      // segunda, dá para saber na hora se veio do agendador ou de alguém.
      origem: 'cron:pg_cron',
    });

    return json({ ok: true, ...resumo }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 500 de propósito: o `pg_net` guarda o status em `net._http_response`, e a
    // falha também fica em `integration_sync_log` com a mensagem. Um 200 com
    // `{ok:false}` passaria por sucesso nos dois lugares e falharia em silêncio
    // por semanas -- exatamente o modo de falha que este painel não pode ter.
    return json({ ok: false, erro: msg.slice(0, 500) }, 500);
  }
}

export const Route = createFileRoute('/api/cron/inhire-sync')({
  server: { handlers: { ANY: handler } },
});
