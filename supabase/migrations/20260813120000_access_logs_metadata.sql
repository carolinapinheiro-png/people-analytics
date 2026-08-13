-- Contexto do evento de acesso, além de "quem" e "permitido ou não".
--
-- Nasceu do "ver como": saber que a Carolina teve acesso permitido não conta
-- a história inteira quando o acesso foi ATRAVÉS de outra identidade. O que
-- se precisa reconstruir depois é "quem viu o painel como quem, e quando" --
-- e isso não cabe numa coluna booleana.
--
-- Aditiva e anulável: nenhuma linha existente muda, nenhum INSERT antigo
-- quebra.
alter table public.access_logs
  add column if not exists metadata jsonb;

comment on column public.access_logs.metadata is
  'Contexto do evento. Em action=''ver_como'', traz o e-mail e o perfil simulados.';

-- Busca por "quem já foi simulado" percorre o jsonb; sem índice isso é um
-- seq scan na tabela inteira de logs, que só cresce.
create index if not exists access_logs_metadata_idx
  on public.access_logs using gin (metadata);
