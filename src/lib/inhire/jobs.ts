/**
 * Transforma vagas do InHire nas linhas que o painel de recrutamento lê.
 *
 * Módulo PURO: recebe o JSON já baixado e devolve as linhas agregadas. Não faz
 * rede e não fala com banco, para que as três armadilhas abaixo -- todas
 * descobertas na validação de 04/08/2026 e todas silenciosas -- possam ser
 * testadas sem credencial nenhuma.
 *
 * ------------------------------------------------------------------
 * ARMADILHA 1: O TALENT POOL CONTAMINA TUDO
 * ------------------------------------------------------------------
 * Uma única vaga -- "Talent Pool - Agente de Suporte ao Cliente Bilíngue" --
 * tem 299 posições abertas, 86% de todas as posições da base. Sem excluí-la, o
 * painel anuncia 346 posições abertas quando o número real é 47.
 *
 * E a flag não resolve: `isTalentPool` está `false` justamente nessa vaga.
 * Marca só 4 vagas, e nenhuma delas tem posição. Por isso o filtro combina três
 * sinais -- flag, departamento e nome -- em vez de confiar num só.
 *
 * ------------------------------------------------------------------
 * ARMADILHA 2: OS NOMES DE DEPARTAMENTO NÃO BATEM
 * ------------------------------------------------------------------
 * "Tecnologia" contra "TECHNOLOGY", "RH" contra "HR", e "Operation" e
 * "Operations" convivendo na mesma base. Sem de-para, a mesma área aparece
 * partida em duas linhas do gráfico, cada uma com metade do volume.
 *
 * "Betfair" aparece como departamento e NÃO é -- é marca, e atravessa todas as
 * áreas. Entra como null, não como uma área a mais.
 *
 * ------------------------------------------------------------------
 * ARMADILHA 3: A API REST NÃO TEM HISTÓRICO DE STATUS
 * ------------------------------------------------------------------
 * Descoberto na primeira execução real, em 11/08/2026, contra a base de vocês:
 * NENHUMA das 159 vagas veio com `statusHistory`. Não é lacuna de cadastro --
 * o campo simplesmente não existe na API REST, nem na listagem nem no detalhe
 * (conferido no schema de `GET /jobs/:id`).
 *
 * A consequência é séria e precisa estar clara: **o tempo de fechamento com
 * desconto de congelamento não é calculável por esta via**. A regra de negócio
 * de vocês manda descontar períodos congelados; sem histórico, não há como
 * saber quando a vaga congelou.
 *
 * O que existe é `updatedAt`. Numa vaga fechada ele é, na prática, a data em
 * que ela foi fechada -- aproximação boa o suficiente para saber em QUE MÊS
 * fechou, que é o que a série mensal precisa.
 *
 * Por isso: o volume mensal é publicado (é exato), e o TTH fica NULO. Publicar
 * um tempo sem o desconto daria um número sistematicamente MAIOR que o que o
 * InHire mostra na tela dele -- e dois painéis com tempos diferentes para a
 * mesma vaga é pior que um painel sem o tempo.
 *
 * Para ter o TTH de volta há dois caminhos, e os dois são decisão de vocês:
 * usar a camada analítica (o MCP tem `statusHistory` completo), ou pedir ao
 * InHire um endpoint de histórico.
 */

export interface InhireJob {
  id: string;
  name?: string | null;
  status?: string | null;
  createdAt?: string | null;
  /** Última alteração. Numa vaga fechada, é na prática a data do fechamento. */
  updatedAt?: string | null;
  openPositions?: number | null;
  applications?: number | null;
  talentsCount?: number | null;
  activeTalents?: number | null;
  isTalentPool?: boolean | null;
  /** Área customizada do ATS. Alternativa ao custom field de departamento. */
  areaATS?: string | null;
  /**
   * A API REST devolve os campos personalizados como ARRAY de objetos; a
   * camada analítica (MCP/ClickHouse) devolve como MAPA em `customFields_map`.
   * Os dois formatos são aceitos porque as duas fontes convivem hoje.
   */
  customFields?: Array<{ name?: string | null; label?: string | null; value?: unknown }> | null;
  customFields_map?: Record<string, string | null> | null;
  /**
   * Histórico de status. NÃO existe na API REST -- só na camada analítica
   * (MCP/ClickHouse). Continua tipado porque o agregador serve às duas fontes,
   * e é dele que sai o desconto de congelamento quando ele existe.
   */
  statusHistory?: Array<{ status?: string | null; createdAt?: string | null }> | null;
  /** Tempo já calculado pelo InHire. Veio vazio em 156 de 156 vagas. */
  sla?: number | null;
}

