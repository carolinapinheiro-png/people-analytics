import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { aggregateJobs, deptOf, type InhireJob } from '@/lib/inhire/jobs';
import { extrairPagina, JOBS_PAGINATED } from '@/lib/inhire/paths';

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

async function authorizeAdmin(userEmail: string | undefined) {
  if (!userEmail) throw new Error('Unauthorized');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('allowed_emails')
    .select('role')
    .ilike('email', userEmail)
    .maybeSingle();
  if (error) throw new Error(`Access check failed: ${error.message}`);
  if (!data) throw new Error('Forbidden');
  const role = (data as { role?: string }).role;
  if (role !== 'admin') throw new Error('Forbidden: apenas admin pode sincronizar o InHire');
  return userEmail;
}

const SyncInput = z.object({
  /** Sem isto a execução é só prévia: baixa, agrega e devolve, sem gravar. */
  confirm: z.boolean().default(false),
}).optional();

export interface InhireSyncResult {
  gravado: boolean;
  vagasRecebidas: number;
  talentPoolExcluidas: number;
  semDepartamento: number;
  fechadasComTempo: number;
  fechadasSemTempo: number;
  linhasMensais: number;
  linhasAbertas: number;
  requisicoes: number;
  retries429: number;
  /** Menor saldo de fichas visto. Baixo significa que quase atrapalhamos o MCP. */
  menorSaldoLimite: number | null;
  asOf: string;
  avisos: string[];
}

