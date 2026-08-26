import test from 'node:test';
import assert from 'node:assert/strict';
import { aderenciaDasPiores } from '@/lib/drill';
import type { DriverPorRecorte } from '@/lib/survey.functions';

const l = (
  cutType: string, cutValue: string, question: string, score: number, favoravel: number,
): DriverPorRecorte => ({ driver: 'D', question, cutType, cutValue, n: 30, score, favoravel });

test('aderenciaDasPiores: conta as áreas cuja pior nota é uma das piores da empresa', () => {
  const linhas = [
    l('company', 'company', 'P1', 3.0, 60),
    l('company', 'company', 'P2', 3.5, 70),
    l('company', 'company', 'P3', 4.0, 80),
    l('company', 'company', 'P4', 4.5, 90),
    // A segue a empresa: pior nota é P1, que é a pior da empresa.
    l('area', 'A', 'P1', 2.8, 55), l('area', 'A', 'P2', 3.6, 72),
    l('area', 'A', 'P3', 4.1, 82), l('area', 'A', 'P4', 4.6, 91),
    // B não segue: a pior dela é P4, que é a MELHOR da empresa.
    l('area', 'B', 'P1', 4.2, 85), l('area', 'B', 'P2', 4.3, 86),
    l('area', 'B', 'P3', 4.4, 87), l('area', 'B', 'P4', 3.1, 50),
  ];
  const r = aderenciaDasPiores(linhas)!;
  assert.equal(r.areas, 2);
  assert.equal(r.seguemAEmpresa, 1);
});

test('aderenciaDasPiores: distância e nota são leituras diferentes', () => {
  const linhas = [
    l('company', 'company', 'P1', 3.0, 60),
    l('company', 'company', 'P2', 4.5, 90),
    // A pior NOTA de A é P1 (segue a empresa), mas a maior DISTÂNCIA é P2:
    // -20 pontos contra -5. É esta divergência que confundiu a leitura.
    l('area', 'A', 'P1', 2.9, 55), l('area', 'A', 'P2', 4.0, 70),
  ];
  const r = aderenciaDasPiores(linhas)!;
  assert.equal(r.seguemAEmpresa, 1);
  assert.equal(r.distanciasDistintas, 1);
});

test('aderenciaDasPiores: sem régua da empresa não inventa número', () => {
  assert.equal(aderenciaDasPiores([l('area', 'A', 'P1', 3, 60)]), null);
});
