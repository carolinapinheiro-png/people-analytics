-- A data de desligamento inteira, não só o mês.
--
-- `dismissal_month` (YYYY-MM) basta para a série mensal, que agrupa por mês de
-- qualquer forma, e foi por isso que só ela ficou. Mas o Talent Mobility pede
-- `End Employment Date` e `Leaver Date` com dia: julho traz 01/07, 03/07,
-- 22/07. Com o mês apenas, as duas colunas saíram em 0 de 639 -- as pessoas
-- certas, sem data.
--
-- Inventar o dia 01 seria pior do que a coluna vazia. Uma data falsa entra em
-- conta de tempo de casa e nunca mais é questionada; uma coluna vazia é vista
-- por quem abre a planilha.
--
-- A API já devolve a data completa em toda listagem de desligados: ela era
-- descartada na redução, como aconteceu com os sete campos do cadastro.
alter table public.convenia_leavers
  add column if not exists dismissal_date date;

comment on column public.convenia_leavers.dismissal_date is
  'Data completa do desligamento. `dismissal_month` continua existindo e e o que a serie mensal usa; esta coluna atende as colunas do Talent Mobility que pedem dia.';
