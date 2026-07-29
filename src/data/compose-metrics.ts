import type { MonthRecord } from './raw-data';
import type { MonthlyMetricRow } from '@/lib/metrics.functions';

/**
 * Compoe a serie do dashboard a partir das linhas de monthly_metrics.
 *
 * Decisao da area (27/07): a serie RECONSTRUIDA e a oficial. Ela cobre os
 * escalares + state_mix + dept_data + promotions (reconstruidas da aba de
 * historico, Motivo="Promoção"). Os DOIS campos que ela ainda nao gera --
 * exit_survey e salary_band_attrition -- vem da serie CONGELADA (raw-data.ts)
 * do mesmo mes/marca. Onde a congelada nao alcanca, ficam vazios (nao zero).
 *
 * O resto do app (helpers, abas) continua consumindo MonthRecord[] sem mudanca.
 */

const num = (v: number | null | undefined): number => (v == null ? 0 : Number(v));

const toMonthRecord = (r: MonthlyMetricRow): MonthRecord => {
  const ym = String(r.month).slice(0, 7); // 'YYYY-MM-01' -> 'YYYY-MM'
  return {
    month: ym,
    year: Number(ym.slice(0, 4)),
    brand: r.brand,
    headcount: num(r.headcount),
    joiners: num(r.joiners),
    leavers: num(r.leavers),
    attrition_rate: num(r.attrition_rate),
    gender_female: num(r.gender_female),
    gender_male: num(r.gender_male),
    gender_female_pct: num(r.gender_female_pct),
    leaders: num(r.leaders),
    leader_female: num(r.leader_female),
    leader_female_pct: num(r.leader_female_pct),
    leaders_pct: num(r.leaders_pct),
    avg_salary_leaders: num(r.avg_salary_leaders),
    avg_salary_non_leaders: num(r.avg_salary_non_leaders),
    state_mix: r.state_mix ?? {},
    dept_data: r.dept_data ?? {},
    salary_band_attrition: r.salary_band_attrition ?? undefined,
    exit_survey: (r.exit_survey as MonthRecord['exit_survey']) ?? undefined,
    promotions: r.promotions == null ? 0 : Number(r.promotions),
    level_base:
      r.level_base && Object.keys(r.level_base).length > 0 ? r.level_base : undefined,
    raise_events:
      r.raise_events && Object.keys(r.raise_events).length > 0 ? r.raise_events : undefined,
  };
};

// nota: promotions da reconstruida ja vem preenchido; o mapa acima trata null
// (fontes antigas) como 0.

const OFFICIAL = 'reconstruido';
const FALLBACK = 'raw-data.ts';

/**
 * @param rows linhas das duas fontes (ja filtradas por quality_flag IS NULL).
 * @returns MonthRecord[] com a reconstruida oficial + congelada nos 3 buracos.
 */
export function composeMonthlyMetrics(rows: MonthlyMetricRow[]): MonthRecord[] {
  const key = (brand: string, ym: string) => `${brand}|${ym}`;

  const frozenByKey = new Map<string, MonthlyMetricRow>();
  for (const r of rows) {
    if (r.source === FALLBACK) frozenByKey.set(key(r.brand, String(r.month).slice(0, 7)), r);
  }

  const out: MonthRecord[] = [];
  for (const r of rows) {
    if (r.source !== OFFICIAL) continue;
    const rec = toMonthRecord(r);
    // Preenche os 3 campos que a reconstruida nao produz, com a congelada.
    const frozen = frozenByKey.get(key(r.brand, rec.month));
    if (frozen) {
      if (rec.exit_survey == null && frozen.exit_survey != null) {
        rec.exit_survey = frozen.exit_survey as MonthRecord['exit_survey'];
      }
      if (rec.salary_band_attrition == null && frozen.salary_band_attrition != null) {
        rec.salary_band_attrition = frozen.salary_band_attrition;
      }
      // promotions NAO cai mais para a congelada: a reconstruida agora produz
      // o numero real (aba de historico). 0 num mes e afirmacao valida.
    }
    out.push(rec);
  }

  // Se por algum motivo nao houver reconstruida, cai para a congelada inteira
  // (nao deixa o dashboard vazio).
  if (out.length === 0) {
    for (const r of rows) if (r.source === FALLBACK) out.push(toMonthRecord(r));
  }

  return out.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}
