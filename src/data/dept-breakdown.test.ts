import test from 'node:test';
import assert from 'node:assert/strict';
import { getMonthData } from './helpers';
import { quebraPorArea } from './compose-metrics';
import type { MonthRecord } from './raw-data';

/**
 * A quebra por departamento na visão COMBINADA.
 *
 * `applyDeptFilter` tem dois caminhos: com `dept_breakdown` recorta de verdade;
 * sem ela, rateia -- multiplica os números da empresa pela fatia de headcount
 * do departamento e MANTÉM os percentuais company-wide.
 *
 * "Combinado" é a marca padrão do painel, e `getMonthData` somava dept_data,
 * level_base, demographics e race_cross mas NÃO dept_breakdown. Então o
 * caminho de todo mundo era o rateio: filtrar por Commercial no DEI deixava os
 * KPIs de mulheres idênticos aos da empresa enquanto o gráfico de composição
 * de liderança mudava -- e o arredondamento zerava as mulheres, fazendo
 * parecer que a área não tem nenhuma na liderança.
 */

const db = (over: Record<string, unknown> = {}) => ({
  gender_female: 0, gender_male: 0, leaders: 0, leader_female: 0,
  level_base: {}, tenure_base: {},
  demographics: { age: {}, race: {}, marital: {}, origin: {} },
  race_cross: {},
  ...over,
});

const mes = (brand: string, over: Record<string, unknown>): MonthRecord => ({
  month: '2026-08', year: 2026, brand, headcount: 0, joiners: 0, leavers: 0,
  ...over,
} as MonthRecord);

test('a visão combinada SOMA a quebra por departamento das marcas', () => {
  const dados = [
    mes('NSX', {
      headcount: 100,
      dept_breakdown: { COMMERCIAL: db({ gender_female: 20, gender_male: 30, leaders: 6, leader_female: 2 }) },
    }),
    mes('Betfair BR', {
      headcount: 10,
      dept_breakdown: { COMMERCIAL: db({ gender_female: 3, gender_male: 4, leaders: 2, leader_female: 1 }) },
    }),
  ];
  const c = getMonthData(dados, '2026-08', 'combined');
  const com = c.dept_breakdown?.COMMERCIAL;
  assert.ok(com, 'a quebra combinada não pode sumir');
  assert.equal(com.gender_female, 23);
  assert.equal(com.gender_male, 34);
  assert.equal(com.leaders, 8);
  assert.equal(com.leader_female, 3);
});

test('mapas aninhados somam por chave, não se sobrescrevem', () => {
  const dados = [
    mes('NSX', { headcount: 10, dept_breakdown: { TECH: db({ level_base: { L3: 5 }, demographics: { age: { '<25': 2 }, race: { Branca: 4 }, marital: {}, origin: {} } }) } }),
    mes('Betfair BR', { headcount: 10, dept_breakdown: { TECH: db({ level_base: { L3: 2, L4: 1 }, demographics: { age: { '<25': 1 }, race: { Parda: 3 }, marital: {}, origin: {} } }) } }),
  ];
  const tech = getMonthData(dados, '2026-08', 'combined').dept_breakdown?.TECH;
  assert.equal(tech?.level_base.L3, 7);
  assert.equal(tech?.level_base.L4, 1);
  assert.equal(tech?.demographics.age['<25'], 3);
  assert.equal(tech?.demographics.race.Branca, 4);
  assert.equal(tech?.demographics.race.Parda, 3);
});

test('race_cross soma as quatro contagens por raça', () => {
  const rc = (o: Record<string, number>) => ({ total: 0, female: 0, leaders: 0, female_leaders: 0, ...o });
  const dados = [
    mes('NSX', { headcount: 10, dept_breakdown: { HR: db({ race_cross: { Preta: rc({ total: 5, female: 3, leaders: 1, female_leaders: 1 }) } }) } }),
    mes('Betfair BR', { headcount: 10, dept_breakdown: { HR: db({ race_cross: { Preta: rc({ total: 2, female: 1, leaders: 1, female_leaders: 0 }) } }) } }),
  ];
  const p = getMonthData(dados, '2026-08', 'combined').dept_breakdown?.HR.race_cross.Preta;
  assert.deepEqual(p, { total: 7, female: 4, leaders: 2, female_leaders: 1 });
});

test('sem quebra em marca nenhuma, devolve undefined e não objeto vazio', () => {
  // `{}` diria "a quebra existe e está vazia", e `applyDeptFilter` marcaria o
  // recorte como EXATO -- publicando zeros como se fossem medição.
  const dados = [mes('NSX', { headcount: 10 }), mes('Betfair BR', { headcount: 5 })];
  assert.equal(getMonthData(dados, '2026-08', 'combined').dept_breakdown, undefined);
});

test('departamento que só existe numa marca sobrevive à soma', () => {
  const dados = [
    mes('NSX', { headcount: 10, dept_breakdown: { LEGAL: db({ gender_female: 4 }) } }),
    mes('Betfair BR', { headcount: 5, dept_breakdown: { TECH: db({ gender_female: 1 }) } }),
  ];
  const c = getMonthData(dados, '2026-08', 'combined');
  assert.equal(c.dept_breakdown?.LEGAL.gender_female, 4);
  assert.equal(c.dept_breakdown?.TECH.gender_female, 1);
});

// ---------------------------------------------------------------------------
// A FORMA, CONFERIDA EM TEMPO DE EXECUÇÃO
// ---------------------------------------------------------------------------

test('a quebra antiga, sem dimensões, é recusada em vez de aceita por um cast', () => {
  // A carga gravava `{ headcount, joiners, leavers }` nesta coluna, e um `as`
  // no compose dizia que era a estrutura rica. `applyDeptFilter` então leria
  // `db.gender_female` de um objeto que não o tem -- undefined virando 0, e 0
  // virando "esta área não tem nenhuma mulher".
  const antiga = { COMMERCIAL: { headcount: 48, joiners: 2, leavers: 1 } };
  assert.equal(quebraPorArea(antiga), undefined);
});

test('a quebra nova é aceita', () => {
  const nova = { COMMERCIAL: db({ gender_female: 20, gender_male: 28 }) };
  assert.ok(quebraPorArea(nova));
});

test('vazio e nulo devolvem undefined, não objeto', () => {
  assert.equal(quebraPorArea({}), undefined);
  assert.equal(quebraPorArea(null), undefined);
  assert.equal(quebraPorArea(undefined), undefined);
});

test('mistura de formas é recusada inteira', () => {
  // Meia quebra é pior que nenhuma: as áreas boas apareceriam e as antigas
  // sairiam zeradas, sem nada na tela distinguindo as duas.
  const mista = {
    TECH: db({ gender_female: 5 }),
    HR: { headcount: 10, joiners: 0, leavers: 0 },
  };
  assert.equal(quebraPorArea(mista), undefined);
});
