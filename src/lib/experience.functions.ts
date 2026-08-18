import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DeptFilterInput, selectedDept } from '@/lib/dept-filter';
import {
  isGlobalProfile, isInScope, visibleExperienceSubTabs,
  type AccessScope, type ExperienceSubTab,
} from '@/lib/permissions';
import { deptForScope } from '@/lib/engagement-context';
import {
  escolherOndas, comDeltaCalculado, type OndaLinha, type LinhaComEscopo,
} from '@/lib/onda';

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
  /**
   * As ondas que existem no banco, da mais recente para a mais antiga.
   *
   * A linha do tempo era uma lista escrita a mao dentro do componente. Ela
   * envelheceu exatamente como o painel inteiro evita: continuou anunciando
   * jul/26 como "em campo" depois de a pesquisa fechar, e nunca soube da onda
   * seguinte. Agora ela se desenha do que existe.
   */
  ondas?: OndaResumo[];
}

export interface OndaResumo {
  wave: string;
  label: string;
  referenceDate: string;
  respondents: number | null;
  eligible: number | null;
  /** Calculada, nao guardada -- respondentes sobre elegiveis. */
  participacao: number | null;
  /** Quantas perguntas de driver aquela onda mediu. */
  drivers: number;
  /** Quantos recortes (area, tempo, funcao, marca, modelo) ela tem. */
  recortes: number;
  /** true na mais recente: e a que a aba esta mostrando. */
  atual: boolean;
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

    // ======================================================================
    // QUAL ONDA A ABA MOSTRA
    // ======================================================================
    // Ate ago/2026 existia UMA onda em `engagement_scores`, entao ler a tabela
    // inteira dava o resultado certo por acidente. Na segunda onda o mesmo
    // codigo passa a devolver as duas juntas: a lista por area aparece com
    // "Technology" duas vezes, com numeros diferentes, sem nada explicando.
    //
    // A ordenacao e por `position`, entao as linhas ate se intercalariam --
    // e o total da empresa apareceria duas vezes. Nada quebraria; a tela
    // simplesmente mentiria.
    //
    // Corrigido ANTES de a segunda onda entrar, e nao depois.
    const { data: ondas, error: eOnda } = await db
      .from('survey_waves')
      .select('wave, label, reference_date, respondents, eligible');
    if (eOnda) throw new Error(`Falha ao listar ondas: ${eOnda.message}`);

    const { atual, anterior: ondaAnt, ordenadas } = escolherOndas((ondas ?? []) as OndaLinha[]);
    const ondaAtual = atual?.wave ?? null;
    const ondaAnterior = ondaAnt?.wave ?? null;

