import test from 'node:test';
import assert from 'node:assert/strict';
import { montarN4, abaixoDeN4, CAMADAS_WIL, type PessoaN4 } from './wil-n4';

const p = (o: Partial<PessoaN4>): PessoaN4 => ({
  camada: 'N-4', familia: 'Finance', empresa: 'NSX Brasil Recife', tipo: 'CLT',
  genero: 'M', fte: null, admissao: '2020-01-10', saida: null, voluntaria: null, ...o,
});

test('as seis linhas saem sempre, na ordem do template', () => {
  const l = montarN4([], '2026-08');
  assert.deepEqual(l.map((x) => x.camada), [...CAMADAS_WIL]);
});

test('N e N-1 saem zerados: sao cargos do grupo, fora do Brasil', () => {
  const l = montarN4([p({ camada: 'N-4' })], '2026-08');
  const n = l.find((x) => x.camada === 'N')!;
  assert.equal(n.homensEmpregados + n.mulheresEmpregadas + n.semGenero, 0);
});

test('separa genero e vinculo nas quatro caixas', () => {
  const l = montarN4([
    p({ genero: 'M', tipo: 'CLT' }), p({ genero: 'M', tipo: 'PJ' }),
    p({ genero: 'F', tipo: 'CLT' }), p({ genero: 'F', tipo: 'PJ' }),
  ], '2026-08');
  const n4 = l.find((x) => x.camada === 'N-4')!;
  assert.equal(n4.homensEmpregados, 1);
  assert.equal(n4.homensContractors, 1);
  assert.equal(n4.mulheresEmpregadas, 1);
  assert.equal(n4.mulheresContractors, 1);
});

test('genero em branco tem coluna propria, e nao vira homem', () => {
  // Percentual de mulheres sobre denominador que inclui desconhecido e
  // afirmacao sobre quem ninguem perguntou.
  const l = montarN4([p({ genero: null }), p({ genero: '' })], '2026-08');
  const n4 = l.find((x) => x.camada === 'N-4')!;
  assert.equal(n4.semGenero, 2);
  assert.equal(n4.homensEmpregados, 0);
});

test('camada mais funda que N-4 nao entra, e e contada a parte', () => {
  // O organograma vai ate N-9. Somar as camadas de baixo transformaria
  // "mulheres na lideranca" em "mulheres na empresa".
  const pessoas = [p({ camada: 'N-4' }), p({ camada: 'N-5' }), p({ camada: 'N-7' })];
  const l = montarN4(pessoas, '2026-08');
  assert.equal(l.reduce((s, x) => s + x.homensEmpregados, 0), 1);
  assert.equal(abaixoDeN4(pessoas, '2026-08'), 2);
});

test('quem nao e NSX fica de fora', () => {
  const l = montarN4([p({ empresa: 'Betfair' }), p({ empresa: 'Flutter International' })], '2026-08');
  assert.equal(l.reduce((s, x) => s + x.homensEmpregados, 0), 0);
});

test('quem saiu antes do mes nao conta; quem saiu no mes conta', () => {
  const antes = montarN4([p({ saida: '2026-03' })], '2026-08');
  assert.equal(antes.find((x) => x.camada === 'N-4')!.homensEmpregados, 0);
  const noMes = montarN4([p({ saida: '2026-08' })], '2026-08');
  assert.equal(noMes.find((x) => x.camada === 'N-4')!.homensEmpregados, 1);
});

test('quem esta fora do organograma nao entra em camada nenhuma', () => {
  const l = montarN4([p({ camada: null })], '2026-08');
  assert.equal(l.reduce((s, x) => s + x.homensEmpregados, 0), 0);
  assert.equal(abaixoDeN4([p({ camada: null })], '2026-08'), 0);
});
