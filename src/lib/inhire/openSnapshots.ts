/**
 * Recorte por período e série mensal da foto de vagas abertas do InHire.
 *
 * `recruitment_open_snapshot` guarda uma linha por (as_of, departamento,
 * status) a CADA sincronização semanal -- é assim que a série histórica de
 * vagas abertas passa a existir, já que a API do InHire não fornece isso (ver
 * sync.server.ts). Desde 11/08/2026 há uma foto nova por semana.
 *
 * Módulo PURO: recebe as linhas já buscadas do banco e devolve o recorte ou a
 * série, sem rede nem banco -- para que as duas armadilhas abaixo possam ser
 * testadas sem credencial nenhuma.
 *
 * ------------------------------------------------------------------
 * ARMADILHA 1: SOMAR FOTOS EM VEZ DE ESCOLHER UMA
 * ------------------------------------------------------------------
 * A tabela acumula uma linha nova por semana; sem filtrar por `as_of`, uma
 * consulta que traz tudo soma a MESMA vaga uma vez por semana em que ela
 * apareceu -- 8 fotos acumuladas viram um número ~8x maior que o real
 * (achado em 16/09/2026). O número certo de um instante vem de UMA foto só:
 * a mais recente até o corte do período.
 *
 * ------------------------------------------------------------------
 * ARMADILHA 2: O STATUS MUDOU DE MAIÚSCULO PARA MINÚSCULO NO MEIO DO CAMINHO
 * ------------------------------------------------------------------
 * A foto de 04/08/2026 (de antes da API, gravada por outro caminho) tem
 * status "Aberta"/"Congelada". Toda foto desde 11/08 (via `statusBucket` em
 * jobs.ts) grava "aberta"/"congelada", minúsculo. Uma comparação exata contra
 * um dos dois formatos erra o outro -- a tela comparava contra "Aberta" e
 * mostrou zero vagas abertas e zero congeladas em toda foto desde 11/08, cinco
 * semanas seguidas, sem nenhum erro no console. `normalizaStatus` existe para
 * que a comparação nunca dependa de qual sync gravou a linha.
 */

export interface OpenSnapshotRow {
  as_of: string;
  department: string;
  status: string;
  jobs: number;
  positions: number;
  applications: number;
  avg_age_days: number | null;
}

/** Minúsculo e sem espaço nas pontas -- nunca comparar `status` cru. */
export function normalizaStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase();
}

/**
 * O `as_of` mais recente que caiba dentro do período, para servir de retrato
 * único do instante.
 *
 * @param corteMes 'AAAA-MM', o fim do período em escopo (mês ou último mês do
 *   trimestre/ano). `null` = sem corte, usa a foto mais recente de todas --
 *   é o que "Todos os anos" quer dizer aqui.
 */
export function asOfNoCorte(rows: OpenSnapshotRow[], corteMes: string | null): string | null {
  const todos = [...new Set(rows.map((r) => r.as_of))].sort();
  if (!todos.length) return null;
  if (!corteMes) return todos[todos.length - 1];
  const elegiveis = todos.filter((d) => d.slice(0, 7) <= corteMes);
  return elegiveis.length ? elegiveis[elegiveis.length - 1] : null;
}

/** As linhas de UMA foto (um `as_of` exato) -- nunca mais de uma por vez. */
export function linhasDoSnapshot(rows: OpenSnapshotRow[], asOf: string | null): OpenSnapshotRow[] {
  if (!asOf) return [];
  return rows.filter((r) => r.as_of === asOf);
}

export interface OpenMonthPoint {
  month: string; // 'AAAA-MM-01', para bater com o formato de MonthlyRow
  department: string;
  status: string; // normalizado
  jobs: number;
  positions: number;
}

/**
 * Uma linha por (mês, departamento, status): a ÚLTIMA foto daquele mês. Meses
 * anteriores à primeira foto real (04/08/2026) não existem na série -- não há
 * o que reconstruir, e fingir um valor seria pior que não desenhar o mês.
 */
export function serieMensal(rows: OpenSnapshotRow[]): OpenMonthPoint[] {
  const porChave = new Map<string, OpenSnapshotRow>();
  for (const r of rows) {
    const k = `${r.as_of.slice(0, 7)}|${r.department}|${normalizaStatus(r.status)}`;
    const atual = porChave.get(k);
    if (!atual || r.as_of > atual.as_of) porChave.set(k, r);
  }
  return [...porChave.values()]
    .map((r) => ({
      month: `${r.as_of.slice(0, 7)}-01`,
      department: r.department,
      status: normalizaStatus(r.status),
      jobs: r.jobs,
      positions: r.positions,
    }))
    .sort(
      (a, b) =>
        a.month.localeCompare(b.month) ||
        a.department.localeCompare(b.department) ||
        a.status.localeCompare(b.status),
    );
}
