import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoberturaBase } from '@/lib/cobertura';

/**
 * Serie reconstruida: escrita e leitura de monthly_metrics.
 *
 * A ESCRITA so acontece aqui (service_role) e so recebe AGREGADOS: o
 * Talent_Mobility.xlsx e lido no navegador e nenhuma linha individual chega
 * a este modulo. Toda importacao e registrada em monthly_metrics_import_log
 * -- o log e requisito, nao efeito colateral: se falhar, a importacao falha
 * junto (mesmo padrao do leavers_access_log).
 *
 * A LEITURA da comparacao passa por aqui tambem, para manter um unico padrao
 * de acesso a dados novos (ver leavers.functions.ts).
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

/** Mesmo criterio do resto do app: estar em allowed_emails. */
/**
 * Adaptador fino sobre `resolverEscopo`, que e o unico lugar do sistema que
 * decide quem voce e -- e o unico que sabe do "ver como". Antes cada arquivo
 * tinha sua propria copia desta consulta; treze copias, quatro formatos.
 */
async function authorize(userEmail: string | undefined) {
  const { resolverEscopo } = await import('@/lib/escopo.server');
  const { canSeeTab } = await import('@/lib/permissions');
  const e = await resolverEscopo(userEmail);
  // ------------------------------------------------------------------
  // AQUI A RECUSA E VAZIO, NAO ERRO -- E A DIFERENCA IMPORTA
  // ------------------------------------------------------------------
  // Esta serie alimenta o CONTEXTO do painel, carregado antes de qualquer
  // aba ser escolhida. `Index.tsx` bloqueia a tela inteira quando ela falha.
  //
  // Entao lancar 'Forbidden' para um perfil de aba unica (Experiencia) nao
  // barraria uma aba: barraria o aplicativo, e a pessoa veria "erro ao
  // carregar" na unica secao a que tem direito.
  //
  // Devolver vazio e a resposta honesta: nao ha serie mensal para este
  // perfil. As abas que a desenhariam nao estao no menu dele nem passam pelo
  // servidor -- cada uma delas declara a sua aba e recusa por conta propria.
  // As DUAS listas individuais entram, e faltavam as duas.
  //
  // Sem `extraTabs`, quem recebeu Overview como concessão individual não
  // recebia a série -- via a aba no menu e a tela vazia. Sem `tabs`, o
  // inverso e pior: quem tem lista própria SEM Overview continuava recebendo,
  // porque a checagem olhava só o preset do perfil.
  const podeVerSerie = canSeeTab(e.profile, 'overview', e.extraTabs, e.tabs);
  return { email: e.email, role: e.role, podeVerSerie };
}

/**
 * Até onde cada base alcança, medido no banco.
 *
 * Existe porque o filtro de ano passou a oferecer 14 anos -- a série de quadro
 * vai a março/2013 -- enquanto desligados começam em 2024 e pesquisa e
 * recrutamento em 2025. Sem isto a tela ofereceria 2017 como se fosse um ano
 * como outro qualquer, e devolveria três abas vazias sem explicar.
 *
 * MEDIDO, e não escrito numa constante: uma base que passar a cobrir mais
 * tempo some do aviso sozinha, e uma que atrasar aparece nele. Constante
 * envelhece calada -- foi o que aconteceu com a linha do tempo das pesquisas e
 * com os rótulos do slope chart, os dois na mesma semana.
 */
