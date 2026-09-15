-- A série mensal passa a guardar a quebra por Modelo de Jornada de Trabalho.
--
-- ===========================================================================
-- SUBSTITUI `work_model_snapshot`
-- ===========================================================================
-- Até 15/09 "Modelo de Trabalho" (Demográficos) vinha de `work_model_snapshot`,
-- uma foto ÚNICA (jul/2026) carregada à parte do Talent Mobility -- não
-- recortava por mês, trimestre, ano, departamento, família, vínculo ou tempo
-- de casa, e a tela dizia isso em texto ("Foto retroativa... sem variar com o
-- filtro de ano/mês").
--
-- O campo "Modelo de Jornada de Trabalho" já vem no `custom_fields` de cada
-- pessoa, no MESMO lugar de `Level` e `Job Type Family` -- só não estava
-- sendo lido. Cobertura medida em 15/09: 440 de 637 ativos (69%); os outros
-- 197 entram como "Não informado", igual ao resto das dimensões.
--
-- Formato igual a `family_base`/`contract_base`: contagem por faixa,
-- `{ "Remoto sem registro de ponto": 277, "Presencial": 142, ... }` -- os
-- valores crus do Convenia, sem agrupar "Remoto" aqui; quem agrupa é a tela.
-- É CONTAGEM, não quebra de gênero/salário -- mesmo limite das outras.
--
-- DEFAULT '{}' e NOT NULL pela mesma razão de `family_base`: linha antiga sem
-- a quebra devolve objeto vazio, e o filtro lê zero pessoas naquele mês -- que
-- é a verdade sobre o que foi gravado.
alter table public.monthly_metrics
  add column if not exists work_model_base jsonb not null default '{}'::jsonb;

comment on column public.monthly_metrics.work_model_base is
  'Contagem de pessoas por Modelo de Jornada de Trabalho no mês, com o valor cru do Convenia ("Remoto sem registro de ponto", "Presencial", "Híbrido", ...). Atributo ATUAL aplicado à série inteira -- o Convenia não guarda histórico de modelo.';
