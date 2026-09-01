-- Empresa e escritório, do `custom_fields` do Convenia.
--
-- A unificação de bases tirou a marca do token. A sonda achou os dois campos
-- que a substituem, e eles são DIFERENTES entre si:
--
--   Empresa ...... "NSX Brasil Recife", "NSX Brasil São Paulo"  -> marca
--   Escritório ... "Recife - Boa Viagem", "Remoto", "São Paulo" -> localidade
--
-- O escritório é informação NOVA: até hoje o painel não tem localidade
-- nenhuma. `fontes.ts` declara um campo `local` por empresa desde o começo e
-- nada nunca leu.
--
-- POR QUE COLUNAS, E NÃO SÓ LEITURA NA HORA
--
-- Os dois só existem no detalhe individual -- uma requisição por pessoa, ~1,3s,
-- 638 pessoas, uns 14 minutos. Isso estoura o tempo do agendador e o de
-- qualquer botão. A carga resolve em lotes de 200 e guarda o que resolveu, do
-- mesmo jeito que faz com gênero e raça desde o começo.
--
-- E o censo de cobertura é o mesmo trabalho: para decidir se a marca pode
-- passar a sair daqui, é preciso saber em quantas das 638 o campo está
-- preenchido -- não em 8. Na amostra deu 5 de 8, e virar a chave com 60% de
-- cobertura joga 40% da empresa numa marca nula.
alter table public.convenia_pessoas add column if not exists empresa text;
alter table public.convenia_pessoas add column if not exists escritorio text;

comment on column public.convenia_pessoas.empresa is
  'custom_fields > "Empresa". Candidata a substituir a marca vinda do token. Nulo com job_title_em preenchido = perguntamos e a pessoa não tem o campo.';
comment on column public.convenia_pessoas.escritorio is
  'custom_fields > "Escritório". Localidade real, incluindo "Remoto" -- que é um valor, não uma ausência.';
