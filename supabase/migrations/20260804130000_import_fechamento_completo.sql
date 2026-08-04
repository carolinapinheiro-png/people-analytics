-- Fechamento mensal completo + invariantes no banco.
--
-- PROBLEMA QUE ESTA MIGRATION CORRIGE
-- A versao anterior de import_reconstruido gravava so 19 colunas. Os campos
-- dimensionais -- level_base, tenure_base, demographics, race_cross,
-- leader_dept, raise_events, pcd, apprentice e dept_breakdown -- ficavam de
-- fora do INSERT e do DO UPDATE. Como ON CONFLICT DO UPDATE so mexe nas
-- colunas listadas, eles NAO eram sobrescritos: sobreviviam da carga anterior.
--
-- O efeito era silencioso e pior do que um erro: ao reimportar um mes, o
-- headcount ia para o valor novo (ex.: 581) enquanto a piramide de senioridade,
-- os demograficos e o recorte por departamento continuavam no valor velho
-- (ex.: 587). O dashboard mostrava numeros que nao fecham entre si, sem nenhum
-- aviso. Toda a validacao "soma dos departamentos = headcount" que fazemos na
-- carga manual seria furada pela tela de admin.
--
-- Agora a funcao grava o agregado INTEIRO e, antes de gravar, checa as
-- invariantes. Se alguma quebrar, levanta excecao e a transacao inteira volta
-- atras -- nada entra pela metade.
--
-- gender_base existe no agregador mas NAO e coluna de monthly_metrics: e
-- derivavel (gender_female + gender_male) e por isso nao e persistido.

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
  v_row     jsonb;   -- NAO chamar de 'r': colide com o alias r dos jsonb_array_elements abaixo
  v_hc      integer;
  v_sum     integer;
  v_ym      text;
