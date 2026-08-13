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
 */
async function authorize(userEmail: string | undefined): Promise<AccessScope> {
  const { resolverEscopo } = await import('@/lib/escopo.server');
  return (await resolverEscopo(userEmail)).scope;
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

    const [{ data: mRows, error: mErr }, { data: oRows, error: oErr }] = await Promise.all([
      db.from('recruitment_monthly')
        .select('month, department, closed_jobs, tth_avg, tth_median, applications')
        .order('month', { ascending: true }),
      db.from('recruitment_open_snapshot')
        .select('as_of, department, status, jobs, positions, applications, avg_age_days')
        .order('department', { ascending: true }),
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
    // precisa saber de quando e o retrato.
    const asOf = allOpen.length ? String(allOpen[0].as_of).slice(0, 10) : null;

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
