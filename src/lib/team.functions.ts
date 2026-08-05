import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isInScope, isGlobalProfile, type AccessProfile, type AccessScope } from '@/lib/permissions';
import { selectedDept } from '@/lib/dept-filter';
import { z } from 'zod';

/** Filtros de tela do Meu Time. comp_ratio e person-level: todos funcionam. */
const TeamInput = z
  .object({
    department: z.string().trim().max(80).optional(),
    level: z.string().trim().max(20).optional(),
    contract: z.string().trim().max(60).optional(),
    jobFamily: z.string().trim().max(120).optional(),
  })
  .optional();

const pick = (v?: string | null): string | null => {
  const t = v?.trim();
  return !t || t === 'Todos' ? null : t;
};

/**
 * Fase 1 do recorte por time: FOTO ATUAL do time do gestor, escopada por
 * departamento e/ou job type family (uniao), calculada do person-level do banco
 * (comp_ratio: depto, familia, nivel, salario, lider/gestor). So agregados --
 * nenhum nome/salario individual sai. Nao cobre genero/raca/idade (nao estao em
 * tabela person-level escopavel) nem serie temporal -- e um retrato do mes.
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

async function authorize(userEmail: string | undefined) {
  if (!userEmail) throw new Error('Unauthorized');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('allowed_emails')
    .select('role, profile, departments, job_families')
    .ilike('email', userEmail)
    .maybeSingle();
  if (error) throw new Error(`Access check failed: ${error.message}`);
  if (!data) throw new Error('Forbidden');
  const row = data as { profile?: string; departments?: string[]; job_families?: string[] };
  const scope: AccessScope = {
    profile: (row.profile as AccessProfile) ?? 'dept_leader',
    departments: row.departments ?? [],
    jobFamilies: row.job_families ?? [],
  };
  return scope;
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
      .select('area, job_type_family, level, contract, salary, comp_ratio, is_leader, is_people_manager');
    if (error) throw new Error(`Falha ao carregar foto do time: ${error.message}`);

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
      med_comp_ratio: median(crs),
      comp_n: crs.length,
      roles: { managers, leaders, ics: Math.max(0, team.length - managers) },
    };
  });
