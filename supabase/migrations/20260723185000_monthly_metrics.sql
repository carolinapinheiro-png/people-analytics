-- Etapa 2: serie mensal agregada
-- Uma linha por mes/marca. Nenhum dado individual.

CREATE TABLE IF NOT EXISTS public.monthly_metrics (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month                  date NOT NULL,
  brand                  text NOT NULL,
  business_unit          public.business_unit,
  headcount              integer NOT NULL,
  joiners                integer NOT NULL DEFAULT 0,
  leavers                integer NOT NULL DEFAULT 0,
  attrition_rate         numeric(7,3),
  gender_female          integer,
  gender_male            integer,
  gender_female_pct      numeric(6,2),
  leaders                integer,
  leader_female          integer,
  leader_female_pct      numeric(6,2),
  leaders_pct            numeric(6,2),
  avg_salary_leaders     numeric(12,2),
  avg_salary_non_leaders numeric(12,2),
  promotions             integer DEFAULT 0,
  state_mix              jsonb NOT NULL DEFAULT '{}'::jsonb,
  dept_data              jsonb NOT NULL DEFAULT '{}'::jsonb,
  salary_band_attrition  jsonb,
  exit_survey            jsonb,
  source                 text NOT NULL DEFAULT 'raw-data.ts',
  created_at             timestamp with time zone DEFAULT now(),
  updated_at             timestamp with time zone DEFAULT now(),
  CONSTRAINT monthly_metrics_unique UNIQUE (month, brand),
  CONSTRAINT monthly_metrics_month_is_first_day CHECK (date_trunc('month', month) = month)
);

COMMENT ON TABLE public.monthly_metrics IS
  'Serie mensal agregada por marca. Uma linha por mes/marca. Sem dado individual.';
COMMENT ON COLUMN public.monthly_metrics.business_unit IS
  'Unidade de negocio canonica. Nulo enquanto o mapeamento da marca legada nao estiver decidido.';
COMMENT ON COLUMN public.monthly_metrics.exit_survey IS
  'Motivos de desligamento agregados. Comentarios livres NAO devem ser gravados aqui.';

CREATE INDEX IF NOT EXISTS monthly_metrics_month_idx ON public.monthly_metrics (month DESC);
CREATE INDEX IF NOT EXISTS monthly_metrics_bu_idx    ON public.monthly_metrics (business_unit, month DESC);

ALTER TABLE public.monthly_metrics ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.monthly_metrics TO authenticated;
GRANT ALL    ON public.monthly_metrics TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='monthly_metrics'
      AND policyname='Authenticated can read monthly_metrics'
  ) THEN
    CREATE POLICY "Authenticated can read monthly_metrics"
      ON public.monthly_metrics FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
