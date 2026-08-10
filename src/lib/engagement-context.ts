/**
 * Cruzamento entre a pesquisa de engajamento e o que de fato aconteceu depois.
 *
 * ------------------------------------------------------------------
 * A PERGUNTA QUE ISTO RESPONDE
 * ------------------------------------------------------------------
 * A pesquisa de jan/2026 mediu, por área, quanta gente declarou intenção de
 * sair ("risco de retenção"). Os seis meses seguintes já passaram e a base de
 * desligados sabe quem realmente saiu. Dá para confrontar os dois: a pesquisa
 * antecipou as perdas, ou foi só termômetro de humor?
 *
 * Essa é a única análise deste painel em que a pesquisa deixa de ser opinião e
 * passa a ser testada contra fato. Vale a pena fazer certo.
 *
 * ------------------------------------------------------------------
 * TRÊS DECISÕES QUE MUDAM O NÚMERO -- e por que cada uma foi tomada assim
 * ------------------------------------------------------------------
 *
 * 1. SÓ SAÍDA VOLUNTÁRIA ENTRA NO CONFRONTO.
 *    O risco de retenção mede intenção de PEDIR demissão. Contra ele só faz
 *    sentido colocar quem pediu. Incluir demissão pela empresa mediria a
 *    decisão do gestor, não a do time -- e uma área que passou por corte
 *    apareceria como "a pesquisa acertou" sem que a pesquisa tenha acertado
 *    nada. O total também é devolvido, mas separado, para contexto.
 *
 * 2. DENOMINADOR É O HEADCOUNT MÉDIO DA JANELA, não o do mês da pesquisa.
 *    Mesma definição do resto do dashboard (ver SeriesCutView). Áreas que
 *    cresceram muito no período teriam a atrição inflada se o denominador
 *    ficasse congelado em janeiro.
 *
 * 3. A TAXA É ANUALIZADA.
 *    Seis meses de saídas sobre o quadro médio dá meia-taxa. Anualizar deixa o
 *    número comparável com a atrição que aparece no resto do painel, que é
 *    anual. O fator fica explícito em `mesesObservados` para quem quiser
 *    desfazer a conta.
 *
 * ------------------------------------------------------------------
 * LIMITE CONHECIDO -- LER ANTES DE APRESENTAR
 * ------------------------------------------------------------------
 * São 8 áreas. Oito pontos não sustentam correlação: ver o veredito em
 * stats.ts, que devolve "insuficiente" em quase todo cenário realista aqui.
 * O gráfico existe para levantar hipótese e provocar a conversa com o gestor,
 * não para fechar diagnóstico. A tela precisa dizer isso, não só este comentário.
 */

export interface EngagementScoreLike {
  scope: string;
  enps: number | null;
  enps_delta: number | null;
  retention_risk: number | null;
  satisfaction: number | null;
  participation: number | null;
  status: string | null;
  /**
   * Diferenca de eNPS para a Flutter International, transcrita do deck de
   * jan/2026. INFORMADA, nao calculada: nao temos a base da entidade global.
   * Por isso nao se atualiza sozinha e nao vale para as proximas ondas -- a
   * tela precisa dizer isso, senao o numero envelhece parecendo vivo.
   */
  gap_ent_enps?: number | null;
}

export interface LeaverLike {
  departamento: string | null;
  data_desligamento: string | null;
  tipo_desligamento_agrupado: string | null;
}

/**
 * De-para entre o nome da área na pesquisa e o departamento do dashboard.
 *
 * Confirmado com a Carolina em 10/08/2026. Sem isto o cruzamento junta
 * populações erradas em silêncio -- "Customer Service" simplesmente não daria
 * match com nenhum departamento e a área sumiria do gráfico sem aviso, que é a
 * pior falha possível aqui: um resultado plausível e incompleto.
 *
 * `Betfair` é MARCA, não departamento, e por isso não entra. A linha continua
 * aparecendo nas visões que não dependem de cruzamento (matriz, slope).
 */
export const SCOPE_TO_DEPT: Record<string, string> = {
  'customer service': 'OPERATION',
  'human resources': 'HR',
  legal: 'LEGAL & COMPLIANCE',
  technology: 'TECHNOLOGY',
  marketing: 'MARKETING',
  commercial: 'COMMERCIAL',
  finance: 'FINANCE',
  product: 'PRODUCT',
};

/** Scopes que existem na pesquisa mas não são departamento. */
export const SCOPES_NAO_DEPARTAMENTO = new Set(['company', 'betfair']);

export function deptForScope(scope: string): string | null {
  const k = (scope ?? '').trim().toLowerCase();
  if (SCOPES_NAO_DEPARTAMENTO.has(k)) return null;
  return SCOPE_TO_DEPT[k] ?? null;
}

