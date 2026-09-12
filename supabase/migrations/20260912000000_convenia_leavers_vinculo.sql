-- `convenia_leavers` ganha `vinculo` -- o último campo que faltava para a
-- aba de Desligamentos parar de ler `leavers` (planilha manual, parada há
-- dois meses) e passar a ler esta tabela direto.
--
-- Mesma história de nome/cargo/salário/level/job_type_family (migração
-- 20260909210000_desligados_completos.sql): o campo já vem na resposta do
-- detalhe individual que a carga já faz para resolver admissão e área.
-- Nenhuma requisição a nova -- só parar de descartar o que já chega.
--
-- Cru (CLT / Pessoa Jurídica / Sócio), como o Convenia escreve -- mesma
-- convenção do `dismissal_type`. A tradução, se algum dia precisar, é de
-- quem exibe.
alter table public.convenia_leavers
  add column if not exists vinculo text;

comment on column public.convenia_leavers.vinculo is
  'Vínculo cru (CLT / Pessoa Jurídica / Sócio), do detalhe individual do desligado. Alimenta o filtro de vínculo da aba de Desligamentos.';
