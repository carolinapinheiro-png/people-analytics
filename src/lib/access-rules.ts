import { z } from 'zod';

/**
 * Schemas e regras puras do controle de acesso.
 *
 * Client-safe de proposito: a UI usa para validar antes de enviar, e as
 * server functions usam os mesmos schemas no inputValidator. O banco ainda
 * tem o trigger validate_allowed_email_rules como backstop final.
 */

export const ProfileSchema = z.enum(['admin', 'hr_leader', 'hrbp', 'dept_leader']);

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

export type AccessProfileValue = z.infer<typeof ProfileSchema>;

/** Departamento e job family so valem para perfis escopados (hrbp/dept_leader). */
export function isScopedProfileValue(profile: AccessProfileValue): boolean {
  return profile === 'hrbp' || profile === 'dept_leader';
}

/** Perfil admin e o unico que administra usuarios; role fica derivado dele. */
export function roleForProfile(profile: AccessProfileValue): 'admin' | 'viewer' {
  return profile === 'admin' ? 'admin' : 'viewer';
}

export const SCOPED_REQUIRES_SCOPE_MESSAGE =
  'Perfis HRBP e Department Leader exigem ao menos um departamento ou job family.';

export const AddAllowedEmailSchema = z.object({
  email: z.string().trim().email().max(255),
  profile: ProfileSchema,
  departments: DepartmentsSchema,
  jobFamilies: JobFamiliesSchema,
  jobTitle: JobTitleSchema,
  jobLevel: JobLevelSchema,
  responsibilities: ResponsibilitiesSchema,
});

export const UpdateAllowedEmailUserSchema = z.object({
  id: z.string().uuid(),
  profile: ProfileSchema,
  departments: DepartmentsSchema,
  jobFamilies: JobFamiliesSchema,
  jobTitle: JobTitleSchema,
  jobLevel: JobLevelSchema,
  responsibilities: ResponsibilitiesSchema,
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