/** De-para InHire → canônico do dashboard. Ver docs/inhire-regras-de-negocio.md. */
const DEPT_CANON: Record<string, string> = {
  tecnologia: 'TECHNOLOGY', technology: 'TECHNOLOGY',
  rh: 'HR', 'recursos humanos': 'HR', 'human resources': 'HR',
  operation: 'OPERATION', operations: 'OPERATION', 'customer ops': 'OPERATION',
  'customer operations': 'OPERATION', atendimento: 'OPERATION',
  marketing: 'MARKETING',
  product: 'PRODUCT', produto: 'PRODUCT',
  commercial: 'COMMERCIAL', comercial: 'COMMERCIAL',
  finance: 'FINANCE', financeiro: 'FINANCE',
  'legal & compliance': 'LEGAL & COMPLIANCE', legal: 'LEGAL & COMPLIANCE',
  'legal e compliance': 'LEGAL & COMPLIANCE',
};

/** Valores que aparecem no campo de departamento mas não são departamento. */
const NAO_DEPARTAMENTO = new Set([
  'betfair', 'n/a - talent pool', 'n/a - talent pool ou template', 'template',
]);

const limpa = (v: string | null | undefined) =>
  (v ?? '').replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();

export function canonDept(v: string | null | undefined): string | null {
  const s = limpa(v);
  if (!s) return null;
  const k = s.toLowerCase();
  if (NAO_DEPARTAMENTO.has(k)) return null;
  return DEPT_CANON[k] ?? s.toUpperCase();
}

/**
 * Departamento da vaga, procurado em três lugares na ordem de confiabilidade.
 *
 * 1. `customFields_map['Departamento']` -- formato da camada analítica.
 * 2. `customFields` como array -- formato da API REST. É o que vale hoje.
 * 3. `areaATS` -- área customizada do ATS, último recurso.
 *
 * O campo `area` da API NÃO entra: é um enum fixo do produto (engineering,
 * product, sales...), não o departamento que vocês usam. Cairia num de-para
 * plausível e errado.
 */
export function deptOf(job: InhireJob): string | null {
  const doMapa = job.customFields_map?.['Departamento'];
  if (limpa(doMapa)) return canonDept(doMapa);

  for (const cf of job.customFields ?? []) {
    const nome = limpa(cf?.name ?? cf?.label).toLowerCase();
    if (nome === 'departamento' || nome === 'department') {
      const v = typeof cf?.value === 'string' ? cf.value
        : cf?.value != null && typeof cf.value === 'object'
          ? limpa((cf.value as { value?: string; name?: string }).value ?? (cf.value as { name?: string }).name)
          : null;
      if (limpa(v)) return canonDept(v);
    }
  }

  return canonDept(job.areaATS);
}

/**
 * A vaga é talent pool?
 *
 * Três sinais, porque nenhum sozinho basta: a flag erra na vaga que mais
 * distorce o número, o departamento é a marcação mais confiável, e o nome pega
 * as que escaparam das duas.
 */
export function isTalentPool(job: InhireJob): boolean {
  if (job.isTalentPool === true) return true;
  // Departamento em qualquer um dos dois formatos, já que a marcação de talent
  // pool vive nele e as duas fontes convivem.
  const cru = job.customFields_map?.['Departamento']
    ?? (job.customFields ?? []).find((c) => limpa(c?.name ?? c?.label).toLowerCase().startsWith('depart'))?.value;
  const dept = limpa(typeof cru === 'string' ? cru : null).toLowerCase();
  if (dept.includes('talent pool')) return true;
  return limpa(job.name).toLowerCase().includes('talent pool');
}

const norm = (v: string | null | undefined) => limpa(v).toLowerCase();

