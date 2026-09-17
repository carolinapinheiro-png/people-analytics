-- Remove a aba "Meu Time" ('team') dos cadastros de acesso.
--
-- A aba saiu do painel em 17/09/2026: os líderes já veem só o próprio time
-- nas demais abas, então ela só repetia Overview, Demográficos e Span.
-- Sem esta limpeza, um cadastro com 'team' salvo seria rejeitado pela
-- validação do formulário (ALL_TABS) na próxima edição.
--
-- Conferido antes: nenhuma lista fica vazia com a remoção (vazio = preset
-- do perfil, o que AMPLIARIA o acesso). A guarda abaixo garante isso mesmo
-- que o dado tenha mudado até a migration rodar.

update public.allowed_emails
set tabs = array_remove(tabs, 'team')
where 'team' = any(tabs)
  and cardinality(array_remove(tabs, 'team')) > 0;

update public.allowed_emails
set extra_tabs = array_remove(extra_tabs, 'team')
where 'team' = any(extra_tabs);

update public.access_profiles
set tabs = array_remove(tabs, 'team')
where 'team' = any(tabs)
  and cardinality(array_remove(tabs, 'team')) > 0;
