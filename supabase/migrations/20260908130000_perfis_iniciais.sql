-- Os dois primeiros perfis, com as abas decididas na reunião de 08/09/2026.
--
-- ===========================================================================
-- DE ONDE VEM CADA ABA DESTA LISTA
-- ===========================================================================
-- Ata da reunião Caio / Carolina, decisão "Alinhada":
--
--   abertas ..... Visão Geral, Atrição, Desligamentos, Recrutamento
--   restritas ... Onboarding, Inclusão, Pertencimento, Compensação,
--                 Perfil Individual
--
-- Mais três que a ata não menciona -- Demográficos, DEI e Span -- e que a
-- Carolina liberou ao ser perguntada, em 08/09. Ficam registradas aqui porque
-- a ata sozinha não as explica, e daqui a três meses "por que o BP vê DEI?"
-- não teria resposta.
--
-- E Experiência › Engajamento, que a ata trata por omissão: ela lista as OUTRAS
-- duas sub-abas de Experiência como restritas, e as BPs estão usando Engajamento
-- e mandando feedback nesta semana. Confirmado com a Carolina.
--
-- Fora da lista, por não estarem em nenhuma das duas: `team` (Meu Time é a
-- visão de quem lidera aquelas pessoas, e o BP não lidera) e `data` (carga e
-- importação). Se algum dia entrarem, entram por decisão e não por descuido.
--
-- ===========================================================================
-- DESLIGAMENTOS E ATRIÇÃO NÃO DESEJADA VÃO JUNTAS, DE PROPÓSITO
-- ===========================================================================
-- As duas leem a MESMA lista de pessoas -- está em SUB_ABAS_QUE_COMPARTILHAM_DADO,
-- em UsersAccessSection.tsx. Liberar uma e esconder a outra tira do menu e não
-- protege nada.
--
-- A ata só cita "Desligamentos". Marcar as duas é o que descreve a verdade do
-- que a pessoa alcança; marcar uma seria uma proteção de mentira, que é pior
-- que nenhuma porque alguém confia nela.
--
-- ===========================================================================
-- `on conflict do nothing`, E NÃO `do update`
-- ===========================================================================
-- Estes perfis passam a ser editados na tela. Uma migração que sobrescreve
-- desfaria, na próxima aplicação, a edição que a Carolina fez -- e sem aviso.
-- Semear é criar o que não existe, não impor o que eu achei em setembro.
insert into public.access_profiles
  (nome, descricao, ve_empresa_toda, administra_usuarios, ve_individual, tabs, sub_tabs)
values
  (
    'Business Partner',
    'Atende áreas específicas: vê só os departamentos atribuídos, em números agregados. Sem remuneração e sem dado individual. Abas definidas na reunião de 08/09/2026.',
    false, false, false,
    array['overview', 'attrition', 'recruitment', 'engagement', 'demographics', 'dei', 'span'],
    array['engajamento', 'desligamentos', 'nao-desejada']
  ),
  (
    'Admin',
    'Vê a empresa inteira, administra usuários e enxerga dado individual. Redundância administrativa do painel.',
    true, true, true,
    array['overview', 'team', 'dei', 'comp', 'demographics', 'engagement',
          'span', 'attrition', 'recruitment', 'individual', 'data'],
    array['engajamento', 'onboarding', 'inclusao', 'custos', 'compratio',
          'movimentacoes', 'desligamentos', 'nao-desejada']
  )
on conflict (nome) do nothing;
