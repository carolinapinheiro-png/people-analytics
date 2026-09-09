import { z } from 'zod';
import { ALL_TABS, SUB_ABAS_DO_PRODUTO } from '@/lib/permissions';

/**
 * Schemas e regras puras do controle de acesso.
 *
 * Client-safe de proposito: a UI usa para validar antes de enviar, e as
 * server functions usam os mesmos schemas no inputValidator. O banco ainda
 * tem o trigger validate_allowed_email_rules como backstop final.
 */

export const ProfileSchema = z.enum([
  'admin', 'hr_leader', 'hrbp', 'dept_leader', 'engagement_viewer',
]);

export type AccessProfileValue = z.infer<typeof ProfileSchema>;

/** Perfil opcional: em lote, não escolher perfil quer dizer "não mexe nele". */
export const ProfileSchemaOpcional = ProfileSchema.optional();

export interface AllowedEmailRow {
  id: string;
  email: string;
  role: 'admin' | 'viewer';
  profile: AccessProfileValue;
  departments: string[];
  job_families: string[];
  job_title: string | null;
  job_level: string | null;
  responsibilities: string[];
  created_at: string;
  updated_at: string;
  extra_tabs: string[];
  /** Abas DESTA pessoa. Vazio = preset do perfil + extra_tabs. */
  tabs: string[];
  /** Sub-abas desta pessoa, mesma regra. Achatada entre as abas. */
  sub_tabs: string[];
  can_see_individual: boolean | null;
  expires_at: string | null;
  last_login_at: string | null;
}

export const DepartmentsSchema = z
  .array(z.string().trim().min(1).max(80))
  .max(50)
  .default([]);

export const JobFamiliesSchema = z
  .array(z.string().trim().min(1).max(120))
  .max(50)
  .default([]);

export const JobTitleSchema = z.string().trim().max(80).default('');
export const JobLevelSchema = z.string().trim().max(40).default('');

export const ResponsibilitiesSchema = z
  .array(z.string().trim().min(1).max(80))
  .max(20)
  .default([]);

/**
 * Ação em lote. Cada campo é OPCIONAL e só mexe no que veio -- o resto da
 * permissão de cada pessoa fica como estava.
 *
 * `addDepartments` e `removeDepartments` existem em vez de um `departments`
 * que substitui: numa lista de 40 pessoas com escopos diferentes, substituir
 * apagaria o escopo de todas para igualar ao de nenhuma. Somar e tirar são as
 * duas operações que fazem sentido sobre um conjunto heterogêneo.
 */
export const BulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  profile: ProfileSchemaOpcional,
  addDepartments: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  removeDepartments: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  /** `null` limpa a validade; ausente não mexe. */
  expiresAt: z.string().datetime().nullable().optional(),
});

export const ImportCsvSchema = z.object({
  texto: z.string().min(1).max(500_000),
  /** Sem isto a chamada só simula e devolve o que faria. */
  confirm: z.boolean().default(false),
});

export const GetAllowedEmailsSchema = z.object({
  search: z.string().trim().max(120).default(''),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(5).max(100).default(20),
  /** Filtros da lista. Vazio = sem filtro. Busca por e-mail nao basta com 100+ linhas. */
  profile: z.string().trim().max(40).default(''),
  department: z.string().trim().max(80).default(''),
});

/**
 * Perfis escopados: so enxergam as areas atribuidas, e por isso EXIGEM ao
 * menos uma. Sem escopo o cadastro fica ambiguo -- e a ambiguidade aqui
 * resolve para o lado errado, porque "sem filtro" parece "tudo".
 */
const PERFIS_ESCOPADOS: AccessProfileValue[] = ['hrbp', 'dept_leader', 'engagement_viewer'];

export function isScopedProfileValue(profile: AccessProfileValue): boolean {
  return PERFIS_ESCOPADOS.includes(profile);
}

/** Perfil admin e o unico que administra usuarios; role fica derivado dele. */
export function roleForProfile(profile: AccessProfileValue): 'admin' | 'viewer' {
  return profile === 'admin' ? 'admin' : 'viewer';
}

export const SCOPED_REQUIRES_SCOPE_MESSAGE =
  'Perfis HRBP e Department Leader exigem ao menos um departamento ou job family.';

/**
 * Abas concedidas alem das do perfil. Validadas contra a lista real.
 *
 * ------------------------------------------------------------------
 * DERIVADA DE `ALL_TABS`, E NAO COPIADA DELA
 * ------------------------------------------------------------------
 * Era uma lista escrita a mao, com o `.max(11)` tambem a mao. Duas copias da
 * mesma verdade, e a copia envelhece: `permissions.ts` ganha uma aba, este
 * arquivo nao fica sabendo, e o servidor passa a recusar uma aba que a tela
 * oferece. Ver `SubTabsSchema` logo abaixo, que foi exatamente isso.
 *
 * Continua sendo lista FECHADA -- uma aba inventada nao entra no cadastro --,
 * so que agora e a lista certa, e ela nao pode divergir.
 */
