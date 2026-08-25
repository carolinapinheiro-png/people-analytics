import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DeptFilterInput, selectedDept } from '@/lib/dept-filter';
import {
  isGlobalProfile, isInScope, visibleExperienceSubTabs,
  type AccessScope, type ExperienceSubTab,
} from '@/lib/permissions';
import { deptForScope } from '@/lib/engagement-context';
import { partesDoCruzamento } from '@/lib/aggregator/polly-survey';
import {
  escolherOndas, comDeltaCalculado, type OndaLinha, type LinhaComEscopo,
} from '@/lib/onda';
import {
  aderenciaDoRisco,
  type FaixaOnda, type RiscoObservado, type AderenciaRisco,
} from '@/lib/analise-engajamento';

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
  /**
   * O que esta onda tem de diferente, escrito na carga. jul/25 veio em duas
   * partes com `n` diferente em cada painel -- sem esta frase na tela, o
   * numero que muda de um quadro para o outro parece defeito.
   */
  observacao: string | null;
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
      .select('wave, label, reference_date, respondents, eligible, notes');
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
      observacao: o.notes?.trim() || null,
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
  /**
   * As faixas de tempo de casa das duas ondas mais recentes que têm esse
   * recorte -- que podem NÃO ser as duas últimas ondas: jan/26 não tem quebra
   * por tempo, então hoje a comparação é jul/25 x ago/26. Por isso os rótulos
   * vêm junto, em vez de a tela deduzir.
   *
   * `null` quando não há duas ondas com o recorte, e aí o painel não aparece.
   */
  tempoDeCasa: {
    /** Da mais antiga para a mais nova. Só ondas que TÊM o recorte por tempo. */
    ondas: Array<{ label: string; faixas: FaixaOnda[] }>;
    /** Nome da área quando a série é dela; null quando é da empresa. */
    daArea: string | null;
  } | null;
  /**
   * O risco que cada área declarou na onda ANTERIOR à janela de saídas,
   * contra quem de fato pediu demissão dentro dela.
   *
   * `null` quando não existe onda antes da janela -- sem ela não há previsão a
   * testar, só coincidência.
   */
  risco: (AderenciaRisco & {
    ondaLabel: string;
    janela: { inicio: string; fim: string };
  }) | null;
}

export interface OndaEnps {
  wave: string;
  label: string;
  referenceDate: string;
  /** Uma entrada por área presente naquela onda. `company` fica de fora. */
  pontos: PontoOnda[];
}

/**
 * Um ponto da série, com a composição por trás do número.
 *
 * ------------------------------------------------------------------
 * POR QUE O eNPS SOZINHO NÃO BASTA
 * ------------------------------------------------------------------
 * eNPS é uma subtração de porcentagens, e subtração perde informação: 60 pode
 * ser "80% promotores e 20% detratores" ou "60% promotores, 40% passivos e
 * nenhum detrator". As duas situações pedem conversas diferentes -- a primeira
 * tem gente ativamente insatisfeita, a segunda tem gente morna.
 *
 * Some a isso o tamanho: Finance caiu 34 pontos com 24 respostas. Uma pessoa
 * ali move o índice em 4 pontos. Sem o `n` ao lado, uma queda de área pequena
 * e uma de área grande parecem o mesmo fato.
 *
 * Tudo isto já está em `survey_cut_scores`, medido na carga. Só não estava
 * saindo do banco.
 */
