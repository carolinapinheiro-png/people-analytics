import test from 'node:test';
import assert from 'node:assert/strict';
import { opcoesDoDado } from './opcoes-de-filtro';
import type { MonthRecord } from './raw-data';
import type { LeaverRecord } from './leaver-types';

/**
 * O seletor tem de oferecer o que a carga grava -- nem mais, nem menos.
 *
 * Estes testes existem porque a divergência entre as duas listas não dava erro
 * em lugar nenhum. Ela desenhava uma linha reta no zero, que se lê como "não
 * temos ninguém nessa faixa", e escondia 178 pessoas no filtro de level.
 */

const mes = (extra: Partial<MonthRecord>): MonthRecord => ({
  month: '2026-09', headcount: 100, joiners: 0, leavers: 0,
  ...extra,
} as MonthRecord);

test('as opções saem das chaves gravadas, não de uma lista escrita à mão', () => {
  const o = opcoesDoDado([mes({
    family_base: { 'Data & Analytics': 19, 'Customer Operations': 150 },
    contract_base: { CLT: 449, 'Pessoa Jurídica': 342, 'Diretor Estatutário': 6 },
    level_base: { L4: 115, L7: 10, L9: 2 },
  })], []);

  // "Data & Analytics" e "Diretor Estatutário" não estavam na lista da barra;
  // L7 e L9 também não. Eram 178 pessoas sem recorte possível.
  assert.deepEqual(o.jobFamily, ['Customer Operations', 'Data & Analytics']);
  assert.deepEqual(o.tipoContrato, ['CLT', 'Pessoa Jurídica', 'Diretor Estatutário']);
  assert.deepEqual(o.level, ['L4', 'L7', 'L9']);
});

test('tempo de casa sai na ordem da régua, não por tamanho', () => {
  // "5+ anos" depois de "1-2 anos" é a única ordem que se lê. Por frequência,
  // a faixa mais populosa viria primeiro e a escada perderia o sentido.
  const o = opcoesDoDado([mes({
    tenure_base: { '5+ anos': 35, '0-3 meses': 102, '1-2 anos': 168, '6-12 meses': 196 },
  })], []);
  assert.deepEqual(o.tempoCasa, ['0-3 meses', '6-12 meses', '1-2 anos', '5+ anos']);
});

test('valor novo, fora da régua, entra no fim -- e não no começo', () => {
  // `indexOf` devolve -1 para desconhecido, e -1 ordena antes de tudo. Sem o
  // tratamento, uma faixa nova que o RH criasse apareceria em primeiro lugar.
  const o = opcoesDoDado([mes({
    tenure_base: { '1-2 anos': 10, '10+ anos': 3, '0-3 meses': 5 },
  })], []);
  assert.deepEqual(o.tempoCasa, ['0-3 meses', '1-2 anos', '10+ anos']);
});

test('"Não informado" e "NA" vão para o fim, e NÃO somem', () => {
  // Em set/2026 são 166 pessoas em `level` e 64 em job family -- a maior fatia
  // de `level`. Escondê-las faria a soma dos recortes não bater com o
  // headcount, sem nada na tela dizendo por quê.
  const o = opcoesDoDado([mes({
    level_base: { NA: 166, L4: 115 },
    family_base: { 'Não informado': 64, HR: 24 },
  })], []);
  assert.deepEqual(o.level, ['L4', 'NA']);
  assert.deepEqual(o.jobFamily, ['HR', 'Não informado']);
});

test('o vocabulário é a UNIÃO dos meses, não o do último', () => {
  // Um vínculo que existiu em janeiro e acabou em setembro continua sendo um
  // recorte legítimo da série -- e sumir do seletor tornaria o passado
  // inalcançável.
  const o = opcoesDoDado([
    mes({ month: '2026-01', contract_base: { CLT: 400, Estágio: 12 } }),
    mes({ month: '2026-09', contract_base: { CLT: 449 } }),
  ], []);
  assert.deepEqual(o.tipoContrato, ['CLT', 'Estágio']);
});

test('série vazia não devolve listas vazias', () => {
  // Lista vazia apagaria os seletores durante o carregamento, e "ainda não
  // carregou" viraria "não existe". A barra precisa cair na reserva dela.
  assert.deepEqual(opcoesDoDado([], []), {});
});

test('faixa salarial e tipo de desligamento saem da base por pessoa', () => {
  // O AGRUPADO, e não o cru. `tipo_desligamento` guarda o texto do Convenia
  // ("Demissão SEM justa causa fora do contrato de experiência - Pedido da
  // Empresa", doze variantes); é o agrupado que a aba de Atrição compara com o
  // filtro. Oferecer o cru daria doze opções ilegíveis, nenhuma casando.
  const leavers = [
    { faixa_salarial: '5k-8k', tipo_desligamento: 'Demissão SEM justa causa...', tipo_desligamento_agrupado: 'Involuntário' },
    { faixa_salarial: 'Até 3k', tipo_desligamento: 'Antecipado pelo empregado', tipo_desligamento_agrupado: 'Involuntário' },
    { faixa_salarial: '5k-8k', tipo_desligamento: 'Outros', tipo_desligamento_agrupado: 'Voluntário' },
  ] as LeaverRecord[];
  const o = opcoesDoDado([mes({ level_base: { L4: 1 } })], leavers);
  // Faixa salarial sai na escada, não por frequência.
  assert.deepEqual(o.faixaSalarial, ['Até 3k', '5k-8k']);
  assert.deepEqual(o.tipoDesligamento, ['Involuntário', 'Voluntário']);
});

test('sem desligados, os dois filtros de pessoa ficam com a lista da barra', () => {
  const o = opcoesDoDado([mes({ level_base: { L4: 1 } })], []);
  assert.equal(o.faixaSalarial, undefined);
  assert.equal(o.tipoDesligamento, undefined);
});
