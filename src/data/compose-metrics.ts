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
    pcd: r.pcd == null ? undefined : Number(r.pcd),
    apprentice: r.apprentice == null ? undefined : Number(r.apprentice),
    leader_dept:
      r.leader_dept && Object.keys(r.leader_dept).length > 0 ? r.leader_dept : undefined,
    tenure_base:
      r.tenure_base && Object.keys(r.tenure_base).length > 0 ? r.tenure_base : undefined,
    demographics:
      r.demographics && Object.keys(r.demographics).length > 0 ? r.demographics : undefined,
    race_cross:
      r.race_cross && Object.keys(r.race_cross).length > 0 ? r.race_cross : undefined,
    dept_breakdown:
      r.dept_breakdown && Object.keys(r.dept_breakdown).length > 0
        ? (r.dept_breakdown as MonthRecord['dept_breakdown'])
        : undefined,
  };
};

// nota: promotions da reconstruida ja vem preenchido; o mapa acima trata null
// (fontes antigas) como 0.

/**
 * A série OFICIAL do painel.
 *
 * Passou de 'reconstruido' para 'convenia' em 12/08/2026. A anterior vinha de
 * planilha importada à mão; esta é calculada a partir das datas de admissão e
 * desligamento da folha, nas cinco empresas do grupo.
 *
 * O que decidiu a troca foi conferência, não preferência:
 *
 *   NSX ....................  582 (convenia)  x  581 (as duas antigas)
 *   Flutter International ...   22            x   22
 *   Betfair BR ..............   34            x   34 congelada / 76 reconstruida
 *
 * A 'reconstruido' somava o Porto -- que é um departamento dentro da Flutter
 * International, não uma marca -- dentro de Betfair BR, quase dobrando aquela
 * marca por 19 meses seguidos. Duas fontes independentes contra uma.
 *
 * A cobertura também: 85 meses de NSX contra 19, e 162 de Flutter International
 * contra 19.
 *
 * As duas séries antigas continuam no banco. Trocar a constante abaixo volta
 * atrás sem perder nada.
 */
const OFFICIAL = 'convenia';

/**
 * De onde saem os campos que a série oficial não produz.
 *
 * Continua sendo a congelada: pesquisa de desligamento e atrição por faixa
 * salarial não existem no Convenia, e sem esse preenchimento os dois gráficos
 * ficariam vazios.
 */
const FALLBACK = 'raw-data.ts';

/**
 * ===========================================================================
 * QUAL SERIE ESTA NO AR
 * ===========================================================================
 * `composeMonthlyMetrics` cai para a congelada inteira quando nao encontra
 * nenhuma linha da oficial. A queda em si e certa -- painel vazio e pior que
 * painel velho. O que estava errado era ela ser MUDA.
 *
 * Em 18/08/2026 a serie do Convenia nasceu inteira marcada como 'parcial' (ver
 * o contador errado em convenia/sync.server.ts). `getMonthlyMetrics` filtra
 * `quality_flag IS NULL`, entao as 272 linhas sumiram na leitura e o painel
 * passou a mostrar a copia congelada, que termina em jun/26 -- dois meses
 * atras do que o banco tinha. Nada avisou. O sintoma que chegou ate mim foi
 * "por que em cima ainda aparece junho?", e dali ate a causa foram quatro
 * consultas.
 *
 * Uma queda silenciosa nao e um plano B: e um jeito de o painel envelhecer sem
 * ninguem perceber. Esta funcao existe para a tela poder dizer em que pe esta.
 */
export type FonteSerie = 'oficial' | 'congelada' | 'vazia';

export interface DiagnosticoSerie {
  fonte: FonteSerie;
  /** Ultimo mes disponivel na serie que esta sendo exibida, AAAA-MM. */
  ultimoMes: string | null;
  /** Quantas linhas da oficial chegaram. Zero e o caso que dispara a queda. */
  linhasOficial: number;
}

export function diagnosticarSerie(rows: MonthlyMetricRow[]): DiagnosticoSerie {
  const mes = (r: MonthlyMetricRow) => String(r.month).slice(0, 7);
  const oficiais = rows.filter((r) => r.source === OFFICIAL);
  const usadas = oficiais.length ? oficiais : rows.filter((r) => r.source === FALLBACK);
  const ultimoMes = usadas.length
    ? usadas.map(mes).sort().at(-1) ?? null
    : null;
  return {
    fonte: oficiais.length ? 'oficial' : usadas.length ? 'congelada' : 'vazia',
    ultimoMes,
    linhasOficial: oficiais.length,
  };
}

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
