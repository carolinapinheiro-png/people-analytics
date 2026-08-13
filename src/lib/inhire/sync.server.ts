import type { SupabaseClient } from '@supabase/supabase-js';
import { aggregateJobs, deptOf, type InhireJob } from './jobs';
import { extrairPagina, JOBS_PAGINATED } from './paths';

/**
 * O núcleo da sincronização com o InHire, sem nada de autenticação.
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO FOI EXTRAÍDO
 * ------------------------------------------------------------------
 * Existem DUAS portas de entrada para a mesma sincronização, e elas se
 * autenticam de formas incompatíveis:
 *
 *   - A tela de admin, via server function, com a sessão de quem está logado.
 *   - O agendador, via rota HTTP, com um segredo compartilhado -- porque um
 *     cron não tem sessão de usuário e não deveria ter.
 *
 * Se cada porta tivesse sua cópia da lógica, elas divergiriam no primeiro
 * ajuste, e o pior desfecho seria silencioso: a tela mostraria um número na
 * prévia e o agendamento gravaria outro, toda semana, sem ninguém notar.
 *
 * Aqui não há checagem de permissão de propósito. Quem chama é responsável por
 * autorizar ANTES -- e as duas portas fazem isso, cada uma do seu jeito.
 */

type Db = SupabaseClient<any, 'public', any>;

export interface SyncResumo {
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
  menorSaldoLimite: number | null;
  asOf: string;
  avisos: string[];
}

/**
 * Executa a sincronização. Com `confirm: false` faz tudo menos gravar.
 *
 * @param origem rótulo para o log: quem disparou. "cron" e um e-mail contam
 *               histórias diferentes quando algo dá errado às 3 da manhã.
 */
export async function executarSyncInhire(
  db: Db,
  { confirm, origem }: { confirm: boolean; origem: string },
): Promise<SyncResumo> {
  const { data: logRow } = await db.from('integration_sync_log').insert({
    provider: 'inhire', status: 'running', triggered_by: origem,
  }).select('id').maybeSingle();
  const logId = (logRow as { id?: string } | null)?.id ?? null;

  const encerrar = async (status: string, campos: Record<string, unknown>) => {
    if (!logId) return;
    await db.from('integration_sync_log')
      .update({ status, finished_at: new Date().toISOString(), ...campos })
      .eq('id', logId);
  };

  try {
    const { InhireClient } = await import('./client.server');
    const client = await InhireClient.create(db);

    const avisos: string[] = [];
    const jobs = await client.listarPaginado<InhireJob>(
      JOBS_PAGINATED,
      extrairPagina,
      { limit: 100, aoAvisar: (a) => avisos.push(a) },
    );

    // A listagem "lean" não traz departamento nem histórico de status; o
    // detalhe traz os dois. Uma requisição por vaga, a 150ms -- ~7/s contra os
    // 20/s sustentados, para não atrapalhar o MCP que o time usa.
    const semDeptNaListagem = jobs.filter((j) => deptOf(j) == null).length;
    let detalhados = 0;
    if (semDeptNaListagem > jobs.length * 0.5 && jobs.length <= 400) {
      for (let i = 0; i < jobs.length; i++) {
        try {
          const det = await client.get<InhireJob>(`/jobs/${jobs[i].id}`);
          jobs[i] = { ...jobs[i], ...det };
          detalhados++;
        } catch {
          // Uma vaga que falha não derruba a carga; ela fica sem área e o
          // resumo mostra quantas ficaram.
        }
        if (i < jobs.length - 1) await new Promise((r) => setTimeout(r, 150));
      }
      avisos.push(`A listagem resumida não traz o departamento — busquei o detalhe de ${detalhados} de ${jobs.length} vagas para recuperá-lo.`);
    }

    const comHist = jobs.filter((j) => (j.statusHistory ?? []).length > 0).length;
    if (jobs.length && comHist === 0) {
      avisos.push('Nenhuma vaga veio com histórico de status — sem ele não dá para descontar congelamento, e o tempo de fechamento fica nulo. O volume por mês continua exato.');
    }

    const asOf = new Date().toISOString().slice(0, 10);
    const { monthly, open, resumo } = aggregateJobs(jobs, asOf);

    if (!jobs.length) avisos.push('Nenhuma vaga voltou da API. Verifique se o usuário de API está ativo.');
    if (resumo.semDepartamento > 0) {
      avisos.push(`${resumo.semDepartamento} vagas sem o campo Departamento preenchido — entram como "SEM DEPTO". É lacuna de cadastro no InHire, não zero.`);
    }
    if (resumo.comMetaSla === 0 && jobs.length > 0) {
      avisos.push('Nenhuma vaga tem prazo alvo (slaDaysGoal) cadastrado no InHire — sem ele não dá para dizer se uma vaga fechou no prazo. É preenchimento no InHire, não limitação da API.');
    }
    if (resumo.fechadasSemTempo > 0 && comHist > 0) {
      avisos.push(`${resumo.fechadasSemTempo} vagas fechadas sem histórico suficiente para calcular o tempo — contam no volume, ficam fora da média.`);
    }
    if (client.stats.minRemaining != null && client.stats.minRemaining < 100) {
      avisos.push(`O saldo do limite chegou a ${client.stats.minRemaining} de 400. O limite é compartilhado com o conector MCP.`);
    }

    const out: SyncResumo = {
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
      await encerrar('preview', { requests: client.stats.requests, detail: out as unknown as Record<string, unknown> });
      return out;
    }

    // Idempotente: uma vaga fechada em março continua fechada em março, então
    // recarregar o histórico inteiro corrige em vez de duplicar.
    if (monthly.length) {
      const { error } = await db.from('recruitment_monthly').upsert(monthly, { onConflict: 'month,department' });
      if (error) throw new Error(`Falha ao gravar a série mensal: ${error.message}`);
    }
    // A foto é do INSTANTE, e por isso carrega a data: é assim que a série
    // histórica de vagas abertas passa a existir, já que a API não a fornece.
    if (open.length) {
      const { error } = await db.from('recruitment_open_snapshot').upsert(open, { onConflict: 'as_of,department,status' });
      if (error) throw new Error(`Falha ao gravar a foto de vagas abertas: ${error.message}`);
    }

    await encerrar('success', {
      requests: client.stats.requests,
      rows_written: monthly.length + open.length,
      detail: out as unknown as Record<string, unknown>,
    });
    return { ...out, gravado: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await encerrar('error', { error: msg.slice(0, 500) });
    throw e;
  }
}
