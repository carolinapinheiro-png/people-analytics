import test from 'node:test';
import assert from 'node:assert/strict';
import type { MonthRecord } from '@/data/raw-data';
import { cltPjDoMes, registroDoMes } from './clt-pj-mes';

const rec = (over: Partial<MonthRecord>): MonthRecord =>
  ({ month: '2026-09-01', headcount: 59, ...over }) as unknown as MonthRecord;

test('traduz o vínculo cru e separa os demais', () => {
  const r = cltPjDoMes(rec({
    contract_base: { CLT: 44, 'Pessoa Jurídica': 13, Aprendiz: 1, 'Diretor Estatutário': 1 },
  }));
  assert.deepEqual(r, { clt: 44, pj: 13, outros: 2 });
});

test('recorte de departamento por rateio não mostra número da empresa', () => {
  const r = cltPjDoMes(rec({ dept_filter_exact: false, contract_base: { CLT: 449 } }));
  assert.equal(r, null);
});

test('recorte exato vale', () => {
  const r = cltPjDoMes(rec({ dept_filter_exact: true, contract_base: { CLT: 5, 'Pessoa Juridica': 2 } }));
  assert.deepEqual(r, { clt: 5, pj: 2, outros: 0 });
});

test('série sem contract_base é "sem dado", não 0 / 0', () => {
  assert.equal(cltPjDoMes(rec({ contract_base: {} })), null);
  assert.equal(cltPjDoMes(rec({})), null);
  assert.equal(cltPjDoMes(undefined), null);
});

test('registroDoMes casa YYYY-MM com YYYY-MM-01', () => {
  const serie = [rec({ month: '2026-08-01' }), rec({ month: '2026-09-01', headcount: 60 })];
  assert.equal(registroDoMes(serie, '2026-09')?.headcount, 60);
  assert.equal(registroDoMes(serie, '2026-09-01')?.headcount, 60);
  assert.equal(registroDoMes(serie, '2026-07'), undefined);
  assert.equal(registroDoMes(serie, ''), undefined);
});
