import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncResumo } from '@/lib/inhire/sync.server';

/**
 * Sincronização do painel de recrutamento com a API do InHire.
 *
 * ------------------------------------------------------------------
 * O QUE ISTO SUBSTITUI
 * ------------------------------------------------------------------
 * Até aqui os dados de recrutamento entravam pelo conector MCP, o que significa
 * que alguém precisava me pedir para atualizar. Com a API, a sincronização roda
 * no servidor, sozinha, numa tarefa agendada.
 *
 * ------------------------------------------------------------------
 * PRÉVIA ANTES DE GRAVAR, SEMPRE
 * ------------------------------------------------------------------
 * `confirm: false` executa tudo -- login, download, agregação -- e devolve o
 * que FARIA, sem escrever. É o mesmo desenho do importador da pesquisa, e pela
 * mesma razão: os erros desta integração são silenciosos. Um de-para de
 * departamento que parou de bater não dá erro, só reparte uma área em duas
 * linhas. Ver o resumo antes de gravar é o que transforma isso em algo
 * percebível.
 *
 * ------------------------------------------------------------------
 * NENHUM DADO PESSOAL ATRAVESSA ESTE ARQUIVO
 * ------------------------------------------------------------------
 * A credencial do InHire tem acesso integral à conta -- currículo, CPF,
 * telefone. Três camadas impedem que isso chegue perto do nosso banco:
 *
 *   1. client.server.ts só aceita chamar uma lista fechada de caminhos, toda
 *      de vaga. Candidato não está nela.
 *   2. jobs.ts agrega em contagem por área e mês antes de qualquer gravação.
 *   3. O teste `nenhum campo de candidato aparece no resultado` quebra se um
 *      campo pessoal aparecer no agregado.
 *
 * Cada camada sozinha seria contornável por distração. As três juntas exigem
 * uma decisão consciente para serem removidas.
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

/**
 * Porta de admin. Delega a `exigirAdmin`, que alem de conferir o perfil
 * recusa enquanto a sessao esta vendo o painel como outra pessoa -- uma
 * previa em que os botoes de admin ainda funcionam nao confere nada.
 */
async function authorizeAdmin(userEmail: string | undefined) {
  const { exigirAdmin } = await import('@/lib/escopo.server');
  return exigirAdmin(userEmail, 'sincronizar o InHire');
}

const SyncInput = z.object({
  /** Sem isto a execução é só prévia: baixa, agrega e devolve, sem gravar. */
  confirm: z.boolean().default(false),
}).optional();

/**
 * O formato do resumo vive em `sync.server.ts`, junto com a lógica que o
 * produz. Se ele ficasse declarado aqui, o agendador teria a própria cópia, e
 * as duas poderiam divergir sem que o compilador reclamasse.
 */
export type InhireSyncResult = SyncResumo;

export const syncInhire = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SyncInput.parse(input))
  .handler(async ({ context, data }): Promise<InhireSyncResult> => {
    const email = await authorizeAdmin(context.claims.email as string | undefined);
    const confirm = data?.confirm ?? false;

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    // Esta função guarda a PORTA (só admin entra); o trabalho em si mora em
    // sync.server.ts, porque o agendador semanal executa exatamente o mesmo.
    const { executarSyncInhire } = await import('@/lib/inhire/sync.server');
    return executarSyncInhire(db, { confirm, origem: email });
  });

export interface InhireStatus {
  configurado: boolean;
  faltando: string[];
  ultimaExecucao: {
    quando: string;
    status: string;
    requisicoes: number | null;
    linhas: number | null;
    erro: string | null;
  } | null;
  ultimaFoto: string | null;
}

/** Status da integração, para a tela de admin. Não chama o InHire. */
export const getInhireStatus = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InhireStatus> => {
    await authorizeAdmin(context.claims.email as string | undefined);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const faltando = [
      !process.env.INHIRE_API_EMAIL && 'INHIRE_API_EMAIL',
      !process.env.INHIRE_API_PASSWORD && 'INHIRE_API_PASSWORD',
      !process.env.INHIRE_TENANT && 'INHIRE_TENANT',
    ].filter(Boolean) as string[];

    const [log, foto] = await Promise.all([
      db.from('integration_sync_log').select('*')
        .eq('provider', 'inhire').order('started_at', { ascending: false }).limit(1).maybeSingle(),
      db.from('recruitment_open_snapshot').select('as_of')
        .order('as_of', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const l = log.data as Record<string, unknown> | null;
    return {
      configurado: faltando.length === 0,
      faltando,
      ultimaExecucao: l ? {
        quando: String(l.started_at),
        status: String(l.status),
        requisicoes: l.requests == null ? null : Number(l.requests),
        linhas: l.rows_written == null ? null : Number(l.rows_written),
        erro: l.error == null ? null : String(l.error),
      } : null,
      ultimaFoto: (foto.data as { as_of?: string } | null)?.as_of ?? null,
    };
  });
