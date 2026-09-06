-- O cadastro cru, para acabar com o ciclo de "mais uma coluna".
--
-- ===========================================================================
-- SEXTA VEZ O MESMO ERRO
-- ===========================================================================
-- `team`, `relationship`, `cost_center`, os sete do Talent Mobility, a data de
-- desligamento, e agora `nationalities` e `disability` para o report do WIL.
-- Toda vez: o campo já vinha na resposta da API, a redução o descartava, e
-- descobrir custou migration, mexida na carga e releitura de 800 cadastros.
--
-- A redução foi escrita para as perguntas de então. Cada pergunta nova precisa
-- de um campo que ela jogou fora, e não há como saber de antemão qual.
--
-- Aqui a lógica se inverte: guarda-se o que veio e reduz-se na leitura. As
-- colunas nomeadas continuam existindo -- elas são o contrato com quem
-- consulta, e SQL sobre coluna é melhor que SQL sobre jsonb. O `bruto` é a
-- rede embaixo: no dia em que faltar um campo, ele já está guardado.
--
-- ===========================================================================
-- MENOS O QUE NÃO SE DEVE GUARDAR
-- ===========================================================================
-- Guardar a resposta inteira traria CPF, RG, CTPS, conta bancária, título de
-- eleitor e contatos de emergência de 809 pessoas -- documentos que nenhum
-- report pede e que ninguém decidiu armazenar. `semSensiveis` tira essas
-- chaves na entrada, e a lista está no código, versionada, onde dá para
-- discutir o que entra.
--
-- Guardar tudo "porque um dia pode servir" é exatamente como se acumula dado
-- que ninguém sabe que tem.
alter table public.convenia_pessoas
  add column if not exists bruto jsonb;

comment on column public.convenia_pessoas.bruto is
  'Cadastro como a API devolveu, menos documentos e dados bancarios (ver semSensiveis). Existe para que campo novo nao exija migration: reduzir na leitura, e nao na escrita. As colunas nomeadas continuam sendo o contrato.';