export const syncInhire = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SyncInput.parse(input))
  .handler(async ({ context, data }): Promise<InhireSyncResult> => {
    const email = await authorizeAdmin(context.claims.email as string | undefined);
    const confirm = data?.confirm ?? false;

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const { data: logRow } = await db.from('integration_sync_log').insert({
      provider: 'inhire', status: 'running', triggered_by: email,
    }).select('id').maybeSingle();
    const logId = (logRow as { id?: string } | null)?.id ?? null;

    const encerrar = async (status: string, campos: Record<string, unknown>) => {
      if (!logId) return;
      await db.from('integration_sync_log')
        .update({ status, finished_at: new Date().toISOString(), ...campos })
        .eq('id', logId);
    };

    try {
      const { InhireClient } = await import('@/lib/inhire/client.server');
      const client = await InhireClient.create(db);

      const avisos: string[] = [];
      const jobs = await client.listarPaginado<InhireJob>(
        JOBS_PAGINATED,
        extrairPagina,
        { limit: 100, aoAvisar: (a) => avisos.push(a) },
      );

      // A LISTAGEM "lean" NÃO TRAZ O DEPARTAMENTO. Confirmado na primeira
      // execução real: 159 vagas, 153 sem departamento. O campo existe só no
      // detalhe de cada vaga, e sem ele TUDO cai em "SEM DEPTO" -- um painel
      // inteiro de uma coluna só, tecnicamente correto e completamente inútil.
      //
      // Buscar o detalhe custa uma requisição por vaga. Com ~160 vagas cabe no
      // burst de 400, e o ritmo de 150ms mantém a taxa em ~7/s, bem abaixo dos
      // 20/s sustentados -- o MCP do time continua respondendo normalmente.
      const semDeptNaListagem = jobs.filter((j) => deptOf(j) == null).length;
      let detalhados = 0;
      if (semDeptNaListagem > jobs.length * 0.5 && jobs.length <= 400) {
        for (let i = 0; i < jobs.length; i++) {
          try {
            const det = await client.get<InhireJob>(`/jobs/${jobs[i].id}`);
            // Mescla em vez de substituir: a listagem pode trazer campos que o
            // detalhe não traz, e perder um deles seria uma regressão silenciosa.
            jobs[i] = { ...jobs[i], ...det };
            detalhados++;
          } catch {
            // Uma vaga que falha não derruba a carga inteira; ela só fica sem
            // departamento, e o resumo mostra quantas ficaram.
          }
          if (i < jobs.length - 1) await new Promise((r) => setTimeout(r, 150));
        }
        avisos.push(`A listagem resumida não traz o departamento — busquei o detalhe de ${detalhados} de ${jobs.length} vagas para recuperá-lo.`);
      }

      // O HISTÓRICO DE STATUS NÃO EXISTE NA API REST -- nem na listagem nem no
      // detalhe. Sem ele não dá para descontar congelamento, e sem o desconto o
      // tempo sairia maior que o do InHire. O volume mensal é publicado; o
      // tempo fica nulo, visivelmente ausente em vez de presente e errado.
      const comHist = jobs.filter((j) => (j.statusHistory ?? []).length > 0).length;
      if (jobs.length && comHist === 0) {
        avisos.push('A API REST não expõe histórico de status, então o tempo de fechamento (TTH) não é calculável por aqui — sem histórico não dá para descontar os períodos congelados, e publicar sem o desconto daria um número maior que o do InHire. O volume por mês continua exato.');
      }

      const asOf = new Date().toISOString().slice(0, 10);
      const { monthly, open, resumo } = aggregateJobs(jobs, asOf);

      if (!jobs.length) avisos.push('Nenhuma vaga voltou da API. Verifique se o usuário de API está ativo.');
      if (resumo.semDepartamento > 0) {
        avisos.push(`${resumo.semDepartamento} vagas sem o campo Departamento preenchido — entram como "SEM DEPTO". É lacuna de cadastro no InHire, não zero.`);
      }
      if (resumo.fechadasSemTempo > 0 && comHist > 0) {
        avisos.push(`${resumo.fechadasSemTempo} vagas fechadas sem histórico suficiente para calcular o tempo — contam no volume, ficam fora da média.`);
      }
      if (client.stats.minRemaining != null && client.stats.minRemaining < 100) {
        avisos.push(`O saldo do limite chegou a ${client.stats.minRemaining} de 400. O limite é compartilhado com o conector MCP — se o time reclamar de lentidão durante a sincronização, é por isto.`);
      }

      const resultado: InhireSyncResult = {
        gravado: false,
        vagasRecebidas: resumo.vagasRecebidas,
        talentPoolExcluidas: resumo.talentPoolExcluidas,
        semDepartamento: resumo.semDepartamento,
        fechadasComTempo: resumo.fechadasComTempo,
        fechadasSemTempo: resumo.fechadasSemTempo,
        linhasMensais: monthly.length,
        linhasAbertas: open.length,
        requisicoes: client.stats.requests,
        retries429: client.stats.retries429,
        menorSaldoLimite: client.stats.minRemaining,
        asOf,
        avisos,
      };

      if (!confirm) {
        await encerrar('preview', {
          requests: client.stats.requests,
          detail: resultado as unknown as Record<string, unknown>,
        });
        return resultado;
      }

      // Série mensal: upsert por (mês, área). Uma vaga fechada em março continua
      // fechada em março para sempre, então recarregar o histórico inteiro é
      // idempotente -- e conserta sozinho qualquer correção feita no InHire.
      if (monthly.length) {
        const { error } = await db.from('recruitment_monthly')
          .upsert(monthly, { onConflict: 'month,department' });
        if (error) throw new Error(`Falha ao gravar a série mensal: ${error.message}`);
      }

      // A foto de abertas é do INSTANTE: `openPositions` é quantas estão
      // abertas agora, não quantas abriram no período. Cada execução grava uma
      // linha nova com a data -- é assim que a série histórica de abertas passa
      // a existir, já que a API não a fornece.
      if (open.length) {
        const { error } = await db.from('recruitment_open_snapshot')
          .upsert(open, { onConflict: 'as_of,department,status' });
        if (error) throw new Error(`Falha ao gravar a foto de vagas abertas: ${error.message}`);
      }

      await encerrar('success', {
        requests: client.stats.requests,
        rows_written: monthly.length + open.length,
        detail: resultado as unknown as Record<string, unknown>,
      });
      return { ...resultado, gravado: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await encerrar('error', { error: msg.slice(0, 500) });
      throw e;
    }
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
