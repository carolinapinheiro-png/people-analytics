-- O perfil deixa de ser escolhido; as três chaves passam a ser.
--
-- ===========================================================================
-- O QUE MUDA, E O QUE NÃO
-- ===========================================================================
-- Nada muda no que cada pessoa enxerga. A coluna `profile` continua existindo
-- e continua sendo o que as 26 checagens de `isGlobalProfile` consultam --
-- ela só deixa de ser preenchida à mão e passa a ser DERIVADA das respostas
-- de "vê a empresa toda?", "administra usuários?", "vê dado individual?".
-- Ver src/lib/perfil-derivado.ts.
--
-- Dois ajustes de dado foram necessários:
--
-- 1. `engagement_viewer` foi aposentado. Ele nunca foi uma combinação das
--    três chaves -- era um Department Leader com `tabs = ['engagement']`, e a
--    lista de abas virou campo por pessoa. O único cadastro com esse perfil
--    passou a dept_leader + tabs=['engagement'] + sub_tabs=['engajamento'],
--    que é exatamente o que ele já enxergava.
--
-- 2. `can_see_individual` era de três estados: true, false, e NULL="conforme
--    o perfil". Com o perfil derivado, o null perde significado próprio --
--    ele apontava para uma escolha que não existe mais. Os sete cadastros com
--    null receberam o valor que o perfil deles já produzia.
--
-- As duas mudanças foram aplicadas antes desta migração e estão aqui para o
-- histórico e para reprodução em outro ambiente.
update public.allowed_emails
set profile = 'dept_leader',
    can_see_individual = false,
    tabs = array['engagement'],
    sub_tabs = array['engajamento']
where profile = 'engagement_viewer';

update public.allowed_emails
set can_see_individual = (profile in ('admin', 'hr_leader', 'hrbp'))
where can_see_individual is null;
