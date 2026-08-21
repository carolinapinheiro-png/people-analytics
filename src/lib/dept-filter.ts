import { z } from 'zod';
import { isInScope, normalizeDept, type AccessScope } from '@/lib/permissions';
import { semFiltro } from '@/lib/filtro-sentinela';

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

/** 'Todos', vazio e nulo significam "sem seleção" (ver `filtro-sentinela.ts`). */
export function selectedDept(data: DeptFilterData): string | null {
  const d = data?.department;
  if (semFiltro(d)) return null;
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

/**
 * Um recorte da pesquisa (área, marca, "Outros", empresa) é visível?
 *
 * Vive aqui, fora do closure da server function, porque é regra de ESCOPO e
 * regra de escopo precisa de teste. A versão anterior estava embutida em dois
 * lugares de `survey.functions.ts`, com a ordem das checagens invertida:
 * liberava quem não tem departamento ANTES de olhar a seleção de área. O
 * efeito era filtrar Technology e receber Technology mais o balde "Outros".
 *
 * A ordem correta é PERMISSÃO PRIMEIRO, seleção depois -- e esta linha já
 * esteve escrita ao contrário aqui, descrevendo com autoridade o inverso do que
 * o código faz. Um comentário errado sobre regra de segurança é pior que
 * nenhum: convida a próxima pessoa a "consertar" o código para casar com ele,
 * e aí o seletor vira caminho para ler área alheia.
 *
 * @param dept       departamento do recorte, ou null quando ele não é área
 *                   (empresa, marca ou residual)
 * @param selecionado área escolhida na tela, já normalizada, ou null
 * @param podeVerTudo perfil global
 */
export function recorteNoEscopo(
  scope: AccessScope,
  dept: string | null,
  selecionado: string | null,
  podeVerTudo: boolean,
): boolean {
  // PERMISSÃO PRIMEIRO -- ela é o teto, e a seleção só desce a partir dele.
  // Escrever isto na ordem inversa (seleção antes) transforma o seletor num
  // caminho para ler área alheia: bastava pedir `department=MARKETING`.
  if (!podeVerTudo) {
    // Empresa, marca e residual não pertencem a nenhuma área, então não há
    // como conferi-los contra o escopo. Só perfil global os vê.
    if (dept == null) return false;
    if (!isInScope(scope, dept)) return false;
  }
  // A seleção só estreita. Um recorte sem departamento não é de área nenhuma,
  // logo não acompanha uma área selecionada.
  if (selecionado) return dept === selecionado;
  return true;
}
