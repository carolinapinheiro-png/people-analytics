import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  marcasDaEntidade, entidadeSemMarca, rebasearCuts, rebasearDrivers, basesRefeitas,
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
  // Sem regra de diferença (retirada a pedido): NSX Legal = 16, visível.
  assert.equal(nsx.enps, Math.round((11 - 0) / 16 * 100));
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

// ---------------------------------------------------------------------------
// 24/09: TODO RECORTE COM A VERSÃO "+ MARCA" SEGUE A ENTIDADE
// ---------------------------------------------------------------------------
// O caso da Thais: NSX + Product, e "Gestores e contribuidores · Product"
// mostrava as três marcas.
const COM_MARCA = [
  ...AGO,
  c('funcao', 'Gestores', 60, 40, 15, 5, 14, 8.6),
  c('funcao+marca', 'Gestores || Betnacional', 40, 30, 8, 2, 10, 8.8),
  c('funcao+marca', 'Gestores || Betfair', 5, 2, 2, 1, 20, 8.1),
  c('funcao+marca', 'Gestores || Cross Brand', 15, 8, 5, 2, 20, 8.4),
  c('area+funcao', 'Product || Gestores', 7, 7, 0, 0, 14.3, 9.4),
  c('area+funcao+marca', 'Product || Gestores || Betnacional', 6, 6, 0, 0, 16.7, 9.5),
  c('area+funcao+marca', 'Product || Gestores || Betfair', 1, 1, 0, 0, 0, 9),
];

test('função e área × função refeitas pela entidade', () => {
  const r = rebasearCuts(COM_MARCA, marcasDaEntidade('NSX')!);
  const g = r.filter((x) => x.cut_type === 'funcao');
  assert.deepEqual(g.map((x) => [x.cut_value, x.n]), [['Gestores', 55]]);
  const pg = r.filter((x) => x.cut_type === 'area+funcao');
  assert.deepEqual(pg.map((x) => [x.cut_value, x.n]), [['Product || Gestores', 6]]);
  // As versões "+ marca" não seguem para a tela.
  assert.ok(!r.some((x) => x.cut_type.endsWith('+marca') && x.cut_type !== 'area+marca'));
});

test('"Por marca" segue só com as marcas da entidade', () => {
  const r = rebasearCuts(COM_MARCA, marcasDaEntidade('NSX')!);
  assert.deepEqual(
    r.filter((x) => x.cut_type === 'marca').map((x) => x.cut_value).sort(),
    ['Betnacional', 'Cross Brand'],
  );
  assert.ok(r.filter((x) => x.cut_type === 'area+marca').every((x) => !x.cut_value.endsWith('Betfair')));
});

test('onda sem a versão "+ marca" de um recorte mantém o da empresa inteira', () => {
  // AGO não tem 'tempo+marca': tempo segue intacto, como antes.
  const r = rebasearCuts(COM_MARCA, marcasDaEntidade('NSX')!);
  assert.ok(r.some((x) => x.cut_type === 'tempo' && x.n === 200));
  assert.deepEqual([...basesRefeitas(COM_MARCA)].sort(), ['area', 'area+funcao', 'company', 'funcao']);
});
