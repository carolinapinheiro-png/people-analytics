-- O elo entre a folha de remuneração e o cadastro, guardado em vez de refeito.
--
-- ===========================================================================
-- POR QUE PARAR DE CASAR POR NOME A CADA LEITURA
-- ===========================================================================
-- `comp_ratio` veio de planilha e não tem e-mail nem matrícula. O único campo
-- em comum com o Convenia é o nome, e `vinculo-comp.ts` casa por ele -- com a
-- regra certa ("na dúvida, não casa"), mas refazendo o trabalho toda vez e
-- jogando o resultado fora.
--
-- O custo disso não é desempenho, é fragilidade. O casamento por nome já
-- devolveu 0% duas vezes esta semana, por dois defeitos diferentes no mesmo
-- campo do Convenia -- primeiro sem sobrenome, depois sem o primeiro nome. Em
-- ambos, tudo que depende do elo caiu junto e em silêncio.
--
-- Guardando `convenia_id`, o elo passa a ser conferido UMA vez, na tela de
-- vínculo que já mostra a taxa antes de gravar, e depois é um join por chave.
-- Grafia de nome deixa de importar para quem lê.
--
-- ===========================================================================
-- O QUE ISTO ABRE, E O QUE NÃO ABRE
-- ===========================================================================
-- Abre o cruzamento de remuneração com gênero e etnia, que hoje é impossível:
-- a demografia mora em `convenia_pessoas`, chaveada por `convenia_id`, e a
-- folha não tinha esse campo.
--
-- NÃO abre leitura individual de demografia. `convenia_pessoas` continua sendo
-- lida só em agregado -- ver a nota em 20260814210000. Guardar a chave não é
-- o mesmo que passar a olhar pessoa por pessoa, e a regra de agregado
-- continua valendo.
alter table public.comp_ratio
  add column if not exists convenia_id uuid;

comment on column public.comp_ratio.convenia_id is
  'Pessoa correspondente no Convenia. Gravado pela tela de vínculo, junto da camada N — ver src/lib/vinculo-comp.ts. Null significa "não casou", e o que depende do elo simplesmente não aparece.';

create index if not exists comp_ratio_convenia_id_idx
  on public.comp_ratio (convenia_id);