    const [eng, engAnt, drv, onb, dist] = await Promise.all([
      ondaAtual
        ? db.from('engagement_scores').select('*').eq('wave', ondaAtual).order('position', { ascending: true })
        : db.from('engagement_scores').select('*').order('position', { ascending: true }),
      // A onda anterior entra so para o delta ser CALCULADO. Ver abaixo.
      ondaAnterior
        ? db.from('engagement_scores').select('scope, enps, retention_risk, satisfaction').eq('wave', ondaAnterior)
        : Promise.resolve({ data: [], error: null }),
      db
        .from('engagement_drivers')
        .select('wave, driver, driver_desc, question, score_current, score_prev, evaluation, driver_pos, q_pos')
        .eq('wave', ondaAtual ?? '')
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
    // O delta e CALCULADO entre as ondas, nao lido da carga. A regra -- e o
    // porque -- vivem em lib/onda.ts, com teste. Esta funcao e a irma
    // `getEngagementCross` usam a mesma; a primeira versao disto ficou so aqui,
    // e a aba apareceu metade certa (drivers de agosto, lista por area com as
    // duas ondas empilhadas).
    const comDelta = comDeltaCalculado(
      (eng.data ?? []) as EngagementScore[],
      (engAnt.data ?? []) as LinhaComEscopo[],
    );

    const ehEmpresa = (r: EngagementScore) => (r.scope ?? '').trim().toLowerCase() === 'company';
    const engagement = (comDelta as EngagementScore[]).filter((r) => {
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

    // Contagem REAL por onda, em vez de um rotulo escrito a mao.
    //
    // E o que revela o caso de jul/25: ela existe em `survey_waves` com 295
    // respostas e ZERO recortes e ZERO drivers -- foi registrada e nunca
    // carregada. A lista fixa dizia "10 perguntas de driver" e ninguem tinha
    // como perceber que nao havia nenhuma.
    const [cnt, cntDrv] = await Promise.all([
      db.from('survey_cut_scores').select('wave'),
      db.from('survey_driver_importance').select('wave'),
    ]);
    const contar = (linhas: unknown, w: string) =>
      ((linhas ?? []) as Array<{ wave: string }>).filter((r) => r.wave === w).length;

    const resumoOndas: OndaResumo[] = ordenadas.map((o, i) => ({
      wave: o.wave,
      label: o.label,
      referenceDate: o.reference_date,
      respondents: o.respondents ?? null,
      eligible: o.eligible ?? null,
      participacao: o.respondents && o.eligible
        ? Math.round((o.respondents / o.eligible) * 1000) / 10
        : null,
      drivers: contar(cntDrv.data, o.wave),
      recortes: contar(cnt.data, o.wave),
      atual: i === 0,
    }));

    return {
      engagement,
      ondas: resumoOndas,
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
  /**
   * Rótulos das duas ondas comparadas, para o slope chart escrever no
   * subtítulo. Ele tinha "jul/2025" e "jan/2026" escritos à mão como default,
   * e continuou anunciando essa comparação depois de ago/26 entrar -- o mesmo
   * defeito da linha do tempo, no componente ao lado.
   *
   * `ondaAnteriorLabel` é null quando não há com o que comparar; nesse caso o
   * gráfico não tem o que desenhar e não aparece.
   */
  ondaAtualLabel: string | null;
  ondaAnteriorLabel: string | null;
  /**
   * eNPS por área ao longo de TODAS as ondas com dado, da mais antiga para a
   * mais nova. Só entram ondas que têm linhas de verdade -- jul/25 está
   * cadastrada com 295 respostas e zero linhas, e uma onda que nunca foi
   * carregada não vira ponto no gráfico.
   *
   * Com duas ondas, a tela desenha o slope (a pergunta da reunião é "o que
   * mudou desde a última pesquisa"). Com três ou mais, vira linha do tempo.
   */
  serieEnps: OndaEnps[];
}

export interface OndaEnps {
  wave: string;
  label: string;
  referenceDate: string;
  /** Uma entrada por área presente naquela onda. `company` fica de fora. */
  pontos: Array<{ scope: string; enps: number }>;
}

export const getEngagementCross = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => DeptFilterInput.parse(input))
  .handler(async ({ context, data: input }): Promise<EngagementCrossData> => {
    const scope = await authorize(context.claims.email as string | undefined);
    const podeVerTudo = isGlobalProfile(scope.profile);

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const db = supabaseAdmin as unknown as UntypedClient;

    // ======================================================================
    // ESTA FUNCAO TAMBEM PRECISA ESCOLHER A ONDA
    // ======================================================================
    // Em 18/08/2026 eu corrigi a leitura de onda em `getExperienceData` e
    // esqueci esta, que le a MESMA tabela para alimentar a fila por area, o
    // slope chart e a frase "onde agir primeiro". A aba ficou metade certa: os
    // drivers vieram de agosto e a lista por area veio com as duas ondas
    // empilhadas -- "Marketing 48" e "Marketing 62" na mesma tela, uma de
    // agosto e outra de janeiro, sem nada dizendo qual era qual.
    //
    // A regra agora mora em lib/onda.ts. Nao existe mais "a outra copia".
    const { data: ondasBrutas, error: eOndas } = await db
      .from('survey_waves').select('wave, label, reference_date, respondents, eligible');
    if (eOndas) throw new Error(`Falha ao listar ondas: ${eOndas.message}`);
    const { atual: ondaAtual, anterior: ondaAnterior } =
      escolherOndas((ondasBrutas ?? []) as OndaLinha[]);

    const [eng, engAnt, todasOndas, mm, lv] = await Promise.all([
      db
        .from('engagement_scores')
        .select('scope, enps, enps_delta, retention_risk, satisfaction, participation, status, gap_ent_enps')
        .eq('wave', ondaAtual?.wave ?? '')
        .order('position', { ascending: true }),
      ondaAnterior
        ? db.from('engagement_scores')
            .select('scope, enps, retention_risk, satisfaction')
            .eq('wave', ondaAnterior.wave)
        : Promise.resolve({ data: [], error: null }),
      // O eNPS de TODAS as ondas, para a série histórica. Só três colunas: o
      // resto de cada onda não interessa a uma linha do tempo, e trazer menos
      // é a diferença entre uma consulta e um dump.
      db.from('engagement_scores').select('wave, scope, enps'),
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

    // O delta aqui alimenta o slope chart (`enpsPrev` é reconstruído de
    // `enps - enps_delta` em engagement-context). Com o delta vindo da carga,
    // o gráfico comparava agosto com o que o deck do CEO dizia de jan/26 --
    // que era a comparação jul/25 → jan/26. Duas ondas erradas de distância.
    const comDelta = comDeltaCalculado(
      (eng.data ?? []) as unknown as LinhaComEscopo[],
      (engAnt.data ?? []) as LinhaComEscopo[],
    ) as unknown as EngagementScoreLike[];

    const scores = comDelta.filter((s) => {
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

    // ======================================================================
    // A SÉRIE HISTÓRICA, COM O MESMO RECORTE DE ÁREA
    // ======================================================================
    // O escopo tem que valer aqui também, e pela razão de sempre: uma linha do
    // tempo com nove áreas é o mesmo ranking que o recorte por departamento
    // fecha nas outras visões, entrando por uma porta nova.
    //
    // `company` fica de fora porque uma linha de empresa junto das de área
    // dominaria a leitura -- e o número da empresa já está nos cartões do topo.
    const podeVerArea = (nome: string): boolean => {
      const dept = deptForScope(nome);
      if (dept == null) return false;              // 'company', 'Betfair'
      if (!podeVerTudo && !isInScope(scope, dept)) return false;
      return !sel || dept === sel;
    };
    const porOnda = new Map<string, Array<{ scope: string; enps: number }>>();
    for (const r of ((todasOndas.data ?? []) as Array<{
      wave: string; scope: string; enps: number | null;
    }>)) {
      if (r.enps == null || !podeVerArea(r.scope ?? '')) continue;
      const lista = porOnda.get(r.wave) ?? [];
      lista.push({ scope: r.scope, enps: Number(r.enps) });
      porOnda.set(r.wave, lista);
    }
    // Da mais antiga para a mais nova, e só as que têm ponto. Uma onda
    // cadastrada e nunca carregada -- jul/25, com 295 respostas anotadas e zero
    // linhas -- não vira ponto: viraria um buraco no meio da linha, que o olho
    // lê como queda.
    const serieEnps: OndaEnps[] = [...(ondasBrutas ?? [] as OndaLinha[])]
      .sort((a, b) => (a.reference_date < b.reference_date ? -1 : 1))
      .filter((o) => (porOnda.get(o.wave)?.length ?? 0) > 0)
      .map((o) => ({
        wave: o.wave,
        label: o.label,
        referenceDate: o.reference_date,
        pontos: porOnda.get(o.wave) ?? [],
      }));

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

    return {
      ...result,
      ressalvas,
      ondaAtualLabel: ondaAtual?.label ?? null,
      ondaAnteriorLabel: ondaAnterior?.label ?? null,
      serieEnps,
    };
  });
