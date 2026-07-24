-- Agregados das pesquisas de onboarding (1 semana / 45 dias / 90 dias).
--
-- Fonte: tres formularios Google vivos (respostas continuam chegando).
-- Carga de 24/07/2026: 109 + 116 + 95 respostas. Recarga e manual: exporta-se
-- o CSV e roda-se o agregador; upsert por (stage, slice, valor) atualiza.
--
-- Duas regras de protecao, deliberadas:
--   1. Supressao de celula minima: recortes com n < 3 nao sao gravados. As
--      pesquisas nao tem nome, mas departamento + mes de inicio + contrato em
--      turma pequena identifica a pessoa -- e a "media" de uma celula de 1 e
--      o dado do individuo.
--   2. Comentarios livres NUNCA entram nesta tabela. Citam colegas
--      nominalmente e incluem relato interpessoal sensivel. Se algum dia o
--      nivel de resposta individual for necessario, o caminho e o mesmo de
--      leavers: tabela sem policy de leitura + server function com log.

CREATE TABLE IF NOT EXISTS public.onboarding_survey_aggregates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_stage text NOT NULL CHECK (survey_stage IN ('1_semana','45_dias','90_dias')),
  slice_type   text NOT NULL CHECK (slice_type IN ('overall','department','cohort_month')),
  slice_value  text NOT NULL,
  n            integer NOT NULL,
  metrics      jsonb NOT NULL,
  loaded_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (survey_stage, slice_type, slice_value)
);

ALTER TABLE public.onboarding_survey_aggregates ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.onboarding_survey_aggregates TO authenticated;
GRANT ALL ON public.onboarding_survey_aggregates TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='onboarding_survey_aggregates') THEN
    CREATE POLICY "Authenticated can read onboarding aggregates"
      ON public.onboarding_survey_aggregates FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
