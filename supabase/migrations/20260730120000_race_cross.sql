-- Recorte de DEI por raca (raca x genero x lideranca da epoca):
-- jsonb { raca: { total, female, leaders, female_leaders } } por mes/marca.
-- Dado sensivel (raca) SO agregado -- nenhuma linha individual.
ALTER TABLE public.monthly_metrics ADD COLUMN IF NOT EXISTS race_cross jsonb NOT NULL DEFAULT '{}'::jsonb;
-- A funcao import_reconstruido foi atualizada no mesmo deploy para gravar race_cross
-- (ver 20260729180000_demographics.sql para a versao anterior; colunas acumulam).
