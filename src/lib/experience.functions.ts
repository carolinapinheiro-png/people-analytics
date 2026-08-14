import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DeptFilterInput, selectedDept } from '@/lib/dept-filter';
import {
  isGlobalProfile, isInScope, visibleExperienceSubTabs,
  type AccessScope, type ExperienceSubTab,
} from '@/lib/permissions';
import { deptForScope } from '@/lib/engagement-context';

/**
 * A área que um perfil restrito enxerga quando não pede nada.
 *
 * Devolve `'\u0000SEM-ESCOPO'` -- valor que não casa com nenhum departamento --
 * para quem tem perfil restrito e nenhuma área atribuída. O resultado é uma
 * tela vazia, que é o correto: um cadastro incompleto não deve virar acesso
 * total por omissão.
 */
function normalizarPrimeiroDept(scope: AccessScope): string {
  const d = (scope.departments ?? []).map((x) => (x ?? '').trim().toUpperCase()).filter(Boolean);
  return d[0] ?? '\u0000SEM-ESCOPO';
}
import {
  buildEngagementContext,
  type EngagementContextResult,
  type EngagementScoreLike,
  type LeaverLike,
} from '@/lib/engagement-context';

/**
 * Leitura da aba Experiencia: engajamento (deck do CEO), onboarding (agregados
 * ja no banco) e inclusao/pertencimento (Polly + Flutter Near You). Tudo
 * agregado; nenhuma resposta individual. Acessivel a qualquer usuario
 * autorizado (mesma checagem do resto).
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

/**
 * Adaptador fino sobre `resolverEscopo`, que e o unico lugar do sistema que
 * decide quem voce e -- e o unico que sabe do "ver como". Antes cada arquivo
 * tinha sua propria copia desta consulta; treze copias, quatro formatos.
 */
async function authorize(userEmail: string | undefined): Promise<AccessScope> {
  const { resolverEscopo } = await import('@/lib/escopo.server');
  return (await resolverEscopo(userEmail, 'engagement')).scope;
}

export interface EngagementScore {
  wave: string;
  /** Diferenca de eNPS para a Flutter International (informada no deck). */
  gap_ent_enps?: number | null;
  scope: string;
  enps: number | null;
  enps_delta: number | null;
  retention_risk: number | null;
  rr_delta: number | null;
  satisfaction: number | null;
  sat_delta: number | null;
  participation: number | null;
  status: string | null;
  position: number;
}

export interface OnboardingAggregate {
  survey_stage: string;
  slice_type: string;
  slice_value: string;
  n: number;
  metrics: Record<string, number>;
}

export interface ExperienceDistribution {
  survey: string;
  section: string;
  question: string;
  category: string;
  pct: number | null;
  n: number | null;
  position: number;
}

export interface EngagementDriver {
  wave: string;
  driver: string;
  driver_desc: string | null;
  question: string;
  score_current: number | null;
  score_prev: number | null;
  evaluation: string | null;
  driver_pos: number;
  q_pos: number;
}

export interface ExperienceData {
  engagement: EngagementScore[];
  drivers: EngagementDriver[];
  onboarding: OnboardingAggregate[];
  distributions: ExperienceDistribution[];
  /** Blocos alcancados pelo filtro de departamento (os demais nao tem recorte por area). */
  deptFilterApplied?: string[];
  /**
   * Sub-abas que este perfil pode abrir.
   *
   * Vem do servidor, e nao e so um espelho do que a UI ja saberia calcular: o
   * conteudo das sub-abas ausentes tambem NAO e enviado. Assim a lista e a
   * resposta contam a mesma historia.
   */
  subAbas?: ExperienceSubTab[];
  /**
   * Quem está olhando, para a tela saber o que rotular.
   *
   * `restrito` = perfil que só enxerga a própria área. Nesse caso os blocos
   * sem recorte por departamento continuam aparecendo, mas precisam ser
   * rotulados como Flutter Brazil -- um número da empresa apresentado sem
   * rótulo dentro de uma tela filtrada por área seria lido como sendo da área.
   */
  escopo: { restrito: boolean; departamento: string | null };
}

