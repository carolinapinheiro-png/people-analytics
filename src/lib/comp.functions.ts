import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canSeeIndividualData,
  isInScope,
} from '@/lib/permissions';
import { salaryBand, tenureBandFromHire } from '@/lib/person-bands';
import { valorFiltro } from '@/lib/filtro-sentinela';
import {
  camadaDe, filtrarLinhas, podeVerLinha, temCamadaNosDados, type EscopoComp,
} from '@/lib/comp-scope';
import {
  agruparEquidade, N_MINIMO_EQUIDADE, type CompEquidade,
} from '@/lib/equidade';

/**
 * Acesso ao salario individual + comp ratio dos ativos (587).
 *
 * Mesma protecao dos desligados: a tabela public.comp_ratio NAO tem policy de
 * SELECT -- nem authenticated nem anon a leem. O unico caminho e esta server
 * function, que roda com service_role e REGISTRA cada consulta em
 * comp_ratio_access_log antes de devolver. Decisao da area (27/07):
 * allowed_emails revisado; os 3 autorizados podem ver, e todo acesso e logado.
 *
 * Nunca exporte um cliente Supabase daqui, nem chame a tabela direto do React.
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

/** O que a aba de Salarios recebe: as linhas e o diagnostico do vazio. */
export interface CompRatioLista {
  rows: CompRatioRow[];
  /**
   * false = a coluna `n_layer` esta vazia na base inteira. Sem ela a regra
   * de camadas esconde tudo, corretamente -- e a tela precisa dizer que o
   * motivo e falta de dado, nao falta de gente.
   */
  camadaImportada: boolean;
}

export interface CompRatioRow {
  id: string;
  /** Camada N ("N-1"...). Ver comp-scope.ts: decide quem ve quem. */
  n_layer?: string | null;
  company: string | null;
  name: string;
  level: string | null;
  area: string | null;
  team: string | null;
  job_title: string | null;
  contract: string | null;
  salary: number | null;
  comp_ratio: number | null;
  quartile: string | null;
  hire: string | null;
}

/**
 * Adaptador fino sobre `resolverEscopo`, que e o unico lugar do sistema que
 * decide quem voce e -- e o unico que sabe do "ver como". Antes cada arquivo
 * tinha sua propria copia desta consulta; treze copias, quatro formatos.
 *
 * A aba declarada ('comp') e permissao, nao decoracao: um perfil que nao a
 * enxerga leva 'Forbidden' aqui, e nao so deixa de ver o item no menu.
 */
async function authorize(userEmail: string | undefined) {
  const { resolverEscopo } = await import('@/lib/escopo.server');
  const e = await resolverEscopo(userEmail, 'comp');
  // `podeVerIndividual` ja vem resolvido (flag por usuario quando existe,
  // perfil quando nao existe). Recalcular aqui a partir do perfil ignoraria o
  // flag -- que e exatamente o caso que ele existe para cobrir.
  const { isGlobalProfile } = await import('@/lib/permissions');
  // ------------------------------------------------------------------
  // O RECORTE POR NIVEL, MONTADO UMA VEZ
  // ------------------------------------------------------------------
  // Regra de 14/08/2026: fora de HR Leader e Admin, so aparece remuneracao de
  // quem esta ESTRITAMENTE ABAIXO do nivel de quem olha, e dentro da propria
  // area. Montado aqui, no adaptador, para as quatro funcoes deste arquivo
  // usarem o mesmo objeto -- se cada uma remontasse, uma delas ficaria para
  // tras no proximo ajuste, e a que ficasse para tras vazaria salario.
  const escopoComp: EscopoComp = {
    global: isGlobalProfile(e.profile),
    camada: camadaDe(e.nivel),
    areas: (e.departments ?? []).map((d) => (d ?? '').trim().toUpperCase()).filter(Boolean),
  };
  return {
    email: e.email, role: e.role, scope: e.scope,
    podeVerIndividual: e.podeVerIndividual,
    escopoComp, nivel: e.nivel,
  };
}

const ListInput = z
  .object({
    context: z.string().max(120).optional(),
    // Filtros de tela. Aplicados DEPOIS do escopo de permissao: estreitam o
    // que a pessoa ja pode ver, nunca ampliam (ver dept-filter.ts).
    department: z.string().trim().max(80).optional(),
    level: z.string().trim().max(20).optional(),
    contract: z.string().trim().max(60).optional(),
    jobFamily: z.string().trim().max(120).optional(),
    // Faixas DERIVADAS de salary/hire (person-bands.ts). Nao existem como
    // coluna em comp_ratio; sao calculadas aqui, no servidor, para que o
    // recorte use o mesmo vocabulario dos desligados e da barra de filtros.
    tenureBand: z.string().trim().max(40).optional(),
    salaryBand: z.string().trim().max(40).optional(),
  })
  .optional();


/** 'Todos'/vazio = sem selecao (ver `filtro-sentinela.ts`). */
const sel = valorFiltro;

