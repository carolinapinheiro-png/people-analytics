-- 1. Porto e um departamento de tecnologia da Flutter International, nao uma
--    unidade de negocio. A linha legada com brand='Porto' passa a ser
--    classificada como flutter_intl. O rotulo original fica preservado em
--    brand ate a importacao real substituir a nomenclatura.
UPDATE public.monthly_metrics
SET business_unit = 'flutter_intl'
WHERE brand = 'Porto' AND business_unit IS NULL;

-- 2. Remove comentarios livres de desligamento do exit_survey.
--    Sao texto aberto escrito por pessoa desligada: o dado mais sensivel do
--    conjunto e desnecessario para qualquer agregacao. Mantem-se apenas
--    reason, count, pct e trend. A origem continua no raw-data.ts.
--    Idempotente: rodar de novo nao muda nada.
UPDATE public.monthly_metrics m
SET exit_survey = sub.cleaned
FROM (
  SELECT mm.id, jsonb_agg(elem - 'comments' ORDER BY ord) AS cleaned
  FROM public.monthly_metrics mm,
       LATERAL jsonb_array_elements(mm.exit_survey) WITH ORDINALITY AS t(elem, ord)
  WHERE mm.exit_survey IS NOT NULL
    AND jsonb_array_length(mm.exit_survey) > 0
    AND mm.exit_survey::text LIKE '%comments%'
  GROUP BY mm.id
) AS sub
WHERE m.id = sub.id;
