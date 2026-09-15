/**
 * O PERÍODO EM ESCOPO -- ANO + VISÃO + MÊS, RESOLVIDOS UMA VEZ SÓ.
 *
 * ===========================================================================
 * POR QUE ISTO EXISTE
 * ===========================================================================
 * Os três filtros globais do topo (ano, visão mensal/trimestral e mês) sempre
 * recortaram a SÉRIE do contexto -- `currentData`, `prevData` e
 * `allMonthsData` já saem recortados de lá. O que não existia era uma forma de
 * qualquer outra fonte de dado responder aos mesmos três.
 *
 * O resultado, medido em 15/09: a aba de Desligamentos filtrava a lista SÓ por
 * ano (`mes_desligamento.startsWith(activeYear)`), então escolher "julho" no
 * topo mudava os cartões da série ao lado de uma lista com o ano inteiro --
 * duas populações na mesma tela. Recrutamento agregava a série mensal inteira,
 * ignorando ano e mês. E Span, Meu Time e Perfil leem fotos do presente que
 * não têm mês nenhum guardado, e não diziam isso em lugar algum.
 *
 * Aqui mora a régua, uma vez: quais meses estão em escopo agora. Quem tem o
 * mês no dado usa `contem`/`ateOFim` e passa a recortar de verdade. Quem NÃO
 * tem histórico declara isso em `PERIODO_INDISPONIVEL` e a tela diz a frase --
 * nunca finge recortar.
 */

export type VisaoPeriodo = 'monthly' | 'quarterly';

export type TipoPeriodo = 'mes' | 'trimestre' | 'todos';

export interface Periodo {
  tipo: TipoPeriodo;
  /** Meses em escopo, 'AAAA-MM'. Vazio quando `tipo === 'todos'`. */
  meses: string[];
  /** Primeiro e último mês do escopo (null em 'todos'). */
  inicio: string | null;
  fim: string | null;
  /** Rótulo curto para subtítulo de cartão ("jul/2026", "2026 Q3", "todos os anos"). */
  label: string;
  /** O mês (ou data) cai DENTRO do período? Aceita 'AAAA-MM' e 'AAAA-MM-DD'. */
  contem: (ym: string | null | undefined) => boolean;
  /**
   * O mês é anterior ou igual ao fim do período (e do mesmo ano, quando há ano
   * em escopo)? É a régua das SÉRIES: um gráfico de tendência recortado a um
   * único mês deixa de ser gráfico. Ele mostra a história até o mês escolhido,
   * que é o que "estou olhando julho" quer dizer numa linha do tempo.
   */
  ateOFim: (ym: string | null | undefined) => boolean;
}

const MES_LABEL = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

const ym = (v: string | null | undefined) => (v ? String(v).slice(0, 7) : '');

/** Os três meses do trimestre que contém `mes`. */
export function trimestreDe(mes: string): string[] {
  const [ano, m] = ym(mes).split('-').map(Number);
  if (!ano || !m) return [];
  const inicio = Math.floor((m - 1) / 3) * 3 + 1;
  return [0, 1, 2].map((i) => `${ano}-${String(inicio + i).padStart(2, '0')}`);
}

/** '2026-08' -> '2026 Q3'. */
export function rotuloTrimestre(mes: string): string {
  const [ano, m] = ym(mes).split('-').map(Number);
  if (!ano || !m) return '';
  return `${ano} Q${Math.ceil(m / 3)}`;
}

/** '2026-08' -> 'ago/2026'. */
export function rotuloMes(mes: string): string {
  const [ano, m] = ym(mes).split('-').map(Number);
  if (!ano || !m) return '';
  return `${MES_LABEL[m - 1]}/${ano}`;
}

export function resolverPeriodo(opts: {
  view: VisaoPeriodo;
  currentMonth: string;
  /** null = "Todos os anos" no seletor do topo. */
  activeYear: string | null;
}): Periodo {
  const { view, activeYear } = opts;
  const mes = ym(opts.currentMonth);

  // Sem ano em escopo (ou sem mês resolvido ainda, na primeira renderização),
  // o comportamento é o de hoje: nada é recortado por tempo.
  if (!activeYear || !mes) {
    return {
      tipo: 'todos',
      meses: [],
      inicio: null,
      fim: null,
      label: 'todos os anos',
      contem: () => true,
      ateOFim: () => true,
    };
  }

  const meses = view === 'quarterly' ? trimestreDe(mes) : [mes];
  const dentro = new Set(meses);
  const inicio = meses[0] ?? mes;
  const fim = meses[meses.length - 1] ?? mes;

  return {
    tipo: view === 'quarterly' ? 'trimestre' : 'mes',
    meses,
    inicio,
    fim,
    label: view === 'quarterly' ? rotuloTrimestre(mes) : rotuloMes(mes),
    contem: (v) => dentro.has(ym(v)),
    ateOFim: (v) => {
      const k = ym(v);
      if (!k) return false;
      return k.startsWith(activeYear) && k <= fim;
    },
  };
}

