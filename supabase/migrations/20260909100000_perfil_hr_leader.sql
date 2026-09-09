-- HR Leader: vê tudo, e não distribui acesso.
--
-- ===========================================================================
-- A ÚNICA DIFERENÇA PARA O ADMIN É QUEM PODE CONCEDER ACESSO
-- ===========================================================================
-- As duas chaves de alcance são idênticas -- empresa inteira, com dado
-- individual. O que muda é `administra_usuarios`, e essa distinção é a razão
-- de o perfil existir: alguém sênior de RH que precisa dos números completos e
-- não deve poder cadastrar, editar ou remover o acesso de ninguém.
--
-- Era exatamente a diferença entre `admin` e `hr_leader` no modelo antigo, e é
-- a única que havia entre os dois. Ver perfil-derivado.ts.
--
-- ===========================================================================
-- INCLUI A ABA `data`, COMO O PRESET ANTIGO INCLUÍA
-- ===========================================================================
-- `data` é a carga e a importação. No modelo derivado, todo perfil global
-- recebia ALL_TABS, e `hr_leader` é global -- então ela vinha junto.
--
-- Mantida aqui por fidelidade, e não por convicção: dá para argumentar que
-- importar dado é ato de administração e devia acompanhar
-- `administra_usuarios`. A diferença é que agora isso é uma linha na tela, e
-- não uma constante no código -- tirar a aba do perfil leva um clique e vale
-- para todo mundo que estiver nele.
--
-- Arquivo novo em vez de edição do 20260908130000: aquela migração pode já ter
-- rodado, e reescrever migração aplicada é como duas bases que deveriam ser
-- iguais deixam de ser.
insert into public.access_profiles
  (nome, descricao, ve_empresa_toda, administra_usuarios, ve_individual, tabs, sub_tabs)
values
  (
    'HR Leader',
    'Vê a empresa inteira e o dado individual, e não administra usuários. É o Admin sem a chave de conceder acesso.',
    true, false, true,
    array['overview', 'team', 'dei', 'comp', 'demographics', 'engagement',
          'span', 'attrition', 'recruitment', 'individual', 'data'],
    array['engajamento', 'onboarding', 'inclusao', 'custos', 'compratio',
          'movimentacoes', 'desligamentos', 'nao-desejada']
  )
on conflict (nome) do nothing;