export const getExperienceData = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => DeptFilterInput.parse(input))
  .handler(async ({ context, data: input }): Promise<ExperienceData> => {
    const scope = await authorize(context.claims.email as string | undefined);

    // ======================================================================
    // O FILTRO PEDIDO NÃO PODE AMPLIAR O ESCOPO -- SÓ ESTREITAR
    // ======================================================================
    // Até 13/08/2026 esta função chamava `authorize()` e DESCARTAVA o
    // resultado. O recorte vinha inteiro do `input`, ou seja, do navegador.
    //
    // Na prática: um Department Leader que pedisse outro departamento --
    // ou nenhum -- recebia a base inteira. O filtro escondia na tela, e o
    // dado chegava ao navegador de qualquer jeito. Quem abrisse o inspetor
    // via tudo.
    //
    // Nunca chegou a vazar porque nenhum líder de área tinha acesso ainda.
    // Foi encontrado justamente ao preparar esse acesso.
    //
    // A regra agora é a que deveria ter sido desde o início: o servidor
    // decide o que pode sair, e o pedido do cliente só escolhe DENTRO disso.
    const pedido = selectedDept(input);
    const podeVerTudo = isGlobalProfile(scope.profile);

    if (!podeVerTudo && pedido && !isInScope(scope, pedido)) {
      // Pedir área fora do escopo é erro, não silêncio: devolver vazio
      // pareceria "sua área não tem dados" e esconderia a tentativa.
      throw new Error('Sem acesso a este departamento.');
    }

    // Sem pedido explícito, quem tem escopo limitado vê a PRÓPRIA área --
    // não a empresa. "Nenhum filtro" não pode significar "tudo".
    const sel = pedido ?? (podeVerTudo ? null : normalizarPrimeiroDept(scope));


    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const [eng, drv, onb, dist] = await Promise.all([
      db.from('engagement_scores').select('*').order('position', { ascending: true }),
      db
        .from('engagement_drivers')
        .select('wave, driver, driver_desc, question, score_current, score_prev, evaluation, driver_pos, q_pos')
        .order('driver_pos', { ascending: true })
        .order('q_pos', { ascending: true }),
      db
        .from('onboarding_survey_aggregates')
        .select('survey_stage, slice_type, slice_value, n, metrics'),
      db
        .from('experience_distributions')
        .select('survey, section, question, category, pct, n, position')
        .order('position', { ascending: true }),
    ]);

    if (eng.error) throw new Error(`Falha ao carregar engajamento: ${eng.error.message}`);
    if (onb.error) throw new Error(`Falha ao carregar onboarding: ${onb.error.message}`);
    if (dist.error) throw new Error(`Falha ao carregar inclusao: ${dist.error.message}`);
    // drivers e nao-fatal: se a tabela ainda nao existir no banco, a aba
    // segue funcionando sem a secao de drivers (aparece quando for semeada).
    if (drv.error) console.error('engagement_drivers indisponivel:', drv.error.message);

    // FILTRO DE DEPARTAMENTO — alcance parcial, declarado de propósito.
    //
    // `engagement_scores` tem a coluna `scope` (empresa ou departamento), então
    // o eNPS e as notas por área respondem ao filtro. Já `engagement_drivers`,
    // `onboarding_survey_aggregates` e `experience_distributions` foram
    // carregadas só no nível da empresa -- não existe recorte por área nelas.
    //
    // A escolha aqui é NÃO tocar no que não tem recorte, em vez de devolver
    // vazio: uma seção some sem explicação parece defeito, e o número da
    // empresa continua sendo verdadeiro (só não é o da área). A aba avisa que
    // o filtro alcança só parte dela.
    // ======================================================================
    // O NOME DA ÁREA NA PESQUISA NÃO É O NOME DO DEPARTAMENTO
    // ======================================================================
    // A pesquisa escreve "Human Resources", "Customer Service", "Legal". O
    // catálogo tem HR, OPERATION, LEGAL & COMPLIANCE. Comparar os dois textos
    // em maiúsculas -- que era o que esta função fazia -- acerta seis das nove
    // áreas e erra três, sempre em silêncio: o filtro devolve zero linhas e a
    // tela diz "sem dado para esta área", que é indistinguível da verdade.
    //
    // `deptForScope` é o de-para conferido com a Carolina em 10/08. Usá-lo
    // aqui é obrigatório, e não uma melhoria: é o mesmo mapa que o cruzamento
    // com saídas já usa, e as duas visões precisam concordar sobre o que é
    // "Technology".
    const daArea = (escopoDaLinha: string | null | undefined): boolean =>
      deptForScope(escopoDaLinha ?? '') === sel;

    // ======================================================================
    // A LINHA `company` FICA -- INCLUSIVE PARA PERFIL RESTRITO
    // ======================================================================
    // Ontem eu a retirei de perfis restritos, com o argumento de que "com 8
    // áreas na tela, saber o total e a própria permite estimar as outras".
    // Esse argumento vale quando se vê SETE das oito -- aí a oitava se deduz.
    // Não vale aqui: um perfil restrito passa a ver UMA área. Total menos a
    // sua devolve as outras oito somadas, que não identifica nenhuma.
    //
    // Retirá-la custava caro e não comprava nada: uma nota sozinha, sem
    // referência, é difícil de agir. E era incoerente com os drivers e a
    // inclusão, que já aparecem com número de empresa e rótulo.
    //
    // Para perfil global com filtro ligado, ela também precisa vir -- e essa
    // parte é a correção do que a Carolina viu. Os quatro cartões do topo são
    // desenhados a partir dela; ao filtrar, o filtro a removia junto com as
    // outras áreas e os cartões simplesmente sumiam da tela.
    const ehEmpresa = (r: EngagementScore) => (r.scope ?? '').trim().toLowerCase() === 'company';
    const engagement = ((eng.data ?? []) as EngagementScore[]).filter((r) => {
      if (ehEmpresa(r)) return true;
      if (!podeVerTudo) return daArea(r.scope) && isInScope(scope, deptForScope(r.scope ?? '') ?? null);
      return !sel || daArea(r.scope);
    });

    // ONBOARDING TEM RECORTE POR ÁREA -- e a tela desenha uma tabela com
    // todos os departamentos. Sem este filtro, um líder de uma área leria a
    // satisfação de entrada das outras seis, nominalmente, numa tabela.
    //
    // As linhas `overall` e `cohort_month` são da empresa e ficam: elas não
    // identificam área nenhuma, e servem de referência.
    const onboarding = ((onb.data ?? []) as OnboardingAggregate[]).filter((o) => {
      if (o.slice_type !== 'department') return true;
      if (podeVerTudo) return !sel || (o.slice_value ?? '').trim().toUpperCase() === sel;
      return isInScope(scope, o.slice_value ?? null);
    });

    // ======================================================================
    // QUEM SÓ PODE VER ENGAJAMENTO NÃO RECEBE ONBOARDING NEM INCLUSÃO
    // ======================================================================
    // As três sub-abas vêm desta mesma chamada. Esconder duas delas no
    // componente deixaria os dados no payload -- e "escondido na tela" é uma
    // frase que só descreve o que a pessoa vê sem procurar.
    //
    // A lista de sub-abas visíveis é a mesma que a UI usa (`permissions.ts`),
    // para as duas não poderem discordar.
    const subs = visibleExperienceSubTabs(scope.profile);
    const soEngajamento = !subs.includes('onboarding') && !subs.includes('inclusao');

    return {
      engagement,
      drivers: (drv.error ? [] : drv.data ?? []) as EngagementDriver[],
      onboarding: soEngajamento ? [] : onboarding,
      distributions: soEngajamento ? [] : ((dist.data ?? []) as ExperienceDistribution[]),
      /** Sub-abas que este perfil pode abrir. A UI desenha só estas. */
      subAbas: subs,
      /**
       * Quais blocos o filtro de departamento realmente alcança.
       *
       * `drivers` e `distributions` ficam de fora porque foram carregadas só
       * no nível da empresa -- não existe recorte por área nelas. Elas seguem
       * visíveis como referência, com rótulo, em vez de sumirem: uma seção
       * vazia parece defeito, e o número da empresa continua verdadeiro.
       */
      deptFilterApplied: sel || !podeVerTudo
        ? (['engagement', 'onboarding'] as const).slice()
        : [],
      escopo: {
        restrito: !podeVerTudo,
        departamento: sel === '\u0000SEM-ESCOPO' ? null : sel,
      },
    };
  });