export const listCompRatio = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ListInput.parse(input))
  .handler(async ({ context, data }): Promise<CompRatioLista> => {
    const { email, scope, podeVerIndividual, escopoComp } = await authorize(context.claims.email as string | undefined);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const { data: rows, error } = await db
      .from('comp_ratio')
      .select('*')
      .order('salary', { ascending: false });
    if (error) throw new Error(`Falha ao carregar comp ratio: ${error.message}`);

    // So a populacao do arquivo de comp (in_comp_scope). Os ativos carregados do
    // historico so para o Perfil Individual (People/diretoria) ficam de fora aqui.
    const fDept = sel(data?.department);
    const fLevel = sel(data?.level);
    const fContract = sel(data?.contract);
    const fFamily = sel(data?.jobFamily);
    const fTenure = sel(data?.tenureBand);
    const fBand = sel(data?.salaryBand);

    const scoped = (rows ?? [])
      .filter((r) => r.in_comp_scope !== false)
      // UMA REGRA DE AREA SO, E E ESTA.
      //
      // Aqui havia tambem um `isInScope(scope, area, job_type_family)`, que e a
      // regra do painel inteiro: departamento OU job family. Somada a esta, a
      // mais estrita vencia -- entao nunca vazou nada. Mas duas regras no mesmo
      // ponto sao duas chances de alguem mexer na errada, e a errada aqui
      // libera salario.
      //
      // A decisao (18/08/2026) e que remuneracao segue DEPARTAMENTO, ponto: e o
      // que a regra escrita diz ("remuneracao de toda a sua area"). Escopo por
      // job family continua valendo em Meu Time, Atricao e Talent Mobility --
      // e nao abre a folha de gente de outro departamento.
      //
      // RECORTE POR NIVEL -- aplicado ANTES de qualquer filtro de tela, e
      // antes de a linha existir na resposta HTTP. Filtrar depois, ou na tela,
      // deixaria o salario no payload: escondido por CSS continua entregue.
      .filter((r) => podeVerLinha(escopoComp, { area: r.area, n_layer: r.n_layer }))
      // Filtros de tela: comp_ratio e person-level, entao aqui TODOS funcionam
      // de verdade -- ao contrario da serie mensal, que so guarda a quebra por
      // departamento.
      .filter((r) => !fDept || (r.area ?? '').trim().toUpperCase() === fDept.toUpperCase())
      .filter((r) => !fLevel || (r.level ?? '').trim() === fLevel)
      .filter((r) => !fContract || (r.contract ?? '').trim() === fContract)
      .filter((r) => !fFamily || (r.job_type_family ?? '').trim() === fFamily)
      // As duas faixas derivadas. Quem nao tem admissao/salario no cadastro cai
      // em 'Não informado' e sai do recorte -- e o comportamento honesto: nao
      // sabemos a faixa dessa pessoa, entao ela nao entra na faixa escolhida.
      .filter((r) => !fTenure || tenureBandFromHire(r.hire) === fTenure)
      .filter(
        (r) => !fBand || salaryBand(r.salary == null ? null : Number(r.salary)) === fBand,
      );

    const visible = podeVerIndividual
      ? scoped
      : scoped.map((r) => ({ ...r, name: 'Confidencial', salary: null }));

    // O aviso de recorte NAO sai daqui: esta funcao devolve um array puro, e
    // pendurar um campo nele mudaria a forma para todos os consumidores. Ele e
    // montado na tela a partir do proprio nivel e das proprias areas, que o
    // `checkAccess` ja devolve -- dado da propria pessoa, sobre a propria
    // pessoa.

    // Log obrigatorio: sem registrar quem viu, nao devolve. Igual aos desligados.
    const { error: logError } = await db.from('comp_ratio_access_log').insert({
      user_email: email,
      rows_returned: visible.length,
      context: data?.context ?? null,
    });
    if (logError) {
      throw new Error(`Falha ao registrar acesso; consulta abortada: ${logError.message}`);
    }

    // Decisao (30/07): o salario individual NAO sai daqui, nem para quem tem
    // acesso no Convenia -- o comp-ratio ja da a leitura relativa sem expor o
    // valor nominal. Fica sempre null; a folha continua disponivel em agregados
    // (getCompAggregates: medias por contrato/nivel/area).
    return {
      rows: visible.map((r) => ({
        ...r,
        salary: null,
        comp_ratio: r.comp_ratio == null ? null : Number(r.comp_ratio),
      })) as CompRatioRow[],
      // Calculado sobre a tabela CRUA, antes de qualquer filtro.
      //
      // A tela nao consegue responder isto sozinha: ela so recebe as linhas
      // que sobraram. Tabela vazia por corte de regra e tabela vazia por
      // camada nao importada sao identicas do lado de la, e pedem acoes
      // opostas -- uma e o sistema funcionando, a outra e uma importacao
      // faltando.
      camadaImportada: temCamadaNosDados((rows ?? []) as Array<{ n_layer?: string | null }>),
    };
  });

