import type { MonthRecord } from '@/data/raw-data';
import { categoriaDeVinculo } from '@/lib/contract-mix-convenia';

/**
 * CLT / PJ DO MÊS SELECIONADO, LIDO DA SÉRIE
 *
 * Até 17/09/2026 o card de Evolução do Headcount lia `comp_ratio` -- a foto
 * ATUAL do arquivo de comp. Não mudava com o mês e contava outra população
 * (por isso "49 / 15" ao lado de um headcount de 59).
 *
 * Agora sai de `contract_base` do mês, que é o vínculo da época gravado pela
 * carga, na mesma população do headcount ao lado.
 *
 * Devolve null quando o número não é confiável, e a tela mostra "—":
 *   - mês sem linha ou sem `contract_base` (série antiga);
 *   - recorte de departamento por RATEIO (`dept_filter_exact === false`):
 *     aí `contract_base` ainda é o da empresa inteira, sob o rótulo da área.
 */
export interface CltPj {
  clt: number;
  pj: number;
  /** Aprendiz, estatutário e outros -- a soma fecha com o total do mês. */
  outros: number;
}

export function cltPjDoMes(rec: MonthRecord | undefined): CltPj | null {
  if (!rec || rec.dept_filter_exact === false) return null;
  const base = rec.contract_base;
  if (!base || Object.keys(base).length === 0) return null;
  const out: CltPj = { clt: 0, pj: 0, outros: 0 };
  for (const [vinculo, n] of Object.entries(base)) {
    const cat = categoriaDeVinculo(vinculo);
    if (cat === 'CLT') out.clt += n || 0;
    else if (cat === 'PJ') out.pj += n || 0;
    else out.outros += n || 0;
  }
  return out;
}

/** O registro MENSAL do mês selecionado (vale também na visão trimestral). */
export function registroDoMes(serieMensal: MonthRecord[], mes: string): MonthRecord | undefined {
  const k = String(mes).slice(0, 7);
  return k ? serieMensal.find((d) => String(d.month).slice(0, 7) === k) : undefined;
}