const ABERTA = new Set(['open', 'aberta', 'ativa', 'active', 'publicada', 'published']);
const FECHADA = new Set(['closed', 'fechada', 'concluida', 'concluída', 'finalizada', 'hired']);
const CONGELADA = new Set(['frozen', 'congelada', 'on hold', 'paused', 'pausada']);
const CANCELADA = new Set(['canceled', 'cancelled', 'cancelada', 'arquivada', 'archived']);

export type StatusBucket = 'aberta' | 'fechada' | 'congelada' | 'cancelada' | 'outro';

export function statusBucket(status: string | null | undefined): StatusBucket {
  const s = norm(status);
  if (ABERTA.has(s)) return 'aberta';
  if (FECHADA.has(s)) return 'fechada';
  if (CONGELADA.has(s)) return 'congelada';
  if (CANCELADA.has(s)) return 'cancelada';
  return 'outro';
}

/**
 * Dias entre a abertura e o fechamento, descontando o tempo congelado.
 *
 * A regra de negócio do InHire manda excluir períodos congelados e cancelados
 * do tempo de fechamento -- uma vaga parada três meses por decisão orçamentária
 * não deve aparecer como recrutamento lento. Sem o desconto, o nosso TTH fica
 * sistematicamente MAIOR que o que o InHire mostra na tela, e a primeira
 * reunião que comparar os dois vira uma discussão sobre qual painel está errado.
 *
 * Devolve null quando não dá para calcular, nunca zero: zero dias seria lido
 * como fechamento no mesmo dia.
 */
export function tempoDeFechamento(job: InhireJob): { dias: number | null; fechadaEm: string | null } {
  // SEM HISTÓRICO: a API REST não expõe `statusHistory`. Dá para saber em que
  // mês a vaga fechou (via `updatedAt`), mas não por quanto tempo ela ficou
  // congelada -- e sem isso o tempo sairia maior que o do InHire.
  //
  // Devolver o mês e NÃO devolver os dias é a escolha certa aqui: o volume
  // mensal fica exato e o tempo fica visivelmente ausente, em vez de presente
  // e errado.
  if (!(job.statusHistory ?? []).length) {
    if (statusBucket(job.status) !== 'fechada') return { dias: null, fechadaEm: null };
    const quando = job.updatedAt ?? job.createdAt;
    const t = quando ? new Date(quando).getTime() : NaN;
    if (!Number.isFinite(t)) return { dias: null, fechadaEm: null };
    return { dias: null, fechadaEm: new Date(t).toISOString().slice(0, 10) };
  }

  const hist = (job.statusHistory ?? [])
    .filter((h) => h?.createdAt)
    .map((h) => ({ status: statusBucket(h.status), em: new Date(h.createdAt as string).getTime() }))
    .filter((h) => Number.isFinite(h.em))
    .sort((a, b) => a.em - b.em);

  if (!hist.length) return { dias: null, fechadaEm: null };

  const fecho = [...hist].reverse().find((h) => h.status === 'fechada');
  if (!fecho) return { dias: null, fechadaEm: null };

  const inicio = job.createdAt ? new Date(job.createdAt).getTime() : hist[0].em;
  if (!Number.isFinite(inicio) || fecho.em <= inicio) return { dias: null, fechadaEm: null };

  // Soma dos intervalos em que a vaga esteve congelada ou cancelada, entre a
  // abertura e o fechamento. Cada entrada do histórico vale até a seguinte.
  let congelado = 0;
  for (let i = 0; i < hist.length; i++) {
    const h = hist[i];
    if (h.status !== 'congelada' && h.status !== 'cancelada') continue;
    const fim = hist[i + 1]?.em ?? fecho.em;
    const de = Math.max(h.em, inicio);
    const ate = Math.min(fim, fecho.em);
    if (ate > de) congelado += ate - de;
  }

  const liquido = fecho.em - inicio - congelado;
  if (liquido <= 0) return { dias: null, fechadaEm: new Date(fecho.em).toISOString().slice(0, 10) };
  return {
    dias: Math.round(liquido / 86_400_000),
    fechadaEm: new Date(fecho.em).toISOString().slice(0, 10),
  };
}

export interface MonthlyRow {
  month: string;
  department: string;
  closed_jobs: number;
  tth_avg: number | null;
  tth_median: number | null;
  applications: number;
}

export interface OpenRow {
  as_of: string;
  department: string;
  status: string;
  jobs: number;
  positions: number;
  applications: number;
  avg_age_days: number | null;
}