/**
 * Agregados de compensacao (CLT/PJ e comp-ratio por area) para a aba
 * Compensacao. Devolve SO somas/contagens por empresa -- nenhuma linha
 * individual, nenhum nome, nenhum salario de pessoa. Por isso nao passa pelo
 * log de acesso individual (o dado devolvido tem a mesma natureza agregada do
 * dept_data que ja alimenta a serie). A empresa vem junto para o cliente
 * filtrar por marca (mesmo de-para do agregador).
 */
export interface CompContractAgg {
  company: string;
  contract: string;
  n: number;
  sal_sum: number;
  sal_n: number;
}
export interface CompAreaAgg {
  company: string;
  area: string;
  n: number;
  cr_sum: number;
  cr_n: number;
}
export interface CompBandAgg {
  company: string;
  band: string;
  n: number;
}
export interface CompLevelAgg {
  company: string;
  level: string;
  n: number;
  cr_sum: number;
  cr_n: number;
  sal_sum: number;
  sal_n: number;
}
export interface CompMedianAgg {
  /** Grupo: marca ('NSX' | 'Betfair BR') ou 'combined'. */
  group: string;
  med_salary: number | null;
  med_cr: number | null;
}

const COMPANY_TO_BRAND: Record<string, string> = {
  'NSX BRASIL RECIFE': 'NSX',
  'NSX BRASIL SÃO PAULO': 'NSX',
  'NSX MARECHAL': 'NSX',
  'NSX BETFAIR BRASIL S.A.': 'Betfair BR',
};
export interface CompAggregates {
  contracts: CompContractAgg[];
  areas: CompAreaAgg[];
  /** Mediana de salario e comp-ratio por empresa (visao mais robusta que a
   *  media para distribuicoes puxadas por poucos C-levels). */
  medians: CompMedianAgg[];
  /** Ativos por faixa salarial (mesmos cortes dos desligados) -> denominador
   *  para a taxa de atricao por faixa. */
  bands: CompBandAgg[];
  /** Por nivel (L0..L9): contagem + somas de comp-ratio e salario. Para as
   *  bandas de comparacao (L0-L2, L3-L4, lideres L4-L5/L6-L7, C-level). */
  levels: CompLevelAgg[];
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * Faixa salarial: os cortes vivem em person-bands.ts, compartilhados com Meu
 * Time e com os rotulos da barra de filtros. Reexportado aqui porque outros
 * pontos deste arquivo (perfil individual, agregado por faixa) ja o usavam.
 */
export { salaryBand };



/**
 * Perfil individual do colaborador (pergunta da Marilia, decisoes 30/07):
 *  - Remuneracao: SO faixa + comp-ratio. Nunca o valor nominal.
 *  - Acesso: todos os usuarios logados (allowed_emails). Ainda assim cada
 *    consulta e REGISTRADA em comp_ratio_access_log -- mesma protecao dos
 *    demais dados individuais.
 *  - Conteudo: admissao/tempo de casa, ultima promocao, nivel/senioridade e
 *    comparacao com o cohort (mesmo nivel e mesma area).
 */
export interface EmployeeSearchResult {
  id: string;
  name: string;
  area: string | null;
  level: string | null;
  job_title: string | null;
}

export interface CohortStat {
  n: number;
  med_cr: number | null;
  med_tenure_months: number | null;
}

export interface EmployeeProfile {
  id: string;
  name: string;
  company: string | null;
  area: string | null;
  team: string | null;
  job_title: string | null;
  level: string | null;
  contract: string | null;
  hire: string | null;
  tenure_months: number | null;
  last_promotion: string | null;
  months_since_promotion: number | null;
  band: string;
  comp_ratio: number | null;
  quartile: string | null;
  /** Posicao do comp-ratio da pessoa dentro do nivel (0..100). */
  cr_percentile_level: number | null;
  cohort_level: CohortStat;
  cohort_area: CohortStat;
  /**
   * true quando os campos de remuneracao vieram vazios por permissao, e nao
   * por falta de dado. A tela precisa distinguir as duas coisas: "nao ha
   * comp-ratio" e "voce nao pode ver o comp-ratio" levam a acoes diferentes.
   */
  comp_restrito?: boolean;
  /** false = carregado do historico so para o perfil (People/diretoria fora do
   *  arquivo de comp); nesse caso nao ha comp-ratio, so faixa via folha. */
  in_comp_scope: boolean;
}

/** Converte "DD/MM/YY" (formato do Convenia) em meses ate hoje. */
function tenureMonthsFrom(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const m = String(dateStr).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  let yy = Number(m[3]);
  if (yy < 100) yy += 2000;
  const from = new Date(yy, mm - 1, dd);
  if (isNaN(from.getTime())) return null;
  const now = new Date();
  const months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  return Math.max(0, months);
}

/** Meses desde uma data ISO (last_promotion e date -> "YYYY-MM-DD"). */
function monthsSinceIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  return Math.max(0, months);
}

const SearchInput = z.object({ query: z.string().max(80) });

