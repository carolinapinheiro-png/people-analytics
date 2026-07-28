-- Aba Experiencia: engajamento (deck do CEO jan/2026) e distribuicoes de
-- inclusao/pertencimento (Polly Inclusion Survey 2026 + Flutter Near You).
-- Onboarding ja vive em onboarding_survey_aggregates.
-- So agregados; nenhuma resposta individual. Leitura para authenticated.

-- 1. Engajamento: uma linha por (wave, escopo). Escopo 'company' ou departamento.
CREATE TABLE IF NOT EXISTS public.engagement_scores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wave            text NOT NULL,               -- ex.: 'jan_2026'
  scope           text NOT NULL,               -- 'company' ou nome do depto
  enps            numeric,
  enps_delta      numeric,                      -- vs onda anterior
  retention_risk  numeric,                      -- %
  rr_delta        numeric,                      -- pp vs onda anterior
  satisfaction    numeric,                      -- 0-10
  sat_delta       numeric,
  participation   numeric,                      -- % (so company)
  status          text,
  position        integer DEFAULT 0,            -- ordem de exibicao
  loaded_at       timestamptz DEFAULT now(),
  CONSTRAINT engagement_scores_unique UNIQUE (wave, scope)
);

-- 2. Distribuicoes de experiencia: inclusao (demografia), pertencimento
--    (itens de concordancia) e Flutter Near You. Formato generico.
CREATE TABLE IF NOT EXISTS public.experience_distributions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey      text NOT NULL,                    -- 'polly_2026' | 'fny_2026'
  section     text NOT NULL,                    -- 'demografia'|'pertencimento'|'dei'|'fny'
  question    text NOT NULL,
  category    text NOT NULL,
  pct         numeric,
  n           integer,
  position    integer DEFAULT 0,
  loaded_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experience_dist_idx
  ON public.experience_distributions (survey, section, question, position);

ALTER TABLE public.engagement_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_distributions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.engagement_scores TO authenticated;
GRANT SELECT ON public.experience_distributions TO authenticated;
GRANT ALL ON public.engagement_scores TO service_role;
GRANT ALL ON public.experience_distributions TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='engagement_scores' AND policyname='auth read engagement') THEN
    CREATE POLICY "auth read engagement" ON public.engagement_scores FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='experience_distributions' AND policyname='auth read experience') THEN
    CREATE POLICY "auth read experience" ON public.experience_distributions FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

COMMENT ON TABLE public.engagement_scores IS
  'Engajamento por onda/escopo (deck do CEO). Company + departamentos. So agregados.';
COMMENT ON TABLE public.experience_distributions IS
  'Distribuicoes de inclusao/pertencimento (Polly, FNY). So agregados; comentarios livres nunca aqui.';
