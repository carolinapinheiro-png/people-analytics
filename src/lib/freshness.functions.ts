import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Idade de cada conjunto de dados.
 *
 * Existe porque dashboard raramente morre errado -- morre VELHO. O numero
 * continua plausivel, ninguem percebe que parou de ser atualizado, e a decisao
 * e tomada em cima de um retrato de tres meses atras. Um selo de idade e a
 * defesa mais barata contra isso.
 *
 * `expectedDays` e o intervalo em que o conjunto DEVERIA ser renovado. Nao e
 * SLA de ninguem: e o que permite a tela dizer "isto aqui esta atrasado" em vez
 * de mostrar uma data e deixar a conta para o leitor.
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

/**
 * Adaptador fino sobre `resolverEscopo`, que e o unico lugar do sistema que
 * decide quem voce e -- e o unico que sabe do "ver como". Antes cada arquivo
 * tinha sua propria copia desta consulta; treze copias, quatro formatos.
 */
async function authorize(userEmail: string | undefined) {
  const { resolverEscopo } = await import('@/lib/escopo.server');
  await resolverEscopo(userEmail);
}

export interface DatasetFreshness {
  key: string;
  label: string;
  /** De onde o dado vem, em linguagem de quem opera -- nao o nome da tabela. */
  source: string;
  updatedAt: string | null;
  rows: number;
  ageDays: number | null;
  expectedDays: number;
  stale: boolean;
  /** Ressalva propria do conjunto (foto congelada, onda unica, etc.). */
  note?: string;
}

interface Spec {
  key: string;
  table: string;
  column: string;
  label: string;
  source: string;
  expectedDays: number;
  note?: string;
  /**
   * Quando "última carga" não é a data mais recente em `table` -- por exemplo
   * `convenia_leavers` só é TOCADA quando alguém se desliga, então uma semana
   * sem saída pareceria sync parada mesmo com o job rodando direitinho toda
   * segunda. Aqui a data vem de outra tabela (o log de sincronização),
   * filtrada pelo provedor certo; `table`/`column` continuam valendo só para
   * a contagem de linhas.
   */
  dateFrom?: { table: string; column: string; filterColumn: string; filterValue: string };
}

