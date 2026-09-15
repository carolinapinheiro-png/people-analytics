import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolverPeriodo, trimestreDe, rotuloMes, rotuloTrimestre,
  periodoAplicavel, PERIODO_INDISPONIVEL,
} from './periodo';

test('trimestreDe devolve os tres meses do trimestre', () => {
  assert.deepEqual(trimestreDe('2026-08'), ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(trimestreDe('2026-01'), ['2026-01', '2026-02', '2026-03']);
  assert.deepEqual(trimestreDe('2026-12'), ['2026-10', '2026-11', '2026-12']);
});

test('trimestreDe aceita data completa', () => {
  assert.deepEqual(trimestreDe('2026-05-01'), ['2026-04', '2026-05', '2026-06']);
});

test('resolverPeriodo: mensal recorta um mes so', () => {
  const p = resolverPeriodo({ view: 'monthly', currentMonth: '2026-07', activeYear: '2026' });
  assert.equal(p.tipo, 'mes');
  assert.deepEqual(p.meses, ['2026-07']);
  assert.equal(p.contem('2026-07'), true);
  assert.equal(p.contem('2026-06'), false);
  assert.equal(p.label, 'jul/2026');
});

test('resolverPeriodo: trimestral recorta o trimestre que contem o mes', () => {
  const p = resolverPeriodo({ view: 'quarterly', currentMonth: '2026-08', activeYear: '2026' });
  assert.equal(p.tipo, 'trimestre');
  assert.equal(p.contem('2026-07'), true);
  assert.equal(p.contem('2026-09-30'), true);
  assert.equal(p.contem('2026-06'), false);
  assert.equal(p.label, '2026 Q3');
});

test('resolverPeriodo: sem ano em escopo nao recorta nada', () => {
  const p = resolverPeriodo({ view: 'monthly', currentMonth: '2026-07', activeYear: null });
  assert.equal(p.tipo, 'todos');
  assert.equal(p.contem('2013-03'), true);
  assert.equal(p.ateOFim('2013-03'), true);
});

test('resolverPeriodo: sem mes resolvido ainda nao recorta nada', () => {
  const p = resolverPeriodo({ view: 'monthly', currentMonth: '', activeYear: '2026' });
  assert.equal(p.tipo, 'todos');
});

test('resolverPeriodo: ateOFim mantem a historia do ano ate o mes escolhido', () => {
  const p = resolverPeriodo({ view: 'monthly', currentMonth: '2026-07', activeYear: '2026' });
  assert.equal(p.ateOFim('2026-01'), true);
  assert.equal(p.ateOFim('2026-07'), true);
  assert.equal(p.ateOFim('2026-08'), false);
  assert.equal(p.ateOFim('2025-12'), false);
  assert.equal(p.ateOFim(null), false);
});

test('resolverPeriodo: trimestral -- a serie vai ate o fim do trimestre', () => {
  const p = resolverPeriodo({ view: 'quarterly', currentMonth: '2026-08', activeYear: '2026' });
  assert.equal(p.ateOFim('2026-09'), true);
  assert.equal(p.ateOFim('2026-10'), false);
});

test('rotulos: formata mes e trimestre', () => {
  assert.equal(rotuloMes('2026-03'), 'mar/2026');
  assert.equal(rotuloTrimestre('2026-03'), '2026 Q1');
});

test('periodoAplicavel: as abas de foto do presente estao declaradas', () => {
  assert.equal(periodoAplicavel('span'), false);
  assert.equal(periodoAplicavel('team'), false);
  assert.equal(periodoAplicavel('individual'), false);
  assert.equal(periodoAplicavel('overview'), true);
  assert.equal(periodoAplicavel('attrition'), true);
});

test('periodoAplicavel: todo motivo declarado tem frase', () => {
  for (const [tab, motivo] of Object.entries(PERIODO_INDISPONIVEL)) {
    assert.ok(motivo.length > 40, `${tab}: motivo curto demais`);
  }
});
