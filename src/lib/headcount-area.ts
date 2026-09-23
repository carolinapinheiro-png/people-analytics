/**
 * Quantas pessoas uma área tem, lido de um bloco de `dept_breakdown`.
 *
 * ------------------------------------------------------------------
 * O CAMPO `headcount` NÃO EXISTE NA SÉRIE CONVENIA
 * ------------------------------------------------------------------
 * `survey.functions.ts` lia `d.headcount` para o denominador da taxa de
 * resposta por área. Conferido no banco em 23/09: o campo vem nulo em TODOS
 * os meses da série `convenia`, das três entidades. O total da área só existe
 * como `level_base` (pessoas por nível), que é o que o cruzamento com saídas
 * sempre somou. Resultado: `elegiveisPorArea` saía vazio e a taxa por área
 * nunca aparecia -- sem erro, só ausente.
 *
 * Um lugar só para essa leitura, usado pelos dois. `headcount` fica como
 * preferência caso uma carga futura passe a gravá-lo; gender_female +
 * gender_male daria o mesmo total, mas perde quem está sem gênero cadastrado.
 */
export function headcountDaArea(
  d: { headcount?: number | null; level_base?: Record<string, number> | null } | null | undefined,
): number {
  const pronto = Number(d?.headcount ?? 0);
  if (pronto > 0) return pronto;
  return Object.values(d?.level_base ?? {}).reduce((s, n) => s + (Number(n) || 0), 0);
}