export interface PontoOnda {
  scope: string;
  enps: number;
  n: number | null;
  promotores: number | null;
  passivos: number | null;
  detratores: number | null;
  risco: number | null;
  satisfacao: number | null;
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
      .from('survey_waves').select('wave, label, reference_date, respondents, eligible, notes');
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
      // A série histórica sai de `survey_cut_scores`, e não de
      // `engagement_scores`, por um motivo só: é lá que está a COMPOSIÇÃO.
      //
      // Os dois têm o eNPS por área e por onda. Mas promotores, passivos,
      // detratores e o `n` só existem no primeiro -- e são justamente eles que
      // transformam o ponto do gráfico em explicação quando alguém para o
      // mouse em cima. Ler do outro lugar significaria uma segunda consulta
      // para os mesmos pontos.
      // 'tempo' vem junto com 'area' na mesma consulta: é o mesmo recorte, a
      // mesma tabela, e separá-los seria uma ida a mais ao banco pelo que já
      // estava vindo. O tempo de casa NÃO identifica ninguém, então ele segue
      // inteiro para qualquer perfil -- a mesma regra dos outros recortes não
      // nominais.
      //
      // 'area+tempo' entra na mesma lista desde que o cruzamento passou a ser
      // calculado. Sem ele aqui, o bloco de tempo de casa continuava caindo no
      // fallback da empresa mesmo com o dado gravado -- a linha existia no
      // banco e nunca chegava ao servidor. A permissão dele é tratada por
      // `podeVerArea` sobre a área extraída do nome composto, abaixo.
      db.from('survey_cut_scores')
        .select('wave, cut_type, cut_value, n, enps, promotores, passivos, detratores, risco, satisfacao')
        .in('cut_type', ['area', 'tempo', 'area+tempo']),
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
    // O CRUZAMENTO RISCO × SAÍDA NÃO SEGUE A SELEÇÃO -- E ISSO NÃO É DESCUIDO
    // ======================================================================
    // Todo o resto desta função responde "como está esta área". Aquele
    // cruzamento responde outra coisa: "a coluna de risco de saída antecipa
    // quem vai embora?". É uma pergunta sobre o INSTRUMENTO, e a resposta é
    // uma correlação ENTRE áreas -- com uma área só ela não existe.
    //
    // Enquanto ele se alimentou de `result.rows`, filtrar um departamento o
    // fazia sumir da tela inteiro (o componente devolve null abaixo de três
    // linhas). Sumir em silêncio se lê como "não há nada aqui", quando o certo
    // é "esta pergunta não é sobre a sua área".
    //
    // A PERMISSÃO CONTINUA VALENDO, e é a única coisa que continua. Quem tem
    // escopo restrito segue vendo só o que pode: o que cai é a SELEÇÃO, não o
    // teto. É a mesma ordem de `recorteNoEscopo` -- permissão primeiro, e aqui
    // a seleção simplesmente não se aplica.
    const semSelecao = sel
      ? buildEngagementContext(
          comDelta.filter((s) => {
            const dept = deptForScope(s.scope ?? '');
            if (dept == null) return podeVerTudo;
            return podeVerTudo || isInScope(scope, dept);
          }),
          leavers,
          hcPorMesDept,
          JANELA,
        )
      : result;

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
    const numero = (v: unknown): number | null =>
      v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null;

    type LinhaCutMin = { wave: string; cut_type: string; cut_value: string };
    type LinhaCut = {
      wave: string; cut_type: string; cut_value: string; n: number | null; enps: number | null;
      promotores: number | null; passivos: number | null; detratores: number | null;
      risco: number | null; satisfacao: number | null;
    };
    const todosCuts = (todasOndas.data ?? []) as LinhaCut[];

    const porOnda = new Map<string, PontoOnda[]>();
    for (const r of todosCuts) {
      if (r.cut_type !== 'area') continue;
      const nome = r.cut_value ?? '';
      if (r.enps == null || !podeVerArea(nome)) continue;
      const lista = porOnda.get(r.wave) ?? [];
      lista.push({
        scope: nome,
        enps: Number(r.enps),
        n: numero(r.n),
        promotores: numero(r.promotores),
        passivos: numero(r.passivos),
        detratores: numero(r.detratores),
        risco: numero(r.risco),
        satisfacao: numero(r.satisfacao),
      });
      porOnda.set(r.wave, lista);
    }

    // ======================================================================
    // O RECORTE POR TEMPO DE CASA, ONDA A ONDA
    // ======================================================================
    // A tela mostrava as faixas de tempo da onda atual e nunca as comparava
    // entre ondas. Foi comparando que apareceu o achado de 19/08: a queda de
    // 13 pontos do eNPS não está distribuída -- ela se concentra em quem tem
    // mais de um ano de casa (-20, -14, -17), enquanto quem chegou nos últimos
    // três meses praticamente não mudou (-3).
    //
    // Isso muda para onde se olha: aponta para longe de contratação e
    // onboarding, e para o que acontece depois do primeiro ano.
    //
    // ------------------------------------------------------------------
    // COM ÁREA SELECIONADA, USA O CRUZAMENTO -- QUANDO ELE EXISTE
    // ------------------------------------------------------------------
    // Este bloco dizia na tela "não existe a quebra por área nesta série", e a
    // frase estava errada: cada resposta sempre carregou área e tempo de casa
    // na mesma linha. O que não existia era o cruzamento CALCULADO, porque o
    // agregador percorria uma dimensão por vez.
    //
    // Agora `area+tempo` é um recorte como outro qualquer. Onde a onda foi
    // carregada com ele, o bloco segue o filtro; onde não foi, cai na série da
    // empresa e a tela diz que não foi calculado NAQUELA carga -- que é
    // diferente de dizer que não dá.
    //
    // A supressão continua sendo o limite real: Commercial tem 48 respondentes
    // espalhados por 7 faixas, e duas ficam abaixo de cinco pessoas. O
    // componente mostra quais sumiram; sumir calado é que não pode.
    const porOndaTempo = new Map<string, FaixaOnda[]>();

