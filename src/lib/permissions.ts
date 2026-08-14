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

export type AccessProfile =
  | 'admin' | 'hr_leader' | 'hrbp' | 'dept_leader' | 'engagement_viewer';

export const ACCESS_PROFILES: AccessProfile[] = [
  'admin', 'hr_leader', 'hrbp', 'dept_leader', 'engagement_viewer',
];

export const PROFILE_LABELS: Record<AccessProfile, string> = {
  admin: 'Admin',
  hr_leader: 'HR Leader',
  hrbp: 'HRBP',
  dept_leader: 'Department Leader',
  engagement_viewer: 'Experiência — Engajamento',
};

export const PROFILE_DESCRIPTIONS: Record<AccessProfile, string> = {
  admin: 'Vê tudo e administra usuários.',
  hr_leader: 'Vê a empresa inteira, sem administrar usuários.',
  hrbp: 'Vê tudo dos departamentos e famílias que atende.',
  dept_leader: 'Vê só o próprio time, em números agregados — sem dado individual.',
  engagement_viewer:
    'Vê só Experiência › Engajamento, e só das áreas atribuídas. Nenhuma outra aba.',
};

export type DashboardTab =
  | 'overview'
  | 'team'
  | 'dei'
  | 'comp'
  | 'demographics'
  | 'engagement'
  | 'span'
  | 'attrition'
  | 'recruitment'
  | 'individual'
  | 'data';

const ALL_TABS: DashboardTab[] = [
  'overview',
  'team',
  'dei',
  'comp',
  'demographics',
  'engagement',
  'span',
  'attrition',
  'recruitment',
  'individual',
  'data',
];

/** Abas que exigem visao consolidada da empresa inteira. */
const COMPANY_WIDE_TABS: DashboardTab[] = ['data'];

/**
 * Perfis que existem para UMA aba só.
 *
 * Criado em 14/08/2026 para Talent Management e lideres de departamento: eles
 * acompanham engajamento e nada mais. Um perfil por aba nao escala -- se
 * amanha alguem precisar de "so Recrutamento", isto vira um mapa maior, nao
 * uma segunda lista paralela.
 */
const TABS_POR_PERFIL: Partial<Record<AccessProfile, DashboardTab[]>> = {
  engagement_viewer: ['engagement'],
};

/**
 * Sub-abas visiveis dentro de Experiencia.
 *
 * A Carolina pediu Engajamento apenas. Onboarding tem recorte por area e
 * Inclusao e da empresa inteira -- as duas ficam fora para este perfil, e
 * ficam fora TAMBEM do que o servidor manda (ver getExperienceData). Esconder
 * na tela deixaria o dado no payload, visivel para quem abrisse o inspetor.
 */
export type ExperienceSubTab = 'engajamento' | 'onboarding' | 'inclusao';

const TODAS_SUBABAS: ExperienceSubTab[] = ['engajamento', 'onboarding', 'inclusao'];

export function visibleExperienceSubTabs(profile: AccessProfile): ExperienceSubTab[] {
  return profile === 'engagement_viewer' ? ['engajamento'] : TODAS_SUBABAS;
}

export function canSeeExperienceSubTab(profile: AccessProfile, sub: string): boolean {
  return visibleExperienceSubTabs(profile).includes(sub as ExperienceSubTab);
}

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
  // Perfil de aba unica vem primeiro: a lista dele nao e "tudo menos algo",
  // e sim exatamente o que foi autorizado. Deixar por ultimo faria um perfil
  // novo herdar tudo por omissao, que e o erro caro nesta funcao.
  const so = TABS_POR_PERFIL[profile];
  if (so) return so.slice();
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

/** Job type families (Talent Mobility). Escopo do gestor = uniao de departamentos + familias. */
export const JOB_TYPE_FAMILIES = [
  'Customer Operations',
  'Commercial & Marketing',
  'Product & Technology',
  'Data & Analytics',
  'Finance',
  'HR',
  'Legal',
  'Other (Property, Security, Cleaning)',
  'Leadership (Executive) SR and C-Levels (reporting to CEO or N-3)',
  'Risk and Trading',
];

/** Sugestoes de level no cadastro (campo livre, datalist). */
export const JOB_LEVEL_PRESETS = [
  'C-Level',
  'VP',
  'Director',
  'Senior Manager',
  'Manager',
  'Coordinator',
  'Specialist',
  'Senior Analyst',
  'Analyst',
  'Intern',
];

/** Sugestoes de responsabilidades no cadastro (chips, campo livre nao permitido). */
export const RESPONSIBILITY_PRESETS = [
  'Headcount & Movimentação',
  'Turnover & Retenção',
  'Comp & Ben',
  'DEI',
  'Engagement & Experiência',
  'Onboarding',
  'Estrutura & Span',
  'Talent Mobility',
];
