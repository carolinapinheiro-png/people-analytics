import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  marcasDaEntidade, entidadeSemMarca, rebasearCuts, rebasearDrivers, suprimirPedacos,
  bloqueadoPorDiferenca, areasComMarcaPequena,
} from './recorte-entidade';

const c = (cut_type: string, cut_value: string, n: number, P: number, Pa: number, D: number, risco: number, sat: number, wave = 'ago_2026') =>
  ({ wave, cut_type, cut_value, n, enps: null, promotores: P, passivos: Pa, detratores: D, risco, satisfacao: sat });

// Números reais de ago/26 (survey_cut_scores).
const AGO = [
  c('company', 'company', 485, 354, 112, 19, 16.1, 8.7),
  c('marca', 'Betfair', 36, 26, 8, 2, 13.9, 8.6),
  c('marca', 'Betnacional', 327, 256, 61, 10, 13.5, 8.8),
  c('marca', 'Cross Brand', 122, 72, 43, 7, 23.8, 8.3),
  c('area', 'Legal', 16, 11, 5, 0, 6.3, 8.7),
  c('area+marca', 'Legal || Betnacional', 4, 2, 2, 0, 25, 8.5),
  c('area+marca', 'Legal || Cross Brand', 12, 9, 3, 0, 0, 8.8),
  c('tempo', '24+ meses', 200, 100, 60, 40, 20, 8),
];

test('cada entidade soma a sua marca e o Cross Brand', () => {
  assert.deepEqual(marcasDaEntidade('Betfair BR'), ['Betfair', 'Cross Brand']);
  assert.deepEqual(marcasDaEntidade('NSX'), ['Betnacional', 'Cross Brand']);
  assert.equal(marcasDaEntidade('Flutter International'), null);
  assert.equal(marcasDaEntidade('combined'), null);
  assert.equal(entidadeSemMarca('Flutter International'), true);
  assert.equal(entidadeSemMarca('combined'), false);
});

test('empresa da Betfair BR = Betfair + Cross Brand, eNPS pelas contagens', () => {
  const r = rebasearCuts(AGO, marcasDaEntidade('Betfair BR')!);
  const emp = r.filter((x) => x.cut_type === 'company');
  assert.equal(emp.length, 1);
  assert.equal(emp[0].n, 158);
  assert.equal(emp[0].promotores, 98);
  assert.equal(emp[0].detratores, 9);
  assert.equal(emp[0].enps, Math.round((98 - 9) / 158 * 100)); // 56
  assert.equal(emp[0].risco, Math.round((36 * 13.9 + 122 * 23.8) / 158 * 10) / 10);
});

test('Cross Brand entra nas DUAS entidades', () => {
  const nsx = rebasearCuts(AGO, marcasDaEntidade('NSX')!).find((x) => x.cut_type === 'company')!;
  assert.equal(nsx.n, 327 + 122);
});

test('área vem de area+marca; área sem a marca da entidade usa só o Cross Brand', () => {
  const bf = rebasearCuts(AGO, marcasDaEntidade('Betfair BR')!).filter((x) => x.cut_type === 'area');
  assert.deepEqual(bf.map((x) => [x.cut_value, x.n]), [['Legal', 12]]);
  const nsx = rebasearCuts(AGO, marcasDaEntidade('NSX')!).find((x) => x.cut_type === 'area')!;
  assert.equal(nsx.n, 16);
  // Legal: N=4, F=0, C=12. NSX (16) = área inteira (16): não expõe nada.
  // Betfair BR (12) expõe N = 16 − 12 = 4, então ela é que some.
  assert.equal(nsx.bloqueadoPorDiferenca, false);
  const bfLegal = bf.find((x) => x.cut_value === 'Legal')!;
  assert.equal(bfLegal.bloqueadoPorDiferenca, true);
});

test('o que não tem marca cruzada passa intacto', () => {
  const r = rebasearCuts(AGO, marcasDaEntidade('NSX')!);
  assert.ok(r.some((x) => x.cut_type === 'tempo' && x.n === 200));
  assert.ok(r.some((x) => x.cut_type === 'marca'));
});

test('onda sem pergunta de marca perde empresa e área em vez de mostrar a Flutter toda', () => {
  const jul = [c('company', 'company', 233, 192, 39, 2, 12, 8.9, 'jul_2025'), c('area', 'Legal', 10, 5, 5, 0, 0, 9, 'jul_2025')];
  const r = rebasearCuts(jul, ['Betfair', 'Cross Brand']);
  assert.equal(r.filter((x) => x.cut_type === 'company' || x.cut_type === 'area').length, 0);
});

test('bloqueio por diferença: o que as outras telas deixam deduzir', () => {
  // Commercial ago/26 (caso da Thais): N=39, F=6, C=3.
  assert.equal(bloqueadoPorDiferenca(39, 6, 3), false, 'NSX (42) aparece');
  assert.equal(bloqueadoPorDiferenca(6, 39, 3), true, 'Betfair BR (9) some: com as duas, C = 3 sairia');
  // Legal: N=4, F=0, C=12 -> Betfair BR (12) expõe N = T − BF = 4.
  assert.equal(bloqueadoPorDiferenca(0, 4, 12), true);
  // Menos de cinco no total.
  assert.equal(bloqueadoPorDiferenca(1, 30, 3), true);
  // Tudo grande.
  assert.equal(bloqueadoPorDiferenca(30, 20, 10), false);
});

test('suprimirPedacos esconde o bloqueado só para quem não vê individual', () => {
  const linhas = [{ n: 16, enps: 70, bloqueadoPorDiferenca: true, suprimido: false }];
  const restrito = suprimirPedacos(linhas, false, ['enps']);
  assert.equal(restrito[0].enps, null);
  assert.equal(restrito[0].suprimido, true);
  assert.ok(!('bloqueadoPorDiferenca' in restrito[0]));
  assert.equal(suprimirPedacos(linhas, true, ['enps'])[0].enps, 70);
});

test('área com marca pequena: a quebra por marca inteira da área sai', () => {
  const fora = areasComMarcaPequena(AGO);
  assert.ok(fora.has('ago_2026\u0001Legal'), 'Legal || Betnacional tem 4');
});

test('drivers: nota ponderada por n, por pergunta', () => {
  const d = (cut_type: string, cut_value: string, n: number, score: number, favoravel: number) =>
    ({ wave: 'ago_2026', driver: 'Liderança', question: 'Q1', cut_type, cut_value, n, score, favoravel });
  const r = rebasearDrivers([
    d('company', 'company', 485, 4, 80),
    d('marca', 'Betfair', 30, 4, 70),
    d('marca', 'Cross Brand', 90, 3, 50),
    d('marca', 'Betnacional', 300, 5, 90),
  ], ['Betfair', 'Cross Brand']);
  const emp = r.find((x) => x.cut_type === 'company')!;
  assert.equal(emp.n, 120);
  assert.equal(emp.score, 3.25);
  assert.equal(emp.favoravel, 55);
});
