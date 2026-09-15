import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticarSerie, composeMonthlyMetrics } from './compose-metrics';
import type { MonthlyMetricRow } from '@/lib/metrics.functions';

const linha = (source: string, month: string): MonthlyMetricRow =>
  ({ source, month, brand: 'NSX' } as unknown as MonthlyMetricRow);

test('com a oficial presente, a fonte é a oficial', () => {
  const d = diagnosticarSerie([
    linha('convenia', '2026-08-01'),
    linha('raw-data.ts', '2026-06-01'),
  ]);
  assert.equal(d.fonte, 'oficial');
  assert.equal(d.ultimoMes, '2026-08');
});

test('sem nenhuma linha da oficial, a queda é detectada e nomeada', () => {
  // O caso real de 18/08/2026: as 272 linhas do Convenia nasceram marcadas
  // como 'parcial' e sumiram no filtro `quality_flag IS NULL` da leitura. O
  // painel exibia a congelada, que termina em jun/26, sem dizer nada.
  const d = diagnosticarSerie([
    linha('raw-data.ts', '2026-05-01'),
    linha('raw-data.ts', '2026-06-01'),
  ]);
  assert.equal(d.fonte, 'congelada');
  assert.equal(d.ultimoMes, '2026-06');
  assert.equal(d.linhasOficial, 0);
});

test('sem linha nenhuma, não inventa mês', () => {
  const d = diagnosticarSerie([]);
  assert.equal(d.fonte, 'vazia');
  assert.equal(d.ultimoMes, null);
});

test('o último mês é o maior, não o último da lista', () => {
  const d = diagnosticarSerie([
    linha('convenia', '2026-08-01'),
    linha('convenia', '2025-01-01'),
  ]);
  assert.equal(d.ultimoMes, '2026-08');
});

// ---------------------------------------------------------------------------
// A QUARTA VEZ NÃO PODE SER MUDA
// ---------------------------------------------------------------------------
// `toMonthRecord` traduz campo a campo entre a linha do banco e o que a tela
// consome -- e coluna que não aparece ali simplesmente não existe para a
// tela, por mais cheia que esteja no banco. Já aconteceu com
// family_breakdown/contract_breakdown/tenure_breakdown (10/09) e de novo com
// work_model_base (15/09): a coluna gravada, o tipo com o campo, o gráfico
// lendo `curr.work_model_base` -- e ninguém adicionou a linha aqui. O card
// simplesmente sumiu, mesmo com a carga rodada e o dado certo no banco.
//
// Este teste não substitui a atenção na próxima vez que um campo for
// adicionado -- mas se alguém adicionar uma quebra nova (`Record<string,
// number>` ou objeto por departamento) e esquecer de traduzi-la aqui, ele
// falha em vez de o card sumir em silêncio.
// ---------------------------------------------------------------------------

test('toda quebra por faixa (*_base) sobrevive de MonthlyMetricRow a MonthRecord', () => {
  const CAMPOS_BASE = [
    'level_base', 'tenure_base', 'family_base', 'contract_base', 'work_model_base',
  ] as const;
  const row = {
    source: 'convenia', month: '2026-08-01', brand: 'NSX',
    ...Object.fromEntries(CAMPOS_BASE.map((c) => [c, { 'valor-sentinela': 1 }])),
  } as unknown as MonthlyMetricRow;

  const [rec] = composeMonthlyMetrics([row]);
  for (const campo of CAMPOS_BASE) {
    assert.ok(
      (rec as unknown as Record<string, unknown>)[campo],
      `${campo}: gravado no banco mas não chegou em MonthRecord -- falta a linha em toMonthRecord`,
    );
  }
});

test('work_model_base especificamente: o card de Demográficos lê daqui', () => {
  const row = {
    source: 'convenia', month: '2026-08-01', brand: 'NSX',
    work_model_base: { Remoto: 250, Presencial: 140, 'Não informado': 166 },
  } as unknown as MonthlyMetricRow;

  const [rec] = composeMonthlyMetrics([row]);
  assert.deepEqual(rec.work_model_base, { Remoto: 250, Presencial: 140, 'Não informado': 166 });
});