export interface EngagementContextRow {
  /** Nome da área como aparece na pesquisa. */
  scope: string;
  /** Departamento correspondente no dashboard, ou null se não houver. */
  dept: string | null;
  enps: number | null;
  /** eNPS da onda anterior, reconstruído de enps - delta. null se não havia. */
  enpsPrev: number | null;
  retentionRisk: number | null;
  satisfaction: number | null;
  status: string | null;
  /** Diferenca de eNPS para a Flutter International. Informada no deck, nao recalculavel. */
  gapEntEnps: number | null;
  /** Headcount médio da janela observada. null quando a área não bate no de-para. */
  headcountMedio: number | null;
  /** Saídas totais na janela (voluntárias + involuntárias + demais). */
  saidasTotais: number | null;
  /** Só quem pediu demissão -- o que se compara com o risco declarado. */
  saidasVoluntarias: number | null;
  /** Taxa anualizada de saída voluntária, em %. null sem denominador. */
  atricaoVoluntariaAnual: number | null;
  /** Taxa anualizada considerando todas as saídas, em %. */
  atricaoTotalAnual: number | null;
}

export interface EngagementContextResult {
  rows: EngagementContextRow[];
  /** Primeiro mês observado, AAAA-MM. */
  janelaInicio: string;
  /** Último mês observado, AAAA-MM. */
  janelaFim: string;
  mesesObservados: number;
  /** Áreas da pesquisa que não encontraram departamento -- exibir, não engolir. */
  semCorrespondencia: string[];
}

const norm = (v: string | null | undefined) => (v ?? '').trim().toUpperCase();

/**
 * @param scores      linhas de engagement_scores (a onda que se quer analisar)
 * @param leavers     base de desligados, já no escopo de quem consulta
 * @param hcPorMesDept headcount por mês e departamento: { '2026-02': { TECHNOLOGY: 210, ... } }
 * @param janela      meses observados, inclusive, no formato AAAA-MM
 */
export function buildEngagementContext(
  scores: EngagementScoreLike[],
  leavers: LeaverLike[],
  hcPorMesDept: Record<string, Record<string, number>>,
  janela: { inicio: string; fim: string },
): EngagementContextResult {
  const meses = Object.keys(hcPorMesDept)
    .filter((m) => m >= janela.inicio && m <= janela.fim)
    .sort();
  const mesesObservados = meses.length;

  // Saídas por departamento dentro da janela. Uma passada só na base.
  const saidas = new Map<string, { total: number; voluntarias: number }>();
  for (const l of leavers) {
    const ym = (l.data_desligamento ?? '').slice(0, 7);
    if (!ym || ym < janela.inicio || ym > janela.fim) continue;
    const d = norm(l.departamento);
    if (!d || d === '-') continue;
    const cur = saidas.get(d) ?? { total: 0, voluntarias: 0 };
    cur.total++;
    if ((l.tipo_desligamento_agrupado ?? '').trim() === 'Voluntário') cur.voluntarias++;
    saidas.set(d, cur);
  }

  // Headcount médio por departamento na janela.
  const hcMedio = new Map<string, number>();
  if (mesesObservados > 0) {
    const soma = new Map<string, number>();
    for (const m of meses) {
      for (const [dept, hc] of Object.entries(hcPorMesDept[m] ?? {})) {
        soma.set(norm(dept), (soma.get(norm(dept)) ?? 0) + hc);
      }
    }
    for (const [dept, s] of soma) hcMedio.set(dept, s / mesesObservados);
  }

  const semCorrespondencia: string[] = [];
  const anualiza = (saidasN: number, hc: number) =>
    hc > 0 && mesesObservados > 0
      ? Math.round((saidasN / hc) * (12 / mesesObservados) * 1000) / 10
      : null;

  const rows: EngagementContextRow[] = scores.map((s) => {
    const dept = deptForScope(s.scope);
    const chave = (s.scope ?? '').trim().toLowerCase();
    if (!dept && !SCOPES_NAO_DEPARTAMENTO.has(chave)) semCorrespondencia.push(s.scope);

    const hc = dept ? (hcMedio.get(dept) ?? null) : null;
    const sd = dept ? saidas.get(dept) : undefined;

    return {
      scope: s.scope,
      dept,
      enps: s.enps,
      // A onda anterior não é guardada; só o delta. Reconstruir é exato quando
      // ambos existem, e null (não zero) quando o delta falta -- caso de área
      // que participou pela primeira vez, como Betfair.
      enpsPrev: s.enps != null && s.enps_delta != null ? s.enps - s.enps_delta : null,
      retentionRisk: s.retention_risk,
      satisfaction: s.satisfaction,
      status: s.status,
      gapEntEnps: s.gap_ent_enps ?? null,
      headcountMedio: hc == null ? null : Math.round(hc),
      saidasTotais: sd?.total ?? (dept ? 0 : null),
      saidasVoluntarias: sd?.voluntarias ?? (dept ? 0 : null),
      atricaoVoluntariaAnual: hc != null ? anualiza(sd?.voluntarias ?? 0, hc) : null,
      atricaoTotalAnual: hc != null ? anualiza(sd?.total ?? 0, hc) : null,
    };
  });

  return {
    rows,
    janelaInicio: janela.inicio,
    janelaFim: janela.fim,
    mesesObservados,
    semCorrespondencia,
  };
}
