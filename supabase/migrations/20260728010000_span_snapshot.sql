-- Span de controle: snapshot calculado da cadeia real de reporte do Talent
-- Mobility (nao mais fabricado). So agregados: contagem de gestores, reports e
-- span medio por departamento e faixa. Sem nomes individuais. Leitura authenticated.

CREATE TABLE IF NOT EXISTS public.span_snapshot (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_month date NOT NULL,
  scope_type     text NOT NULL,     -- 'overall' | 'department' | 'distribution'
  scope          text NOT NULL,     -- nome do depto, faixa, ou 'all'
  managers       integer,
  reports        integer,
  avg_span       numeric,
  actives        integer,           -- so no overall
  ics            integer,           -- individuais sem report (so no overall)
  position       integer DEFAULT 0,
  loaded_at      timestamptz DEFAULT now(),
  CONSTRAINT span_snapshot_unique UNIQUE (snapshot_month, scope_type, scope)
);

ALTER TABLE public.span_snapshot ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.span_snapshot TO authenticated;
GRANT ALL ON public.span_snapshot TO service_role;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='span_snapshot' AND policyname='auth read span') THEN
    CREATE POLICY "auth read span" ON public.span_snapshot FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

COMMENT ON TABLE public.span_snapshot IS
  'Span de controle calculado da cadeia real (Talent Mobility). So agregados.';