export const searchEmployees = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SearchInput.parse(input))
  .handler(async ({ context, data }): Promise<EmployeeSearchResult[]> => {
    const { email, scope } = await authorize(context.claims.email as string | undefined);
    const q = (data.query ?? '').trim();
    if (q.length < 2) return [];

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const { data: rows, error } = await db
      .from('comp_ratio')
      .select('id, name, area, level, job_title, job_type_family')
      .ilike('name', `%${q}%`)
      .order('name', { ascending: true })
      .limit(20);
    if (error) throw new Error(`Falha na busca: ${error.message}`);

    const scoped = (rows ?? [])
      .filter((r) => isInScope(scope, r.area, r.job_type_family))
      .map(({ job_type_family: _jtf, ...rest }) => rest);

    const { error: logError } = await db.from('comp_ratio_access_log').insert({
      user_email: email,
      rows_returned: scoped.length,
      context: `busca-perfil:${q.slice(0, 40)}`,
    });
    if (logError) throw new Error(`Falha ao registrar acesso; busca abortada: ${logError.message}`);

    return scoped as EmployeeSearchResult[];
  });

const ProfileInput = z.object({ id: z.string().uuid() });

export const getEmployeeProfile = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ProfileInput.parse(input))
  .handler(async ({ context, data }): Promise<EmployeeProfile | null> => {
    const { email, scope, escopoComp } = await authorize(context.claims.email as string | undefined);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const { data: person, error } = await db
      .from('comp_ratio')
      .select('id, company, name, area, team, job_title, level, n_layer, contract, hire, salary, comp_ratio, quartile, last_promotion, in_comp_scope, job_type_family')
      .eq('id', data.id)
      .maybeSingle();
    if (error) throw new Error(`Falha ao carregar perfil: ${error.message}`);
    if (!person || !isInScope(scope, person.area, person.job_type_family)) {
      // Loga a tentativa mesmo sem retorno.
      await db.from('comp_ratio_access_log').insert({
        user_email: email, rows_returned: 0, context: `perfil:${data.id}`,
      });
      return null;
    }

    // Cohort: mesmo nivel e mesma area (para comparacao relativa).
    const level = (person.level ?? '').trim();
    const area = (person.area ?? '').trim();
    const { data: cohort, error: cErr } = await db
      .from('comp_ratio')
      .select('area, level, comp_ratio, hire');
    if (cErr) throw new Error(`Falha ao carregar cohort: ${cErr.message}`);

    const byLevel = (cohort ?? []).filter((r) => (r.level ?? '').trim() === level && level !== '');
    const byArea = (cohort ?? []).filter((r) => (r.area ?? '').trim() === area && area !== '');

    const crLevel = byLevel.map((r) => (r.comp_ratio == null ? null : Number(r.comp_ratio))).filter((v): v is number => v != null);
    const crArea = byArea.map((r) => (r.comp_ratio == null ? null : Number(r.comp_ratio))).filter((v): v is number => v != null);
    const tenLevel = byLevel.map((r) => tenureMonthsFrom(r.hire)).filter((v): v is number => v != null);
    const tenArea = byArea.map((r) => tenureMonthsFrom(r.hire)).filter((v): v is number => v != null);

    const myCr = person.comp_ratio == null ? null : Number(person.comp_ratio);
    const crPct =
      myCr != null && crLevel.length
        ? Math.round((crLevel.filter((v) => v <= myCr).length / crLevel.length) * 100)
        : null;

    // ==================================================================
    // A PORTA DOS FUNDOS DA ABA PERFIL
    // ==================================================================
    // Esta tela mostra comp-ratio e quartil de QUALQUER pessoa, achada por
    // busca de nome. Sem o mesmo recorte da aba de Salarios, um Director
    // barrado la abriria aqui, digitaria o nome do VP e leria o mesmo dado --
    // e a regra que acabou de ser criada viraria enfeite.
    //
    // A pessoa continua aparecendo: admissao, tempo de casa, promocao e nivel
    // nao sao remuneracao, e sao o que faz esta tela existir. So os campos de
    // dinheiro somem.
    const podeVerComp = podeVerLinha(escopoComp, {
      area: person.area, n_layer: person.n_layer,
    });

    const profile: EmployeeProfile = {
      id: person.id,
      name: person.name,
      company: person.company ?? null,
      area: person.area ?? null,
      team: person.team ?? null,
      job_title: person.job_title ?? null,
      level: person.level ?? null,
      contract: person.contract ?? null,
      hire: person.hire ?? null,
      tenure_months: tenureMonthsFrom(person.hire),
      last_promotion: person.last_promotion ?? null,
      months_since_promotion: monthsSinceIso(person.last_promotion),
      // Os cinco campos de remuneracao saem juntos ou ficam juntos. Deixar
      // um deles passar -- o quartil, por exemplo -- entregaria a posicao na
      // faixa, que e o que se queria esconder.
      band: podeVerComp ? salaryBand(person.salary == null ? null : Number(person.salary)) : 'Restrito',
      comp_ratio: podeVerComp ? myCr : null,
      quartile: podeVerComp ? person.quartile ?? null : null,
      cr_percentile_level: podeVerComp ? crPct : null,
      cohort_level: podeVerComp
        ? { n: byLevel.length, med_cr: median(crLevel), med_tenure_months: median(tenLevel) }
        : { n: 0, med_cr: null, med_tenure_months: null },
      cohort_area: podeVerComp
        ? { n: byArea.length, med_cr: median(crArea), med_tenure_months: median(tenArea) }
        : { n: 0, med_cr: null, med_tenure_months: null },
      /** false = os campos de remuneracao vieram vazios de proposito. */
      comp_restrito: !podeVerComp,
      in_comp_scope: person.in_comp_scope !== false,
    };

    const { error: logError } = await db.from('comp_ratio_access_log').insert({
      user_email: email, rows_returned: 1, context: `perfil:${person.name.slice(0, 40)}`,
    });
    if (logError) throw new Error(`Falha ao registrar acesso; consulta abortada: ${logError.message}`);

    return profile;
  });

