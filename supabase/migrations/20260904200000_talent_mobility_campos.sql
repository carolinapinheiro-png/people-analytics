-- Os campos que faltam para o Talent Mobility, e o log de quem baixa.
--
-- ===========================================================================
-- POR QUE ESTES SETE
-- ===========================================================================
-- O mapa das 51 colunas foi medido contra as 654 pessoas de julho. Quarenta e
-- quatro colunas já saem do que está guardado. As sete que faltavam eram todas
-- o mesmo problema: a sync LÊ o campo do Convenia e o descarta na redução.
--
--   registration  -> Employee ID (matrícula: 000320, P000212 -- não o UUID)
--   social_name   -> Preferred Name
--   team          -> Supervisory Organization E os sete níveis da escada
--   relationship  -> Worker Type, depois de traduzir Vínculo para CLT/PJ
--   uf            -> Work Address - Country (estado de RESIDÊNCIA)
--   salary        -> Basic Salary
--   birth_date    -> Date of Birth
--
-- `team` sozinho responde por oito colunas.
--
-- ===========================================================================
-- SALÁRIO E DATA DE NASCIMENTO SÃO OUTRA CATEGORIA
-- ===========================================================================
-- A sync cortava `birth_date` para `birth_month` DE PROPÓSITO -- guardar menos
-- era a decisão. Guardar a data inteira e o salário individual de 641 pessoas
-- é alargar o que fica armazenado, e foi decidido explicitamente para este
-- report, não por descuido.
--
-- O que muda junto: quem baixa deixa rastro. Um CSV com nome completo, data de
-- nascimento e salário na mesma linha é o artefato mais sensível que este
-- sistema produz -- mais do que a tabela de leavers, que já tem log
-- obrigatório. O gerador grava ANTES de devolver, e falha se não conseguir
-- gravar: um download sem registro não acontece.
alter table public.convenia_pessoas
  add column if not exists registration text,
  add column if not exists social_name  text,
  add column if not exists team         text,
  add column if not exists relationship text,
  add column if not exists uf           text,
  add column if not exists salary       numeric,
  add column if not exists birth_date   date;

comment on column public.convenia_pessoas.registration is
  'Matrícula do Convenia (000320, P000212). Employee ID do report -- NÃO o convenia_id, que é UUID.';
comment on column public.convenia_pessoas.team is
  'O `Time` do Convenia. Supervisory Organization do report, e o atributo que a escada de hierarquia lê em cada degrau.';
comment on column public.convenia_pessoas.relationship is
  'Vínculo cru, como o Convenia manda. A tradução para CLT/PJ é do gerador -- vínculo novo sai vazio em vez de virar CLT em silêncio.';
comment on column public.convenia_pessoas.uf is
  'Estado do endereço de RESIDÊNCIA, não do escritório: os remotos espalham por RJ, RS, MG.';
comment on column public.convenia_pessoas.salary is
  'Salário individual. Alargamento consciente do que se guarda, para o Talent Mobility. Toda saída passa por talent_mobility_download_log.';
comment on column public.convenia_pessoas.birth_date is
  'Data de nascimento completa. `birth_month` continua existindo e é o que o dashboard usa.';

-- O log do download. Mesmo desenho do `leavers_access_log`.
--
-- Sem policy: service role apenas. Quem consulta o log não é a mesma pessoa
-- que baixa, e a tabela existe justamente para não depender de boa vontade.
create table if not exists public.talent_mobility_download_log (
  id           bigserial primary key,
  baixado_por  text not null,
  baixado_em   timestamptz not null default now(),
  linhas       integer not null,
  -- O mês pedido, para separar o download de rotina do passeio pelo histórico.
  mes_alvo     text not null,
  -- Colunas sensíveis que saíram nesta cópia. Se um dia o report deixar de
  -- levar salário, o log de ontem continua dizendo que o de ontem levava.
  campos_sensiveis text[] not null default '{}'
);

alter table public.talent_mobility_download_log enable row level security;

create index if not exists talent_mobility_download_log_em
  on public.talent_mobility_download_log (baixado_em desc);

comment on table public.talent_mobility_download_log is
  'Quem baixou a base do Talent Mobility, quando, de que mês e quantas linhas. O gerador grava ANTES de devolver e falha se não conseguir: download sem registro não acontece.';
