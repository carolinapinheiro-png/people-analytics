/**
 * Testes do adaptador Workday (Brazil_FBe -> Betfair BR).
 *   npx tsc src/lib/aggregator/*.ts --outDir /tmp/aggtest --module commonjs \
 *     --target es2020 --strict --esModuleInterop --skipLibCheck --moduleResolution node
 *   node --test /tmp/aggtest/.../workday-adapter.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkdayBetfair } from './workday-adapter';
import { aggregateMonth, monthEnd, type PersonRow } from './monthly-aggregator';

const HEADER =
  'Employee ID;Employee Type;Worker;Hire Date;FTC end date;Future leave date;Location;Is Manager?';
const TITLE = '1001 Daily Employee Report For Finance Partner;;;;;;;';

const csv = (rows: string[]): string => [TITLE, HEADER, ...rows].join('\n');

test('pula o titulo, acha o cabecalho na linha 2 e importa', () => {
  const { people, report } = parseWorkdayBetfair(
    csv(['E1;Permanent;Ana Souza;28/02/22;;;Brazil Remote;Yes']),
    new Set(),
  );
  assert.deepEqual(report.errors, []);
  assert.equal(report.added, 1);
  assert.equal(people[0].company, 'NSX BETFAIR BRASIL S.A.'); // roteia para betfair
  assert.equal(people[0].leadership, 'Sim'); // Is Manager? Yes
  assert.equal(people[0].admission?.toISOString().slice(0, 10), '2022-02-28');
});

test('ano de 2 digitos vira 20xx', () => {
  const { people } = parseWorkdayBetfair(csv(['E1;P;Bia;23/02/09;;;Brazil Remote;']), new Set());
  assert.equal(people[0].admission?.toISOString().slice(0, 10), '2009-02-23');
});

test('duplicado do Talent Mobility e removido (TM vence os 18)', () => {
  const tm = new Set(['joao da silva']);
  const { report, people } = parseWorkdayBetfair(
    csv([
      'E1;P;João da Silva;01/03/22;;;Brazil Remote;',
      'E2;P;Clara Nunes;01/03/22;;;Romania Office - Cluj Napoca;Yes',
    ]),
    tm,
  );
  assert.equal(report.overlapWithTm, 1);
  assert.equal(report.added, 1);
  assert.equal(people.length, 1);
  assert.equal(people[0].cpf, 'wd:Clara Nunes');
});

test('sem genero: entra no headcount, fica fora de fem/mas', () => {
  const { people } = parseWorkdayBetfair(
    csv(['E1;P;Ana;01/03/22;;;Brazil Remote;Yes', 'E2;P;Bruno;01/03/22;;;Romania Remote;']),
    new Set(),
  );
  const agg = aggregateMonth(people, new Map(), 2024, 6, 'betfair');
  assert.equal(agg.headcount, 2);
  assert.equal(agg.gender_female, 0);
  assert.equal(agg.gender_male, 0);
  assert.equal(agg.gender_base, 0);
  assert.equal(agg.leaders, 1); // Ana e manager
});

test('sem historico -> SEM DEPTO; soma dos deptos = headcount', () => {
  const { people } = parseWorkdayBetfair(csv(['E1;P;Ana;01/03/22;;;Brazil Remote;']), new Set());
  const agg = aggregateMonth(people, new Map(), 2024, 6, 'betfair');
  assert.equal(agg.dept_data['SEM DEPTO']?.hc, 1);
});

test('admissao respeitada no headcount do mes (nao ativo antes de admitir)', () => {
  const { people } = parseWorkdayBetfair(csv(['E1;P;Ana;15/06/2024;;;Brazil Remote;']), new Set());
  const antes = aggregateMonth(people, new Map(), 2024, 5, 'betfair');
  const depois = aggregateMonth(people, new Map(), 2024, 6, 'betfair');
  assert.equal(antes.headcount, 0);
  assert.equal(depois.headcount, 1);
});

test('cabecalho ausente vira erro, nao silencio', () => {
  const { report } = parseWorkdayBetfair('linha solta;sem cabecalho', new Set());
  assert.ok(report.errors.length > 0);
  assert.equal(report.added, 0);
});

test('merge com Talent Mobility: pool combinado agrega os dois', () => {
  const { people: wd } = parseWorkdayBetfair(
    csv(['E1;P;Estrangeiro Um;01/03/22;;;Romania Office - Cluj Napoca;']),
    new Set(['pessoa tm']),
  );
  const tmPerson: PersonRow = {
    company: 'NSX BETFAIR BRASIL S.A.',
    cpf: '999',
    admission: new Date(Date.UTC(2020, 0, 1)),
    termination: null,
    gender: 'Mulher',
    state: 'SP',
    leadership: 'Não',
  };
  const agg = aggregateMonth([tmPerson, ...wd], new Map(), 2024, 6, 'betfair');
  assert.equal(agg.headcount, 2);
  assert.equal(agg.gender_female, 1);
  assert.equal(agg.gender_base, 1); // so a pessoa do TM tem genero
  assert.equal(agg.gender_female_pct, 100); // 1 de 1 conhecido
  void monthEnd;
});
