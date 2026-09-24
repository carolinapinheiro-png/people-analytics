import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tx, setLocale, getLocale, mesesCurtos, numLocale } from '@/lib/i18n';
import { mLabel, fmt } from '@/data/helpers';

// setLocale mexe em localStorage/document só se existirem; aqui não existem.
const emIngles = (fn: () => void) => {
  setLocale('en');
  try { fn(); } finally { setLocale('pt'); }
};

test('português é o padrão e devolve o texto original', () => {
  assert.equal(getLocale(), 'pt');
  assert.equal(tx('Mês anterior'), 'Mês anterior');
  assert.equal(tx('{0} pessoas', [12]), '12 pessoas');
});

test('inglês traduz e interpola na ordem do dicionário', () => {
  emIngles(() => {
    assert.equal(tx('Mês anterior'), 'Previous month');
    assert.equal(tx('{0} pessoas', [12]), '12 people');
    assert.equal(tx('Página {0} de {1}', [2, 5]), 'Page 2 of 5');
  });
});

test('texto sem entrada (dado) passa intacto nos dois idiomas', () => {
  emIngles(() => {
    assert.equal(tx('TECHNOLOGY'), 'TECHNOLOGY');
    assert.equal(tx(undefined), undefined);
    assert.equal(tx(null), null);
  });
});

test('meses e números seguem o idioma', () => {
  assert.equal(mLabel('2026-02'), 'Fev 2026');
  assert.equal(fmt(1234.5, 1), '1.234,5');
  emIngles(() => {
    assert.equal(mLabel('2026-02'), 'Feb 2026');
    assert.equal(mesesCurtos()[4], 'may');
    assert.equal(numLocale(), 'en-US');
    assert.equal(fmt(1234.5, 1), '1,234.5');
  });
});