export interface AggregateResult {
  monthly: MonthlyRow[];
  open: OpenRow[];
  /** Contagens para conferir a carga antes de gravar. */
  resumo: {
    vagasRecebidas: number;
    talentPoolExcluidas: number;
    semDepartamento: number;
    fechadasComTempo: number;
    fechadasSemTempo: number;
  };
}

function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
}

/**
 * @param jobs  vagas vindas da API
 * @param asOf  data da foto, AAAA-MM-DD. As vagas abertas são um retrato do
 *              instante -- `openPositions` é quantas estão abertas AGORA, não
 *              quantas abriram no período. Sem a data na linha, uma foto nova
 *              sobrescreveria a antiga e a série histórica de abertas nunca
 *              existiria.
 */
export function aggregateJobs(jobs: InhireJob[], asOf: string): AggregateResult {
  const reais = jobs.filter((j) => !isTalentPool(j));
  const resumo = {
    vagasRecebidas: jobs.length,
    talentPoolExcluidas: jobs.length - reais.length,
    semDepartamento: 0,
    fechadasComTempo: 0,
    fechadasSemTempo: 0,
  };

  const porMes = new Map<string, { fechadas: number; tempos: number[]; candidaturas: number }>();
  const porAberta = new Map<string, { jobs: number; positions: number; applications: number; idades: number[] }>();
  const agora = Date.now();

  for (const j of reais) {
    // Departamento ausente vira "SEM DEPTO", igual ao resto do painel: some da
    // tela seria pior, porque some junto com o problema de cadastro que a
    // ausência representa.
    const dept = deptOf(j) ?? 'SEM DEPTO';
    if (deptOf(j) == null) resumo.semDepartamento++;
    const bucket = statusBucket(j.status);
    const candidaturas = Number(j.applications ?? 0) || 0;

    if (bucket === 'fechada') {
      const { dias, fechadaEm } = tempoDeFechamento(j);
      if (fechadaEm) {
        const mes = fechadaEm.slice(0, 7);
        const k = `${mes}|${dept}`;
        const cur = porMes.get(k) ?? { fechadas: 0, tempos: [], candidaturas: 0 };
        cur.fechadas++;
        cur.candidaturas += candidaturas;
        if (dias != null) { cur.tempos.push(dias); resumo.fechadasComTempo++; }
        else resumo.fechadasSemTempo++;
        porMes.set(k, cur);
      } else {
        resumo.fechadasSemTempo++;
      }
      continue;
    }

    if (bucket === 'aberta' || bucket === 'congelada') {
      const k = `${dept}|${bucket}`;
      const cur = porAberta.get(k) ?? { jobs: 0, positions: 0, applications: 0, idades: [] };
      cur.jobs++;
      cur.positions += Number(j.openPositions ?? 0) || 0;
      cur.applications += candidaturas;
      if (j.createdAt) {
        const idade = (agora - new Date(j.createdAt).getTime()) / 86_400_000;
        if (Number.isFinite(idade) && idade >= 0) cur.idades.push(idade);
      }
      porAberta.set(k, cur);
    }
  }

  const monthly: MonthlyRow[] = [...porMes.entries()].map(([k, v]) => {
    const [month, department] = k.split('|');
    return {
      month: `${month}-01`,
      department,
      closed_jobs: v.fechadas,
      tth_avg: v.tempos.length
        ? Math.round((v.tempos.reduce((a, b) => a + b, 0) / v.tempos.length) * 10) / 10
        : null,
      tth_median: mediana(v.tempos),
      applications: v.candidaturas,
    };
  }).sort((a, b) => a.month.localeCompare(b.month) || a.department.localeCompare(b.department));

  const open: OpenRow[] = [...porAberta.entries()].map(([k, v]) => {
    const [department, status] = k.split('|');
    return {
      as_of: asOf,
      department,
      status,
      jobs: v.jobs,
      positions: v.positions,
      applications: v.applications,
      avg_age_days: v.idades.length
        ? Math.round((v.idades.reduce((a, b) => a + b, 0) / v.idades.length) * 10) / 10
        : null,
    };
  }).sort((a, b) => a.department.localeCompare(b.department) || a.status.localeCompare(b.status));

  return { monthly, open, resumo };
}
