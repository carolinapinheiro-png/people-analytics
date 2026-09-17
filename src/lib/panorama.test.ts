import test from 'node:test';
import assert from 'node:assert/strict';
import type { MonthRecord } from '@/data/raw-data';
import { panoramaDoPeriodo, rotuloIntervalo } from './panorama';

const mes = (month: string, headcount: number, joiners: number, leavers: number): MonthRecord =>
  ({
    month,
    year: month.slice(0, 4),
    headcount,
    joiners,
    leavers,
    attrition_rate: headcount ? (leavers / headcount) * 100 : 0,
    promotions: null,
  }) as unknown as MonthRecord;

const serie = [
  mes('2025-12', 38, 0, 0),
  mes('2026-01', 40, 2, 0),
  mes('2026-02', 42, 3, 1),
  mes('2026-03', 44, 3, 1),
  mes('2026-04', 45, 2, 1),
  mes('2026-05', 43, 0, 2),
];
const so2026 = serie.filter((d) => d.month.startsWith('2026'));

test('mês selecionado: acumula de janeiro até ele, e não além', () => {
  const p = panoramaDoPeriodo({ serieMensal: so2026, view: 'monthly', currentMonth: '2026-03', activeYear: '2026' });
  assert.deepEqual(p.meses.map((d) => d.month), ['2026-01', '2026-02', '2026-03']);
  assert.equal(p.rotulo, 'jan–mar/2026');
  assert.equal(p.hcInicio, 40);
  assert.equal(p.hcFim, 44);
  assert.equal(p.saidas, 2, 'as saídas de abril e maio não entram');
  assert.equal(p.entradas, 8);
});

test('trimestre selecionado: vai até o fim do trimestre, sobre a série mensal', () => {
  const p = panoramaDoPeriodo({ serieMensal: so2026, view: 'quarterly', currentMonth: '2026-04', activeYear: '2026' });
  assert.deepEqual(p.meses.map((d) => d.month), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']);
  assert.equal(p.rotulo, 'jan–mai/2026', 'trimestre incompleto mostra até o último mês com dado');
  assert.equal(p.hcFim, 43, 'HC de um mês, não média de trimestre');
});

test('todos os anos: série inteira, rótulo com os dois anos', () => {
  const p = panoramaDoPeriodo({ serieMensal: serie, view: 'monthly', currentMonth: '2026-02', activeYear: null });
  assert.equal(p.meses.length, 6);
  assert.equal(p.rotulo, 'dez/2025–mai/2026');
});

test('acumulado é saídas sobre o HC médio da janela', () => {
  const p = panoramaDoPeriodo({ serieMensal: so2026, view: 'monthly', currentMonth: '2026-02', activeYear: '2026' });
  assert.equal(p.hcMedio, 41);
  assert.ok(Math.abs(p.atricaoAcumulada - (1 / 41) * 100) < 1e-9);
  assert.ok(Math.abs(p.turnoverAcumulado - ((5 + 1) / 2 / 41) * 100) < 1e-9);
});

test('promoção nula em todos os meses é "não calculado", não zero', () => {
  const p = panoramaDoPeriodo({ serieMensal: so2026, view: 'monthly', currentMonth: '2026-05', activeYear: '2026' });
  assert.equal(p.promocoes, null);
});

test('série vazia não quebra', () => {
  const p = panoramaDoPeriodo({ serieMensal: [], view: 'monthly', currentMonth: '', activeYear: '2026' });
  assert.equal(p.rotulo, '');
  assert.equal(p.atricaoAcumulada, 0);
});

test('rotuloIntervalo', () => {
  assert.equal(rotuloIntervalo('2026-03', '2026-03'), 'mar/2026');
  assert.equal(rotuloIntervalo('2026-01', '2026-09'), 'jan–set/2026');
});
