-- O cadastro inteiro, e não três campos escolhidos a dedo.
--
-- POR QUE ISTO MUDA
--
-- O report de headcount da Controladoria tem 17 colunas por pessoa. Dez delas
-- são campos personalizados do Convenia -- Job Type Family, Career Band,
-- WorkDay Level, Modelo de Jornada, Role, Liderança, Level, Empresa,
-- Escritório -- e hoje a carga lê o cadastro inteiro, aproveita TRÊS e joga o
-- resto fora.
--
-- Cada vez que alguém precisa de mais um campo, o caminho tem sido: descobrir
-- que ele existe, criar coluna, mexer na carga, rodar 638 detalhes de novo.
-- Foi assim com o cargo, e de novo com empresa e escritório. Três rodadas do
-- mesmo trabalho pela mesma razão.
--
-- `custom_fields` guarda a lista como ela vem. Um campo novo que o RH criar
-- amanhã já entra, sem migração nenhuma -- e sem que eu tenha de adivinhar de
-- antemão quais campos alguém vai querer.
--
-- O QUE NÃO ENTRA AQUI
--
-- CPF, RG, conta bancária, endereço e dependentes continuam morrendo na
-- chegada, como sempre. O que se guarda é `custom_fields`, cujos nomes são
-- dados pelo RH e cujo conteúdo é organizacional -- e mesmo ali a TELA esconde
-- o valor de quem se chama CNPJ, razão social ou endereço (ver VALOR_SENSIVEL
-- em custom-fields.ts). Guardar não é exibir.
--
-- `cost_center` e `hiring_date` vêm da LISTAGEM, não do detalhe -- são de
-- graça, chegam em toda carga para todo mundo.
alter table public.convenia_pessoas add column if not exists custom_fields jsonb;
alter table public.convenia_pessoas add column if not exists cost_center text;
alter table public.convenia_pessoas add column if not exists hiring_date date;
alter table public.convenia_pessoas add column if not exists status text;

comment on column public.convenia_pessoas.custom_fields is
  'Campos personalizados do Convenia, como vieram: [{nome, valor}]. Guardar a lista inteira evita uma migração por campo novo. Ler com lerCustomFields() em custom-fields.ts.';
comment on column public.convenia_pessoas.cost_center is
  'Centro de custo, da listagem. Ex.: "PROCUREMENT & FACILITIES (12822001)". "GERALL" é o valor não-migrado.';
comment on column public.convenia_pessoas.hiring_date is
  'Data de admissão, da listagem. Alimenta a coluna Admission Date do report da Controladoria.';
comment on column public.convenia_pessoas.status is
  'Status do cadastro no Convenia (ativo/desligado/admissão), como o report da Controladoria usa.';
