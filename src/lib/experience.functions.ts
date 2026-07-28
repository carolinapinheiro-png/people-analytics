import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Leitura da aba Experiencia: engajamento (deck do CEO), onboarding (agregados
 * ja no banco) e inclusao/pertencimento (Polly + Flutter Near You). Tudo
 * agregado; nenhuma resposta individual. Acessivel a qualquer usuario
 * autorizado (mesma checagem do resto).
 */

type UntypedClient = SupabaseClient<any, 'public', any>;

async function authorize(userEmail: string | undefined) {
  if (!userEmail) throw new Error('Unauthorized');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('allowed_emails')
    .select('role')
    .ilike('email', userEmail)
    .maybeSingle();
  if (error) throw new Error(`Access check failed: ${error.message}`);
  if (!data) throw new Error('Forbidden');
}

export interface EngagementScore {
  wave: string;
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
}

export const getExperienceData = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExperienceData> => {
    await authorize(context.claims.email as string | undefined);

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

    return {
      engagement: (eng.data ?? []) as EngagementScore[],
      drivers: (drv.error ? [] : drv.data ?? []) as EngagementDriver[],
      onboarding: (onb.data ?? []) as OnboardingAggregate[],
      distributions: (dist.data ?? []) as ExperienceDistribution[],
    };
  });
