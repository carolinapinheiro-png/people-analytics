import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCESS_PROFILES, PROFILE_LABELS, PROFILE_DESCRIPTIONS,
  visibleTabs, canSeeTab, isGlobalProfile, canSeeIndividualData, canManageUsers,
  visibleExperienceSubTabs, canSeeExperienceSubTab, isInScope,
  isExtraTab, sugerirAbas, podeVerSubAba, SUB_ABAS_DO_PRODUTO,
  type AccessProfile,
} from './permissions';

/**
 * O mapa de perfil -> abas é a regra mais cara de errar do sistema: quando ela
 * erra, ninguém vê um erro. A pessoa simplesmente enxerga uma aba a mais, e o
 * painel continua parecendo correto.
 *
 * Os testes abaixo travam a lista INTEIRA de cada perfil, e não só o caso que
 * motivou a mudança. Um perfil novo que herde acesso por omissão quebra aqui.
 */

test('engagement_viewer vê exatamente uma aba', () => {
  assert.deepEqual(visibleTabs('engagement_viewer'), ['engagement']);
});

test('engagement_viewer não alcança nenhuma outra aba', () => {
  const outras = [
    'overview', 'team', 'dei', 'comp', 'demographics',
    'span', 'attrition', 'recruitment', 'individual', 'data',
  ] as const;
  for (const t of outras) {
    assert.equal(canSeeTab('engagement_viewer', t), false, `não deveria ver ${t}`);
  }
  assert.equal(canSeeTab('engagement_viewer', 'engagement'), true);
});

test('o perfil novo não ganhou poder de empresa nem de dado individual', () => {
  // O risco de criar perfil é herdar por omissão. Estas três são as
  // perguntas que decidem "vê a empresa toda", "vê nome e salário" e
  // "administra usuários" -- todas precisam ser não.
  assert.equal(isGlobalProfile('engagement_viewer'), false);
  assert.equal(canSeeIndividualData('engagement_viewer'), false);
  assert.equal(canManageUsers('engagement_viewer'), false);
});

test('engagement_viewer sem área atribuída não vê área nenhuma', () => {
  // Cadastro pela metade não pode virar acesso total. O banco também recusa
  // (trigger), mas a regra tem de valer sozinha.
  const semEscopo = { profile: 'engagement_viewer' as AccessProfile, departments: [], jobFamilies: [] };
  assert.equal(isInScope(semEscopo, 'TECHNOLOGY'), false);
  assert.equal(isInScope(semEscopo, null), false);
});

test('engagement_viewer só enxerga as áreas atribuídas', () => {
  const escopo = {
    profile: 'engagement_viewer' as AccessProfile,
    departments: ['TECHNOLOGY'], jobFamilies: [],
  };
  assert.equal(isInScope(escopo, 'TECHNOLOGY'), true);
  assert.equal(isInScope(escopo, 'MARKETING'), false);
});

test('dentro de Experiência, só a sub-aba de Engajamento', () => {
  assert.deepEqual(visibleExperienceSubTabs('engagement_viewer'), ['engajamento']);
  assert.equal(canSeeExperienceSubTab('engagement_viewer', 'onboarding'), false);
  assert.equal(canSeeExperienceSubTab('engagement_viewer', 'inclusao'), false);
});

test('os perfis que já existiam não mudaram', () => {
  // A Carolina pediu para NÃO mexer no Department Leader. Se um dia alguém
  // mexer, que seja de propósito e apagando este teste.
  assert.deepEqual(visibleExperienceSubTabs('dept_leader'), ['engajamento', 'onboarding', 'inclusao']);
  assert.equal(canSeeTab('dept_leader', 'recruitment'), true);
  // 'data' exige visão consolidada e continua fora dos perfis não-globais.
  assert.equal(canSeeTab('dept_leader', 'data'), false);
  assert.equal(canSeeTab('hrbp', 'data'), false);
  assert.equal(canSeeTab('hr_leader', 'data'), true);
  assert.equal(canSeeTab('admin', 'data'), true);
});

test('todo perfil tem rótulo e descrição', () => {
  // Um perfil sem rótulo aparece como a chave crua ("engagement_viewer") na
  // tela de cadastro, e quem escolhe não sabe o que está escolhendo.
  for (const p of ACCESS_PROFILES) {
    assert.equal(typeof PROFILE_LABELS[p], 'string', `${p} sem rótulo`);
    assert.ok(PROFILE_LABELS[p].length > 0, `${p} com rótulo vazio`);
    assert.ok(PROFILE_DESCRIPTIONS[p]?.length > 0, `${p} sem descrição`);
  }
});

