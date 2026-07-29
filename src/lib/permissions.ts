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
  | 'trend'
  | 'dei'
  | 'salary'
  | 'compratio'
  | 'location'
  | 'movement'
  | 'engagement'
  | 'span'
  | 'unwanted'
  | 'leavers'
  | 'data';

const ALL_TABS: DashboardTab[] = [
  'overview',
  'trend',
  'dei',
  'salary',
  'compratio',
  'location',
  'movement',
  'engagement',
  'span',
  'unwanted',
  'leavers',
  'data',
];

/** Abas que exigem visao consolidada da empresa inteira. */
const COMPANY_WIDE_TABS: DashboardTab[] = ['data'];

export interface AccessScope {
  profile: AccessProfile;
  /** Departamentos atendidos. Vazio = sem restricao apenas para perfis globais. */
  departments: string[];
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

/** Um perfil com escopo so ve linhas dos departamentos atribuidos. */
export function isInScope(scope: AccessScope, dept: string | null | undefined): boolean {
  if (isGlobalProfile(scope.profile)) return true;
  const allowed = scope.departments.map(normalizeDept).filter(Boolean);
  if (allowed.length === 0) return false;
  return allowed.includes(normalizeDept(dept));
}
