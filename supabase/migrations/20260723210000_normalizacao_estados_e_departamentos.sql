-- Etapa 2.5: normalizacao de nomenclatura
--
-- Direcao das regras definida pela BASE REAL (Talent_Mobility.xlsx), nao por
-- preferencia estetica: o formato para o qual convergimos e o que a fonte
-- produz hoje, para que a importacao futura nao precise traduzir nada.
--
--   Estados     -> nome por extenso. A base real usa Alagoas, Bahia, Ceara...
--                  Sao Paulo. As 10 siglas da serie ate 2025-11 sobem para
--                  esse formato.
--   Departamento-> OPERATION. Na base real: OPERATION 469 ocorrencias,
--                  OPERATIONS 1. A grafia no plural e o desvio, nao a regra.
--
-- Ambas as regras sao reversiveis: o mapeamento e 1-para-1 e esta explicito.

-- 1. Siglas de UF para nome por extenso
WITH uf(sigla, nome) AS (VALUES
  ('CE','Ceará'), ('PE','Pernambuco'), ('PR','Paraná'), ('RJ','Rio de Janeiro'),
  ('RN','Rio Grande do Norte'), ('RS','Rio Grande do Sul'), ('SC','Santa Catarina'),
  ('SP','São Paulo'), ('DF','Distrito Federal'), ('MG','Minas Gerais')
),
remap AS (
  SELECT m.id, jsonb_object_agg(COALESCE(u.nome, kv.key), kv.value) AS novo
  FROM public.monthly_metrics m
  CROSS JOIN LATERAL jsonb_each(m.state_mix) AS kv(key, value)
  LEFT JOIN uf u ON u.sigla = kv.key
  WHERE m.state_mix <> '{}'::jsonb
  GROUP BY m.id
)
UPDATE public.monthly_metrics m
SET state_mix = r.novo
FROM remap r
WHERE m.id = r.id AND m.state_mix <> r.novo;

-- 2. OPERATIONS -> OPERATION
-- Verificado antes de aplicar: nenhuma linha continha as duas chaves, entao
-- nao ha colisao a resolver.
UPDATE public.monthly_metrics
SET dept_data = (dept_data - 'OPERATIONS') || jsonb_build_object('OPERATION', dept_data -> 'OPERATIONS')
WHERE dept_data ? 'OPERATIONS';
