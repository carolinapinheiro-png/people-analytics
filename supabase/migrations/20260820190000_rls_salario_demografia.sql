-- ---------------------------------------------------------------------------
-- A tabela passa a repetir a regra que o servidor ja aplicava
-- ---------------------------------------------------------------------------
-- O painel sempre decidiu escopo no servidor: as server functions leem com o
-- service_role e so devolvem o que `resolverEscopo()` autoriza. Isso protege
-- quem entra pela tela.
--
-- Nao protege quem nao entra pela tela. A politica de `monthly_metrics` era
-- `USING (true)` para `authenticated`, ou seja: qualquer pessoa da allowlist --
-- inclusive um engagement_viewer ou o lider de uma area pequena -- podia pegar
-- o proprio token e chamar a API REST direto, lendo avg_salary_leaders,
-- avg_salary_non_leaders, demographics, race_cross e dept_breakdown da empresa
-- inteira. A regra existia no servidor e nao no banco.
--
-- `salary_bands` tinha o mesmo problema e nenhum leitor: nenhum codigo do app
-- consulta essa tabela com a chave do usuario.
--
-- ---------------------------------------------------------------------------
-- QUEM AINDA PRECISA LER COM A CHAVE DO USUARIO
-- ---------------------------------------------------------------------------
-- Uma unica coisa: a ferramenta MCP `get_headcount_series`, que devolve
-- agregados da empresa inteira e por isso so faz sentido para perfil global.
-- Ela ja limitava as colunas na propria consulta; agora o banco tambem limita,
-- e a lista de quem pode chamar sai de `allowed_emails` em vez de "tem sessao".
--
-- As demais leituras (dashboard) usam service_role e nao passam por RLS.
-- ---------------------------------------------------------------------------

-- --- monthly_metrics -------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated can read monthly_metrics" ON public.monthly_metrics;

CREATE POLICY "Perfil global le metricas mensais"
ON public.monthly_metrics
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.allowed_emails ae
    WHERE lower(ae.email) = lower((SELECT u.email FROM auth.users u WHERE u.id = auth.uid()))
      AND COALESCE(
            ae.profile::text,
            CASE WHEN ae.role = 'admin' THEN 'admin' ELSE 'dept_leader' END
          ) IN ('admin', 'hr_leader')
      AND (ae.expires_at IS NULL OR ae.expires_at > now())
  )
);

-- Cinto e suspensorio: mesmo um perfil global so enxerga as colunas que a
-- ferramenta ja devolvia. Salario medio, recorte racial, demografia e o
-- detalhe por area nunca saem pela chave do usuario -- so pelo servidor.
REVOKE SELECT ON public.monthly_metrics FROM authenticated, anon;
GRANT SELECT (
  month, brand, business_unit, headcount, joiners, leavers, attrition_rate,
  promotions, leaders, leaders_pct, gender_female_pct, leader_female_pct,
  pcd, apprentice
) ON public.monthly_metrics TO authenticated;

-- --- salary_bands ----------------------------------------------------------
-- Sem politica = ninguem le com a chave do usuario. Nenhum codigo do app faz
-- isso hoje; se um dia precisar, a politica entra aqui, explicita.

DROP POLICY IF EXISTS "Authenticated can read salary_bands" ON public.salary_bands;
REVOKE SELECT ON public.salary_bands FROM authenticated, anon;

-- --- tabela de backup esquecida --------------------------------------------
-- Criada em 10/08 e deixada sem RLS: era a unica tabela do schema publico
-- legivel ate por quem nao esta logado.

ALTER TABLE IF EXISTS public.engagement_drivers_backup_20260810 ENABLE ROW LEVEL SECURITY;

-- --- views de catalogo -----------------------------------------------------
-- Usadas pelo card de conferencia de migrations. Rodavam com os privilegios do
-- dono (postgres); passam a rodar com os de quem chama.

ALTER VIEW public.v_catalogo_tabelas  SET (security_invoker = on);
ALTER VIEW public.v_catalogo_colunas  SET (security_invoker = on);
ALTER VIEW public.v_catalogo_indices  SET (security_invoker = on);
ALTER VIEW public.v_catalogo_enums    SET (security_invoker = on);
ALTER VIEW public.v_catalogo_funcoes  SET (security_invoker = on);

GRANT SELECT ON
  public.v_catalogo_tabelas, public.v_catalogo_colunas, public.v_catalogo_indices,
  public.v_catalogo_enums, public.v_catalogo_funcoes
TO service_role;