/**
 * Preenche a camada N das linhas de remuneração a partir do organograma.
 *
 * ===========================================================================
 * A PONTE POSSÍVEL, COM A REGRA QUE A TORNA SEGURA
 * ===========================================================================
 * `comp_ratio` veio de planilha e tem `name`; o organograma vem do Convenia e
 * tem `corporate_email`. O nome é o único campo em comum -- e nome é chave
 * ruim: homônimo existe, grafia varia.
 *
 * A regra que compensa isso está em `vinculo-comp.ts`: na dúvida, NÃO casa.
 * Nome repetido de qualquer um dos lados fica sem camada, e sem camada a
 * linha não aparece para ninguém que não seja perfil global.
 *
 * Sem `confirm` só diz o que faria. É o mesmo padrão dos outros importadores
 * do painel, e aqui pesa mais: um casamento errado não gera erro nenhum na
 * tela -- gera o salário de alguém aparecendo para quem não devia.
 */
export const vincularCamadaComp = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ confirm: z.boolean().default(false) }).parse(input ?? {}))
  .handler(async ({ context, data }) => {
    const { exigirAdmin } = await import('@/lib/escopo.server');
    await exigirAdmin(context.claims.email as string | undefined, 'vincular a camada N à folha');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;
    const { vincular, resumir } = await import('@/lib/vinculo-comp');

    const [comp, org] = await Promise.all([
      db.from('comp_ratio').select('id, name'),
      db.from('org_pessoas').select('nome, camada, convenia_id'),
    ]);
    if (comp.error) throw new Error(`Falha ao ler a folha: ${comp.error.message}`);
    if (org.error) {
      throw new Error(
        `Falha ao ler o organograma: ${org.error.message}. Rode a migração de org_pessoas e uma sincronização do Convenia antes.`,
      );
    }

    const linhas = (comp.data ?? []) as Array<{ id: string; name: string }>;
    const organograma = (org.data ?? []) as Array<{
      nome: string; camada: string | null; convenia_id: string | null;
    }>;

    if (organograma.length === 0) {
      return {
        gravado: false, total: linhas.length, casados: 0,
        semCorrespondencia: [] as string[], ambiguos: [] as string[],
        semCamadaNaOrigem: [] as string[],
        resumo: 'O organograma está vazio. Rode uma sincronização do Convenia primeiro — sem ela não há camada para vincular.',
      };
    }

    const r = vincular(linhas, organograma);
    const out = {
      gravado: false,
      total: linhas.length,
      casados: r.casados.length,
      // Amostra, não a lista inteira: são nomes de pessoas, e a tela precisa
      // do suficiente para conferir, não de um diretório.
      semCorrespondencia: r.semCorrespondencia.slice(0, 20),
      ambiguos: r.ambiguos.slice(0, 20),
      semCamadaNaOrigem: r.semCamadaNaOrigem.slice(0, 20),
      resumo: resumir(r, linhas.length),
    };

    if (!data.confirm) return out;

    // ------------------------------------------------------------------
    // UPDATE, E NÃO UPSERT
    // ------------------------------------------------------------------
    // Isto era `upsert({ id, n_layer }, { onConflict: 'id' })`, e o upsert do
    // PostgREST é um INSERT com fallback: o Postgres cobra as colunas
    // obrigatórias da tabela, e `name` é NOT NULL. Estourava com
    // "null value in column name violates not-null constraint" -- para linhas
    // que JÁ EXISTEM e cujo nome ninguém queria tocar.
    //
    // Nunca tinha aparecido porque nunca tinha rodado: enquanto o casamento
    // por nome dava 0%, `casados` vinha vazio e o laço não executava. O bug
    // esperou o primeiro vínculo bem-sucedido para se manifestar -- 571
    // linhas de uma vez.
    //
    // Agrupado por camada em vez de uma chamada por linha: são cinco ou seis
    // camadas distintas contra 571 pessoas, então são cinco ou seis idas ao
    // banco em vez de 571.
    const porCamada = new Map<string, string[]>();
    for (const c of r.casados) {
      const lista = porCamada.get(c.camada) ?? [];
      lista.push(c.id);
      porCamada.set(c.camada, lista);
    }

    // Só as que casaram: quem não casou fica com n_layer nulo, que ESCONDE a
    // linha -- o lado seguro do erro.
    for (const [camada, ids] of porCamada) {
      for (let i = 0; i < ids.length; i += 500) {
        const { error } = await db
          .from('comp_ratio')
          .update({ n_layer: camada } as never)
          .in('id', ids.slice(i, i + 500));
        if (error) throw new Error(`Falha ao gravar a camada: ${error.message}`);
      }
    }

    // ------------------------------------------------------------------
    // O ELO, GRAVADO JUNTO
    // ------------------------------------------------------------------
    // A camada dá para agrupar -- são cinco ou seis valores para centenas de
    // pessoas. O `convenia_id` é único por pessoa, então aqui é uma chamada
    // por linha mesmo. São ~570 numa ação manual e confirmada, não num
    // caminho de leitura, e é o preço de nunca mais casar por nome na hora de
    // ler. Ver a migração 20260828160000.
    //
    // Falhar aqui NÃO derruba a camada que acabou de ser gravada: a camada é
    // o que controla acesso, e ela já entrou. O elo é acessório, e o aviso
    // conta quantos ficaram sem.
    let elosGravados = 0;
    for (const c of r.casados) {
      if (!c.convenia_id) continue;
      const { error } = await db
        .from('comp_ratio')
        .update({ convenia_id: c.convenia_id } as never)
        .eq('id', c.id);
      if (!error) elosGravados++;
    }

    return { ...out, gravado: true, elosGravados };
  });

