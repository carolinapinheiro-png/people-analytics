import test from 'node:test';
import assert from 'node:assert/strict';
import { deptForScope, ehResidual, tipoDoScope, SCOPE_TO_DEPT } from './engagement-context';
import { recorteNoEscopo } from './dept-filter';
import type { AccessScope } from './permissions';

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

// ===========================================================================
// "OUTROS" NÃO É "TODOS", E NENHUM DOS DOIS É "SEM DEPARTAMENTO"
// ===========================================================================
// Quatro coisas devolviam `null` em deptForScope e eram tratadas como um caso
// só. Isso produziu dois defeitos silenciosos ao mesmo tempo:
//
//   1. "Outros" era reportado como área sem correspondência no de-para -- um
//      alarme falso, porque ele é um balde conhecido, não uma falha de carga.
//   2. Recortes sem departamento escapavam da seleção de área: filtrar
//      Technology devolvia Technology E "Outros".
//
// Os testes abaixo fixam a distinção nos dois eixos.

test('os quatro sentidos de "não é um departamento" ficam distintos', () => {
  assert.equal(tipoDoScope('Technology'), 'area');
  assert.equal(tipoDoScope('company'), 'empresa');
  assert.equal(tipoDoScope('Betfair'), 'marca');
  assert.equal(tipoDoScope('Outros'), 'residual');
  assert.equal(tipoDoScope('Growth'), 'nao-mapeado');
});

test('"Outros" é grupo real, não falha de mapeamento', () => {
  assert.equal(ehResidual('Outros'), true);
  assert.equal(ehResidual('outros'), true);
  assert.notEqual(tipoDoScope('Outros'), 'nao-mapeado');
  // e uma área de verdade que ninguém mapeou continua sendo sinalizada
  assert.equal(tipoDoScope('Growth'), 'nao-mapeado');
  assert.equal(ehResidual('Growth'), false);
});

test('nenhuma área nomeada caiu no saco de não-departamento', () => {
  for (const k of Object.keys(SCOPE_TO_DEPT)) {
    assert.equal(tipoDoScope(k), 'area', `${k} deveria ser área`);
  }
});

// --------------------------------------------------------------- o filtro

const ADMIN: AccessScope = { profile: 'admin', departments: [], jobFamilies: [] };
const SO_TECH: AccessScope = {
  profile: 'dept_leader', departments: ['TECHNOLOGY'], jobFamilies: [],
};

test('sem seleção, perfil global vê áreas, empresa, marca e residual', () => {
  for (const s of ['Technology', 'Marketing', 'company', 'Betfair', 'Outros']) {
    assert.equal(recorteNoEscopo(ADMIN, deptForScope(s), null, true), true, s);
  }
});

test('com área selecionada, nada que não seja dela passa junto', () => {
  assert.equal(recorteNoEscopo(ADMIN, deptForScope('Technology'), 'TECHNOLOGY', true), true);
  for (const s of ['Marketing', 'Outros', 'Betfair', 'company']) {
    assert.equal(
      recorteNoEscopo(ADMIN, deptForScope(s), 'TECHNOLOGY', true), false,
      `${s} não pode acompanhar um filtro de Technology`,
    );
  }
});

test('perfil restrito não vê empresa, marca nem residual', () => {
  assert.equal(recorteNoEscopo(SO_TECH, deptForScope('Technology'), null, false), true);
  for (const s of ['Marketing', 'company', 'Betfair', 'Outros']) {
    assert.equal(recorteNoEscopo(SO_TECH, deptForScope(s), null, false), false, s);
  }
});

test('a seleção só estreita: pedir outra área não amplia o escopo', () => {
  // A permissão é o teto e é conferida ANTES da seleção. Escrito na ordem
  // inversa, o seletor viraria um caminho para ler área alheia.
  assert.equal(recorteNoEscopo(SO_TECH, deptForScope('Marketing'), 'MARKETING', false), false);
});
