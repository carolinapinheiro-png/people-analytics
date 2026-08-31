import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeForDept, deptForScope, SCOPE_TO_DEPT } from './engagement-context';

/**
 * A fronteira entre os DOIS vocabulários de área.
 *
 * ===========================================================================
 * POR QUE ISTO MERECE ARQUIVO PRÓPRIO
 * ===========================================================================
 * O painel chama a mesma área por dois nomes:
 *
 *   filtro / headcount ..... 'HR', 'MARKETING', 'OPERATION'
 *   pesquisa ............... 'Human Resources', 'Marketing', 'Customer Service'
 *
 * E há duas funções que traduzem, em direções opostas, com nomes parecidos.
 * Trocar uma pela outra não dá erro: devolve `null` ou o nome errado, a
 * comparação não casa, e a tela conclui que a área não tem dado.
 *
 * Aconteceu três vezes esta semana no mesmo arquivo. A terceira só apareceu
 * porque alguém abriu o painel pelos olhos de um HRBP de HR e viu "0
 * respostas" onde o banco tem 20.
 */

test('scopeForDept vai do FILTRO para a PESQUISA', () => {
  assert.equal(scopeForDept('HR'), 'Human Resources');
  assert.equal(scopeForDept('MARKETING'), 'Marketing');
  assert.equal(scopeForDept('OPERATION'), 'Customer Service');
  assert.equal(scopeForDept('LEGAL & COMPLIANCE'), 'Legal');
});

test('deptForScope vai da PESQUISA para o FILTRO', () => {
  assert.equal(deptForScope('Human Resources'), 'HR');
  assert.equal(deptForScope('Customer Service'), 'OPERATION');
});

test('trocar uma pela outra NÃO dá erro — devolve null ou o nome errado', () => {
  // É por isso que a troca sobrevive à revisão e morre na tela.
  assert.equal(deptForScope('HR'), null, 'null: o cruzamento nem é pedido');
  assert.equal(
    deptForScope('MARKETING'), 'MARKETING',
    'pior: parece funcionar, mas "MARKETING" não casa com "Marketing" gravado',
  );
});

test('a volta e a ida são consistentes para toda área da pesquisa', () => {
  // Se alguém acrescentar uma área a um dos mapas e esquecer do outro, a
  // tradução vira mão única e a tela some com aquela área.
  for (const [scope, dept] of Object.entries(SCOPE_TO_DEPT)) {
    const volta = scopeForDept(dept);
    assert.ok(volta, `${dept} não volta para a pesquisa`);
    assert.equal(
      volta.toLowerCase(), scope.toLowerCase(),
      `${dept} -> ${volta}, esperado ${scope}`,
    );
  }
});

test('área que não existe na pesquisa devolve null, e não um palpite', () => {
  // PORTO, CW GROUP e DIRETORIA existem no headcount e não na pesquisa. Null
  // é a resposta certa: quem chama decide o que fazer com a ausência, em vez
  // de receber um nome que não vai casar com nada.
  assert.equal(scopeForDept('PORTO'), null);
  assert.equal(scopeForDept('CW GROUP'), null);
});
