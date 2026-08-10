/**
 * Testes do cruzamento pesquisa × saídas e da estatística que o acompanha.
 *
 * Mesmo runner do resto do projeto (node:test, sem dependência nova):
 *   npx tsc src/lib/engagement-context.ts src/lib/stats.ts \
 *     src/lib/engagement-context.test.ts --outDir /tmp/engtest --module commonjs \
 *     --target es2020 --strict --esModuleInterop --skipLibCheck --moduleResolution node
 *   node --test /tmp/engtest/engagement-context.test.js
 *
 * O que estes testes protegem: as três decisões que mudam o número no
 * cruzamento (só voluntária, headcount médio, taxa anualizada) e o de-para de
 * área. Todas são fáceis de quebrar sem que a tela pareça errada -- o gráfico
 * continua bonito com o denominador trocado, e é justamente por isso que
 * precisa de teste.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEngagementContext, deptForScope, type EngagementScoreLike } from './engagement-context';
import { spearman, median } from './stats';

const hc: Record<string, Record<string, number>> = {
  '2026-01': { TECHNOLOGY: 100, OPERATION: 200 },
  '2026-02': { TECHNOLOGY: 100, OPERATION: 200 },
  '2026-03': { TECHNOLOGY: 100, OPERATION: 200 },
  '2026-04': { TECHNOLOGY: 100, OPERATION: 200 },
  '2026-05': { TECHNOLOGY: 100, OPERATION: 200 },
  '2026-06': { TECHNOLOGY: 100, OPERATION: 200 },
  '2026-07': { TECHNOLOGY: 100, OPERATION: 200 },
  '2026-08': { TECHNOLOGY: 999, OPERATION: 999 },
};
const janela = { inicio: '2026-02', fim: '2026-07' };

const score = (scope: string, extra: Partial<EngagementScoreLike> = {}): EngagementScoreLike => ({
  scope, enps: 80, enps_delta: -5, retention_risk: 10,
  satisfaction: 8.5, participation: null, status: null, ...extra,
});

// --------------------------------------------------------------- de-para

test('de-para: mapeia os nomes que divergem entre pesquisa e dashboard', () => {
  assert.equal(deptForScope('Customer Service'), 'OPERATION');
  assert.equal(deptForScope('Human Resources'), 'HR');
  assert.equal(deptForScope('Legal'), 'LEGAL & COMPLIANCE');
  assert.equal(deptForScope('  TECHNOLOGY  '), 'TECHNOLOGY');
});

test('de-para: company e Betfair não são departamento', () => {
  assert.equal(deptForScope('company'), null);
  assert.equal(deptForScope('Betfair'), null);
});

// --------------------------------------------------- cruzamento com saídas

test('conta só saída voluntária no confronto com o risco declarado', () => {
  const r = buildEngagementContext(
    [score('Technology')],
    [
      { departamento: 'TECHNOLOGY', data_desligamento: '2026-03-10', tipo_desligamento_agrupado: 'Voluntário' },
      { departamento: 'TECHNOLOGY', data_desligamento: '2026-04-10', tipo_desligamento_agrupado: 'Involuntário' },
      { departamento: 'TECHNOLOGY', data_desligamento: '2026-05-10', tipo_desligamento_agrupado: 'Acordo' },
    ],
    hc, janela,
  );
  assert.equal(r.rows[0].saidasVoluntarias, 1);
  assert.equal(r.rows[0].saidasTotais, 3);
});

test('ignora saída fora da janela: janeiro tornaria a análise circular', () => {
  const r = buildEngagementContext(
    [score('Technology')],
    [
      { departamento: 'TECHNOLOGY', data_desligamento: '2026-01-20', tipo_desligamento_agrupado: 'Voluntário' },
      { departamento: 'TECHNOLOGY', data_desligamento: '2026-08-02', tipo_desligamento_agrupado: 'Voluntário' },
      { departamento: 'TECHNOLOGY', data_desligamento: '2026-02-02', tipo_desligamento_agrupado: 'Voluntário' },
    ],
    hc, janela,
  );
  assert.equal(r.rows[0].saidasVoluntarias, 1);
  assert.equal(r.mesesObservados, 6);
});

test('anualiza a taxa sobre o headcount médio da janela', () => {
  const r = buildEngagementContext(
    [score('Technology')],
    [2, 3, 4].map((m) => ({
      departamento: 'TECHNOLOGY',
      data_desligamento: `2026-0${m}-15`,
      tipo_desligamento_agrupado: 'Voluntário',
    })),
    hc, janela,
  );
  // 3 saídas / 100 pessoas em 6 meses = 3% no semestre = 6% ao ano.
  assert.equal(r.rows[0].headcountMedio, 100);
  assert.equal(r.rows[0].atricaoVoluntariaAnual, 6);
});

test('denominador é a média da janela, não o mês da pesquisa', () => {
  const variavel: Record<string, Record<string, number>> = {
    '2026-02': { TECHNOLOGY: 100 }, '2026-03': { TECHNOLOGY: 100 },
    '2026-04': { TECHNOLOGY: 100 }, '2026-05': { TECHNOLOGY: 200 },
    '2026-06': { TECHNOLOGY: 200 }, '2026-07': { TECHNOLOGY: 200 },
  };
  const r = buildEngagementContext([score('Technology')], [], variavel, janela);
  assert.equal(r.rows[0].headcountMedio, 150);
});

test('reconstrói o eNPS anterior pelo delta; sem delta devolve null', () => {
  const r = buildEngagementContext(
    [score('Technology', { enps: 79, enps_delta: -7 }), score('Betfair', { enps: 75, enps_delta: null })],
    [], hc, janela,
  );
  assert.equal(r.rows[0].enpsPrev, 86);
  assert.equal(r.rows[1].enpsPrev, null);
});

test('distingue "não saiu ninguém" de "área sem correspondência"', () => {
  const r = buildEngagementContext([score('Technology'), score('Betfair')], [], hc, janela);
  // Technology existe no de-para: zero saídas é um fato.
  assert.equal(r.rows[0].saidasVoluntarias, 0);
  // Betfair é marca: não sabemos, e null obriga a tela a mostrar "—".
  assert.equal(r.rows[1].saidasVoluntarias, null);
  assert.equal(r.rows[1].atricaoVoluntariaAnual, null);
});

test('reporta área da pesquisa que não achou departamento', () => {
  const r = buildEngagementContext([score('Area Nova')], [], hc, janela);
  assert.deepEqual(r.semCorrespondencia, ['Area Nova']);
});

test('não mistura departamentos ao contar saídas', () => {
  const r = buildEngagementContext(
    [score('Technology'), score('Customer Service')],
    [
      { departamento: 'OPERATION', data_desligamento: '2026-03-01', tipo_desligamento_agrupado: 'Voluntário' },
      { departamento: 'OPERATION', data_desligamento: '2026-04-01', tipo_desligamento_agrupado: 'Voluntário' },
      { departamento: 'TECHNOLOGY', data_desligamento: '2026-03-01', tipo_desligamento_agrupado: 'Voluntário' },
    ],
    hc, janela,
  );
  assert.equal(r.rows[0].saidasVoluntarias, 1);
  assert.equal(r.rows[1].saidasVoluntarias, 2);
});

test('departamento vazio ou "-" não vira uma área fantasma', () => {
  const r = buildEngagementContext(
    [score('Technology')],
    [
      { departamento: '-', data_desligamento: '2026-03-01', tipo_desligamento_agrupado: 'Voluntário' },
      { departamento: null, data_desligamento: '2026-03-01', tipo_desligamento_agrupado: 'Voluntário' },
    ],
    hc, janela,
  );
  assert.equal(r.rows[0].saidasVoluntarias, 0);
});

// ------------------------------------------------------------- estatística

test('spearman: ordens idênticas dão rho 1 e significância', () => {
  const r = spearman([[1, 10], [2, 20], [3, 30], [4, 40], [5, 50], [6, 60]]);
  assert.equal(r.rho, 1);
  assert.equal(r.significant, true);
});

test('spearman: ordens invertidas dão rho -1', () => {
  assert.equal(spearman([[1, 60], [2, 50], [3, 40], [4, 30], [5, 20], [6, 10]]).rho, -1);
});

test('spearman: empate usa média dos postos e não depende da ordem de entrada', () => {
  const a = spearman([[1, 5], [2, 5], [3, 9], [4, 12], [5, 15]]);
  const b = spearman([[2, 5], [1, 5], [3, 9], [4, 12], [5, 15]]);
  assert.equal(a.rho, b.rho);
});

test('spearman: com 8 áreas o crítico é 0,738 e rho médio não se sustenta', () => {
  const r = spearman([[1, 1], [2, 3], [3, 2], [4, 5], [5, 4], [6, 7], [7, 6], [8, 8]]);
  assert.equal(r.n, 8);
  assert.equal(r.critical, 0.738);
  if (r.rho != null && Math.abs(r.rho) < 0.738) {
    assert.equal(r.significant, false);
    assert.equal(r.strength, 'insuficiente');
    assert.ok(r.verdict.includes('não se sustenta'));
  }
});

test('spearman: descarta par incompleto antes de contar n', () => {
  const r = spearman([[1, 2], [2, null], [3, 6], [undefined, 8], [5, 10], [6, 12]]);
  assert.equal(r.n, 4);
});

test('spearman: eixo sem variação avisa, em vez de dizer correlação zero', () => {
  const r = spearman([[5, 1], [5, 2], [5, 3], [5, 4], [5, 5]]);
  assert.equal(r.rho, null);
  assert.ok(r.verdict.includes('sem variação'));
});

test('spearman: menos de 4 pares não tenta calcular', () => {
  const r = spearman([[1, 2], [2, 4], [3, 6]]);
  assert.equal(r.rho, null);
  assert.equal(r.strength, 'insuficiente');
});

test('median: par, ímpar, com nulos e vazia', () => {
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([3, null, 1, undefined, 2]), 2);
  assert.equal(median([]), null);
});
