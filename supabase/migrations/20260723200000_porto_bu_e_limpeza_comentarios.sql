-- 1. Porto e um departamento de tecnologia da Flutter International, nao uma
--    unidade de negocio. Mas a linha legada com brand='Porto' (2026-05) nao foi
--    reconhecida pela area: headcount 34 nao cabe dentro dos 22 da Flutter
--    International em 2026-06, onde o departamento PORTO aparece com 19; o
--    state_mix diz Romania enquanto a BU diz "Nao informado"; e os
--    departamentos TECHNOLOGY GROUP / CW GROUP nao existem em nenhuma outra
--    linha da serie.
--
--    Origem desconhecida => quarentena, nao exclusao e nao reclassificacao.
--    business_unit fica NULL de proposito: nenhuma agregacao por unidade de
--    negocio a inclui. O marcador abaixo evita que isso pareca descuido.
UPDATE public.monthly_metrics
SET source = 'raw-data.ts (origem nao reconhecida)'
WHERE brand = 'Porto';

-- Consultas do dashboard devem filtrar business_unit IS NOT NULL.

-- 2. Remove comentarios livres de desligamento do exit_survey.
--    Texto aberto escrito por pessoa desligada: o dado mais sensivel do
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