    /** Preenche o mapa a partir de um tipo de recorte. Devolve as ondas cobertas. */
    const carregarTempo = (
      quero: (r: LinhaCutMin) => string | null,
    ): Set<string> => {
      porOndaTempo.clear();
      const ondas = new Set<string>();
      for (const r of todosCuts) {
        const faixa = quero(r);
        if (faixa == null) continue;
        const lista = porOndaTempo.get(r.wave) ?? [];
        lista.push({ faixa, n: Number(r.n ?? 0), enps: numero(r.enps) });
        porOndaTempo.set(r.wave, lista);
        ondas.add(r.wave);
      }
      return ondas;
    };

    const daEmpresa = (r: LinhaCutMin) => (r.cut_type === 'tempo' ? r.cut_value : null);
    const daAreaSel = (r: LinhaCutMin) => {
      if (r.cut_type !== 'area+tempo') return null;
      const p = partesDoCruzamento(r.cut_value ?? '');
      if (!p) return null;
      // ------------------------------------------------------------------
      // PERMISSÃO E SELEÇÃO, NA ORDEM, MESMO SENDO REDUNDANTE
      // ------------------------------------------------------------------
      // A consulta traz o cruzamento de TODAS as áreas -- ela não filtra por
      // escopo. Hoje comparar com `sel` já basta, porque perfil restrito sempre
      // tem `sel` preenchido com a própria área e um pedido fora do escopo já
      // levantou erro lá em cima.
      //
      // "Hoje basta" é exatamente o tipo de raciocínio que envelhece: no dia em
      // que `sel` puder ficar nulo para perfil restrito, esta linha passa a
      // liberar o cruzamento de qualquer área. `podeVerArea` já é a regra do
      // resto da função e custa nada aqui.
      if (!podeVerArea(p.area)) return null;
      return deptForScope(p.area) === sel ? p.valor : null;
    };

    // A onda mais recente que tem QUALQUER dado de tempo de casa. É contra ela
    // que o cruzamento precisa se medir.
    const ondasComTempoEmpresa = carregarTempo(daEmpresa);
    const maisRecenteComTempo = [...(ondasBrutas ?? [] as OndaLinha[])]
      .filter((o) => ondasComTempoEmpresa.has(o.wave))
      .sort((a, b) => (a.reference_date < b.reference_date ? 1 : -1))[0]?.wave;

