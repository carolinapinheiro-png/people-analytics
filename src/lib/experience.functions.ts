import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DeptFilterInput, selectedDept } from '@/lib/dept-filter';
import {
  isGlobalProfile, isInScope, type AccessProfile, type AccessScope,
} from '@/lib/permissions';

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

async function authorize(userEmail: string | undefined): Promise<AccessScope> {
  if (!userEmail) throw new Error('Unauthorized');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('allowed_emails')
    .select('role, profile, departments, job_families')
    .ilike('email', userEmail)
    .maybeSingle();
  if (error) throw new Error(`Access check failed: ${error.message}`);
  if (!data) throw new Error('Forbidden');

  // O cruzamento com a base de desligados exige escopo, mesmo devolvendo só
  // contagem. Um gestor de uma área não deve inferir o volume de saídas de
  // outra a partir daqui -- o número é agregado, mas com 8 áreas na tela um
  // agregado por área é tão identificável quanto uma lista.
  const row = data as {
    profile?: string; departments?: string[]; job_families?: string[];
  };
  return {
    profile: (row.profile as AccessProfile) ?? 'dept_leader',
    departments: row.departments ?? [],
    jobFamilies: row.job_families ?? [],
  };
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
    // `EMPRESA` é a linha consolidada. Perfil restrito NÃO a recebe: com 8
    // áreas na tela, saber o total e a própria área permite estimar as outras.
    const engagement = ((eng.data ?? []) as EngagementScore[]).filter((r) => {
      const escopoDaLinha = (r.scope ?? '').trim().toUpperCase();
      if (!podeVerTudo) return escopoDaLinha === sel;
      return !sel || escopoDaLinha === sel;
    });

    return {
      engagement,
      drivers: (drv.error ? [] : drv.data ?? []) as EngagementDriver[],
      onboarding: (onb.data ?? []) as OnboardingAggregate[],
      distributions: (dist.data ?? []) as ExperienceDistribution[],
      /** Quais blocos o filtro de departamento realmente alcança. */
      deptFilterApplied: sel ? (['engagement'] as const).slice() : [],
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
  .handler(async ({ context }): Promise<EngagementCrossData> => {
    const scope = await authorize(context.claims.email as string | undefined);

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

    const leavers = ((lv.data ?? []) as Array<LeaverLike & { job_family?: string | null }>).filter(
      (r) => isInScope(scope, r.departamento, r.job_family ?? null),
    );

    const result = buildEngagementContext(
      (eng.data ?? []) as EngagementScoreLike[],
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
