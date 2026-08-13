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
    source: 'Talent Mobility (mesma importação)',
    expectedDays: 40,
  },
  {
    key: 'comp_ratio',
    table: 'comp_ratio',
    column: 'created_at',
    label: 'Comp ratio e faixas',
    source: 'Base de remuneração — carga manual',
    expectedDays: 120,
    note: 'Não cobre a área de HR nem parte da diretoria.',
  },
  {
    key: 'leavers',
    table: 'leavers',
    column: 'created_at',
    label: 'Desligamentos individuais',
    source: 'Carga manual',
    expectedDays: 40,
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
        const { data } = await db
          .from(s.table)
          .select(s.column)
          .order(s.column, { ascending: false })
          .limit(1)
          .maybeSingle();

        const raw = (data as Record<string, string> | null)?.[s.column] ?? null;
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