const SPECS: Spec[] = [
  {
    key: 'monthly_metrics',
    table: 'monthly_metrics',
    column: 'updated_at',
    label: 'Série mensal (headcount, atrição, DEI)',
    source: 'Talent Mobility, pela tela de importação',
    expectedDays: 40,
  },
  {
    key: 'contract_mix',
    table: 'contract_mix_monthly',
    column: 'loaded_at',
    label: 'Evolução CLT/PJ',
    source: 'Convenia — mês corrente automático; histórico (jan/2025-jul/2026) congelado',
    // 10 dias: a carga grava (sobrescreve) o mês corrente a cada
    // sincronização semanal. Diferente de monthly_metrics, isto NÃO
    // reconstrói o passado -- só o mês em que a carga está rodando.
    expectedDays: 10,
    note: 'Vínculo é o ATUAL de cada pessoa, não o de cada mês passado — ago/2026 ficou sem dado.',
  },
  {
    key: 'comp_ratio',
    table: 'comp_ratio',
    // `atualizado_em`, não `created_at`. `created_at` é preenchido só no
    // INSERT (default now()) e nunca mais tocado -- lido, o selo ia ficar
    // atrasado para sempre mesmo com a carga rodando toda semana, porque a
    // maioria das linhas já existia de antes. `atualizado_em` é escrito em
    // TODO upsert (ver sync.server.ts), inclusive quando o valor não muda.
    column: 'atualizado_em',
    label: 'Comp ratio e faixas',
    source: 'Convenia — sincronização semanal automática',
    // 10 dias: mesma cadência do Convenia (cron.job `sync-convenia-semanal`).
    // Passou a ser gravada a cada carga em set/2026; a planilha que alimentava
    // antes parou em junho.
    expectedDays: 10,
    note: 'Não cobre a área de HR nem parte da diretoria.',
  },
  {
    key: 'leavers',
    table: 'convenia_leavers',
    column: 'dismissal_date',
    label: 'Desligamentos individuais',
    source: 'Convenia — sincronização semanal automática',
    // 10 dias: o job roda toda segunda (ver cron.job `sync-convenia-semanal`).
    // A data em si vem do LOG de sync, não da tabela de desligados -- ver
    // `dateFrom`: sem saída na semana, `convenia_leavers` não é tocada, e
    // isso não pode se ler como "a sincronização parou".
    expectedDays: 10,
    dateFrom: {
      table: 'integration_sync_log',
      column: 'finished_at',
      filterColumn: 'provider',
      filterValue: 'convenia',
    },
  },
  {
    key: 'work_model',
    table: 'work_model_snapshot',
    column: 'loaded_at',
    label: 'Modelo de trabalho',
    source: 'Talent Mobility — foto única',
    expectedDays: 180,
    note: 'Foto retroativa: não há série histórica deste campo.',
  },
  {
    key: 'engagement',
    table: 'engagement_scores',
    column: 'loaded_at',
    label: 'Engajamento',
    source: 'Pesquisa interna',
    expectedDays: 200,
    note: 'Uma onda só (jan/2026) — sem comparação com onda anterior.',
  },
  {
    key: 'recruitment',
    table: 'recruitment_monthly',
    column: 'loaded_at',
    label: 'Recrutamento',
    source: 'InHire — carga manual até a API entrar',
    expectedDays: 30,
    note: 'O InHire é tempo real; aqui é a última carga.',
  },
  {
    key: 'ta_satisfaction',
    table: 'ta_satisfaction',
    column: 'loaded_at',
    label: 'Satisfação de TA',
    source: 'Google Forms — sincronização semanal',
    // 10 dias: com carga semanal, passar disso significa que a sincronizacao
    // parou de rodar, nao que ninguem respondeu.
    expectedDays: 10,
  },
];

export const getDataFreshness = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DatasetFreshness[]> => {
    await authorize(context.claims.email as string | undefined);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;
    const now = Date.now();

    const out = await Promise.all(
      SPECS.map(async (s): Promise<DatasetFreshness> => {
        // head:true traz so a contagem; nao puxamos linha nenhuma para saber idade.
        const { count } = await db
          .from(s.table)
          .select('*', { count: 'exact', head: true });

        // A data de "ultima carga" normalmente vem da mesma tabela contada
        // acima; quando nao vem (ver `dateFrom`), a consulta troca de tabela
        // e ganha um filtro -- por exemplo, so as execucoes do Convenia no
        // log de sincronizacao, e nao as do InHire que moram no mesmo log.
        //
        // FILTRO ANTES de order/limit -- na primeira versão vinha depois, e
        // o selo de Desligamentos aparecia como "sem registro de carga"
        // mesmo com sync rodando. Mesma convenção já usada em
        // experience.functions.ts (`.eq(...).order(...)`); não inverter.
        const alvo = s.dateFrom ?? { table: s.table, column: s.column };
        let consultaData = db.from(alvo.table).select(alvo.column);
        if (s.dateFrom) {
          consultaData = consultaData.eq(s.dateFrom.filterColumn, s.dateFrom.filterValue);
        }
        const { data } = await consultaData
          .order(alvo.column, { ascending: false })
          .limit(1)
          .maybeSingle();

        const raw = (data as Record<string, string> | null)?.[alvo.column] ?? null;
        const ageDays = raw ? Math.floor((now - new Date(raw).getTime()) / 86_400_000) : null;
        return {
          key: s.key,
          label: s.label,
          source: s.source,
          updatedAt: raw,
          rows: count ?? 0,
          ageDays,
          expectedDays: s.expectedDays,
          // Sem data conhecida conta como atrasado: silencio nao e boa noticia.
          stale: ageDays == null || ageDays > s.expectedDays,
          note: s.note,
        };
      }),
    );

    return out.sort((a, b) => (b.ageDays ?? 9999) - (a.ageDays ?? 9999));
  });