// ---------------------------------------------------------------------------
// Cruzamento: a pesquisa antecipou as saídas?
// ---------------------------------------------------------------------------

/**
 * Janela observada. A pesquisa é de jan/2026, então só conta o que veio DEPOIS:
 * incluir janeiro deixaria a análise circular (saídas que já tinham acontecido
 * quando a pessoa respondeu). Julho é o último mês fechado na base.
 */
const JANELA = { inicio: '2026-02', fim: '2026-07' };

export interface EngagementCrossData extends EngagementContextResult {
  /**
   * Ressalvas que a tela precisa exibir. Vêm do servidor porque dependem do
   * que o banco de fato tinha na hora da consulta -- deixar isso hardcoded no
   * componente faria o aviso continuar aparecendo depois de resolvido, ou
   * sumir sem que o problema tivesse sido resolvido.
   */
  ressalvas: string[];
}

export const getEngagementCross = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => DeptFilterInput.parse(input))
  .handler(async ({ context, data: input }): Promise<EngagementCrossData> => {
    const scope = await authorize(context.claims.email as string | undefined);
    const podeVerTudo = isGlobalProfile(scope.profile);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    const [eng, mm, lv] = await Promise.all([
      db
        .from('engagement_scores')
        .select('scope, enps, enps_delta, retention_risk, satisfaction, participation, status, gap_ent_enps')
        .order('position', { ascending: true }),
      // Só NSX/reconstruido tem dept_breakdown. Ver ressalva abaixo: a pesquisa
      // cobre a Flutter Brazil inteira, a quebra por área só existe para NSX.
      db
        .from('monthly_metrics')
        .select('month, dept_breakdown')
        .eq('brand', 'NSX')
        .eq('source', 'reconstruido')
        .is('quality_flag', null)
        .not('dept_breakdown', 'is', null),
      db
        .from('leavers')
        .select('departamento, job_family, data_desligamento, tipo_desligamento_agrupado')
        .gte('data_desligamento', `${JANELA.inicio}-01`),
    ]);

    if (eng.error) throw new Error(`Falha ao carregar engajamento: ${eng.error.message}`);
    if (mm.error) throw new Error(`Falha ao carregar headcount por área: ${mm.error.message}`);
    if (lv.error) throw new Error(`Falha ao carregar desligados: ${lv.error.message}`);

    // headcount por mês e departamento, lido do dept_breakdown.
    const hcPorMesDept: Record<string, Record<string, number>> = {};
    for (const row of (mm.data ?? []) as Array<{ month: string; dept_breakdown: unknown }>) {
      const ym = String(row.month).slice(0, 7);
      const blob = row.dept_breakdown as Record<string, { level_base?: Record<string, number> }> | null;
      if (!blob) continue;
      const porDept: Record<string, number> = {};
      for (const [dept, d] of Object.entries(blob)) {
        // O headcount da área não vem pronto no blob; é a soma do level_base,
        // que é a contagem de pessoas por nível. gender_female + gender_male
        // daria o mesmo total, mas perde quem está sem gênero cadastrado.
        const total = Object.values(d?.level_base ?? {}).reduce((s, n) => s + (n || 0), 0);
        if (total > 0) porDept[dept] = total;
      }
      hcPorMesDept[ym] = porDept;
    }

    // O cruzamento com a base de desligados exige escopo, mesmo devolvendo só
    // contagem. Um gestor de uma área não deve inferir o volume de saídas de
    // outra a partir daqui -- o número é agregado, mas com 8 áreas na tela um
    // agregado por área é tão identificável quanto uma lista.
    const leavers = ((lv.data ?? []) as Array<LeaverLike & { job_family?: string | null }>).filter(
      (r) => isInScope(scope, r.departamento, r.job_family ?? null),
    );

    // ======================================================================
    // AS LINHAS DA PESQUISA TAMBÉM PRECISAM DE ESCOPO
    // ======================================================================
    // Até 13/08 esta função filtrava os DESLIGADOS pelo escopo e devolvia o
    // eNPS, o risco e a satisfação das nove áreas para qualquer perfil. Meio
    // caminho é pior que nenhum: dá a impressão de que o escopo foi tratado.
    //
    // É por aqui que a fila de prioridade por área, o gráfico de movimento
    // entre ondas e a frase "onde agir primeiro" se alimentam. Um líder de uma
    // área veria o ranking das outras oito -- exatamente o que o recorte por
    // departamento existe para impedir, entrando por outra porta.
    //
    // O filtro pedido também vale aqui, e pela razão que a Carolina relatou:
    // com TECHNOLOGY selecionado, a leitura continuava dizendo que o lugar de
    // agir era Marketing. Uma tela filtrada que fala de outra área não é uma
    // tela filtrada.
    const pedido = selectedDept(input);
    if (!podeVerTudo && pedido && !isInScope(scope, pedido)) {
      throw new Error('Sem acesso a este departamento.');
    }
    const sel = pedido ?? (podeVerTudo ? null : normalizarPrimeiroDept(scope));

    const scores = ((eng.data ?? []) as EngagementScoreLike[]).filter((s) => {
      const dept = deptForScope(s.scope ?? '');
      // Linhas que não são departamento (`company`, `Betfair`) seguem a mesma
      // regra do resto: perfil restrito não as recebe, perfil global recebe.
      if (dept == null) return podeVerTudo;
      if (!podeVerTudo && !isInScope(scope, dept)) return false;
      return !sel || dept === sel;
    });

    const result = buildEngagementContext(
      scores,
      leavers,
      hcPorMesDept,
      JANELA,
    );

    const ressalvas: string[] = [
      'A pesquisa cobre a Flutter Brazil inteira; a quebra de headcount por área só existe para a NSX. Se as linhas por departamento da pesquisa incluírem gente da Betfair, o denominador está subestimado e a atrição sai um pouco alta.',
    ];
    if (result.semCorrespondencia.length) {
      ressalvas.push(
        `Sem departamento correspondente no dashboard: ${result.semCorrespondencia.join(', ')}. Estas áreas aparecem nas visões da pesquisa, mas ficam fora do cruzamento com saídas.`,
      );
    }
    const comDado = result.rows.filter((r) => r.dept && r.retentionRisk != null).length;
    if (comDado < 8) {
      ressalvas.push(
        `Só ${comDado} áreas têm risco declarado e saídas observadas ao mesmo tempo. Quanto menor esse número, menos a correlação significa.`,
      );
    }

    return { ...result, ressalvas };
  });