export const getCoberturaAnos = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CoberturaBase[]> => {
    const { podeVerSerie } = await authorize(context.claims.email as string | undefined);
    if (!podeVerSerie) return [];

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    // Só a coluna de data de cada base. Os limites saem daqui, em memória --
    // são poucas centenas de linhas e evita quatro pares de consultas.
    const [mm, lv, sw, rc] = await Promise.all([
      db.from('monthly_metrics').select('month').is('quality_flag', null),
      db.from('leavers').select('mes_desligamento'),
      db.from('survey_waves').select('reference_date'),
      db.from('recruitment_monthly').select('month'),
    ]);

    const anos = (linhas: unknown, campo: string): [string | null, string | null] => {
      const vs = ((linhas ?? []) as Array<Record<string, unknown>>)
        .map((r) => String(r[campo] ?? '').slice(0, 4))
        .filter((a) => /^\d{4}$/.test(a))
        .sort();
      return [vs[0] ?? null, vs.at(-1) ?? null];
    };

    const [qDe, qAte] = anos(mm.data, 'month');
    const [dDe, dAte] = anos(lv.data, 'mes_desligamento');
    const [pDe, pAte] = anos(sw.data, 'reference_date');
    const [rDe, rAte] = anos(rc.data, 'month');

    return [
      { base: 'quadro', label: 'Quadro', abas: ['Quadro', 'Estrutura & Span'], primeiroAno: qDe, ultimoAno: qAte },
      { base: 'desligados', label: 'Desligados', abas: ['Atrição'], primeiroAno: dDe, ultimoAno: dAte },
      { base: 'pesquisa', label: 'Pesquisa', abas: ['Experiência'], primeiroAno: pDe, ultimoAno: pAte },
      { base: 'recrutamento', label: 'Recrutamento', abas: ['Recrutamento'], primeiroAno: rDe, ultimoAno: rAte },
    ];
  });

const DeptAggregateSchema = z.object({
  hc: z.number().int().nonnegative(),
  avg_salary_leaders: z.number(),
  avg_salary_non_leaders: z.number(),
});

const MetricRowSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
  brand: z.enum(['NSX', 'Betfair BR', 'Flutter International']),
  business_unit: z.enum(['nsx_br', 'betfair', 'flutter_intl']),
  headcount: z.number().int().nonnegative(),
  joiners: z.number().int().nonnegative(),
  leavers: z.number().int().nonnegative(),
  attrition_rate: z.number(),
  /** Reconstruidas da aba de historico (Motivo="Promoção"). Nullable por
   *  compatibilidade com series antigas que gravaram null. */
  promotions: z.number().nullable(),
  gender_female: z.number().int().nonnegative(),
  gender_male: z.number().int().nonnegative(),
  gender_female_pct: z.number(),
  leaders: z.number().int().nonnegative(),
  leader_female: z.number().int().nonnegative(),
  leader_female_pct: z.number(),
  leaders_pct: z.number(),
  avg_salary_leaders: z.number(),
  avg_salary_non_leaders: z.number(),
  state_mix: z.record(z.number().int().nonnegative()),
  dept_data: z.record(DeptAggregateSchema),
  /** Distribuicao por nivel da epoca ({ "L0": n, ..., "NA": n }). Default {}
   *  aceita series antigas sem o campo. */
  level_base: z.record(z.number().int().nonnegative()).default({}),
  /** Movimentacoes salariais por tipo ({ promocao:{n,delta}, ... }). Default {}. */
  raise_events: z
    .record(z.object({ n: z.number().int().nonnegative(), delta: z.number() }))
    .default({}),
  /** Cotas legais e lideranca por depto. Default aceita series antigas. */
  pcd: z.number().int().nonnegative().default(0),
  apprentice: z.number().int().nonnegative().default(0),
  leader_dept: z
    .record(z.object({ leaders: z.number().int().nonnegative(), female: z.number().int().nonnegative() }))
    .default({}),
  /** Distribuicao por tempo de casa ({ "0-3m": n, ..., "5a+": n }). Default {}. */
  tenure_base: z.record(z.number().int().nonnegative()).default({}),
  /** Demograficos ({ age, race, marital, origin }). Default {}. */
  demographics: z
    .object({
      age: z.record(z.number().int().nonnegative()),
      race: z.record(z.number().int().nonnegative()),
      marital: z.record(z.number().int().nonnegative()),
      origin: z.record(z.number().int().nonnegative()),
    })
    .partial()
    .default({}),
  /** Recorte DEI por raca ({ raca: { total, female, leaders, female_leaders } }). */
  race_cross: z
    .record(z.object({
      total: z.number().int().nonnegative(),
      female: z.number().int().nonnegative(),
      leaders: z.number().int().nonnegative(),
      female_leaders: z.number().int().nonnegative(),
    }))
    .default({}),
  /** Fase 2: as mesmas dimensoes quebradas por departamento da epoca. Sem isto
   *  aqui o campo era descartado no validator e nunca chegava na RPC -- o
   *  recorte por time congelava na carga anterior enquanto o headcount andava. */
  dept_breakdown: z
    .record(z.object({
      gender_female: z.number().int().nonnegative(),
      gender_male: z.number().int().nonnegative(),
      leaders: z.number().int().nonnegative(),
      leader_female: z.number().int().nonnegative(),
      level_base: z.record(z.number().int().nonnegative()),
      tenure_base: z.record(z.number().int().nonnegative()),
      demographics: z.object({
        age: z.record(z.number().int().nonnegative()),
        race: z.record(z.number().int().nonnegative()),
        marital: z.record(z.number().int().nonnegative()),
        origin: z.record(z.number().int().nonnegative()),
      }),
      race_cross: z.record(z.object({
        total: z.number().int().nonnegative(),
        female: z.number().int().nonnegative(),
        leaders: z.number().int().nonnegative(),
        female_leaders: z.number().int().nonnegative(),
      })),
    }))
    .default({}),
  /** Evolucao CLT/PJ do mes (vinculo da epoca). Gravada em contract_mix_monthly
   *  pela mesma RPC/transacao, para nao poder ficar defasada do headcount. */
  contract_mix: z.record(z.number().int().nonnegative()).default({}),
});