BEGIN
  -- ---------------------------------------------------------------------
  -- 1. Invariantes. Roda ANTES de qualquer escrita: um mes ruim aborta a
  --    importacao toda, em vez de gravar metade da serie.
  --
  --    So checa o que existe: Betfair BR e Flutter International nao produzem
  --    dept_breakdown nem demografico completo, entao blocos vazios passam.
  -- ---------------------------------------------------------------------
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_hc := (v_row->>'headcount')::int;
    v_ym := (v_row->>'brand') || ' ' || substr(v_row->>'month', 1, 7);

    IF v_hc < 0 THEN
      RAISE EXCEPTION 'Headcount negativo em %: %', v_ym, v_hc;
    END IF;

    -- Soma dos departamentos = headcount.
    IF COALESCE(v_row->'dept_data', '{}'::jsonb) <> '{}'::jsonb THEN
      SELECT COALESCE(sum((v->>'hc')::int), 0) INTO v_sum
      FROM jsonb_each(v_row->'dept_data') AS t(k, v);
      IF v_sum <> v_hc THEN
        RAISE EXCEPTION 'Soma dos departamentos (%) difere do headcount (%) em %',
          v_sum, v_hc, v_ym;
      END IF;
    END IF;

    -- Soma da piramide de nivel = headcount.
    IF COALESCE(v_row->'level_base', '{}'::jsonb) <> '{}'::jsonb THEN
      SELECT COALESCE(sum(value::int), 0) INTO v_sum
      FROM jsonb_each_text(v_row->'level_base');
      IF v_sum <> v_hc THEN
        RAISE EXCEPTION 'Soma dos niveis (%) difere do headcount (%) em %',
          v_sum, v_hc, v_ym;
      END IF;
    END IF;

    -- Tempo de casa: todo ativo cai em alguma faixa.
    IF COALESCE(v_row->'tenure_base', '{}'::jsonb) <> '{}'::jsonb THEN
      SELECT COALESCE(sum(value::int), 0) INTO v_sum
      FROM jsonb_each_text(v_row->'tenure_base');
      IF v_sum <> v_hc THEN
        RAISE EXCEPTION 'Soma do tempo de casa (%) difere do headcount (%) em %',
          v_sum, v_hc, v_ym;
      END IF;
    END IF;

    -- Genero e base parcial (fonte pode nao trazer): so nao pode passar do todo.
    IF (v_row->>'gender_female')::int + (v_row->>'gender_male')::int > v_hc THEN
      RAISE EXCEPTION 'Genero (%) maior que o headcount (%) em %',
        (v_row->>'gender_female')::int + (v_row->>'gender_male')::int, v_hc, v_ym;
    END IF;

    IF (v_row->>'leaders')::int > v_hc THEN
      RAISE EXCEPTION 'Lideres (%) maior que o headcount (%) em %',
        (v_row->>'leaders')::int, v_hc, v_ym;
    END IF;

    -- Mix de vinculo: todo ativo cai em exatamente um bucket, entao a soma e o
    -- headcount. A versao anterior da serie era ancorada por "escala
    -- proporcional" e errava +-1 entre CLT e PJ em alguns meses; o agregador
    -- agora conta direto e fecha exato. Se nao fechar, e bug, nao arredondamento.
    IF COALESCE(v_row->'contract_mix', '{}'::jsonb) <> '{}'::jsonb THEN
      SELECT COALESCE(sum(value::int), 0) INTO v_sum
      FROM jsonb_each_text(v_row->'contract_mix');
      IF v_sum <> v_hc THEN
        RAISE EXCEPTION 'Soma do vinculo CLT/PJ (%) difere do headcount (%) em %',
          v_sum, v_hc, v_ym;
      END IF;
    END IF;

    -- dept_breakdown e a fatia por departamento das MESMAS dimensoes: somar
    -- todos os departamentos tem que reproduzir os totais da empresa.
    IF COALESCE(v_row->'dept_breakdown', '{}'::jsonb) <> '{}'::jsonb THEN
      SELECT COALESCE(sum((SELECT COALESCE(sum(value::int), 0)
                           FROM jsonb_each_text(v->'level_base'))), 0)
        INTO v_sum
      FROM jsonb_each(v_row->'dept_breakdown') AS t(k, v);
      IF v_sum <> v_hc THEN
        RAISE EXCEPTION 'Recorte por departamento soma % pessoas, headcount e % em %',
          v_sum, v_hc, v_ym;
      END IF;

      SELECT COALESCE(sum((v->>'gender_female')::int + (v->>'gender_male')::int), 0)
        INTO v_sum
      FROM jsonb_each(v_row->'dept_breakdown') AS t(k, v);
      IF v_sum <> (v_row->>'gender_female')::int + (v_row->>'gender_male')::int THEN
        RAISE EXCEPTION 'Genero por departamento (%) difere do total (%) em %',
          v_sum, (v_row->>'gender_female')::int + (v_row->>'gender_male')::int, v_ym;
      END IF;
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------------
  -- 2. Upsert do agregado COMPLETO.
  -- ---------------------------------------------------------------------
  INSERT INTO public.monthly_metrics (
    month, brand, business_unit, headcount, joiners, leavers, attrition_rate,
    gender_female, gender_male, gender_female_pct, leaders, leader_female,
    leader_female_pct, leaders_pct, avg_salary_leaders, avg_salary_non_leaders,
    promotions, pcd, apprentice, state_mix, dept_data, level_base, raise_events,
    leader_dept, tenure_base, demographics, race_cross, dept_breakdown, source
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
    (r->>'promotions')::int,
    COALESCE((r->>'pcd')::int, 0),
    COALESCE((r->>'apprentice')::int, 0),
    COALESCE(r->'state_mix',      '{}'::jsonb),
    COALESCE(r->'dept_data',      '{}'::jsonb),
    COALESCE(r->'level_base',     '{}'::jsonb),
    COALESCE(r->'raise_events',   '{}'::jsonb),
    COALESCE(r->'leader_dept',    '{}'::jsonb),
    COALESCE(r->'tenure_base',    '{}'::jsonb),
    COALESCE(r->'demographics',   '{}'::jsonb),
    COALESCE(r->'race_cross',     '{}'::jsonb),
    COALESCE(r->'dept_breakdown', '{}'::jsonb),
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
    pcd                    = EXCLUDED.pcd,
    apprentice             = EXCLUDED.apprentice,
    state_mix              = EXCLUDED.state_mix,
    dept_data              = EXCLUDED.dept_data,
    level_base             = EXCLUDED.level_base,
    raise_events           = EXCLUDED.raise_events,
    leader_dept            = EXCLUDED.leader_dept,
    tenure_base            = EXCLUDED.tenure_base,
    demographics           = EXCLUDED.demographics,
    race_cross             = EXCLUDED.race_cross,
    dept_breakdown         = EXCLUDED.dept_breakdown,
    updated_at             = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- ---------------------------------------------------------------------
  -- 3. Evolucao CLT/PJ, no MESMO corpo (mesma transacao). Antes esta tabela
  --    era carga manual e podia ficar defasada do headcount sem ninguem notar;
  --    agora anda junto ou nao anda.
  --
  --    So mexe nos meses/marcas presentes no payload -- reimportar um mes nao
  --    apaga o resto da serie.
  -- ---------------------------------------------------------------------
  DELETE FROM public.contract_mix_monthly cm
  USING jsonb_array_elements(p_rows) AS r
  WHERE cm.month = (r->>'month')::date
    AND cm.brand = r->>'brand'
    AND COALESCE(r->'contract_mix', '{}'::jsonb) <> '{}'::jsonb;

  INSERT INTO public.contract_mix_monthly (month, brand, contract, n, position)
  SELECT
    (r->>'month')::date,
    r->>'brand',
    b.contract,
    COALESCE((r->'contract_mix'->>b.contract)::int, 0),
    b.ord
  FROM jsonb_array_elements(p_rows) AS r
  CROSS JOIN (VALUES ('CLT', 0), ('PJ', 1), ('Aprendiz', 2), ('Estatutário/Sócio', 3))
    AS b(contract, ord)
  WHERE COALESCE(r->'contract_mix', '{}'::jsonb) <> '{}'::jsonb
  ON CONFLICT (month, brand, contract) DO UPDATE SET n = EXCLUDED.n;

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
