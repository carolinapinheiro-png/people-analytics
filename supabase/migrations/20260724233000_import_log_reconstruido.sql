-- Log de importacao da serie reconstruida.
--
-- A escrita em monthly_metrics (source='reconstruido') acontece so pela server
-- function importReconstruido, com service_role. Cada importacao e registrada
-- aqui -- mesmo padrao do leavers_access_log: o log e requisito, nao efeito
-- colateral; se ele falhar, a importacao falha junto.
--
-- Sem policy de leitura para authenticated: so service_role acessa.

CREATE TABLE IF NOT EXISTS public.monthly_metrics_import_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email     text NOT NULL,
  source         text NOT NULL,
  rows_upserted  integer NOT NULL,
  months         integer NOT NULL,
  brands         text[] NOT NULL,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE public.monthly_metrics_import_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.monthly_metrics_import_log TO service_role;

COMMENT ON TABLE public.monthly_metrics_import_log IS
  'Quem importou a serie reconstruida, quando e quanto. Escrita e leitura so via service_role.';
