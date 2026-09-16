/**
 * Testes do recorte de foto e da série mensal de vagas abertas.
 *
 *   bun test src/lib/inhire/openSnapshots.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  asOfNoCorte, linhasDoSnapshot, normalizaStatus, serieMensal,
  type OpenSnapshotRow,
} from './openSnapshots';

const row = (o: Partial<OpenSnapshotRow> = {}): OpenSnapshotRow => ({
  as_of: '2026-09-14',
  department: 'TECHNOLOGY',
  status: 'aberta',
  jobs: 1,
  positions: 1,
  applications: 0,
  avg_age_days: null,
  ...o,
});

// ------------------------------------------------------- normalizaStatus

test('normalizaStatus: maiúsculo antigo e minúsculo novo caem no mesmo valor', () => {
  assert.equal(normalizaStatus('Aberta'), 'aberta');
  assert.equal(normalizaStatus('aberta'), 'aberta');
  assert.equal(normalizaStatus('Congelada'), 'congelada');
  assert.equal(normalizaStatus('  Aberta  '), 'aberta');
  assert.equal(normalizaStatus(null), '');
});

// ------------------------------------------------------- asOfNoCorte

test('asOfNoCorte: sem linhas, sem foto', () => {
  assert.equal(asOfNoCorte([], null), null);
  assert.equal(asOfNoCorte([], '2026-08'), null);
});

test('asOfNoCorte: sem corte, pega a foto mais recente de todas', () => {
  const rows = [row({ as_of: '2026-08-11' }), row({ as_of: '2026-09-14' }), row({ as_of: '2026-08-31' })];
  assert.equal(asOfNoCorte(rows, null), '2026-09-14');
});

test('asOfNoCorte: corte no meio do caminho pega a última foto ANTES do corte', () => {
  const rows = [row({ as_of: '2026-08-11' }), row({ as_of: '2026-08-31' }), row({ as_of: '2026-09-14' })];
  assert.equal(asOfNoCorte(rows, '2026-08'), '2026-08-31');
});

test('asOfNoCorte: corte antes de qualquer foto real não inventa uma', () => {
  const rows = [row({ as_of: '2026-08-11' })];
  assert.equal(asOfNoCorte(rows, '2026-07'), null);
});

test('asOfNoCorte: corte exatamente no mês da foto inclui ela', () => {
  const rows = [row({ as_of: '2026-08-11' }), row({ as_of: '2026-08-31' })];
  assert.equal(asOfNoCorte(rows, '2026-08'), '2026-08-31');
});

// ------------------------------------------------------- linhasDoSnapshot

test('linhasDoSnapshot: traz só as linhas do as_of pedido, nunca soma outra foto', () => {
  const rows = [
    row({ as_of: '2026-08-31', department: 'TECHNOLOGY', jobs: 3 }),
    row({ as_of: '2026-09-14', department: 'TECHNOLOGY', jobs: 5 }),
    row({ as_of: '2026-09-14', department: 'FINANCE', jobs: 2 }),
  ];
  const linhas = linhasDoSnapshot(rows, '2026-09-14');
  assert.equal(linhas.length, 2);
  assert.ok(linhas.every((r) => r.as_of === '2026-09-14'));
});

test('linhasDoSnapshot: as_of nulo não traz nada', () => {
  assert.deepEqual(linhasDoSnapshot([row()], null), []);
});

// ------------------------------------------------------- serieMensal

test('serieMensal: várias fotos no mesmo mês viram UM ponto, a última foto', () => {
  const rows = [
    row({ as_of: '2026-08-11', jobs: 3 }),
    row({ as_of: '2026-08-17', jobs: 4 }),
    row({ as_of: '2026-08-31', jobs: 5 }),
  ];
  const serie = serieMensal(rows);
  assert.equal(serie.length, 1);
  assert.equal(serie[0].month, '2026-08-01');
  assert.equal(serie[0].jobs, 5);
});

test('serieMensal: status maiúsculo e minúsculo do mesmo mês não viram duas linhas', () => {
  const rows = [
    row({ as_of: '2026-08-04', status: 'Aberta', jobs: 6 }),
    row({ as_of: '2026-08-20', status: 'aberta', jobs: 7 }),
  ];
  const serie = serieMensal(rows);
  assert.equal(serie.length, 1);
  assert.equal(serie[0].status, 'aberta');
  assert.equal(serie[0].jobs, 7);
});

test('serieMensal: meses diferentes viram pontos diferentes, ordenados', () => {
  const rows = [
    row({ as_of: '2026-09-14', jobs: 5 }),
    row({ as_of: '2026-08-31', jobs: 3 }),
  ];
  const serie = serieMensal(rows);
  assert.equal(serie.length, 2);
  assert.equal(serie[0].month, '2026-08-01');
  assert.equal(serie[1].month, '2026-09-01');
});

test('serieMensal: departamento e status diferentes no mesmo mês não se misturam', () => {
  const rows = [
    row({ as_of: '2026-09-14', department: 'TECHNOLOGY', status: 'aberta', jobs: 5 }),
    row({ as_of: '2026-09-14', department: 'TECHNOLOGY', status: 'congelada', jobs: 1 }),
    row({ as_of: '2026-09-14', department: 'FINANCE', status: 'aberta', jobs: 2 }),
  ];
  const serie = serieMensal(rows);
  assert.equal(serie.length, 3);
});