/**
 * ===========================================================================
 * ONDE O RECORTE DE PERÍODO NÃO PODE EXISTIR -- E POR QUÊ
 * ===========================================================================
 * Estas abas leem FOTO DO PRESENTE. Não é uma escolha de produto: o dado
 * histórico dessa dimensão não é guardado em lugar nenhum.
 *
 *   span ....... `org_pessoas` guarda a cadeia de reporte ATUAL e é reescrita
 *                por upsert a cada sincronização do Convenia (ninguém apaga
 *                nem versiona linha). Conferido no banco em 15/09: uma única
 *                foto, sem coluna de mês. `span_snapshot`, a tabela mensal
 *                antiga, tem UM mês gravado (jul/2026) e está parada -- foi
 *                exatamente por isso que a aba deixou de lê-la. Reconstruir o
 *                organograma de um mês passado exigiria uma carga nova, com
 *                supervisor por mês (ver a nota no fim deste arquivo).
 *   team ....... `comp_ratio` é a foto de salário/banda do momento da carga
 *                (`atualizado_em`), uma linha por pessoa ativa. Sem versão
 *                mensal.
 *   individual . mesmo dado de `comp_ratio`, pessoa a pessoa.
 *
 * Mostrar o seletor de mês ativo sobre esses números afirmaria uma coisa
 * falsa: que aquele span é o de julho. Então o seletor é DESABILITADO nessas
 * abas, com este motivo no hover, e a própria aba repete a frase em tela.
 */
export const PERIODO_INDISPONIVEL: Record<string, string> = {
  span: 'A cadeia de reporte (Convenia) é guardada só na versão atual — não existe organograma de meses passados, então mês, trimestre e ano não recortam esta aba.',
  team: 'Salário, banda e comp ratio são a foto da última sincronização — a base não guarda versão mensal, então mês, trimestre e ano não recortam esta aba.',
  individual: 'O perfil individual sai da foto atual de cadastro e salário — não há versão mensal, então mês, trimestre e ano não recortam esta aba.',
};

/** A aba responde aos filtros de mês/trimestre/ano? */
export function periodoAplicavel(tab: string): boolean {
  return !(tab in PERIODO_INDISPONIVEL);
}

/**
 * Motivos de recorte parcial: a aba responde ao período na maior parte, mas um
 * cartão específico é foto do presente. A frase fica junto do cartão.
 */
export const CARTAO_SEM_PERIODO = {
  compRatio:
    'Foto da última sincronização de salários: a base guarda uma linha por pessoa ativa hoje, sem versão mensal — este quadro não muda com mês, trimestre ou ano.',
  bandas:
    'Faixas e bandas saem da foto atual de salários (sem histórico mensal) — este quadro não muda com mês, trimestre ou ano.',
  modeloTrabalho:
    'Modelo de trabalho tem uma única foto gravada (jul/2026) — não há série mensal, então este quadro não muda com mês, trimestre ou ano.',
  vagasAbertas:
    'Vagas abertas é a foto do dia da última carga do Inhire — não há histórico de aberturas por mês, então este quadro não muda com mês, trimestre ou ano.',
} as const;

/**
 * ===========================================================================
 * O QUE FALTARIA PARA O SPAN (E O MEU TIME) VIRAREM HISTÓRICOS
 * ===========================================================================
 * Uma tabela nova, de fato mensal, gravada pela sincronização -- algo como
 * `org_pessoas_mensal (mes, convenia_id, supervisor_id, department)`, com
 * gravação idempotente por (mes, convenia_id). A partir da primeira gravação
 * o span passaria a ser calculável por mês; para trás não há como: o dado do
 * passado nunca foi guardado, e não existe fonte para reconstruí-lo.
 *
 * Isso é uma migração + mudança de carga, não um ajuste de tela -- por isso
 * não foi feito junto com este recorte.
 */
