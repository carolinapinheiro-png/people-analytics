-- Distribuicao por tempo de casa dos ativos (historico exato: fim do mes menos
-- admissao). jsonb { "0-3m": n, "3-6m": n, "6-12m": n, "1-2a": n, "2-5a": n, "5a+": n }.

ALTER TABLE public.monthly_metrics
  ADD COLUMN IF NOT EXISTS tenure_base jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.import_reconstruido(p_rows jsonb, p_user_email text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer; v_months integer; v_brands text[];
BEGIN
  INSERT INTO public.monthly_metrics (
    month, brand, business_unit, headcount, joiners, leavers, attrition_rate,
    gender_female, gender_male, gender_female_pct, leaders, leader_female,
    leader_female_pct, leaders_pct, avg_salary_leaders, avg_salary_non_leaders,
    promotions, state_mix, dept_data, level_base, raise_events,
    pcd, apprentice, leader_dept, tenure_base, source)
  SELECT (r->>'month')::date, r->>'brand', (r->>'business_unit')::public.business_unit,
    (r->>'headcount')::int, (r->>'joiners')::int, (r->>'leavers')::int, (r->>'attrition_rate')::numeric,
    (r->>'gender_female')::int, (r->>'gender_male')::int, (r->>'gender_female_pct')::numeric,
    (r->>'leaders')::int, (r->>'leader_female')::int, (r->>'leader_female_pct')::numeric,
    (r->>'leaders_pct')::numeric, (r->>'avg_salary_leaders')::numeric, (r->>'avg_salary_non_leaders')::numeric,
    (r->>'promotions')::int, COALESCE(r->'state_mix','{}'::jsonb), COALESCE(r->'dept_data','{}'::jsonb),
    COALESCE(r->'level_base','{}'::jsonb), COALESCE(r->'raise_events','{}'::jsonb),
    COALESCE((r->>'pcd')::int,0), COALESCE((r->>'apprentice')::int,0), COALESCE(r->'leader_dept','{}'::jsonb),
    COALESCE(r->'tenure_base','{}'::jsonb), 'reconstruido'
  FROM jsonb_array_elements(p_rows) AS r
  ON CONFLICT (month, brand, source) DO UPDATE SET
    business_unit=EXCLUDED.business_unit, headcount=EXCLUDED.headcount, joiners=EXCLUDED.joiners,
    leavers=EXCLUDED.leavers, attrition_rate=EXCLUDED.attrition_rate, gender_female=EXCLUDED.gender_female,
    gender_male=EXCLUDED.gender_male, gender_female_pct=EXCLUDED.gender_female_pct, leaders=EXCLUDED.leaders,
    leader_female=EXCLUDED.leader_female, leader_female_pct=EXCLUDED.leader_female_pct, leaders_pct=EXCLUDED.leaders_pct,
    avg_salary_leaders=EXCLUDED.avg_salary_leaders, avg_salary_non_leaders=EXCLUDED.avg_salary_non_leaders,
    promotions=EXCLUDED.promotions, state_mix=EXCLUDED.state_mix, dept_data=EXCLUDED.dept_data,
    level_base=EXCLUDED.level_base, raise_events=EXCLUDED.raise_events,
    pcd=EXCLUDED.pcd, apprentice=EXCLUDED.apprentice, leader_dept=EXCLUDED.leader_dept,
    tenure_base=EXCLUDED.tenure_base, updated_at=now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  SELECT count(DISTINCT r->>'month'), array_agg(DISTINCT r->>'brand') INTO v_months, v_brands FROM jsonb_array_elements(p_rows) AS r;
  INSERT INTO public.monthly_metrics_import_log (user_email, source, rows_upserted, months, brands)
  VALUES (p_user_email, 'reconstruido', v_count, v_months, v_brands);
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.import_reconstruido(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_reconstruido(jsonb, text) TO service_role;
