import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isInScope, isGlobalProfile, type AccessScope } from '@/lib/permissions';
import { selectedDept } from '@/lib/dept-filter';
import { valorFiltro } from '@/lib/filtro-sentinela';
import { salaryBand, tenureBandFromHire } from '@/lib/person-bands';
import { MIN_GRUPO_SALARIO } from '@/lib/convenia/pessoas';
import { z } from 'zod';

/** Filtros de tela do Meu Time. comp_ratio e person-level: todos funcionam. */
const TeamInput = z
  .object({
    department: z.string().trim().max(80).optional(),
    level: z.string().trim().max(20).optional(),
    contract: z.string().trim().max(60).optional(),
    jobFamily: z.string().trim().max(120).optional(),
    // Derivadas de hire/salary no servidor (person-bands.ts). Ver comentario em
    // comp.functions.ts: nao ha coluna de faixa em comp_ratio.
    tenureBand: z.string().trim().max(40).optional(),
    salaryBand: z.string().trim().max(40).optional(),
  })
  .optional();

/** 'Todos'/vazio = sem seleção (ver `filtro-sentinela.ts`). */
const pick = valorFiltro;


/**
 * Fase 1 do recorte por time: FOTO ATUAL do time do gestor, escopada por
 * departamento e/ou job type family (uniao), calculada do person-level do banco
 * (comp_ratio: depto, familia, nivel, salario, lider/gestor). So agregados --
 * nenhum nome/salario individual sai. Nao cobre genero/raca/idade (nao estao em
 * tabela person-level escopavel) nem serie temporal -- e um retrato do mes.
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

/**
 * Adaptador fino sobre `resolverEscopo`, que e o unico lugar do sistema que
 * decide quem voce e -- e o unico que sabe do "ver como". Antes cada arquivo
 * tinha sua propria copia desta consulta; treze copias, quatro formatos.
 *
 * A aba declarada ('team') e permissao, nao decoracao: um perfil que nao a
 * enxerga leva 'Forbidden' aqui, e nao so deixa de ver o item no menu.
 */