/**
 * Split salarial por nivel x papel (Caio #13). Dois eixos independentes:
 *  - gestao: "Gestor de pessoas" (tem reporte) vs "Contribuidor individual".
 *  - lideranca: "Líder" (flag do cadastro) vs "Não-líder".
 * So agregados por nivel (mediana de salario e comp-ratio + n). Nenhuma linha
 * individual sai; mesma natureza de getCompAggregates (sem log).
 */
export interface CompRoleCell {
  level: string;
  group: string;
  n: number;
  med_salary: number | null;
  med_cr: number | null;
}
export interface CompByRole {
  gestao: CompRoleCell[];
  lideranca: CompRoleCell[];
}

export const getCompByLevelRole = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompByRole> => {
    const { escopoComp } = await authorize(context.claims.email as string | undefined);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const { data: rows, error } = await db
      .from('comp_ratio')
      .select('area, level, n_layer, salary, comp_ratio, is_leader, is_people_manager, in_comp_scope');
    if (error) throw new Error(`Falha ao carregar split por papel: ${error.message}`);

    // O RECORTE VALE PARA O AGREGADO TAMBEM.
    //
    // "Media salarial por nivel" com os niveis de cima dentro e o mesmo
    // vazamento com menos passos: nos degraus altos ha poucas pessoas, e a
    // media de tres e praticamente o salario de cada uma.
    const active = filtrarLinhas(escopoComp, rows ?? []).filter(
      (r) => r.in_comp_scope !== false && (r.level ?? '').trim() !== '',
    );

    // Acumula salarios/comp-ratio por (nivel, grupo) e tira a mediana no fim.
    type Acc = { sal: number[]; cr: number[] };
    const bucket = new Map<string, Acc>();
    const add = (key: string, sal: number | null, cr: number | null) => {
      const a = bucket.get(key) ?? { sal: [], cr: [] };
      if (sal != null) a.sal.push(sal);
      if (cr != null) a.cr.push(cr);
      bucket.set(key, a);
    };
    for (const r of active) {
      const level = (r.level as string).trim();
      const sal = r.salary == null ? null : Number(r.salary);
      const cr = r.comp_ratio == null ? null : Number(r.comp_ratio);
      const gGrp = r.is_people_manager ? 'Gestor de pessoas' : 'Contribuidor individual';
      const lGrp = r.is_leader ? 'Líder' : 'Não-líder';
      add(`g|${level}|${gGrp}`, sal, cr);
      add(`l|${level}|${lGrp}`, sal, cr);
    }

    const cells = (prefix: string): CompRoleCell[] => {
      const out: CompRoleCell[] = [];
      for (const [key, a] of bucket) {
        if (!key.startsWith(prefix)) continue;
        const [, level, group] = key.split('|');
        out.push({ level, group, n: a.sal.length, med_salary: median(a.sal), med_cr: median(a.cr) });
      }
      return out.sort((x, y) => (x.level < y.level ? -1 : x.level > y.level ? 1 : x.group.localeCompare(y.group)));
    };

    return { gestao: cells('g|'), lideranca: cells('l|') };
  });

