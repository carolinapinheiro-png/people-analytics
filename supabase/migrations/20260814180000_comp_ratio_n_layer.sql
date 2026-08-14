-- Camada N (o "WorkDay Level") na base de remuneração.
--
-- ===========================================================================
-- POR QUE ESTA COLUNA NÃO EXISTIA
-- ===========================================================================
-- O adaptador da planilha (src/lib/aggregator/xlsx-adapter.ts) tem, desde a
-- primeira versão, este comentário na regra da coluna `level`:
--
--     Nivel (L0..L9): colunas "Level", "Level_1".."Level_4".
--     NAO "WorkDay Level" nem "Nivel de senioridade" (texto).
--
-- Ou seja: a coluna "WorkDay Level" SEMPRE esteve no arquivo de origem, e foi
-- deliberadamente ignorada -- na época, com razão: ninguém a usava, e `level`
-- era o que alimentava os gráficos.
--
-- Ela deixou de ser dispensável em 14/08/2026, quando a regra de acesso a
-- remuneração passou a ser "cada um vê apenas as camadas abaixo da sua". A
-- escada `L0..L9` NÃO serve para isso: L é senioridade do cargo, N é
-- profundidade a partir do CEO. Um Director e um VP podem estar na mesma
-- camada; dois L7 podem estar em camadas diferentes.
--
-- ===========================================================================
-- ENQUANTO ESTA COLUNA ESTIVER VAZIA
-- ===========================================================================
-- A regra esconde TUDO para perfis não-globais -- e isso é o comportamento
-- correto, não um defeito: sem saber a camada de uma pessoa, não há como
-- afirmar que ela está abaixo de quem está olhando.
--
-- A tela distingue esse caso ("a camada ainda não foi importada") de "não há
-- ninguém na sua área", porque os dois produzem a mesma tabela vazia e pedem
-- ações opostas.
--
-- Texto, e não inteiro, de propósito: o arquivo traz "N-2", e converter na
-- entrada esconderia o valor original de quem for conferir depois.
alter table public.comp_ratio
  add column if not exists n_layer text;

comment on column public.comp_ratio.n_layer is
  'Camada a partir do CEO ("N", "N-1", ... "N-4"), vinda do WorkDay Level. Decide quem enxerga a remuneração de quem — ver src/lib/comp-scope.ts.';

-- O filtro por camada roda em toda leitura da aba de Salários.
create index if not exists comp_ratio_n_layer_idx on public.comp_ratio (n_layer);
