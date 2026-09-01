-- Cargo no organograma, para o cadastro de acesso preencher sozinho.
--
-- Camada N e departamento já vinham automaticamente ao sair do campo de
-- e-mail. O cargo não, porque a carga do Convenia nunca o guardou -- e era o
-- único dos três que continuava sendo digitado à mão.
--
-- Null não quebra nada: o campo Cargo continua digitável, que é como ele
-- funciona hoje. O sync avisa quando mais da metade vier vazia, para a
-- ausência ser uma resposta e não um silêncio.
alter table public.org_pessoas add column if not exists job_title text;

comment on column public.org_pessoas.job_title is
  'Cargo, vindo do Convenia. Preenche o campo Cargo no cadastro de acesso — ver cargoDe() em src/lib/convenia/sync.server.ts.';
