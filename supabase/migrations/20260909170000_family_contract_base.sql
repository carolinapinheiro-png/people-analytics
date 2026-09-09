-- A série mensal passa a guardar a quebra por Job Type Family e por vínculo.
--
-- ===========================================================================
-- POR QUE ESTAS DUAS COLUNAS
-- ===========================================================================
-- A barra de filtros mostrava "Job family" e "Contrato" esmaecidos em Visão
-- geral, DEI, Demográficos, Span e Recrutamento, com o motivo "a série mensal
-- guarda apenas a quebra por departamento".
--
-- Era verdade sobre a TABELA e falso como limite: as duas dimensões estão no
-- cadastro de cada pessoa, e o laço que já conta tempo de casa mês a mês podia
-- contá-las no mesmo passo. O que faltava era coluna para gravar.
--
-- Formato igual a `tenure_base`: contagem por faixa, `{ "CLT": 512, "Pessoa
-- Jurídica": 96 }`. É CONTAGEM, não quebra das outras dimensões -- sabemos
-- quantas pessoas eram CLT em cada mês, não o gênero delas. Por isso
-- `applySeriesFilter` continua suprimindo gênero, DEI e demográficos sob estes
-- recortes, em vez de ratear: ratear seria fabricar número auditável-por-
-- ninguém.
--
-- DEFAULT '{}' e NOT NULL pela mesma razão de `level_base`: linha antiga sem a
-- quebra devolve objeto vazio, e o filtro lê zero pessoas naquele mês -- que é
-- a verdade sobre o que foi gravado. Nulo obrigaria cada leitor a lembrar do
-- caso, e algum esqueceria.
alter table public.monthly_metrics
  add column if not exists family_base jsonb not null default '{}'::jsonb,
  add column if not exists contract_base jsonb not null default '{}'::jsonb;

comment on column public.monthly_metrics.family_base is
  'Contagem de pessoas por Job Type Family no mês. Família é atributo ATUAL aplicado à série inteira -- o Convenia não guarda histórico de família.';
comment on column public.monthly_metrics.contract_base is
  'Contagem de pessoas por vínculo no mês, com o nome cru do Convenia ("CLT", "Pessoa Jurídica", "Aprendiz").';
