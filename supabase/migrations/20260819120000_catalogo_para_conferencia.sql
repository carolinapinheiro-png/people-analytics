-- Views de catálogo, para o painel conferir se o banco tem o que as
-- migrations prometeram.
--
-- ===========================================================================
-- POR QUE ISTO PRECISA EXISTIR
-- ===========================================================================
-- Em 19/08/2026 a aba de Salários ficou quebrada para TODO MUNDO -- inclusive
-- para a admin -- porque `comp_ratio.n_layer` não existia. O arquivo da
-- migration estava no repositório desde 14/08 e nunca tinha sido aplicado.
--
-- Descobrir isso levou quatro consultas e começou por um sintoma que não
-- parecia schema: "por que o mês em cima ainda mostra junho?". Uma verificação
-- responderia em segundos, e não existia.
--
-- ===========================================================================
-- POR QUE VIEWS, E NÃO A TABELA DE CONTROLE DO SUPABASE
-- ===========================================================================
-- O caminho óbvio seria comparar os arquivos com
-- `supabase_migrations.schema_migrations`. Não serve aqui:
--
--     arquivos no repositório .......... 46
--     registrados como aplicados ........ 5
--
-- A tabela de controle só conhece o que passou pelo fluxo do Lovable; as
-- outras 41 foram aplicadas por outros caminhos e estão valendo. Um alerta com
-- 41 falsos positivos é desligado na primeira semana, e junto com ele o único
-- que importava.
--
-- Então a pergunta muda de "esta migration rodou?" para "o que ela prometeu
-- existe?" -- que é verificável e é a que tem consequência.
--
-- ===========================================================================
-- POR QUE VIEW E NÃO CONSULTA DIRETA
-- ===========================================================================
-- O PostgREST não expõe `information_schema` nem `pg_catalog`. Estas views são
-- a porta -- e só devolvem NOMES de objeto do schema public. Nenhuma linha de
-- dado passa por aqui.

create or replace view public.v_catalogo_tabelas as
  select table_name as nome
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE';

create or replace view public.v_catalogo_colunas as
  select table_name as tabela, column_name as coluna
  from information_schema.columns
  where table_schema = 'public';

create or replace view public.v_catalogo_indices as
  select indexname as nome from pg_indexes where schemaname = 'public';

-- Enum não tem schema próprio na consulta: o nome do TIPO já é único no
-- public, e é assim que as migrations o declaram.
create or replace view public.v_catalogo_enums as
  select t.typname as tipo, e.enumlabel as valor
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public';

create or replace view public.v_catalogo_funcoes as
  select p.proname as nome
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public';

-- Leitura pelo service_role apenas: a função de servidor que consulta estas
-- views já exige admin, e o anon/authenticated não tem nada a fazer com um
-- mapa da estrutura do banco.
revoke all on public.v_catalogo_tabelas from anon, authenticated;
revoke all on public.v_catalogo_colunas from anon, authenticated;
revoke all on public.v_catalogo_indices from anon, authenticated;
revoke all on public.v_catalogo_enums from anon, authenticated;
revoke all on public.v_catalogo_funcoes from anon, authenticated;
