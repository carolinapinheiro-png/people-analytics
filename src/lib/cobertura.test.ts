import test from 'node:test';
import assert from 'node:assert/strict';
import { alcanca, basesSemDado, rotuloAno, type CoberturaBase } from './cobertura';

/** A cobertura real em 19/08/2026, medida no banco. */
const REAL: CoberturaBase[] = [
  { base: 'quadro', label: 'Quadro', abas: ['Quadro'], primeiroAno: '2013', ultimoAno: '2026' },
  { base: 'desligados', label: 'Desligados', abas: ['Atrição'], primeiroAno: '2024', ultimoAno: '2026' },
  { base: 'pesquisa', label: 'Pesquisa', abas: ['Experiência'], primeiroAno: '2025', ultimoAno: '2026' },
  { base: 'recrutamento', label: 'Recrutamento', abas: ['Recrutamento'], primeiroAno: '2025', ultimoAno: '2026' },
];

test('2017 só tem quadro', () => {
  const faltam = basesSemDado('2017', REAL).map((c) => c.base);
  assert.deepEqual(faltam, ['desligados', 'pesquisa', 'recrutamento']);
  assert.equal(rotuloAno('2017', REAL), '2017 · só quadro');
});

test('2024 tem quadro e desligados, mas não pesquisa nem recrutamento', () => {
  assert.deepEqual(basesSemDado('2024', REAL).map((c) => c.base), ['pesquisa', 'recrutamento']);
  assert.equal(rotuloAno('2024', REAL), '2024 · só quadro e desligados');
});

test('ano completo não ganha rótulo nenhum -- o aviso só aparece quando há o que avisar', () => {
  assert.deepEqual(basesSemDado('2026', REAL), []);
  assert.equal(rotuloAno('2026', REAL), '2026');
});

test('"Todos" não julga ano nenhum', () => {
  // Sem um ano escolhido não existe "esta base não alcança" -- a série longa
  // usa o que cada base tem, e o aviso não faria sentido.
  assert.deepEqual(basesSemDado(null, REAL), []);
});

test('base vazia não alcança ano nenhum', () => {
  const vazia: CoberturaBase = {
    base: 'pesquisa', label: 'Pesquisa', abas: [], primeiroAno: null, ultimoAno: null,
  };
  assert.equal(alcanca(vazia, '2026'), false);
});

test('ano fora de toda cobertura diz que não tem nada', () => {
  assert.equal(rotuloAno('2011', REAL), '2011 · sem dado');
});

test('o rótulo sai da cobertura, não de ano escrito à mão', () => {
  // Se amanhã os desligados passarem a cobrir desde 2013, 2017 deixa de ser
  // "só quadro" sozinho -- sem ninguém editar uma lista.
  const futuro = REAL.map((c) =>
    c.base === 'desligados' ? { ...c, primeiroAno: '2013' } : c);
  assert.equal(rotuloAno('2017', futuro), '2017 · só quadro e desligados');
});
