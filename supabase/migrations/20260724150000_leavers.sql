-- Tira o dado individual de desligados do bundle do navegador.
--
-- Antes: src/data/leavers-data.ts (152 pessoas, com nome, raca e salario) era
-- importado pelo DashboardContext, entao ia inteiro para o bundle. Qualquer
-- usuario autenticado baixava a base completa, independentemente do que a tela
-- mostrava.
--
-- Agora: a tabela nao tem policy de SELECT. Nem authenticated nem anon leem.
-- O unico caminho e a server function listLeavers, que roda com service_role,
-- verifica a autorizacao e grava em leavers_access_log antes de devolver.
-- Decisao da area: todos os usuarios autorizados veem todos os campos, e toda
-- consulta e registrada.

CREATE TABLE IF NOT EXISTS public.leavers (
  id                          uuid PRIMARY KEY,
  nome                        text NOT NULL,
  genero                      text,
  raca                        text,
  salario                     numeric(12,2),
  vinculo                     text,
  cargo                       text,
  departamento                text,
  "time"                      text,
  level                       text,
  job_family                  text,
  career_band                 text,
  workday_level               text,
  data_desligamento_str       text,
  tipo_desligamento           text,
  motivo_desligamento         text,
  data_desligamento           date,
  data_admissao               date,
  tempo_casa_dias             integer,
  faixa_salarial              text,
  tempo_casa_faixa            text,
  mes_desligamento            text,
  ano_desligamento            text,
  tipo_desligamento_agrupado  text,
  created_at                  timestamptz DEFAULT now()
);

COMMENT ON TABLE public.leavers IS
  'Dado individual de pessoas desligadas, incluindo nome, raca e salario. Nunca deve ser importado por codigo de cliente: a leitura passa pela server function listLeavers, que registra o acesso.';

CREATE INDEX IF NOT EXISTS leavers_desligamento_idx ON public.leavers (data_desligamento DESC);
CREATE INDEX IF NOT EXISTS leavers_depto_idx        ON public.leavers (departamento);

ALTER TABLE public.leavers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leavers FROM authenticated, anon;
GRANT ALL ON public.leavers TO service_role;

CREATE TABLE IF NOT EXISTS public.leavers_access_log (
  id            bigserial PRIMARY KEY,
  user_email    text NOT NULL,
  rows_returned integer NOT NULL,
  context       text,
  accessed_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leavers_access_log IS
  'Registro de toda consulta a dado individual de desligados. Escrito pela server function listLeavers.';

CREATE INDEX IF NOT EXISTS leavers_access_log_email_idx ON public.leavers_access_log (user_email, accessed_at DESC);

ALTER TABLE public.leavers_access_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leavers_access_log FROM authenticated, anon;
GRANT ALL ON public.leavers_access_log TO service_role;
