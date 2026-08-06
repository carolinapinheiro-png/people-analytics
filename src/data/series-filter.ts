import type { MonthRecord } from './raw-data';
import type { LeaverRecord } from './leaver-types';

/**
 * Filtro de UMA dimensão sobre a série mensal (nível, tempo de casa, vínculo).
 *
 * ------------------------------------------------------------------
 * POR QUE ISTO NÃO É O MESMO QUE O FILTRO DE DEPARTAMENTO
 * ------------------------------------------------------------------
 * O filtro de departamento tem `dept_breakdown`: a quebra EXATA de todas as
 * dimensões por área, calculada pelo mesmo agregador que produz os totais.
 * Filtrar por TECHNOLOGY devolve o gênero real de TECHNOLOGY.
 *
 * Para nível, tempo de casa e vínculo não existe nada equivalente. A série
 * guarda `level_base` e `tenure_base`, que são a CONTAGEM por faixa -- não a
 * quebra das outras dimensões dentro da faixa. Sabemos quantas pessoas são L4
 * em cada mês; não sabemos o gênero, a raça ou o salário médio dos L4.
 *
 * A tentação seria ratear: "L4 é 20% do quadro, então o gênero de L4 é 20% do
 * gênero da empresa". Isso é fabricação. Produz um número com aparência de
 * precisão que ninguém consegue auditar, e é exatamente o tipo de coisa que,
 * descoberta seis meses depois, derruba a confiança no painel inteiro.
 *
 * Então a regra aqui é: devolve o que é EXATO e declara o resto como
 * indisponível. Quem consome precisa suprimir o indisponível, não desenhar zero.
 *
 * ------------------------------------------------------------------
 * O QUE É EXATO
 * ------------------------------------------------------------------
 *  - headcount → lido direto de level_base / tenure_base / contract_mix
 *  - leavers   → contados da tabela `leavers`, que é por pessoa e tem a data
 *                do desligamento junto com nível, vínculo e faixa
 *  - atrição   → os dois acima, então também é exata
 *
 * O QUE NÃO É (e por isso sai como indisponível): entradas, gênero, liderança,
 * promoções, salários, demográficos e raça.
 */

/**
 * `tipoContrato` foi REMOVIDO deste recorte. A contagem por vinculo vive em
 * `contract_mix_monthly`, uma tabela separada que a serie do contexto nao
 * carrega -- e que tambem nao tem quebra por departamento. Enquanto estava
 * aqui, o headcount vinha sempre 0 e a tela mostrava "0 pessoas, 21 saidas,
 * 0% de atricao", que e pior que nao oferecer o recorte.
 */
export type SeriesFilterKey = 'level' | 'tempoCasa';

/** Métricas que sobrevivem a um recorte de dimensão única. */
export const METRICAS_EXATAS = ['headcount', 'leavers', 'attrition_rate'] as const;

export interface SeriesFilterResult {
  months: MonthRecord[];
  /**
   * true quando o recorte NAO pode ser combinado com o departamento escolhido.
   * Acontece quando o filtro de area caiu no rateio proporcional (marca
   * Combinada, por exemplo): ali level_base/tenure_base continuam sendo os da
   * empresa, entao o headcount seria da empresa e as saidas do departamento.
   */
  unreliable: boolean;
  /** true quando algum recorte de dimensão está ativo. */
  active: boolean;
  /** Rótulo para a tela ("Nível: L4"). */
  label: string | null;
  /** Nomes amigáveis do que NÃO pode ser mostrado sob este recorte. */
  suppressed: string[];
}

const SUPRIMIDO = [
  'entradas',
  'gênero e DEI',
  'liderança',
  'promoções',
  'salários',
  'demográficos',
];

/**
 * Mapeia a faixa de tempo de casa da série (chaves do tenure_base, ex.: "1-2a")
 * para o rótulo do seletor (ex.: "1-2 anos"). São vocabulários diferentes que
 * descrevem a mesma coisa -- unificar na origem seria melhor, mas mudaria dado
 * já validado, então a tradução vive aqui, isolada.
 */
