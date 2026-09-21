-- Motivo do desligamento (Convenia).
--
-- A carga lia só `dismissal.type` e `dismissal.date` da listagem de
-- desligados e descartava o resto do bloco -- incluindo o MOTIVO, que o
-- Convenia tem. `dismissal_raw` guarda o bloco inteiro (sem texto livre, ver
-- `blocoSemTextoLivre` em src/lib/convenia/pessoas.ts) para que o próximo
-- campo necessário não exija outra migração; `dismissal_motive` é a leitura
-- categórica que a aba de Desligamentos usa.
--
-- Aditivo e nulável: linhas existentes ficam nulas até a próxima carga.
alter table public.convenia_leavers
  add column if not exists dismissal_raw jsonb,
  add column if not exists dismissal_motive text;
