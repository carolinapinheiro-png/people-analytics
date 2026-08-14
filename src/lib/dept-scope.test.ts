import test from 'node:test';
import assert from 'node:assert/strict';
import { deptForScope, SCOPE_TO_DEPT } from './engagement-context';

/**
 * O filtro por área da aba de Engajamento depende inteiramente do de-para
 * entre o nome que a PESQUISA usa e o nome que o CATÁLOGO usa. Enquanto a
 * comparação era feita em maiúsculas no texto cru, três das nove áreas nunca
 * casavam -- e o sintoma era "esta área não tem dado", que é indistinguível
 * de uma área que realmente não tem dado.
 *
 * Estes testes existem para que a próxima área com nome diferente quebre um
 * teste em vez de sumir da tela em silêncio.
 */

/** Os nove `scope` que existem hoje em engagement_scores (onda jan/26). */
const SCOPES_REAIS = [
  'company', 'Customer Service', 'Marketing', 'Technology', 'Commercial',
  'Human Resources', 'Finance', 'Product', 'Legal', 'Betfair',
];

test('as três áreas em que o nome divergia casam pelo de-para', () => {
  // Estas são exatamente as que a comparação em maiúsculas errava:
  // 'HUMAN RESOURCES' !== 'HR', 'CUSTOMER SERVICE' !== 'OPERATION',
  // 'LEGAL' !== 'LEGAL & COMPLIANCE'.
  assert.equal(deptForScope('Human Resources'), 'HR');
  assert.equal(deptForScope('Customer Service'), 'OPERATION');
  assert.equal(deptForScope('Legal'), 'LEGAL & COMPLIANCE');
});

test('as que já casavam continuam casando', () => {
  assert.equal(deptForScope('Technology'), 'TECHNOLOGY');
  assert.equal(deptForScope('Marketing'), 'MARKETING');
  assert.equal(deptForScope('Commercial'), 'COMMERCIAL');
  assert.equal(deptForScope('Finance'), 'FINANCE');
  assert.equal(deptForScope('Product'), 'PRODUCT');
});

test('company e Betfair não são departamento', () => {
  // `Betfair` é MARCA e aparece ao lado das áreas na pesquisa. Tratá-la como
  // departamento a faria disputar espaço na fila de prioridade com áreas de
  // verdade -- e, pior, entraria como "área sem escopo" para perfil restrito.
  assert.equal(deptForScope('company'), null);
  assert.equal(deptForScope('Betfair'), null);
});

test('toda área da onda atual ou vira departamento ou é declarada não-área', () => {
  // Uma área nova na próxima onda que ninguém mapeie cai aqui. Sem este teste
  // ela sumiria do filtro sem avisar.
  for (const s of SCOPES_REAIS) {
    const dept = deptForScope(s);
    const naoArea = s === 'company' || s === 'Betfair';
    assert.equal(
      dept != null || naoArea, true,
      `"${s}" não tem departamento correspondente nem está declarada como não-área`,
    );
  }
});

test('o de-para não distingue maiúscula nem espaço em volta', () => {
  assert.equal(deptForScope('  technology  '), 'TECHNOLOGY');
  assert.equal(deptForScope('HUMAN RESOURCES'), 'HR');
});

test('área desconhecida devolve null, não um palpite', () => {
  // Devolver o próprio texto em maiúsculas "quase funciona" e é justamente o
  // que causava o bug: parecia certo para seis áreas e errava três.
  assert.equal(deptForScope('Growth'), null);
  assert.equal(deptForScope(''), null);
});

test('todo destino do de-para é um departamento do catálogo', () => {
  // Lista conferida no banco em 13/08/2026. Um destino escrito errado aqui
  // faria a área casar com nada -- o mesmo sintoma silencioso de antes.
  const CATALOGO = new Set([
    'COMMERCIAL', 'CW GROUP', 'DIRETORIA', 'FINANCE', 'HR', 'LEGAL & COMPLIANCE',
    'MARKETING', 'OPERATION', 'PORTO', 'PRODUCT', 'SEM DEPTO', 'TECHNOLOGY',
    'TECHNOLOGY GROUP',
  ]);
  for (const destino of Object.values(SCOPE_TO_DEPT)) {
    assert.equal(CATALOGO.has(destino), true, `${destino} não existe no catálogo de departamentos`);
  }
});
