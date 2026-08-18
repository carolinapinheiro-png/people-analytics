import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticarSerie } from './compose-metrics';
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