const ImportInput = z.object({
  rows: z.array(MetricRowSchema).min(1).max(200),
});

/**
 * A importação manual da série reconstruída foi removida em 12/08/2026.
 *
 * Ela lia Talent_Mobility.xlsx e o CSV do Workday para produzir
 * `source = 'reconstruido'`. A integração com o Convenia passou a produzir a
 * mesma coisa direto da folha, com histórico maior e sem ninguém exportar nada
 * -- e a comparação entre as séries mostrou que a versão por planilha somava o
 * Porto dentro de Betfair BR, quase dobrando aquela marca por 19 meses.
 *
 * Os DADOS de `reconstruido` continuam no banco: o card de comparação precisa
 * deles, e apagar história para limpar tela seria um mau negócio. O que saiu
 * foi a forma de produzir mais.
 *
 * O código está no histórico do git, caso a importação precise voltar.
 */

const ListInput = z
  .object({
    sources: z.array(z.string()).max(5).optional(),
  })
  .optional();
export interface MetricSeriesRow {
  month: string;
  brand: string;
  source: string;
  quality_flag: string | null;
  headcount: number;
  joiners: number;
  leavers: number;
  attrition_rate: number | null;
  promotions: number | null;
  gender_female: number | null;
  gender_male: number | null;
  gender_female_pct: number | null;
  leaders: number | null;
  leader_female: number | null;
  leader_female_pct: number | null;
  leaders_pct: number | null;
  avg_salary_leaders: number | null;
  avg_salary_non_leaders: number | null;
}

export const listMetricsBySource = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ListInput.parse(input))
  .handler(async ({ context, data }) => {
    const { podeVerSerie } = await authorize(context.claims.email as string | undefined);
    if (!podeVerSerie) return [];

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    let q = db
      .from('monthly_metrics')
      .select(
        'month, brand, source, quality_flag, headcount, joiners, leavers, attrition_rate, promotions, gender_female, gender_male, gender_female_pct, leaders, leader_female, leader_female_pct, leaders_pct, avg_salary_leaders, avg_salary_non_leaders',
      )
      .order('month', { ascending: true });

    if (data?.sources?.length) q = q.in('source', data.sources);

    const { data: rows, error } = await q;
    if (error) throw new Error(`Falha ao carregar series: ${error.message}`);

    return (rows ?? []) as MetricSeriesRow[];
  });

