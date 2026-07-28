-- Comp ratio individual (587 ativos): salario + comp ratio + quartil da banda.
--
-- Mesma protecao dos desligados: a tabela NAO tem policy de SELECT. Nem
-- authenticated nem anon a leem. O unico caminho e a server function
-- listCompRatio, que roda com service_role, verifica allowed_emails e registra
-- cada consulta em comp_ratio_access_log antes de devolver.

CREATE TABLE IF NOT EXISTS public.comp_ratio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text, name text NOT NULL, level text, area text, team text,
  job_title text, contract text, salary numeric(12,2), comp_ratio numeric(6,2),
  quartile text, hire text, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.comp_ratio_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL, rows_returned integer NOT NULL, context text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.comp_ratio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comp_ratio_access_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.comp_ratio TO service_role;
GRANT ALL ON public.comp_ratio_access_log TO service_role;

COMMENT ON TABLE public.comp_ratio IS
  'Salario individual + comp ratio dos ativos. Sem policy de leitura; so via listCompRatio, que registra cada consulta.';
