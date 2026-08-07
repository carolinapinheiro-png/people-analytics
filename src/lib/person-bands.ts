/**
 * Faixas derivadas do dado por pessoa (salario e admissao).
 *
 * POR QUE ISTO EXISTE
 * O seletor de "faixa salarial" e "tempo de casa" nasceu nos desligados, onde
 * as faixas ja vem calculadas na tabela (`faixa_salarial`, `tempo_casa_faixa`).
 * Em comp_ratio nao existe coluna de faixa -- existem `salary` e `hire`. Sem
 * derivar, os dois filtros ficavam de fora de Comp Ratio e Meu Time, que sao
 * exatamente as abas onde o dado por pessoa permitiria aplica-los.
 *
 * REGRA: os rotulos devolvidos aqui tem que ser IDENTICOS aos das opcoes da
 * barra de filtros (FilterBar.filterOptions) e aos usados nos desligados. Se
 * divergirem, o filtro compara textos diferentes e devolve vazio silencioso --
 * pior que nao ter o filtro. Ao mexer numa lista, mexa nas duas.
 */

/** Mesmos cortes de faixa salarial usados nos desligados (LeaverRecord). */
export function salaryBand(salary: number | null): string {
  if (salary == null) return 'Não informado';
  if (salary < 3000) return 'Até 3k';
  if (salary < 5000) return '3k-5k';
  if (salary < 8000) return '5k-8k';
  if (salary < 12000) return '8k-12k';
  if (salary < 20000) return '12k-20k';
  if (salary < 50000) return '20k-50k';
  return '50k+';
}

/**
 * Data de admissao do Convenia ("DD/MM/YY" ou "DD/MM/YYYY"; aceita tambem
 * ISO "YYYY-MM-DD", que aparece em parte das cargas) -> meses de casa.
 */
export function tenureMonthsFromHire(hire: string | null | undefined): number | null {
  const raw = String(hire ?? '').trim();
  if (!raw) return null;

  let y: number | null = null;
  let m: number | null = null;
  let d = 1;

  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (br) {
    d = Number(br[1]);
    m = Number(br[2]);
    y = Number(br[3]);
    if (y < 100) y += 2000;
  } else if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  }
  if (y == null || m == null) return null;

  const from = new Date(y, m - 1, d);
  if (isNaN(from.getTime())) return null;
  const now = new Date();
  const months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  return Math.max(0, months);
}

/** Faixa de tempo de casa, nos mesmos rotulos do seletor. */
export function tenureBandFromMonths(months: number | null): string {
  if (months == null) return 'Não informado';
  if (months < 3) return '0-3 meses';
  if (months < 6) return '3-6 meses';
  if (months < 12) return '6-12 meses';
  if (months < 24) return '1-2 anos';
  if (months < 60) return '2-5 anos';
  return '5+ anos';
}

export function tenureBandFromHire(hire: string | null | undefined): string {
  return tenureBandFromMonths(tenureMonthsFromHire(hire));
}

/** Rotulos validos (a barra oferece estes; 'Não informado' nao e oferecido). */
export const SALARY_BANDS = ['Até 3k', '3k-5k', '5k-8k', '8k-12k', '12k-20k', '20k-50k', '50k+'];
export const TENURE_BANDS = ['0-3 meses', '3-6 meses', '6-12 meses', '1-2 anos', '2-5 anos', '5+ anos'];
