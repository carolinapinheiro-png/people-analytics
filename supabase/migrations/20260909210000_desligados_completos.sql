-- `convenia_leavers` passa a guardar o que a aba de Desligamentos precisa.
--
-- ===========================================================================
-- DUAS BASES DE DESLIGADOS, E A TELA USA A PARADA
-- ===========================================================================
-- A aba lê `leavers`, que é carga MANUAL de planilha e está sem atualizar há
-- dois meses: 65 desligamentos em 2026. A carga do Convenia conhece 138 saídas
-- e grava em `convenia_leavers` -- outra tabela, que ninguém lê.
--
-- O selo de frescor era o único lugar do painel que percebia, e ele dizia a
-- verdade que ninguém interpretou: "atualizado há 2 meses".
--
-- Não dava para simplesmente trocar a fonte. `convenia_leavers` tinha quatro
-- campos (admissão, desligamento, área, tipo) e a aba desenha faixa salarial,
-- level, job family e tempo de casa. Migrar assim apagaria quatro gráficos --
-- e a lição de hoje é que gráfico apagado vira "não temos ninguém".
--
-- ===========================================================================
-- O DADO JÁ CHEGAVA E ERA JOGADO FORA
-- ===========================================================================
-- Para cada desligado sem admissão conhecida, a carga já busca o DETALHE
-- individual -- 123 campos -- e guardava dois: mês de admissão e área. Salário,
-- `Level` e `Job Type Family` vinham na mesma resposta e morriam na linha
-- seguinte.
--
-- Estas colunas param de jogar fora. Nenhuma requisição a mais: é a mesma
-- chamada que já acontece.
alter table public.convenia_leavers
  add column if not exists nome text,
  add column if not exists cargo text,
  add column if not exists salary numeric(12,2),
  add column if not exists level text,
  add column if not exists job_type_family text,
  add column if not exists genero text,
  add column if not exists raca text,
  -- Marca da versão do código que leu este desligado. Mesma mecânica de
  -- `detalhe_versao`: subir o número reenfileira quem foi lido por um código
  -- que ainda não guardava o campo novo. Sem isso, as 138 pessoas já lidas
  -- ficariam com as colunas novas vazias PARA SEMPRE -- o cache transforma
  -- uma leitura incompleta em permanente.
  add column if not exists detalhe_versao integer;

comment on column public.convenia_leavers.salary is
  'Salário na data do desligamento, do detalhe individual. Alimenta a faixa salarial da aba de Desligamentos.';
comment on column public.convenia_leavers.detalhe_versao is
  'Versão do código que leu o detalhe desta pessoa. Menor que a atual = volta para a fila.';

-- Sem policy de SELECT: tem salário e nome de pessoa. Mesma proteção de
-- `leavers` e `comp_ratio` -- só server function, com log de acesso.
alter table public.convenia_leavers enable row level security;