export const ExtraTabsSchema = z
  .array(z.enum(ALL_TABS as [string, ...string[]]))
  .max(ALL_TABS.length)
  .default([]);

/**
 * A lista de abas DESTA pessoa. Mesmos valores das extras, outra semântica:
 * preenchida, ela SUBSTITUI o preset do perfil e as extras.
 *
 * Validada contra a mesma lista real -- uma aba inventada não entra no
 * cadastro, senão a pessoa ficaria com um item que nunca resolve para tela
 * nenhuma e ninguém entenderia por que ela não vê nada.
 */
export const TabsSchema = ExtraTabsSchema;

/**
 * As sub-abas desta pessoa, achatadas entre as abas.
 *
 * ===========================================================================
 * A LISTA ESTAVA DESATUALIZADA, E O SINTOMA ERA UM ERRO DE VALIDACAO
 * ===========================================================================
 * Este enum tinha SEIS valores e `.max(6)`. `SUB_ABAS_DO_PRODUTO` tem OITO --
 * `desligamentos` e `nao-desejada` entraram com a aba de Atricao e nunca
 * chegaram aqui.
 *
 * A tela oferecia as oito; o servidor recusava duas. Ou seja: ninguem nunca
 * conseguiu salvar um cadastro com as sub-abas de Atricao, e o erro so
 * apareceu quando um perfil trouxe as oito de uma vez. Um controle que oferece
 * o que o servidor recusa e pior que um controle ausente -- quem tenta conclui
 * que errou alguma coisa.
 *
 * O comentario antigo defendia o enum fechado: "melhor nao conseguir conceder
 * do que conceder algo que a regra nao sabe interpretar". A defesa continua
 * valendo e nao exige copia: derivando de `SUB_ABAS_DO_PRODUTO`, a lista
 * segue fechada e passa a ser a mesma que o produto usa para resolver a
 * sub-aba na tela. Sub-aba nova entra nas duas ao mesmo tempo, ou em nenhuma.
 */
const SUB_ABAS_VALIDAS = Object.keys(SUB_ABAS_DO_PRODUTO);

export const SubTabsSchema = z
  .array(z.enum(SUB_ABAS_VALIDAS as [string, ...string[]]))
  .max(SUB_ABAS_VALIDAS.length)
  .default([]);

/**
 * `null` = conforme o perfil. E o padrao de propósito: um booleano de dois
 * estados obrigaria a decidir por todo mundo agora, e "conforme o perfil" e a
 * resposta certa para quase todos os cadastros.
 */
export const CanSeeIndividualSchema = z.boolean().nullable().default(null);

/** Data ISO ou vazio. Vazio = acesso sem prazo. */
export const ExpiresAtSchema = z
  .string()
  .trim()
  .max(40)
  .nullable()
  .default(null)
  .transform((v) => (v && v.length ? v : null));

/** O perfil de acesso. `null` = cadastro avulso, o comportamento anterior. */
export const ProfileIdSchema = z.string().uuid().nullish();

export const AddAllowedEmailSchema = z.object({
  email: z.string().trim().email().max(255),
  profile: ProfileSchema,
  profileId: ProfileIdSchema,
  departments: DepartmentsSchema,
  jobFamilies: JobFamiliesSchema,
  jobTitle: JobTitleSchema,
  jobLevel: JobLevelSchema,
  responsibilities: ResponsibilitiesSchema,
  extraTabs: ExtraTabsSchema,
  tabs: TabsSchema,
  subTabs: SubTabsSchema,
  canSeeIndividual: CanSeeIndividualSchema,
  expiresAt: ExpiresAtSchema,
});

export const UpdateAllowedEmailUserSchema = z.object({
  id: z.string().uuid(),
  profile: ProfileSchema,
  profileId: ProfileIdSchema,
  departments: DepartmentsSchema,
  jobFamilies: JobFamiliesSchema,
  jobTitle: JobTitleSchema,
  jobLevel: JobLevelSchema,
  responsibilities: ResponsibilitiesSchema,
  extraTabs: ExtraTabsSchema,
  tabs: TabsSchema,
  subTabs: SubTabsSchema,
  canSeeIndividual: CanSeeIndividualSchema,
  expiresAt: ExpiresAtSchema,
});

/** Historico de mudancas de permissao de um usuario. */
export const UserHistorySchema = z.object({
  email: z.string().trim().email().max(255),
});

export const RemoveAllowedEmailSchema = z.object({
  id: z.string().uuid(),
});

export const AddDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(60),
  aliases: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
});

export const SetDepartmentActiveSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});
