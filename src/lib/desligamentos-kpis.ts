/**
 * As contas dos cartões da aba de Desligamentos, fora do componente.
 *
 * ===========================================================================
 * POR QUE SAIU DO LEAVERSTAB
 * ===========================================================================
 * O cartão "Atrição acumulada" mostrava 1,9% com o topo em "Mensal · Set
 * 2026". Era a taxa DO MÊS (12 ÷ HC médio 627), com um rótulo de acumulado.
 * Quem lê uma vez por mês compara esse número com metas anuais (~20%) e acha
 * que a empresa está muito abaixo. Agora o cartão diz qual conta é, e ao lado
 * vem a mesma taxa anualizada e o acumulado do ano -- três números com três
 * nomes, em vez de um número com o nome errado.
 *
 * As contas ficam aqui para serem testadas: comparação com o período anterior
 * e com o mesmo período do ano passado depende de deslocar meses, e virada de
 * ano é exatamente onde esse tipo de conta erra em silêncio.
 */

export interface PontoSerie {
  month: string;
  headcount?: number;
  leavers?: number;
}

/** 'AAAA-MM' deslocado `n` meses (negativo = para trás). */
export function deslocarMes(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export function deslocarMeses(meses: string[], n: number): string[] {
  return meses.map((m) => deslocarMes(m, n));
}

/** Janeiro do mesmo ano até `fim`, inclusive. */
export function mesesDoAnoAte(fim: string): string[] {
  const mes = Number(fim.slice(5, 7));
  return Array.from({ length: mes }, (_, i) => deslocarMes(fim, i - (mes - 1)));
}

/** Os 12 meses que terminam em `fim`, inclusive. */
export function ultimos12(fim: string): string[] {
  return Array.from({ length: 12 }, (_, i) => deslocarMes(fim, i - 11));
}

export interface TaxaPeriodo {
  saidas: number;
  hcMedio: number;
  nMeses: number;
  /** saídas ÷ HC médio, em %. */
  taxa: number;
  /** `taxa` levada a 12 meses. Igual a `taxa` quando o período já é um ano. */
  anualizada: number;
}

/**
 * Saídas ÷ HC médio dos meses pedidos.
 *
 * `null` quando QUALQUER mês pedido falta na série (ou tem HC zero). Uma
 * comparação com um trimestre de dois meses não é comparação -- e o cartão
 * mostra "—" em vez de uma variação inventada.
 */
export function taxaDoPeriodo(serie: PontoSerie[], meses: string[]): TaxaPeriodo | null {
  if (meses.length === 0) return null;
  const porMes = new Map(serie.map((p) => [p.month, p]));
  let saidas = 0;
  let hc = 0;
  for (const m of meses) {
    const p = porMes.get(m);
    if (!p || !(p.headcount && p.headcount > 0)) return null;
    saidas += p.leavers || 0;
    hc += p.headcount;
  }
  const hcMedio = hc / meses.length;
  const taxa = (saidas / hcMedio) * 100;
  return { saidas, hcMedio, nMeses: meses.length, taxa, anualizada: (taxa * 12) / meses.length };
}

/** Diferença em pontos percentuais; `null` se faltar um dos lados. */
export function deltaPP(a: TaxaPeriodo | null, b: TaxaPeriodo | null): number | null {
  if (!a || !b) return null;
  return Math.round((a.taxa - b.taxa) * 10) / 10;
}

export function mediana(nums: number[]): number | null {
  const v = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/**
 * Tempo de casa em meses, só de quem TEM tempo de casa.
 *
 * Antes a média somava `tempo_casa_dias || 0`: quem ainda não teve o detalhe
 * lido no Convenia entrava como zero dia de casa e puxava a média para baixo,
 * como se fosse um desligamento na primeira semana.
 */
export function mesesDeCasaValidos(dias: Array<number | null | undefined>): number[] {
  return dias.filter((d): d is number => typeof d === 'number' && d >= 0).map((d) => d / 30.44);
}

export interface TurnoverPrecoce {
  /** Quantos tinham tempo de casa conhecido (o denominador). */
  n: number;
  ate3m: number;
  ate12m: number;
  pct3m: number | null;
  pct12m: number | null;
}

/**
 * Saídas nos primeiros 3 e 12 meses.
 *
 * A admissão no Convenia vem com granularidade de MÊS (`hiring_month`), e o
 * tempo de casa é contado do dia 1 -- então "até 3 meses" pode incluir alguém
 * com 3 meses e poucos dias. Os cortes em dias abaixo (92 e 365) seguem a
 * mesma régua das faixas do gráfico de tempo de casa ('0-3 meses').
 */
export function turnoverPrecoce(dias: Array<number | null | undefined>): TurnoverPrecoce {
  const v = dias.filter((d): d is number => typeof d === 'number' && d >= 0);
  const ate3m = v.filter((d) => d <= 92).length;
  const ate12m = v.filter((d) => d < 365).length;
  return {
    n: v.length,
    ate3m,
    ate12m,
    pct3m: v.length ? (ate3m / v.length) * 100 : null,
    pct12m: v.length ? (ate12m / v.length) * 100 : null,
  };
}
