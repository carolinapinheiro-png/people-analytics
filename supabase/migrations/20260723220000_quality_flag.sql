-- Marcacao de qualidade por linha.
--
-- Contexto: a comparacao entre a serie congelada (raw-data.ts) e a serie
-- reconstruida a partir do Talent_Mobility mostrou que o headcount e confiavel
-- (diferenca maxima de 5 pessoas em 18 meses, convergindo a zero), mas que
-- linhas especificas nao sao. Em vez de apagar, marca-se.

ALTER TABLE public.monthly_metrics ADD COLUMN IF NOT EXISTS quality_flag text;

COMMENT ON COLUMN public.monthly_metrics.quality_flag IS
  'Nulo = linha confiavel. Preenchido = motivo da suspeita. Consultas do dashboard devem filtrar quality_flag IS NULL.';

-- Dezembro/2025: tres indicadores independentes apontam recorte quebrado.
UPDATE public.monthly_metrics
SET quality_flag = 'Snapshot inconsistente: 110 lideres contra 72 em nov/2025 e 72 em jan/2026; salario medio de lideranca R$ 23.392 contra R$ 50.575 no mes anterior; state_mix vazio. Substituir pela serie reconstruida.'
WHERE brand = 'NSX' AND month = '2025-12-01' AND source LIKE 'raw-data.ts%';

-- Porto: marcacao sai do campo source e passa para quality_flag, que e o
-- lugar proprio. source volta a indicar apenas a procedencia.
UPDATE public.monthly_metrics
SET source = 'raw-data.ts',
    quality_flag = 'Origem nao reconhecida pela area. headcount 34 nao cabe nos 22 da Flutter International; state_mix Romania; departamentos TECHNOLOGY GROUP / CW GROUP inexistentes no resto da serie.'
WHERE brand = 'Porto';

-- Chave unica passa a incluir source: a serie reconstruida convive com a
-- congelada em vez de sobrescreve-la.
ALTER TABLE public.monthly_metrics DROP CONSTRAINT IF EXISTS monthly_metrics_unique;
ALTER TABLE public.monthly_metrics ADD CONSTRAINT monthly_metrics_unique UNIQUE (month, brand, source);
