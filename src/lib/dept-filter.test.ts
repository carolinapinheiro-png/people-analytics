import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedDept, recorteNoEscopo } from '@/lib/dept-filter';
import type { AccessScope } from '@/lib/permissions';

/**
 * O SENTINELA JÁ DERRUBOU ESTE PROJETO DUAS VEZES, NO MESMO ARQUIVO.
 *
 * O seletor manda a string "Todos" quando nada está filtrado -- não manda
 * vazio nem null. "Todos" é truthy, então qualquer `if (departamento)` dá
 * verdadeiro com o filtro DESLIGADO.
 *
 * Primeira vez: `survey.functions.ts` fazia o parsing à mão e "Todos" virava
 * um departamento inexistente; as oito áreas eram descartadas e sobrava
 * "Outros". Segunda vez: `perfil && data.department` fez a consulta pedir os
 * recortes cruzados com o filtro em Todos, estourar o teto de 1.000 linhas do
 * PostgREST e perder as linhas de tempo de casa -- sem erro nenhum.
 *
 * Nas duas o sintoma foi "o filtro não funciona" e a causa foi a mesma linha
 * de código escrita de duas formas. Estes testes existem para que a terceira
 * vez falhe aqui.
 */

test('selectedDept: o sentinela NÃO é um departamento', () => {
  assert.equal(selectedDept({ department: 'Todos' }), null);
  assert.equal(selectedDept({ department: '  Todos  ' }), null);
  assert.equal(selectedDept({ department: '' }), null);
  assert.equal(selectedDept({ department: undefined }), null);
  assert.equal(selectedDept({}), null);
});

test('selectedDept: departamento de verdade passa, normalizado', () => {
  assert.equal(selectedDept({ department: 'marketing' }), 'MARKETING');
  assert.equal(selectedDept({ department: ' Technology ' }), 'TECHNOLOGY');
});

const global: AccessScope = { profile: 'admin', departments: [] };
const gestor: AccessScope = { profile: 'engagement_viewer', departments: ['MARKETING'] };

test('recorteNoEscopo: permissão primeiro, seleção depois', () => {
  // Perfil global sem seleção vê tudo, inclusive o que não é área.
  assert.equal(recorteNoEscopo(global, null, null, true), true);
  assert.equal(recorteNoEscopo(global, 'TECHNOLOGY', null, true), true);
  // Com seleção, só a área escolhida -- e o que não é área não acompanha.
  assert.equal(recorteNoEscopo(global, 'TECHNOLOGY', 'MARKETING', true), false);
  assert.equal(recorteNoEscopo(global, null, 'MARKETING', true), false);
});

test('recorteNoEscopo: quem tem escopo não vê área alheia por nenhuma porta', () => {
  assert.equal(recorteNoEscopo(gestor, 'MARKETING', null, false), true);
  assert.equal(recorteNoEscopo(gestor, 'TECHNOLOGY', null, false), false);
  // Recorte sem departamento não é conferível contra o escopo: falha fechado.
  assert.equal(recorteNoEscopo(gestor, null, null, false), false);
});