/**
 * ===========================================================================
 * CONTAGEM DE GENTE NAO E AGREGADO DE SALARIO
 * ===========================================================================
 * O Overview mostra uma linha "CLT / PJ" no quadro do headcount. Ela e
 * contagem pura: quantas pessoas tem cada tipo de contrato. Nao ha salario
 * nenhum ali -- nem valor, nem faixa, nem media.
 *
 * Ate 18/08/2026 esse numero vinha de `getCompAggregates`, porque a fonte
 * (`comp_ratio`) e a mesma. Quando a aba Compensation virou permissao, a
 * funcao inteira passou a exigi-la, e o Overview de quem nao tem Compensation
 * -- lider de departamento, HRBP -- ficou com "…" eterno naquela linha. Nao
 * era erro visivel: era um carregamento que nunca terminava.
 *
 * Vir da mesma TABELA nao faz duas coisas terem a mesma sensibilidade. Esta
 * funcao existe para separar o que a origem tinha juntado: contagem de
 * contrato sai por aqui, sob a permissao do Overview; qualquer numero que
 * carregue salario continua so em `getCompAggregates`, sob a de Compensation.
 *
 * O recorte de AREA vale (o escopo normal do painel: departamento ou job
 * family). O recorte por CAMADA N nao vale aqui, e de proposito: ele existe
 * para nao expor a remuneracao dos pares e dos superiores. Saber que a empresa
 * tem 400 CLT e 90 PJ nao expoe a remuneracao de ninguem.
 */
export interface HeadcountContractAgg {
  company: string;
  contract: string;
  n: number;
}
export interface HeadcountMix {
  contracts: HeadcountContractAgg[];
}

export const getHeadcountMix = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HeadcountMix> => {
    const { resolverEscopo } = await import('@/lib/escopo.server');
    const e = await resolverEscopo(context.claims.email as string | undefined, 'overview');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    // So as colunas que a contagem precisa. Nao selecionar `salary` aqui e
    // deliberado: o que nao e lido nao pode escapar por um `...rest` distraido
    // numa mudanca futura.
    const { data: rows, error } = await db
      .from('comp_ratio')
      .select('company, area, contract, job_type_family, in_comp_scope');
    if (error) throw new Error(`Falha ao carregar composicao de contrato: ${error.message}`);

    const cMap = new Map<string, HeadcountContractAgg>();
    for (const r of (rows ?? []).filter(
      (r) => r.in_comp_scope !== false && isInScope(e.scope, r.area, r.job_type_family),
    )) {
      const company = (r.company ?? '—') as string;
      const contract = (r.contract ?? '—') as string;
      const k = `${company}||${contract}`;
      const c = cMap.get(k) ?? { company, contract, n: 0 };
      c.n++;
      cMap.set(k, c);
    }

    return { contracts: [...cMap.values()] };
  });

export const getCompAggregates = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompAggregates> => {
    const { escopoComp } = await authorize(context.claims.email as string | undefined);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const { data: allRows, error } = await db
      .from('comp_ratio')
      .select('company, area, contract, level, n_layer, salary, comp_ratio, in_comp_scope');
    if (error) throw new Error(`Falha ao carregar agregados de comp: ${error.message}`);

    // Agregados de compensacao usam SO a populacao do arquivo de comp -- e,
    // desde 14/08/2026, so os niveis abaixo do de quem olha. Ver o comentario
    // em getCompByLevelRole: media de poucos e salario individual disfarcado.
    const rows = filtrarLinhas(escopoComp, allRows ?? [])
      .filter((r) => r.in_comp_scope !== false);

    const cMap = new Map<string, CompContractAgg>();
    const aMap = new Map<string, CompAreaAgg>();
    const bMap = new Map<string, CompBandAgg>();
    const lMap = new Map<string, CompLevelAgg>();
    const salByCo = new Map<string, number[]>();
    const crByCo = new Map<string, number[]>();
    for (const r of rows ?? []) {
      const company = (r.company ?? '—') as string;
      const contract = (r.contract ?? '—') as string;
      const area = (r.area ?? '—') as string;
      const level = ((r.level ?? '—') as string).trim() || '—';
      const sal = r.salary == null ? null : Number(r.salary);
      const cr = r.comp_ratio == null ? null : Number(r.comp_ratio);
      const brandGroup = COMPANY_TO_BRAND[company];
      const groups = brandGroup ? [brandGroup, 'combined'] : ['combined'];
      for (const g of groups) {
        if (sal != null) (salByCo.get(g) ?? salByCo.set(g, []).get(g)!).push(sal);
        if (cr != null) (crByCo.get(g) ?? crByCo.set(g, []).get(g)!).push(cr);
      }

      const ck = `${company}||${contract}`;
      const c = cMap.get(ck) ?? { company, contract, n: 0, sal_sum: 0, sal_n: 0 };
      c.n++;
      if (sal != null) { c.sal_sum += sal; c.sal_n++; }
      cMap.set(ck, c);

      const ak = `${company}||${area}`;
      const a = aMap.get(ak) ?? { company, area, n: 0, cr_sum: 0, cr_n: 0 };
      a.n++;
      if (cr != null) { a.cr_sum += cr; a.cr_n++; }
      aMap.set(ak, a);

      const band = salaryBand(sal);
      const bk = `${company}||${band}`;
      const b = bMap.get(bk) ?? { company, band, n: 0 };
      b.n++;
      bMap.set(bk, b);

      const lk = `${company}||${level}`;
      const l = lMap.get(lk) ?? { company, level, n: 0, cr_sum: 0, cr_n: 0, sal_sum: 0, sal_n: 0 };
      l.n++;
      if (cr != null) { l.cr_sum += cr; l.cr_n++; }
      if (sal != null) { l.sal_sum += sal; l.sal_n++; }
      lMap.set(lk, l);
    }

    const groups = new Set<string>([...salByCo.keys(), ...crByCo.keys()]);
    const medians: CompMedianAgg[] = [...groups].map((group) => ({
      group,
      med_salary: median(salByCo.get(group) ?? []),
      med_cr: median(crByCo.get(group) ?? []),
    }));

    return {
      contracts: [...cMap.values()],
      areas: [...aMap.values()],
      bands: [...bMap.values()],
      levels: [...lMap.values()],
      medians,
    };
  });

