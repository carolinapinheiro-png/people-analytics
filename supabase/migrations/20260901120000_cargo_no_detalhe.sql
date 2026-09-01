-- O cargo não vem na LISTAGEM do Convenia. Vem no detalhe individual.
--
-- A coluna `org_pessoas.job_title` entrou em 31/08 e o `cargoDe()` lia o
-- payload da listagem. Medido em 01/09, depois de a sync ter rodado:
--
--   select count(*), count(job_title) from org_pessoas;  ->  638, 0
--
-- Zero de 638. Nenhum dos sete nomes de campo que `cargoDe` tenta existe na
-- listagem -- é a mesma história de `gender` e `ethnicity`, que também só
-- aparecem no detalhe, uma requisição por pessoa.
--
-- E foi um silêncio, não um erro: o aviso de ">50% sem cargo" existe e teria
-- disparado, mas o efeito visível era só o campo Cargo continuar em branco no
-- cadastro -- que é exatamente como ele funcionava antes. Ausência que se
-- parece com o estado anterior não chama atenção de ninguém.
--
-- A saída não é buscar 638 detalhes de novo: o laço de gênero JÁ busca esse
-- detalhe, em lotes de 200 por execução, e joga fora o resto da resposta. O
-- cargo passa a sair da mesma requisição, sem uma chamada a mais. Esta coluna
-- é o cache dele, ao lado de gender e race, pelo mesmo motivo dos dois: a
-- próxima execução não repete a busca.
alter table public.convenia_pessoas add column if not exists job_title text;

comment on column public.convenia_pessoas.job_title is
  'Cargo, do detalhe individual do Convenia. Cache: vem na mesma requisição de gender/race e evita reconsultar. Alimenta org_pessoas.job_title, que preenche o campo Cargo no cadastro de acesso.';
