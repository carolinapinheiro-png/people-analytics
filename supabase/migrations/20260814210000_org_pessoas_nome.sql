-- Nome no organograma, para ligar a folha de remuneração à camada N.
--
-- ===========================================================================
-- ISTO CONTRARIA O QUE ESCREVI NA MIGRAÇÃO ANTERIOR
-- ===========================================================================
-- Em `20260814200000_org_pessoas.sql` eu disse que ali entraria "só o
-- necessário para responder quem é este e-mail, de que área, em que camada.
-- Sem salário, sem CPF, sem data de nascimento" -- e não incluí o nome.
--
-- O que mudou: `comp_ratio` não tem e-mail. Veio de uma planilha e traz
-- `name`. Não existe NENHUM campo em comum entre a folha e o Convenia além do
-- nome -- nem id, nem matrícula. Sem ele, as linhas de salário ficam sem
-- camada, e a aba de Salários esconde tudo até alguém reimportar a planilha
-- com a coluna "WorkDay Level".
--
-- A troca é aceitável por um motivo específico: esta tabela JÁ guarda o
-- e-mail corporativo, que identifica a pessoa tanto quanto o nome. Acrescentar
-- o nome não abre uma categoria nova de exposição -- e a tabela continua com
-- RLS ligada e nenhuma policy, ou seja, service_role apenas.
--
-- O que continua fora: salário, CPF, endereço, data de nascimento, raça,
-- gênero. Esses seguem em `convenia_pessoas`, que nunca é lida por pessoa.
alter table public.org_pessoas
  add column if not exists nome text;

comment on column public.org_pessoas.nome is
  'Nome no Convenia. Única ponte com comp_ratio, que não tem e-mail — ver src/lib/vinculo-comp.ts.';

-- O casamento percorre a tabela inteira comparando nome normalizado.
create index if not exists org_pessoas_nome_idx on public.org_pessoas (lower(nome));
