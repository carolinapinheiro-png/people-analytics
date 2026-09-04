-- O mapa dos reports do Sandeep: qual campo do Convenia preenche cada coluna.
--
-- POR QUE UMA TABELA, E NÃO CÓDIGO
--
-- O Talent Mobility Data Model tem 51 colunas no vocabulário do Workday. O
-- Convenia tem os dados, com nomes dados pelo RH -- e nome escolhido por gente
-- não se adivinha. A primeira tentativa de casar por nome entregou doze
-- colunas ao campo `Level` porque "level" está contido em todas elas.
--
-- Casar por nome também não resolveria o caso central: `Level` é o
-- Compensation Grade, e os nomes não têm uma letra em comum. Só os VALORES
-- denunciam -- L0, L5, L3 -- e quem lê valor é gente.
--
-- Então a escolha é feita uma vez, na tela, por quem sabe, e fica gravada. O
-- gerador do CSV lê daqui. Um campo que o RH renomear amanhã quebra uma linha
-- desta tabela, visivelmente, em vez de mudar uma coluna do report em silêncio.
--
-- SEM RLS DE LEITURA, COMO OS LEAVERS
--
-- A tabela não guarda dado de pessoa -- guarda nome de campo. Mas ela DECIDE o
-- conteúdo de um arquivo que leva nome, salário e data de nascimento de 641
-- pessoas para fora daqui. Quem pode reescrever o mapa pode redirecionar o que
-- sai. Fica sem policy: só o service role, atrás de `exigirAdmin`.
create table if not exists public.talent_mobility_mapa (
  coluna text primary key,
  campo text not null,
  origem text not null check (origem in ('listagem', 'detalhe', 'personalizado')),
  definido_por text not null,
  definido_em timestamptz not null default now()
);

alter table public.talent_mobility_mapa enable row level security;

comment on table public.talent_mobility_mapa is
  'Qual campo do Convenia preenche cada coluna do Talent Mobility Data Model. Escolhido na tela de admin (Dados > Reports), lido pelo gerador do CSV. Sem policy: service role apenas.';
comment on column public.talent_mobility_mapa.coluna is
  'O nome da coluna como está no arquivo do Sandeep, exato. Ver COLUNAS_TALENT em talent-mobility.ts.';
comment on column public.talent_mobility_mapa.campo is
  'O nome do campo no Convenia, como a API devolve -- inclusive caixa e acento.';
comment on column public.talent_mobility_mapa.origem is
  'Onde o campo mora: listagem (de graça em toda carga), detalhe, ou personalizado (custom_fields).';
comment on column public.talent_mobility_mapa.definido_por is
  'E-mail de quem escolheu. O mapa decide o que sai num arquivo com salário; a escolha tem dono.';
