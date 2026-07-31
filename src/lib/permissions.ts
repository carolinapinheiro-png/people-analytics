/**
 * Perfis de acesso ao dashboard.
 *
 * Um perfil responde a tres perguntas distintas:
 *   1. Quais abas a pessoa ve.
 *   2. Quais linhas ela ve (escopo por departamento).
 *   3. Se ela ve campo sensivel individual (nome + salario) e acoes de admin.
 *
 * Este arquivo e client-safe de proposito: a UI usa para esconder o que nao
 * cabe, mas quem decide de fato sao as server functions, que aplicam o mesmo
 * mapa antes de devolver dado.
 */

export type AccessProfile = 'admin' | 'hr_leader' | 'hrbp' | 'dept_leader';

export const ACCESS_PROFILES: AccessProfile[] = ['admin', 'hr_leader', 'hrbp', 'dept_leader'];

export const PROFILE_LABELS: Record<AccessProfile, string> = {
  admin: 'Admin',
  hr_leader: 'HR Leader',
  hrbp: 'HRBP',
  dept_leader: 'Department Leader',
};

export const PROFILE_DESCRIPTIONS: Record<AccessProfile, string> = {
  admin: 'Ve, edita e administra tudo.',
  hr_leader: 'Ve tudo, sem administrar usuarios.',
  hrbp: 'Ve tudo dos departamentos que atende.',
  dept_leader: 'Ve os proprios departamentos, sem dado individual.',
};

export type DashboardTab =
  | 'overview'
  | 'dei'
  | 'comp'
  | 'demographics'
  | 'engagement'
  | 'span'
  | 'attrition'
  | 'individual'
  | 'data';

const ALL_TABS: DashboardTab[] = [
  'overview',
  'dei',
  'comp',
  'demographics',
  'engagement',
  'span',
  'attrition',
  'individual',
  'data',
];

/** Abas que exigem visao consolidada da empresa inteira. */
const COMPANY_WIDE_TABS: DashboardTab[] = ['data'];

export interface AccessScope {
  profile: AccessProfile;
  /** Departamentos atendidos. Vazio = sem restricao apenas para perfis globais. */
  departments: string[];
  /** Job type families atendidas (ex.: "Product & Technology"). Decisao (30/07):
   *  um gestor pode ser escopado por departamento E/OU por job family; ve a
   *  UNIAO -- tudo que bate em qualquer um dos criterios atribuidos. */
  jobFamilies?: string[];
}

export function normalizeFamily(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Perfis que enxergam a empresa toda. */
export function isGlobalProfile(profile: AccessProfile): boolean {
  return profile === 'admin' || profile === 'hr_leader';
}

export function canManageUsers(profile: AccessProfile): boolean {
  return profile === 'admin';
}

export function canImportData(profile: AccessProfile): boolean {
  return profile === 'admin';
}

/** Nome + salario individual (Comp Ratio e Desligamentos). */
export function canSeeIndividualData(profile: AccessProfile): boolean {
  return profile === 'admin' || profile === 'hr_leader' || profile === 'hrbp';
}

export function visibleTabs(profile: AccessProfile): DashboardTab[] {
  if (isGlobalProfile(profile)) return ALL_TABS;
  return ALL_TABS.filter((t) => !COMPANY_WIDE_TABS.includes(t));
}

export function canSeeTab(profile: AccessProfile, tab: DashboardTab): boolean {
  return visibleTabs(profile).includes(tab);
}

export function normalizeDept(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

/**
 * Um perfil com escopo so ve linhas do seu "time": UNIAO dos departamentos e das
 * job families atribuidas. Uma linha entra se seu departamento esta na lista OU
 * sua job family esta na lista. Perfis globais veem tudo; um perfil sem nenhum
 * criterio nao ve nada. `jobFamily` e opcional para nao quebrar chamadas antigas
 * (nesse caso, so o criterio de departamento pesa).
 */
export function isInScope(
  scope: AccessScope,
  dept: string | null | undefined,
  jobFamily?: string | null | undefined,
): boolean {
  if (isGlobalProfile(scope.profile)) return true;
  const allowedDepts = scope.departments.map(normalizeDept).filter(Boolean);
  const allowedFamilies = (scope.jobFamilies ?? []).map(normalizeFamily).filter(Boolean);
  if (allowedDepts.length === 0 && allowedFamilies.length === 0) return false;
  if (allowedDepts.includes(normalizeDept(dept))) return true;
  if (jobFamily != null && allowedFamilies.includes(normalizeFamily(jobFamily))) return true;
  return false;
}