/* ===========================================================================
 * EQUIDADE: COMP-RATIO POR GÊNERO E ETNIA
 * ===========================================================================
 * O comp-ratio é salário ÷ ponto médio da faixa do cargo. Isso importa aqui
 * mais do que em qualquer outra tela: nível e família de cargo já estão
 * controlados POR CONSTRUÇÃO. Comparar comp-ratio entre grupos não é comparar
 * salário -- é perguntar "dentro da MESMA faixa, quem está posicionado onde".
 *
 * É a diferença entre uma leitura de composição (mulheres ganham menos porque
 * estão em níveis menores) e uma de equidade (no mesmo nível, na mesma faixa,
 * a posição difere).
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTA TELA EXISTE, E POR QUE NÃO A DE PROMOÇÕES
 * ---------------------------------------------------------------------------
 * A pergunta original era cruzar PROMOÇÕES com diversidade. Medido: 62
 * promoções em três anos, intervalos de ±3 a ±10 pontos, nada significativo em
 * corte nenhum. Uma tela ali publicaria diferenças que o dado não sustenta.
 *
 * Remuneração tem 570 pessoas em vez de 62. É onde a pergunta tem resposta.
 *
 * ---------------------------------------------------------------------------
 * O ELO
 * ---------------------------------------------------------------------------
 * `convenia_id` na folha, gravado pela tela de vínculo. NÃO se casa por nome
 * aqui: esse casamento devolveu 0% duas vezes esta semana, e uma tela de
 * equidade que silenciosamente perde metade das pessoas é pior que nenhuma.
 * Linha sem `convenia_id` simplesmente não entra, e o total diz quantas são.
 */

export const getCompEquidade = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompEquidade> => {
    const { escopoComp } = await authorize(context.claims.email as string | undefined);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const { data: rows, error } = await db
      .from('comp_ratio')
      .select('area, level, n_layer, comp_ratio, convenia_id, in_comp_scope');
    if (error) throw new Error(`Falha ao carregar equidade: ${error.message}`);

    // A MESMA porta das outras telas de remuneração, e não uma segunda
    // implementação da ideia. `podeVerLinha` é quem sabe da camada e da área.
    const visiveis = (rows ?? [])
      .filter((r) => r.in_comp_scope !== false)
      .filter((r) => podeVerLinha(escopoComp, { area: r.area, n_layer: r.n_layer }))
      .filter((r) => typeof r.comp_ratio === 'number' && r.comp_ratio > 0);

    const comElo = visiveis.filter((r) => r.convenia_id);
    if (!comElo.length) {
      return { porGenero: [], porEtnia: [], total: visiveis.length, comElo: 0, minimo: N_MINIMO_EQUIDADE };
    }

    // Demografia lida em BLOCO e reduzida na chegada a duas colunas. A tabela
    // nunca é consultada por pessoa -- ver a nota na migração 20260814210000.
    const { data: demo } = await db
      .from('convenia_pessoas')
      .select('convenia_id, gender, race')
      .in('convenia_id', comElo.map((r) => String(r.convenia_id)));

    const porId = new Map(
      ((demo ?? []) as Array<{ convenia_id: string; gender: string | null; race: string | null }>)
        .map((d) => [d.convenia_id, d]),
    );

    const base = comElo.map((r) => {
      const d = porId.get(String(r.convenia_id));
      return {
        nivel: (r.level as string | null) ?? null,
        genero: d?.gender === 'F' ? 'Feminino' : d?.gender === 'M' ? 'Masculino' : null,
        etnia: (d?.race ?? '').trim() || null,
        cr: Number(r.comp_ratio),
      };
    });

    return {
      porGenero: agruparEquidade(
        base.map((b) => ({ nivel: b.nivel, chave: b.genero, cr: b.cr })),
        ['Feminino', 'Masculino'],
      ),
      porEtnia: agruparEquidade(
        base.map((b) => ({ nivel: b.nivel, chave: b.etnia, cr: b.cr })),
        ['Branca', 'Parda', 'Preta', 'Amarela', 'Indígena'],
      ),
      total: visiveis.length,
      comElo: comElo.length,
      minimo: N_MINIMO_EQUIDADE,
    };
  });