    // ------------------------------------------------------------------
    // O CRUZAMENTO SÓ VALE SE ALCANÇAR A ONDA ATUAL
    // ------------------------------------------------------------------
    // As ondas são carregadas uma a uma, então é normal que só algumas tenham o
    // cruzamento. Se jan/26 tiver e ago/26 não, usar o cruzamento faria este
    // bloco desenhar "Julho/25 → Janeiro/26" embaixo de uma tela que diz
    // Agosto/26 no cabeçalho -- uma série de outro período, com a mesma cara.
    //
    // Meia cobertura é pior que nenhuma aqui: a que falta é justamente a ponta
    // que todo mundo lê primeiro.
    let tempoPorArea = false;
    if (sel) {
      const ondasCruzadas = carregarTempo(daAreaSel);
      tempoPorArea =
        // DUAS ondas, não uma. O bloco compara ondas entre si e some abaixo de
        // duas -- então com o cruzamento em uma onda só ele não cairia no
        // fallback, ele desapareceria. Sumir em silêncio é o comportamento que
        // este arquivo inteiro tenta evitar, e a primeira carga com cruzamento
        // (ago/26 sozinha) é exatamente esse caso.
        ondasCruzadas.size >= 2 &&
        maisRecenteComTempo != null &&
        ondasCruzadas.has(maisRecenteComTempo);
      // Sem alcance até a onda atual, volta para a série da empresa: um bloco
      // vazio se lê como "esta área não tem tempo de casa".
      if (!tempoPorArea) carregarTempo(daEmpresa);
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

    // A comparação por tempo de casa entre as duas ondas mais recentes que
    // TÊM esse recorte. jan/26 não tem -- então a comparação é jul/25 x ago/26,
    // e o rótulo precisa dizer isso, senão a tela sugere uma janela que não é
    // a que está sendo medida.
    const comTempo = [...(ondasBrutas ?? [] as OndaLinha[])]
      .sort((a, b) => (a.reference_date < b.reference_date ? 1 : -1))
      .filter((o) => (porOndaTempo.get(o.wave)?.length ?? 0) > 0);

    // TODAS as ondas com o recorte, da mais antiga para a mais nova.
    //
    // A primeira versão disto mandava só as DUAS mais recentes, e a tela
    // comparava duas pontas. Com três ondas dá para separar queda contínua de
    // oscilação -- e a diferença não é cosmética: uma queda de 20 pontos em
    // três medições seguidas é um processo em curso, e uma oscilação que por
    // acaso terminou 20 abaixo é ruído com uma ponta infeliz. As duas
    // produziam o mesmo número na versão anterior.
    const tempoDeCasa = comTempo.length >= 2
      ? {
          ondas: [...comTempo].reverse().map((o) => ({
            label: o.label,
            faixas: porOndaTempo.get(o.wave) ?? [],
          })),
          /**
           * A série mostrada é da área selecionada, ou da empresa?
           *
           * Sem isto o componente teria que adivinhar, e adivinhar aqui
           * significa rotular números da empresa com o nome de uma área.
           */
          daArea: sel && tempoPorArea ? sel : null,
        }
      : null;

    // ======================================================================
    // O PAINEL AVALIANDO A SI MESMO
    // ======================================================================
    // A coluna "risco de saída" aparece em toda visão de engajamento e carrega
    // uma promessa implícita: que antecipa quem vai embora. Ninguém nunca
    // conferiu.
    //
    // Dá para conferir. A janela de saídas que esta função já carrega
    // (fev-jul/2026) é exatamente o intervalo ENTRE jan/26 e ago/26. Então:
    // pega o risco que cada área declarou na onda ANTERIOR à janela, e compara
    // com quem de fato pediu demissão dentro dela.
    //
    // A onda tem que ser a anterior, e não a atual: usar ago/26 seria comparar
    // uma declaração de julho com saídas de fevereiro -- o efeito antes da
    // causa. Foi por pouco que essa inversão não entrou aqui.
    const ondaAntesDaJanela = [...(ondasBrutas ?? [] as OndaLinha[])]
      .filter((o) => o.reference_date < `${JANELA.inicio}-01`)
      .sort((a, b) => (a.reference_date < b.reference_date ? 1 : -1))[0] ?? null;

    const risco = ondaAntesDaJanela
      ? (() => {
          const declarado = new Map(
            (porOnda.get(ondaAntesDaJanela.wave) ?? [])
              .filter((p) => p.risco != null)
              .map((p) => [p.scope.trim().toLowerCase(), p]),
          );
          const linhas: RiscoObservado[] = [];
          // `semSelecao.rows`, não `result.rows` -- ver o bloco acima.
          for (const r of semSelecao.rows) {
            const d = declarado.get((r.scope ?? '').trim().toLowerCase());
            if (!d || d.risco == null) continue;
            linhas.push({
              area: r.scope,
              riscoDeclarado: d.risco,
              respostas: d.n ?? 0,
              pediramDemissao: r.saidasVoluntarias ?? 0,
              headcount: r.headcountMedio,
              // A taxa anualizada que a aba já calcula. Anualizada dos dois
              // lados evita comparar seis meses de saída com um percentual
              // que não tem prazo.
              saidaObservada: r.atricaoVoluntariaAnual,
            });
          }
          return {
            ondaLabel: ondaAntesDaJanela.label,
            janela: JANELA,
            ...aderenciaDoRisco(linhas, semSelecao.mesesObservados),
          };
        })()
      : null;

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
      tempoDeCasa,
      risco,
    };
  });
