-- O histórico salarial do Convenia, guardado -- é dele que saem as promoções.
--
-- ===========================================================================
-- POR QUE UMA TABELA, E NÃO UMA LEITURA NA HORA
-- ===========================================================================
-- `/employees/{id}/salaries-historic` é UMA requisição POR PESSOA. Com 642
-- ativos, calcular a série a cada abertura de tela seria 642 chamadas por
-- visita -- inviável, e o Convenia tem limite.
--
-- Guardado, o histórico é lido uma vez por pessoa e a série se recalcula de
-- graça, quantas vezes for preciso. É o mesmo desenho do detalhe individual,
-- que já provou funcionar: lotes por execução, marca de versão, e a carga
-- converge em alguns dias sem ninguém acompanhar.
--
-- ===========================================================================
-- A CHAVE É (pessoa, vigência, motivo)
-- ===========================================================================
-- Não existe id de registro na resposta. Sem chave, cada carga duplicaria o
-- histórico inteiro e as promoções cresceriam a cada execução -- um gráfico
-- subindo sozinho, plausível, e falso.
--
-- Duas alterações no MESMO dia com o MESMO motivo são a mesma linha para
-- efeito de contagem: a pessoa foi promovida naquele dia. Se um dia o RH
-- lançar duas legítimas, a segunda é absorvida -- perda conhecida, e
-- preferível a duplicar a série por um empate de chave.
create table if not exists public.convenia_historico_salarial (
  convenia_id text not null,
  vigencia date not null,
  motivo text,
  salario numeric(12,2),
  -- Quando esta linha foi lida. Permite dizer "o histórico desta pessoa é de
  -- ontem" em vez de deixar a idade do dado invisível.
  lido_em timestamptz not null default now(),
  primary key (convenia_id, vigencia, motivo)
);

comment on table public.convenia_historico_salarial is
  'Uma linha por alteração salarial, como o Convenia devolve em /employees/{id}/salaries-historic. O `motivo` vem classificado pela origem (Promoção, Mérito/Reajuste, Dissídio, Admissão...) e é ele que separa progressão de carreira de aumento.';

-- Busca por mês: a série pergunta "o que aconteceu em 2026-03" a cada carga.
create index if not exists convenia_historico_vigencia_idx
  on public.convenia_historico_salarial (vigencia);

-- ===========================================================================
-- A FILA, NA PRÓPRIA PESSOA
-- ===========================================================================
-- `historico_em` marca a PERGUNTA, não a resposta. Uma pessoa sem nenhuma
-- alteração salarial devolve lista vazia -- e sem esta marca ela voltaria para
-- a fila em toda carga, para sempre, empurrando quem nunca foi lido para o
-- fim. Com a marca, "não tem histórico" é uma resposta gravada.
--
-- `historico_versao` existe pelo motivo que este repositório já pagou quatro
-- vezes: quando o código passar a guardar um campo novo do histórico, subir o
-- número reenfileira todo mundo. Sem isso, coluna nova nasce vazia e assim
-- fica.
alter table public.convenia_pessoas
  add column if not exists historico_em timestamptz,
  add column if not exists historico_versao integer;

comment on column public.convenia_pessoas.historico_em is
  'Quando o histórico salarial desta pessoa foi lido. Nulo = ainda na fila. Preenchido com lista vazia = a pessoa não tem alterações, e isso é resposta, não pendência.';

-- ===========================================================================
-- SEM POLICY DE SELECT, DE PROPÓSITO
-- ===========================================================================
-- A tabela tem salário nominal por pessoa e por data. Mesma proteção de
-- `comp_ratio`: nenhum cliente a lê direto; o único caminho é a carga, que
-- roda com service_role e só publica AGREGADO por mês em `monthly_metrics`.
alter table public.convenia_historico_salarial enable row level security;
