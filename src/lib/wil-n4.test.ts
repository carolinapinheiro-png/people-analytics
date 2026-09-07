import test from 'node:test';
import assert from 'node:assert/strict';
import { montarN4, CAMADAS_N4, type PessoaN4 } from './wil-n4';

const p = (o: Partial<PessoaN4>): PessoaN4 => ({
  familia: 'Finance', empresa: 'NSX Brasil Recife', tipo: 'CLT', genero: 'M',
  fte: null, admissao: '2020-01-10', saida: null, voluntaria: null, camada: 'N-3', ...o,
});

test('as seis linhas saem sempre, mesmo zeradas', () => {
  // O arquivo entregue traz N e N-1 zerados; linha faltando desalinha o resto.
  const l = montarN4([], '2026-08');
  assert.equal(l.length, CAMADAS_N4.length);
  assert.deepEqual(l.map((x) => x.camada), ['N', 'N-1', 'N-2', 'N-3', 'N-4', 'EXCO EA']);
});

test('cruza camada com genero e vinculo', () => {
  const l = montarN4([
    p({ camada: 'N-4', genero: 'M', tipo: 'CLT' }),
    p({ camada: 'N-4', genero: 'M', tipo: 'PJ' }),
    p({ camada: 'N-4', genero: 'F', tipo: 'CLT' }),
    p({ camada: 'N-4', genero: 'F', tipo: 'PJ' }),
  ], '2026-08');
  const n4 = l.find((x) => x.camada === 'N-4')!;
  assert.equal(n4.homensEmpregado, 1);
  assert.equal(n4.homensContractor, 1);
  assert.equal(n4.mulheresEmpregado, 1);
  assert.equal(n4.mulheresContractor, 1);
});

test('genero desconhecido tem coluna propria, e nao vira homem', () => {
  const l = montarN4([p({ camada: 'N-3', genero: null })], '2026-08');
  const n3 = l.find((x) => x.camada === 'N-3')!;
  assert.equal(n3.semGenero, 1);
  assert.equal(n3.homensEmpregado, 0);
});

test('EXCO EA sai zero em vez de receber gente de N-4', () => {
  const l = montarN4([p({ camada: 'N-4' }), p({ camada: 'EXCO EA' })], '2026-08');
  const exco = l.find((x) => x.camada === 'EXCO EA')!;
  assert.equal(exco.homensEmpregado + exco.semGenero, 0);
});

test('camada abaixo de N-4 fica de fora: o report e de lideranca', () => {
  const l = montarN4([p({ camada: 'N-6' }), p({ camada: 'N-5' })], '2026-08');
  assert.equal(l.reduce((s, x) => s + x.homensEmpregado, 0), 0);
});

test('quem nao e NSX nao entra', () => {
  const l = montarN4([p({ empresa: 'Betfair' }), p({ empresa: 'Flutter International' })], '2026-08');
  assert.equal(l.reduce((s, x) => s + x.homensEmpregado, 0), 0);
});

test('quem saiu antes do mes nao conta; quem saiu NO mes conta', () => {
  const antes = montarN4([p({ saida: '2026-03' })], '2026-08');
  assert.equal(antes.find((x) => x.camada === 'N-3')!.homensEmpregado, 0);
  const noMes = montarN4([p({ saida: '2026-08' })], '2026-08');
  assert.equal(noMes.find((x) => x.camada === 'N-3')!.homensEmpregado, 1);
});

test('admissao futura nao conta', () => {
  const l = montarN4([p({ admissao: '2026-09-01' })], '2026-08');
  assert.equal(l.find((x) => x.camada === 'N-3')!.homensEmpregado, 0);
});

test('sem camada no organograma nao entra em linha nenhuma', () => {
  const l = montarN4([p({ camada: null })], '2026-08');
  assert.equal(l.reduce((s, x) => s + x.homensEmpregado + x.semGenero, 0), 0);
});