test('nenhum perfil enxerga aba fora da lista conhecida', () => {
  const CONHECIDAS = new Set([
    'overview', 'team', 'dei', 'comp', 'demographics', 'engagement',
    'span', 'attrition', 'recruitment', 'individual', 'data',
  ]);
  for (const p of ACCESS_PROFILES) {
    for (const t of visibleTabs(p)) {
      assert.equal(CONHECIDAS.has(t), true, `${p} lista aba desconhecida: ${t}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Abas concedidas por usuario (extra_tabs)
// ---------------------------------------------------------------------------

test('aba concedida soma ao preset, sem reordenar o menu', () => {
  const abas = visibleTabs('engagement_viewer', ['comp', 'span']);
  assert.deepEqual(abas, ['comp', 'engagement', 'span']);
  assert.equal(canSeeTab('engagement_viewer', 'comp', ['comp']), true);
});

test('aba concedida nao tira nada do preset', () => {
  // A lista so soma. Duas listas, uma somando e outra subtraindo, produzem
  // combinacoes que ninguem preve lendo o cadastro.
  assert.equal(canSeeTab('engagement_viewer', 'engagement', ['comp']), true);
});

test('valor invalido em extra_tabs nao vira aba', () => {
  // O trigger do banco ja recusa, mas a regra tem de valer sozinha: o filtro
  // e feito contra ALL_TABS, entao lixo simplesmente nao aparece.
  assert.deepEqual(visibleTabs('engagement_viewer', ['inexistente', '*']), ['engagement']);
});

test('sem concessao, nada muda', () => {
  assert.deepEqual(visibleTabs('engagement_viewer'), ['engagement']);
  assert.deepEqual(visibleTabs('engagement_viewer', []), ['engagement']);
  assert.deepEqual(visibleTabs('engagement_viewer', null), ['engagement']);
});

test('isExtraTab distingue o que veio do preset do que foi concedido', () => {
  assert.equal(isExtraTab('engagement_viewer', 'engagement'), false);
  assert.equal(isExtraTab('engagement_viewer', 'comp'), true);
  assert.equal(isExtraTab('admin', 'comp'), false);
});

test('o flag de dado individual sobrepoe o perfil nos dois sentidos', () => {
  assert.equal(canSeeIndividualData('hrbp', false), false);
  assert.equal(canSeeIndividualData('dept_leader', true), true);
  assert.equal(canSeeIndividualData('hrbp', null), true);
  assert.equal(canSeeIndividualData('dept_leader'), false);
});

test('responsabilidade sugere aba, e so sugere', () => {
  assert.deepEqual(sugerirAbas(['Comp & Ben']), ['comp']);
  assert.deepEqual(sugerirAbas(['DEI', 'Estrutura & Span']), ['team', 'dei', 'demographics', 'span']);
  assert.deepEqual(sugerirAbas([]), []);
  assert.deepEqual(sugerirAbas(['coisa que nao existe']), []);
});


// ---------------------------------------------------------------------------
// Remuneracao fora do padrao (14/08/2026)
// ---------------------------------------------------------------------------

test('ninguem tem Salarios por padrao, fora dos perfis globais', () => {
  // A regra da Carolina: "o restante da empresa nao tem acesso ao quadro de
  // compensation". Herdar `comp` por ser "tudo menos as company-wide" era
  // exatamente como Department Leader e HRBP tinham.
  assert.equal(canSeeTab('dept_leader', 'comp'), false);
  assert.equal(canSeeTab('hrbp', 'comp'), false);
  assert.equal(canSeeTab('engagement_viewer', 'comp'), false);
});

test('HR Leader e Admin continuam vendo Salarios', () => {
  assert.equal(canSeeTab('hr_leader', 'comp'), true);
  assert.equal(canSeeTab('admin', 'comp'), true);
});

test('Salarios volta pela concessao individual, e so por ela', () => {
  // E como um C-level ou N-2 recebe a aba: no proprio cadastro, com registro
  // de quem deu e quando.
  assert.equal(canSeeTab('dept_leader', 'comp', ['comp']), true);
  assert.equal(isExtraTab('dept_leader', 'comp'), true);
});

test('tirar `comp` do padrao nao derrubou as outras abas do perfil', () => {
  // O jeito errado de fazer isto seria trocar a lista inteira e perder uma
  // aba sem querer.
  for (const t of ['overview', 'team', 'dei', 'demographics', 'engagement', 'span', 'attrition', 'recruitment', 'individual'] as const) {
    assert.equal(canSeeTab('dept_leader', t), true, `dept_leader perdeu ${t}`);
  }
});

// ---------------------------------------------------------------------------
// A LISTA DA PESSOA: UMA MANDA POR VEZ
// ---------------------------------------------------------------------------
// `extra_tabs` só soma, de propósito. Isso impedia o caso real -- liberar um
// HRBP só para Engajamento nesta onda e ampliar depois.
//
// A saída não foi acrescentar uma lista de subtração (a combinação que o
// código evitou), e sim deixar a lista explícita SUBSTITUIR o preset. Estes
// testes fixam qual das duas manda em cada situação.
// ---------------------------------------------------------------------------

test('sem lista própria, nada muda: preset do perfil', () => {
  // Os nove cadastrados hoje estão neste caso. A mudança não pode mexer neles.
  assert.deepEqual(visibleTabs('hr_leader', [], []), visibleTabs('hr_leader'));
  assert.deepEqual(visibleTabs('hrbp', null, null), visibleTabs('hrbp'));
});

test('lista própria SUBSTITUI o preset, inclusive reduzindo', () => {
  // O caso da Carolina: HRBP liberado só para Engajamento nesta onda.
  const r = visibleTabs('hrbp', [], ['engagement']);
  assert.deepEqual(r, ['engagement']);
  assert.ok(!r.includes('overview'), 'o preset não sobra por baixo');
});

test('lista própria também amplia, e ignora os extras', () => {
  // Uma lista manda por vez: com `tabs` preenchida, `extra_tabs` não soma
  // nada. Se as duas somassem, ler o cadastro exigiria fazer a conta.
  const r = visibleTabs('hrbp', ['data'], ['engagement', 'comp']);
  assert.deepEqual(r.sort(), ['comp', 'engagement']);
  assert.ok(!r.includes('data'), 'extra_tabs não entra quando há lista própria');
});

test('lista VAZIA é "não definida", não "não vê nada"', () => {
  // Salvar sem marcar nada é o gesto mais fácil de fazer sem querer. O
  // resultado dele não pode ser trancar a pessoa para fora.
  assert.deepEqual(visibleTabs('hrbp', [], []), visibleTabs('hrbp'));
});

test('aba que não existe mais some da lista em vez de virar fantasma', () => {
  const r = visibleTabs('hrbp', [], ['engagement', 'aba_que_nao_existe']);
  assert.deepEqual(r, ['engagement']);
});

test('a ordem do menu é sempre a de ALL_TABS, não a do cadastro', () => {
  const r = visibleTabs('hrbp', [], ['attrition', 'overview', 'dei']);
  assert.deepEqual(r, ['overview', 'dei', 'attrition']);
});

// ---------------------------------------------------------------------------
// SUB-ABAS, MESMA MECÂNICA
// ---------------------------------------------------------------------------

test('sub-abas: sem lista própria, vale o preset do perfil', () => {
  assert.deepEqual(visibleExperienceSubTabs('hrbp'), ['engajamento', 'onboarding', 'inclusao']);
  assert.deepEqual(visibleExperienceSubTabs('engagement_viewer'), ['engajamento']);
});

test('sub-abas: lista própria reduz', () => {
  assert.deepEqual(
    visibleExperienceSubTabs('hrbp', ['engajamento']),
    ['engajamento'],
  );
});

test('sub-abas: a lista da pessoa NÃO amplia um perfil de aba única', () => {
  // Perfil de aba única é exatamente o que foi autorizado -- não um piso a
  // ampliar. Marcar onboarding num engagement_viewer não pode conceder.
  assert.deepEqual(
    visibleExperienceSubTabs('engagement_viewer', ['engajamento', 'onboarding']),
    ['engajamento'],
  );
});

test('sub-abas de OUTRA aba na lista não concedem nem barram Experiência', () => {
  // A lista é achatada entre as abas. Alguém que marcou só sub-abas de
  // Compensação não disse "não vê nada em Experiência" -- disse "não falei de
  // Experiência". Nesse caso o preset volta.
  assert.deepEqual(
    visibleExperienceSubTabs('hrbp', ['custos', 'compratio']),
    ['engajamento', 'onboarding', 'inclusao'],
  );
});

test('canSee* concorda com visible* nas duas listas', () => {
  assert.equal(canSeeTab('hrbp', 'overview', [], ['engagement']), false);
  assert.equal(canSeeTab('hrbp', 'engagement', [], ['engagement']), true);
  assert.equal(canSeeExperienceSubTab('hrbp', 'onboarding', ['engajamento']), false);
  assert.equal(canSeeExperienceSubTab('hrbp', 'engajamento', ['engajamento']), true);
});

// ---------------------------------------------------------------------------
// SUB-ABA COMO PERMISSÃO DE SERVIDOR
// ---------------------------------------------------------------------------
// Até aqui só Experiência era barrada de verdade. Salários e Atrição tinham
// corte de navegação: a sub-aba sumia do menu e a função continuava
// respondendo a quem soubesse chamá-la. A tela do admin chegou a exibir um
// aviso dizendo isso -- um aviso é honesto, não é proteção.
// ---------------------------------------------------------------------------

test('sem lista de sub-abas, todas passam', () => {
  assert.equal(podeVerSubAba('compratio'), true);
  assert.equal(podeVerSubAba('custos', []), true);
  assert.equal(podeVerSubAba('desligamentos', null), true);
});

test('com lista, só as escolhidas DA MESMA aba passam', () => {
  assert.equal(podeVerSubAba('custos', ['custos']), true);
  assert.equal(podeVerSubAba('compratio', ['custos']), false);
  assert.equal(podeVerSubAba('movimentacoes', ['custos']), false);
});

test('escolher sub-abas de UMA aba não barra as de outra', () => {
  // Quem marcou só as de Salários não disse nada sobre Atrição, e silêncio
  // não pode virar recusa. É a mesma regra que já valia em Experiência.
  assert.equal(podeVerSubAba('desligamentos', ['custos']), true);
  assert.equal(podeVerSubAba('engajamento', ['custos', 'compratio']), true);
});

test('a lista barra dentro da própria aba mesmo com irmãs de outras marcadas', () => {
  const lista = ['custos', 'engajamento'];
  assert.equal(podeVerSubAba('custos', lista), true);
  assert.equal(podeVerSubAba('compratio', lista), false, 'irmã de Salários não marcada');
  assert.equal(podeVerSubAba('engajamento', lista), true);
  assert.equal(podeVerSubAba('onboarding', lista), false);
  assert.equal(podeVerSubAba('desligamentos', lista), true, 'Atrição não foi mencionada');
});

test('sub-aba desconhecida é RECUSADA, e não ignorada', () => {
  // O lado seguro do erro: uma sub-aba que a regra não sabe interpretar não
  // pode passar por omissão. `SubTabsSchema` já a recusaria no cadastro, e
  // isto é a segunda porta.
  assert.equal(podeVerSubAba('inventada', ['custos']), false);
});

test('o mapa cobre TODAS as sub-abas que o cadastro aceita', () => {
  // Se alguém acrescentar uma sub-aba ao schema e esquecer do mapa, ela cai
  // no ramo "desconhecida" e some para quem tiver qualquer lista -- um bug
  // de acesso que ninguém veria até alguém reclamar de tela faltando.
  const doSchema = [
    'engajamento', 'onboarding', 'inclusao',
    'custos', 'compratio', 'movimentacoes',
  ];
  for (const s of doSchema) {
    assert.ok(SUB_ABAS_DO_PRODUTO[s], `${s} fora de SUB_ABAS_DO_PRODUTO`);
  }
});

test('Movimentações é barrável: tem campo próprio na série', () => {
  // Ela não tem função de servidor própria, mas consome `raise_events`, que
  // mais ninguém consome. O corte é sobre o CAMPO -- `getMonthlyMetrics` não
  // o pede no SELECT quando a pessoa não pode ver a sub-aba.
  assert.equal(podeVerSubAba('movimentacoes', ['custos']), false);
  assert.equal(podeVerSubAba('movimentacoes', ['movimentacoes']), true);
  assert.equal(podeVerSubAba('movimentacoes', ['desligamentos']), true,
    'Atrição marcada não fala de Salários');
});
