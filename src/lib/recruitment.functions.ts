import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isGlobalProfile, type AccessScope } from '@/lib/permissions';
import { DeptFilterInput, selectedDept, visibleWithFilter } from '@/lib/dept-filter';

/**
 * Recrutamento (InHire): serie mensal por departamento + foto das vagas abertas.
 *
 * Escopado igual ao resto: gestor com escopo de departamento so recebe as linhas
 * do time dele. A filtragem acontece AQUI, no servidor -- a tela nunca recebe o
 * que nao pode mostrar.
 *
 * So agregados. Nenhum dado de candidato passa por este modulo.
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

/**
 * Adaptador fino sobre `resolverEscopo`, que e o unico lugar do sistema que
 * decide quem voce e -- e o unico que sabe do "ver como". Antes cada arquivo
 * tinha sua propria copia desta consulta; treze copias, quatro formatos.
 *
 * A aba declarada ('recruitment') e permissao, nao decoracao: um perfil que nao a
 * enxerga leva 'Forbidden' aqui, e nao so deixa de ver o item no menu.
 */
async function authorize(userEmail: string | undefined): Promise<AccessScope> {
  const { resolverEscopo } = await import('@/lib/escopo.server');
  return (await resolverEscopo(userEmail, 'recruitment')).scope;
}

export interface RecruitmentMonth {
  month: string;
  department: string;
  closed_jobs: number;
  tth_avg: number | null;
  tth_median: number | null;
  applications: number;
}

export interface RecruitmentOpen {
  as_of: string;
  department: string;
  status: string;
  jobs: number;
  positions: number;
  applications: number;
  avg_age_days: number | null;
}

/**
 * `open` carrega o HISTÓRICO inteiro de fotos semanais (uma linha por
 * as_of/depto/status), não só a mais recente -- é o material bruto da série
 * mensal de vagas abertas. Quem lê isto NUNCA deve somar `open` direto: isso
 * soma a mesma vaga uma vez por semana em que ela apareceu. Escolha uma foto
 * primeiro com `asOfNoCorte`/`linhasDoSnapshot` de `lib/inhire/openSnapshots`
 * (para um número de instante) ou agregue com `serieMensal` (para uma série).
 */

export interface RecruitmentData {
  global: boolean;
  scopeDepartments: string[];
  monthly: RecruitmentMonth[];
  open: RecruitmentOpen[];
  /** Data da foto -- o painel NAO e tempo real, e o InHire e. Sem isto na tela,
   *  alguem compara os dois num intervalo de carga e acha que ha erro. */
  asOf: string | null;
  /**
   * Primeiro mes com fechamento no ATS, considerando a EMPRESA TODA -- nao o
   * escopo de quem esta olhando.
   *
   * A distincao importa: para um gestor de Finance, cujo primeiro fechamento e
   * jan/2026, os meses anteriores nao sao "nao medidos" -- sao meses medidos em
   * que a area nao fechou nada, ou seja, zero de verdade. Usar o primeiro mes do
   * escopo como inicio faria a tela chamar de "sem medicao" um periodo que foi
   * medido e deu zero. Antes de `seriesStart` (global), sim, nao ha medicao.
   */
  seriesStart: string | null;
  /** Ultimo mes com dado na base, para fechar o eixo do grafico. */
  seriesEnd: string | null;
}

export const getRecruitment = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => DeptFilterInput.parse(input))
  .handler(async ({ context, data }): Promise<RecruitmentData> => {
    const scope = await authorize(context.claims.email as string | undefined);
    const sel = selectedDept(data);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    // `recruitment_open_snapshot` guarda UMA linha por depto/status a cada
    // sincronização -- é assim que a série histórica de vagas abertas passa a
    // existir (ver comentário em sync.server.ts). Traz TODO o histórico aqui
    // de propósito (16/09/2026: passou a alimentar o gráfico de evolução);
    // quem lê `open` precisa escolher uma foto com `lib/inhire/openSnapshots`
    // antes de somar -- nunca reduzir `open` direto (ver o aviso no tipo).
    //
    // `asOf` (a data mostrada no topo da aba) continua vindo de uma consulta
    // separada por max(as_of): é sobre TODA a base, sem o filtro de escopo
    // que `open` leva abaixo -- um gestor sem vaga aberta no time dele ainda
    // precisa saber de quando é o retrato.
    const { data: ultimaFoto } = await db
      .from('recruitment_open_snapshot')
      .select('as_of')
      .order('as_of', { ascending: false })
      .limit(1)
      .maybeSingle();
    const latestAsOf = (ultimaFoto as { as_of?: string } | null)?.as_of ?? null;

    const [{ data: mRows, error: mErr }, { data: oRows, error: oErr }] = await Promise.all([
      db.from('recruitment_monthly')
        .select('month, department, closed_jobs, tth_avg, tth_median, applications')
        .order('month', { ascending: true }),
      db.from('recruitment_open_snapshot')
        .select('as_of, department, status, jobs, positions, applications, avg_age_days')
        .order('as_of', { ascending: true }),
    ]);
    if (mErr) throw new Error(`Falha ao carregar recrutamento: ${mErr.message}`);
    if (oErr) throw new Error(`Falha ao carregar vagas abertas: ${oErr.message}`);

    const global = isGlobalProfile(scope.profile);
    // BETFAIR nao e departamento nosso -- e marca. Nao entra no escopo de nenhum
    // gestor por departamento; so perfis globais veem.
    const visible = (dept: string) =>
      (global || visibleWithFilter(scope, dept, null)) && (!sel || dept.toUpperCase() === sel);

    const all = ((mRows ?? []) as RecruitmentMonth[]).map((r) => ({
      ...r,
      month: String(r.month).slice(0, 10),
    }));
    const allOpen = ((oRows ?? []) as RecruitmentOpen[]);

    const monthly = all.filter((r) => visible(r.department));
    const open = allOpen.filter((r) => visible(r.department));

    // Extremos calculados SEM o escopo: sao propriedades da medicao, nao de quem
    // esta olhando (ver comentario em seriesStart).
    const seriesStart = all.length ? all[0].month : null;
    const seriesEnd = all.length ? all[all.length - 1].month : null;
    // A data da foto tambem vem da base inteira: um gestor sem vaga aberta ainda
    // precisa saber de quando e o retrato. `latestAsOf` já é o max(as_of) --
    // computado antes de filtrar por escopo, não precisa passar por `allOpen`.
    const asOf = latestAsOf ? String(latestAsOf).slice(0, 10) : null;

    return {
      global,
      scopeDepartments: scope.departments,
      monthly,
      open,
      asOf,
      seriesStart,
      seriesEnd,
    };
  });
