-- Pesquisa de engajamento estruturada no banco.
--
-- Origem: deck "Flutter Brazil Engagement Survey" (CEO deck, jan/2026).
-- Os valores fixos que hoje vivem no EngagementTab batem exatamente com a
-- tabela por departamento desse deck -- sao dados reais da onda de jan/2026,
-- congelados no codigo. Este schema tira o dado do componente e prepara as
-- proximas ondas: cada nova pesquisa entra como nova linha em
-- engagement_waves, sem tocar em codigo.
--
-- Dado agregado por departamento, sem individuo: leitura direta por
-- authenticated e adequada, diferente de leavers.
--
-- Ressalva: para jun/2025 o deck so informa deltas, entao eNPS 79 e RR 12.0
-- da baseline sao derivados (76-(-3) e 16.6-4.6). A satisfacao de jun/25
-- aparece de forma ambigua no deck ("= June/25" num trecho, "8.6 -> 8.3"
-- noutro); adotou-se 8.9 pela leitura "= June/25", a confirmar com a area.

CREATE TABLE IF NOT EXISTS public.engagement_waves (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wave           date NOT NULL UNIQUE,
  label          text NOT NULL,
  enps           integer,
  satisfaction   numeric(4,1),
  retention_risk numeric(5,1),
  participation_pct numeric(5,1),
  notes          text,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.engagement_dept_scores (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wave           date NOT NULL REFERENCES public.engagement_waves(wave),
  department     text NOT NULL,
  enps           integer,
  enps_delta     numeric(5,1),
  enps_gap_ent   numeric(5,1),
  retention_risk numeric(5,1),
  rr_delta_pp    numeric(5,1),
  rr_gap_ent_pp  numeric(5,1),
  satisfaction   numeric(4,1),
  sat_delta      numeric(4,1),
  sat_gap_ent    numeric(4,1),
  status         text,
  status_level   text CHECK (status_level IN ('good','ok','warn','danger')),
  UNIQUE (wave, department)
);

CREATE TABLE IF NOT EXISTS public.engagement_questions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wave        date NOT NULL REFERENCES public.engagement_waves(wave),
  driver      text NOT NULL,
  question    text NOT NULL,
  score       numeric(3,1),
  prev_score  numeric(3,1),
  evaluation  text,
  UNIQUE (wave, question)
);

ALTER TABLE public.engagement_waves       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_dept_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_questions   ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.engagement_waves, public.engagement_dept_scores, public.engagement_questions TO authenticated;
GRANT ALL ON public.engagement_waves, public.engagement_dept_scores, public.engagement_questions TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='engagement_waves') THEN
    CREATE POLICY "Authenticated can read engagement_waves" ON public.engagement_waves FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Authenticated can read engagement_dept_scores" ON public.engagement_dept_scores FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Authenticated can read engagement_questions" ON public.engagement_questions FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Cargas (identicas as aplicadas direto no banco; ON CONFLICT torna reexecucao inocua)

INSERT INTO public.engagement_waves (wave, label, enps, satisfaction, retention_risk, participation_pct, notes) VALUES
  ('2025-06-01', 'Junho 2025 — Baseline eNPS', 79, 8.9, 12.0, NULL, 'Primeira medicao padronizada Flutter International: eNPS, satisfacao e risco de retencao. Valores de eNPS e RR derivados dos deltas informados na onda de jan/2026.'),
  ('2026-01-01', 'Janeiro 2026 — Framework completo', 76, 8.9, 16.6, 79.0, '32 perguntas em 8 drivers. Detratores 12% -> 17%. RR +4.6pp vs jun/25.')
ON CONFLICT (wave) DO NOTHING;

INSERT INTO public.engagement_dept_scores
  (wave, department, enps, enps_delta, enps_gap_ent, retention_risk, rr_delta_pp, rr_gap_ent_pp, satisfaction, sat_delta, sat_gap_ent, status, status_level) VALUES
  ('2026-01-01','Customer Service',85,-2,9,26.0,8.0,9.4,8.9,-0.2,0,'Retention Risk','warn'),
  ('2026-01-01','Marketing',62,-3,-14,21.8,1.6,5.2,8.4,-0.5,-0.5,'Engagement + Retention','danger'),
  ('2026-01-01','Technology',79,-7,3,13.1,10.0,-3.4,9.2,0.2,0.3,'Retention trend','warn'),
  ('2026-01-01','Commercial',76,-5,0,12.0,0,-4.6,8.9,0,0,'Stable','ok'),
  ('2026-01-01','Human Resources',88,-2,12,17.6,-0.5,1.6,9.2,-0.5,0.3,'Strong Engagement','good'),
  ('2026-01-01','Finance',84,-7,8,10.5,-21.8,-6.1,9.0,-0.3,0.1,'Improving','good'),
  ('2026-01-01','Product',84,-6,8,7.9,-1.6,-8.7,8.9,-0.2,0,'Very Healthy','good'),
  ('2026-01-01','Legal',47,4,-29,6.7,-0.9,-9.9,8.0,-0.3,-0.9,'Engagement Gap','danger'),
  ('2026-01-01','Betfair',75,NULL,-1,15.0,NULL,-1.6,8.9,NULL,0,'Aligned (1ª onda)','ok')
ON CONFLICT (wave, department) DO NOTHING;

-- Perguntas por driver (31 perguntas da onda jan/2026, com nota anterior onde o deck informa)
-- [carga completa aplicada no banco em 2026-07-24; INSERT identico omitido aqui apenas
--  para as 31 linhas de engagement_questions -- reexecutar via seed do repositorio se
--  o banco for recriado]
