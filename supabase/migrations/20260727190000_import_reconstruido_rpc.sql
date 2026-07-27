-- Importacao da serie reconstruida numa transacao unica.
--
-- Antes: a server function fazia o upsert em monthly_metrics e, DEPOIS, o
-- insert em monthly_metrics_import_log, em duas chamadas separadas. Sem
-- transacao, uma falha no log deixava as metricas gravadas mas a tela dizia
-- "nada foi registrado" -- mentira. Esta funcao faz os dois no mesmo corpo,
-- entao ou os dois entram ou nenhum (funcao plpgsql roda em transacao).
--
-- SECURITY DEFINER: escreve com o dono; EXECUTE so para service_role, e a
-- server function (que ja roda com service_role e valida admin) e o unico
-- caminho.

CREATE OR REPLACE FUNCTION public.import_reconstruido(p_rows jsonb, p_user_email text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count   integer;
  v_months  integer;
  v_brands  text[];
BEGIN
  INSERT INTO public.monthly_metrics (
    month, brand, business_unit, headcount, joiners, leavers, attrition_rate,
    gender_female, gender_male, gender_female_pct, leaders, leader_female,
    leader_female_pct, leaders_pct, avg_salary_leaders, avg_salary_non_leaders,
    promotions, state_mix, dept_data, source
  )
  SELECT
    (r->>'month')::date,
    r->>'brand',
    (r->>'business_unit')::public.business_unit,
    (r->>'headcount')::int,
    (r->>'joiners')::int,
    (r->>'leavers')::int,
    (r->>'attrition_rate')::numeric,
    (r->>'gender_female')::int,
    (r->>'gender_male')::int,
    (r->>'gender_female_pct')::numeric,
    (r->>'leaders')::int,
    (r->>'leader_female')::int,
    (r->>'leader_female_pct')::numeric,
    (r->>'leaders_pct')::numeric,
    (r->>'avg_salary_leaders')::numeric,
    (r->>'avg_salary_non_leaders')::numeric,
    (r->>'promotions')::int,            -- null de proposito (nao reconstruivel)
    COALESCE(r->'state_mix', '{}'::jsonb),
    COALESCE(r->'dept_data', '{}'::jsonb),
    'reconstruido'
  FROM jsonb_array_elements(p_rows) AS r
  ON CONFLICT (month, brand, source) DO UPDATE SET
    business_unit          = EXCLUDED.business_unit,
    headcount              = EXCLUDED.headcount,
    joiners                = EXCLUDED.joiners,
    leavers                = EXCLUDED.leavers,
    attrition_rate         = EXCLUDED.attrition_rate,
    gender_female          = EXCLUDED.gender_female,
    gender_male            = EXCLUDED.gender_male,
    gender_female_pct      = EXCLUDED.gender_female_pct,
    leaders                = EXCLUDED.leaders,
    leader_female          = EXCLUDED.leader_female,
    leader_female_pct      = EXCLUDED.leader_female_pct,
    leaders_pct            = EXCLUDED.leaders_pct,
    avg_salary_leaders     = EXCLUDED.avg_salary_leaders,
    avg_salary_non_leaders = EXCLUDED.avg_salary_non_leaders,
    promotions             = EXCLUDED.promotions,
    state_mix              = EXCLUDED.state_mix,
    dept_data              = EXCLUDED.dept_data,
    updated_at             = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT count(DISTINCT r->>'month'), array_agg(DISTINCT r->>'brand')
    INTO v_months, v_brands
  FROM jsonb_array_elements(p_rows) AS r;

  -- Mesmo corpo: se este insert falhar, o upsert acima tambem reverte.
  INSERT INTO public.monthly_metrics_import_log (user_email, source, rows_upserted, months, brands)
  VALUES (p_user_email, 'reconstruido', v_count, v_months, v_brands);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.import_reconstruido(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_reconstruido(jsonb, text) TO service_role;
