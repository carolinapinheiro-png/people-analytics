-- A foto mensal do cadastro.
--
-- ===========================================================================
-- POR QUE JSONB, E NÃO UMA COLUNA POR CAMPO
-- ===========================================================================
-- Cinco das últimas seis correções foram do mesmo tipo: um campo que a API já
-- entregava e que a carga descartava na chegada. `team`, `relationship`,
-- `cost_center`, os sete do Talent Mobility, a data de desligamento. O padrão
-- é sempre o mesmo -- a redução foi escrita para uma pergunta, e cada pergunta
-- nova precisa de um campo que ela jogou fora. Cada uma custou migration,
-- mexida na carga e uma releitura de 800 cadastros.
--
-- Aqui a lógica se inverte: guarda-se o que veio e reduz-se na leitura. Uma
-- coluna nova no report do mês que vem não exige migration nenhuma, e a foto
-- de setembro já vai ter o campo mesmo que ninguém soubesse que ele seria
-- preciso.
--
-- ===========================================================================
-- O QUE ISTO DESTRAVA
-- ===========================================================================
-- 1. O carry-forward. `Compensation Grade` sai em 73% e `Job Family` em 89%
--    porque o campo está vazio no cadastro de hoje para parte das pessoas --
--    é a mesma população que a nota de agosto descrevia como "puxada do último
--    mês em que cada colega teve valor", feita na mão. Com foto mensal, essa
--    busca vira código.
--
-- 2. Re-rodar um mês passado honestamente. Hoje a base de julho é montada com
--    o cadastro de hoje: quem mudou de cargo desde então aparece com o cargo
--    novo, e quem saiu não volta.
--
-- Uma linha por pessoa por mês. A carga reescreve a do mês corrente a cada
-- execução -- a foto é do estado no fim do mês, e o mês só acaba quando acaba.
create table if not exists public.convenia_cadastro_mensal (
  mes         text not null check (mes ~ '^\d{4}-\d{2}$'),
  convenia_id text not null,
  dados       jsonb not null,
  capturado_em timestamptz not null default now(),
  primary key (mes, convenia_id)
);

alter table public.convenia_cadastro_mensal enable row level security;

create index if not exists convenia_cadastro_mensal_mes on public.convenia_cadastro_mensal (mes);

comment on table public.convenia_cadastro_mensal is
  'Foto do cadastro no fim de cada mes, uma linha por pessoa. Guarda o registro inteiro em jsonb de proposito: reduzir na leitura, e nao na escrita. Sem policy: service role apenas -- contem salario e data de nascimento.';
