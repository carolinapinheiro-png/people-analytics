import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headcountDaArea } from './headcount-area';

test('série convenia: sem `headcount`, soma o level_base', () => {
  assert.equal(headcountDaArea({ level_base: { L3: 10, L4: 5, L5: 2 } }), 17);
});

test('`headcount` gravado tem preferência', () => {
  assert.equal(headcountDaArea({ headcount: 20, level_base: { L3: 10 } }), 20);
});

test('bloco vazio ou nulo é zero, não erro', () => {
  assert.equal(headcountDaArea(null), 0);
  assert.equal(headcountDaArea({ headcount: null, level_base: null }), 0);
});
