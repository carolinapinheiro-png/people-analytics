import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { lerTodas, pendencias, type Faltando, type ArquivoMigration } from '@/lib/migracoes';

type UntypedClient = SupabaseClient<any, 'public', any>;

/**
 * ===========================================================================
 * O BANCO TEM O QUE AS MIGRATIONS PROMETERAM?
 * ===========================================================================
 * Em 19/08/2026 a aba de Salários estava quebrada para todo mundo -- inclusive
 * para a admin -- porque `comp_ratio.n_layer` não existia. O arquivo estava no
 * repositório desde 14/08 e nunca foi aplicado. O sintoma que chegou não foi
 * "faltou uma coluna": foi um painel com reticências que não terminavam, e
 * depois "por que o mês em cima ainda mostra junho?".
 *
 * Uma consulta responde isso em segundos. Ninguém a fazia porque não existia.
 *
 * ---------------------------------------------------------------------------
 * OS ARQUIVOS VÊM PELO BUNDLE, E NÃO DO DISCO
 * ---------------------------------------------------------------------------
 * `import.meta.glob` com `?raw` embute o texto das migrations no build. Ler do
 * disco em tempo de execução funcionaria no meu computador e falharia no
 * servidor, onde a pasta `supabase/` não é publicada -- e falharia justamente
 * como esta verificação existe para evitar: em silêncio, devolvendo "nenhuma
 * pendência" porque não achou arquivo nenhum.
 *
 * Por isso o retorno diz quantos arquivos foram lidos. Zero arquivos com zero
 * pendências não é um banco saudável, é uma verificação que não rodou.
 */

const ARQUIVOS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

export interface EstadoMigracoes {
  arquivosLidos: number;
  promessas: number;
  faltando: Faltando[];
}

export const getMigracoesPendentes = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EstadoMigracoes> => {
    const { exigirAdmin } = await import('@/lib/escopo.server');
    // Só admin: a lista nomeia tabelas e colunas do banco inteiro, o que é
    // mapa de estrutura -- inútil para quem usa o painel e útil para quem
    // quisesse procurar por onde entrar.
    await exigirAdmin(context.claims.email as string | undefined, 'ver o estado das migrations');

    const arquivos: ArquivoMigration[] = Object.entries(ARQUIVOS).map(([caminho, sql]) => ({
      arquivo: caminho.split('/').pop() ?? caminho,
      sql,
    }));
    const promessas = lerTodas(arquivos);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const existentes = new Set<string>();
    const add = (linhas: unknown, fn: (r: Record<string, unknown>) => string) => {
      for (const r of (linhas ?? []) as Array<Record<string, unknown>>) existentes.add(fn(r));
    };

    // PostgREST não expõe `information_schema` nem `pg_catalog`, então cada
    // categoria vem de uma consulta a uma view criada para isto. Onde a view
    // não existir, a categoria simplesmente não entra -- e o modo de falha
    // continua sendo o benigno: promessa sem catálogo vira "faltando", que é
    // ruído visível, e não silêncio.
    const [tabs, cols, idx, enums, fns] = await Promise.all([
      db.from('v_catalogo_tabelas').select('nome'),
      db.from('v_catalogo_colunas').select('tabela, coluna'),
      db.from('v_catalogo_indices').select('nome'),
      db.from('v_catalogo_enums').select('tipo, valor'),
      db.from('v_catalogo_funcoes').select('nome'),
    ]);

    add(tabs.data, (r) => `tabela|${r.nome}`);
    add(cols.data, (r) => `coluna|${r.tabela}.${r.coluna}`);
    add(idx.data, (r) => `indice|${r.nome}`);
    add(enums.data, (r) => `enum|${r.tipo}.${r.valor}`);
    add(fns.data, (r) => `funcao|${r.nome}`);

    return {
      arquivosLidos: arquivos.length,
      promessas: promessas.length,
      faltando: pendencias(promessas, existentes),
    };
  });
