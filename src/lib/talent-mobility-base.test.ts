import test from 'node:test';
import assert from 'node:assert/strict';
import { employeeType, dataBR } from './talent-mobility-base';

test('Employee Type sai no vocabulario do arquivo entregue', () => {
  // Julho traz ativo/admissao/desligado, minusculo, e nao tem nenhuma linha de
  // ferias entre as 654: ferias nao e tipo de vinculo, e estado dentro dele.
  assert.equal(employeeType('Ativo', false), 'ativo');
  assert.equal(employeeType('Em férias', false), 'ativo');
  assert.equal(employeeType('Em ferias', false), 'ativo');
});

test('quem saiu sai como desligado, e nao vazio', () => {
  // As 10 pessoas que sairam em agosto vinham com a coluna VAZIA: o cadastro
  // nao guarda status de quem nao esta mais la, e vazio ali se le como "nao
  // sei" quando se sabe muito bem.
  assert.equal(employeeType(null, true), 'desligado');
  assert.equal(employeeType('Ativo', true), 'desligado');
});

test('status desconhecido passa como veio, em minusculo', () => {
  assert.equal(employeeType('Admissão', false), 'admissão');
  assert.equal(employeeType(null, false), '');
});

test('dataBR nao aceita mes sem dia', () => {
  // `dismissal_month` e YYYY-MM. Passar isso por dataBR devolvia vazio, e foi
  // por isso que End Employment Date saiu em 0 de 639 com Leaver Reason em 10.
  assert.equal(dataBR('2026-08'), '');
  assert.equal(dataBR('2026-08-31'), '31/08/2026');
  assert.equal(dataBR(null), '');
});