/** Linha completa de monthly_metrics para alimentar o dashboard (inclui jsonb). */
export interface MonthlyMetricRow extends MetricSeriesRow {
  leader_female: number | null;
  state_mix: Record<string, number> | null;
  dept_data: Record<string, { hc: number; avg_salary_leaders: number; avg_salary_non_leaders: number }> | null;
  salary_band_attrition:
    | Array<{ band: string; leavers: number; pct_of_leavers: number; avg_tenure_months: number }>
    | null;
  exit_survey:
    | Array<{ reason: string; count: number; pct: number; trend: string; comments?: string[] }>
    | null;
  /** Distribuicao por nivel da epoca ({ "L0": n, ..., "NA": n }). */
  level_base: Record<string, number> | null;
  /** Movimentacoes salariais por tipo ({ promocao:{n,delta}, ... }). */
  raise_events: Record<string, { n: number; delta: number }> | null;
  /** Cotas legais e lideranca por depto. */
  pcd: number | null;
  apprentice: number | null;
  leader_dept: Record<string, { leaders: number; female: number }> | null;
  /** Distribuicao por tempo de casa ({ "0-3m": n, ..., "5a+": n }). */
  tenure_base: Record<string, number> | null;
  /** Demograficos ({ age, race, marital, origin }). */
  demographics: {
    age?: Record<string, number>;
    race?: Record<string, number>;
    marital?: Record<string, number>;
    origin?: Record<string, number>;
  } | null;
  /** Recorte DEI por raca. */
  race_cross: Record<string, { total: number; female: number; leaders: number; female_leaders: number }> | null;
  /** Fase 2: quebras por departamento da epoca (mesmas dimensoes acima). */
  dept_breakdown: Record<string, {
    gender_female: number;
    gender_male: number;
    leaders: number;
    leader_female: number;
    level_base: Record<string, number>;
    tenure_base: Record<string, number>;
    demographics: {
      age: Record<string, number>;
      race: Record<string, number>;
      marital: Record<string, number>;
      origin: Record<string, number>;
    };
    race_cross: Record<string, { total: number; female: number; leaders: number; female_leaders: number }>;
  }> | null;
}

/**
 * Leitura completa para o dashboard: todas as colunas (inclusive state_mix,
 * dept_data, salary_band_attrition, exit_survey), so linhas confiaveis
 * (quality_flag IS NULL). Traz as duas fontes -- a composicao (reconstruida nos
 * escalares, congelada nos 3 campos que ela nao gera) e feita no cliente.
 * Acessivel a qualquer usuario autorizado (viewer inclusive).
 */
export const getMonthlyMetrics = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ListInput.parse(input))
  .handler(async ({ context, data }) => {
    const { podeVerSerie } = await authorize(context.claims.email as string | undefined);
    if (!podeVerSerie) return [];

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    let q = db
      .from('monthly_metrics')
      .select(
        'month, brand, source, quality_flag, headcount, joiners, leavers, attrition_rate, promotions, gender_female, gender_male, gender_female_pct, leaders, leader_female, leader_female_pct, leaders_pct, avg_salary_leaders, avg_salary_non_leaders, state_mix, dept_data, salary_band_attrition, exit_survey, level_base, raise_events, pcd, apprentice, leader_dept, tenure_base, demographics, race_cross, dept_breakdown',
      )
      .is('quality_flag', null)
      .order('month', { ascending: true });

    if (data?.sources?.length) q = q.in('source', data.sources);

    const { data: rows, error } = await q;
    if (error) throw new Error(`Falha ao carregar metricas: ${error.message}`);

    return (rows ?? []) as MonthlyMetricRow[];
  });