async function authorize(userEmail: string | undefined): Promise<AccessScope> {
  const { resolverEscopo } = await import('@/lib/escopo.server');
  return (await resolverEscopo(userEmail, 'team')).scope;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export interface NameCount { name: string; n: number }
export interface TeamSnapshot {
  /** true se o perfil ve a empresa toda (admin/hr_leader); a foto e global. */
  global: boolean;
  /** Descricao do escopo (departamentos + familias) para o cabecalho. */
  scopeDepartments: string[];
  scopeFamilies: string[];
  headcount: number;
  byLevel: NameCount[];
  byContract: NameCount[];
  byDept: NameCount[];
  byFamily: NameCount[];
  med_comp_ratio: number | null;
  /** Piso para publicar a mediana. Abaixo dele, `med_comp_ratio` vem null. */
  comp_minimo?: number;
  comp_n: number;
  roles: { managers: number; leaders: number; ics: number };
}

const LEVEL_ORDER = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'];

export const getTeamSnapshot = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => TeamInput.parse(input))
  .handler(async ({ context, data: input }): Promise<TeamSnapshot> => {
    const scope = await authorize(context.claims.email as string | undefined);
    const sel = selectedDept(input);
    const global = isGlobalProfile(scope.profile);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;
    const { data: rows, error } = await db
      .from('comp_ratio')
      .select('area, job_type_family, level, contract, salary, hire, comp_ratio, is_leader, is_people_manager');
    if (error) throw new Error(`Falha ao carregar foto do time: ${error.message}`);

    const fTenure = pick(input?.tenureBand);
    const fBand = pick(input?.salaryBand);

    // Escopo: global ve tudo; senao, uniao depto/familia (mesma trava do isInScope).
    // O filtro de tela entra DEPOIS e so estreita -- nunca amplia o que a
    // permissao ja decidiu (ver dept-filter.ts).
    const team = (rows ?? [])
      .filter((r) => isInScope(scope, r.area, r.job_type_family))
      .filter((r) => !sel || (r.area ?? '').trim().toUpperCase() === sel)
      .filter((r) => !pick(input?.level) || (r.level ?? '').trim() === pick(input?.level))
      .filter((r) => !pick(input?.contract) || (r.contract ?? '').trim() === pick(input?.contract))
      .filter(
        (r) =>
          !pick(input?.jobFamily) ||
          (r.job_type_family ?? '').trim() === pick(input?.jobFamily),
      )
      // Faixas derivadas. O salario nao sai daqui (o snapshot ja e agregado);
      // ele so serve para decidir a faixa dentro do servidor.
      .filter((r) => !fTenure || tenureBandFromHire(r.hire) === fTenure)
      .filter(
        (r) => !fBand || salaryBand(r.salary == null ? null : Number(r.salary)) === fBand,
      );


    const level = new Map<string, number>();
    const contract = new Map<string, number>();
    const dept = new Map<string, number>();
    const family = new Map<string, number>();
    const crs: number[] = [];
    let managers = 0;
    let leaders = 0;
    for (const r of team) {
      const lv = (r.level ?? '—').trim() || '—';
      level.set(lv, (level.get(lv) ?? 0) + 1);
      const ct = (r.contract ?? '—').trim() || '—';
      contract.set(ct, (contract.get(ct) ?? 0) + 1);
      const dp = (r.area ?? '—').trim() || '—';
      dept.set(dp, (dept.get(dp) ?? 0) + 1);
      const fm = (r.job_type_family ?? 'Não informado').trim() || 'Não informado';
      family.set(fm, (family.get(fm) ?? 0) + 1);
      if (r.comp_ratio != null) crs.push(Number(r.comp_ratio));
      if (r.is_people_manager) managers++;
      if (r.is_leader) leaders++;
    }

    const sortByLevel = (a: NameCount, b: NameCount) =>
      (LEVEL_ORDER.indexOf(a.name) === -1 ? 99 : LEVEL_ORDER.indexOf(a.name)) -
      (LEVEL_ORDER.indexOf(b.name) === -1 ? 99 : LEVEL_ORDER.indexOf(b.name));
    const toArr = (m: Map<string, number>) =>
      [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);

    return {
      global,
      scopeDepartments: scope.departments ?? [],
      scopeFamilies: scope.jobFamilies ?? [],
      headcount: team.length,
      byLevel: toArr(level).sort(sortByLevel),
      byContract: toArr(contract),
      byDept: toArr(dept),
      byFamily: toArr(family),
      // ------------------------------------------------------------------
      // A MEDIANA DO TIME PRECISA DE PISO -- E NÃO TINHA
      // ------------------------------------------------------------------
      // Com UMA pessoa no time, esta "mediana" é o comp-ratio dela. E
      // comp-ratio se desfaz em salário: ele é salário ÷ ponto médio da
      // faixa, e a faixa está publicada na aba de Salários.
      //
      // Meu Time está no preset de TODO perfil escopado, inclusive do
      // `dept_leader`, cuja descrição é "vê só o próprio time, em números
      // agregados -- SEM dado individual". Um gestor de dois reportes lia o
      // comp-ratio de um deles por aqui.
      //
      // Achado varrendo as funções de servidor atrás da mesma classe de falha
      // do Perfil Individual. É a segunda vez que "agregado" serviu de
      // disfarce para dado de uma pessoa só.
      //
      // A decisão de desligar a supressão vale para a tela de EQUIDADE, e o
      // fundamento dela era o acesso restrito de Compensação. Aqui não se
      // aplica: Meu Time é a aba mais aberta do painel.
      med_comp_ratio: crs.length >= MIN_GRUPO_SALARIO ? median(crs) : null,
      // O `n` continua saindo: é ele que explica a ausência da mediana.
      comp_n: crs.length,
      /** O piso, para a tela dizer quanto falta em vez de só omitir. */
      comp_minimo: MIN_GRUPO_SALARIO,
      roles: { managers, leaders, ics: Math.max(0, team.length - managers) },
    };
  });