const TENURE_LABEL_TO_KEY: Record<string, string> = {
  '0-3 meses': '0-3m',
  '3-6 meses': '3-6m',
  '6-12 meses': '6-12m',
  '1-2 anos': '1-2a',
  '2-5 anos': '2-5a',
  '5+ anos': '5a+',
};

/** Faixa de tempo de casa de um desligado, a partir dos dias de casa. */
function tenureBucketFromDays(dias: number): string {
  const meses = dias / 30.44;
  if (meses < 3) return '0-3m';
  if (meses < 6) return '3-6m';
  if (meses < 12) return '6-12m';
  if (meses < 24) return '1-2a';
  if (meses < 60) return '2-5a';
  return '5a+';
}

const norm = (v: string | null | undefined) => (v ?? '').trim();

export function applySeriesFilter(
  months: MonthRecord[],
  leavers: LeaverRecord[],
  key: SeriesFilterKey | null,
  value: string | null,
  /** Departamento ativo, para contar as saidas dentro dele. Sem isto, o
   *  numerador vinha da empresa toda e o denominador do departamento. */
  department?: string | null,
): SeriesFilterResult {
  if (!key || !value || value === 'Todos') {
    return { months, active: false, label: null, suppressed: [], unreliable: false };
  }

  // Se ha departamento selecionado, o recorte so e confiavel quando o filtro de
  // area usou a quebra exata. Caso contrario headcount e saidas viriam de
  // populacoes diferentes -- e a atricao entre elas seria um numero inventado.
  const unreliable = !!department && months.some((m) => m.dept_filter_exact === false);

  const labelPrefix = key === 'level' ? 'Nível' : 'Tempo de casa';
  const dept = department && department !== 'Todos' ? department.trim().toUpperCase() : null;

  // Contagem de saídas por mês dentro do recorte. Person-level, então exata.
  const saidasPorMes = new Map<string, number>();
  for (const l of leavers) {
    const ym = (l.data_desligamento ?? '').slice(0, 7);
    if (!ym) continue;
    // Mesma populacao do headcount: se ha departamento, a saida tem que ser dele.
    if (dept && norm(l.departamento).toUpperCase() !== dept) continue;
    let bate = false;
    if (key === 'level') bate = norm(l.level) === norm(value);
    else if (key === 'tempoCasa') {
      const alvo = TENURE_LABEL_TO_KEY[value] ?? value;
      bate = tenureBucketFromDays(l.tempo_casa_dias ?? 0) === alvo;
    }
    if (bate) saidasPorMes.set(ym, (saidasPorMes.get(ym) ?? 0) + 1);
  }

  const out = months.map((m): MonthRecord => {
    let hc = 0;
    hc =
      key === 'level'
        ? (m.level_base?.[value] ?? 0)
        : (m.tenure_base?.[TENURE_LABEL_TO_KEY[value] ?? value] ?? 0);
    const saidas = saidasPorMes.get(m.month) ?? 0;

    return {
      ...m,
      headcount: hc,
      leavers: saidas,
      attrition_rate: hc > 0 ? Math.round((saidas / hc) * 1000) / 10 : 0,
      // Zerar seria mentira; o consumidor precisa saber que não há valor.
      // Undefined obriga quem desenha a tratar o caso -- zero passaria batido.
      joiners: 0,
      gender_female: 0,
      gender_male: 0,
      leaders: 0,
      promotions: 0,
      level_base: undefined,
      tenure_base: undefined,
      demographics: undefined,
      race_cross: undefined,
      dept_breakdown: undefined,
      leader_dept: undefined,
      raise_events: undefined,
    };
  });

  return {
    months: out,
    active: true,
    label: `${labelPrefix}: ${value}`,
    suppressed: SUPRIMIDO,
    unreliable,
  };
}
