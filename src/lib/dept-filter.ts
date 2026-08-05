import { z } from 'zod';
import { isInScope, normalizeDept, type AccessScope } from '@/lib/permissions';

/**
 * Filtro de departamento vindo da tela, aplicado no servidor.
 *
 * REGRA DE SEGURANÇA: o filtro só ESTREITA. Ele é aplicado por cima do escopo
 * de permissão, nunca no lugar dele. Um gestor de Marketing que mandar
 * "department=TECHNOLOGY" continua recebendo nada de Technology -- a permissão
 * decide o teto, a seleção decide o quanto abaixo do teto se olha.
 *
 * Sem essa ordem, o filtro viraria um caminho para ler dado de outra área
 * simplesmente escolhendo no seletor.
 */

export const DeptFilterInput = z
  .object({ department: z.string().trim().max(80).optional() })
  .optional();

export type DeptFilterData = z.infer<typeof DeptFilterInput>;

/** 'Todos', vazio e nulo significam "sem seleção". */
export function selectedDept(data: DeptFilterData): string | null {
  const d = data?.department?.trim();
  if (!d || d === 'Todos') return null;
  return normalizeDept(d);
}

/**
 * Permissão E seleção. Use no lugar de `isInScope` direto quando a origem
 * também aceita filtro de tela.
 */
export function visibleWithFilter(
  scope: AccessScope,
  rowDept: string | null | undefined,
  selected: string | null,
  jobFamily?: string | null,
): boolean {
  if (!isInScope(scope, rowDept, jobFamily)) return false;
  if (selected && normalizeDept(rowDept) !== selected) return false;
  return true;
}
