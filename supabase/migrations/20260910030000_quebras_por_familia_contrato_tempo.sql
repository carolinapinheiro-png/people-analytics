-- Demográficos e DEI passam a recortar por família, contrato e tempo de casa.
--
-- ===========================================================================
-- O SELETOR EXISTIA E NÃO PODIA FUNCIONAR
-- ===========================================================================
-- A barra mostra quatro filtros fixos em toda aba. Em Demográficos e DEI, três
-- deles apareciam esmaecidos com o motivo "a série só guarda a quebra por
-- departamento" -- e o motivo era verdade.
--
-- A série guardava `family_base`, `contract_base` e `tenure_base`: a CONTAGEM
-- por faixa. Ela sabia que 145 pessoas eram "Customer Operations" e não sabia
-- o gênero, a raça ou a idade dessas 145. Por isso `applySeriesFilter`
-- devolvia `demographics: undefined` ao recortar por família -- a resposta
-- honesta para um dado que não existia.
--
-- Por departamento isso sempre funcionou, porque `dept_breakdown` guarda a
-- composição inteira de cada área. Estas três colunas são a mesma estrutura,
-- com outra chave.
--
-- ===========================================================================
-- POR QUE COLUNA NOVA, E NÃO UMA TABELA
-- ===========================================================================
-- Mesma cardinalidade e mesmo ciclo de vida do `dept_breakdown`: uma entrada
-- por mês, escrita pela mesma carga, lida pela mesma tela, sem sentido fora
-- da linha mensal. Tabela à parte só acrescentaria um join e a chance de as
-- duas divergirem.
--
-- Tamanho medido antes de escrever isto: `dept_breakdown` são 292 kB para os
-- 275 meses da série, com ~4 departamentos por mês. Família (~3,4), vínculo
-- (~1) e tempo de casa (~2) são da mesma ordem. O custo é irrelevante.
alter table public.monthly_metrics
  add column if not exists family_breakdown   jsonb,
  add column if not exists contract_breakdown jsonb,
  add column if not exists tenure_breakdown   jsonb;

comment on column public.monthly_metrics.family_breakdown is
  'Mesma estrutura de dept_breakdown (gender_female, leaders, race_cross, demographics, *_base), com a Job Type Family como chave. Alimenta o filtro de job family em Demograficos e DEI.';
comment on column public.monthly_metrics.contract_breakdown is
  'Idem, com o vinculo CRU do Convenia como chave -- sem traducao para CLT/PJ.';
comment on column public.monthly_metrics.tenure_breakdown is
  'Idem, com a faixa de tempo de casa como chave NO VOCABULARIO DA SERIE ("1-2a"), e nao no rotulo do seletor ("1-2 anos"). A traducao vive em series-filter.ts.';

-- ===========================================================================
-- NULO É "ESTA LINHA É ANTERIOR À QUEBRA", E TEM DE CONTINUAR SENDO
-- ===========================================================================
-- Sem DEFAULT '{}' de propósito. Um objeto vazio se leria como "esta linha foi
-- calculada e não tem ninguém em família nenhuma", que é falso e indistinguível
-- do certo. `null` diz "ainda não calculado", e a tela sabe esmaecer o filtro
-- com esse motivo em vez de desenhar um gráfico vazio.
--
-- É a mesma distinção que custou o dia 09/09 inteiro em `promotions`, onde o
-- zero afirmava "ninguém foi promovido" sobre uma tabela que nunca tinha sido
-- lida.
