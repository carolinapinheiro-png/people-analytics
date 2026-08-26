import test from 'node:test';
import assert from 'node:assert/strict';
import { historicoPorArea } from '@/lib/analise-engajamento';

const onda = (...pares: Array<[string, number | null]>) => ({
  pontos: pares.map(([scope, enps]) => ({ scope, enps })),
});

test('historicoPorArea: queda contínua é distinguida de patamar baixo', () => {
  const h = historicoPorArea([
    onda(['Despencou', 85], ['Sempre baixa', 60]),
    onda(['Despencou', 72], ['Sempre baixa', 61]),
    onda(['Despencou', 60], ['Sempre baixa', 60]),
  ]);
  const cai = h.find((x) => x.scope === 'Despencou')!;
  const parada = h.find((x) => x.scope === 'Sempre baixa')!;

  // As duas terminam em 60 -- é isso que a fila mostrava, e só isso.
  assert.equal(cai.valores.at(-1), 60);
  assert.equal(parada.valores.at(-1), 60);

  // E pedem reuniões diferentes.
  assert.equal(cai.trajetoria, 'queda');
  assert.equal(parada.trajetoria, 'oscila');
  assert.equal(cai.contraSuaMedia, -18.5); // 60 - média(85, 72)
  assert.equal(parada.contraSuaMedia, -0.5); // 60 - média(60, 61)
});

test('historicoPorArea: a média anterior não inclui a onda corrente', () => {
  const [h] = historicoPorArea([onda(['A', 100]), onda(['A', 0])]);
  // Com a corrente dentro, a média seria 50 e a distância -50.
  assert.equal(h.mediaAnterior, 100);
  assert.equal(h.contraSuaMedia, -100);
});

test('historicoPorArea: uma onda só não inventa comparação', () => {
  const [h] = historicoPorArea([onda(['A', 70])]);
  assert.equal(h.mediaAnterior, null);
  assert.equal(h.contraSuaMedia, null);
  assert.equal(h.trajetoria, 'indefinida');
});

test('historicoPorArea: área ausente numa onda não vira zero', () => {
  const [h] = historicoPorArea([onda(['A', 80]), onda(['A', null]), onda(['A', 60])]);
  assert.deepEqual(h.valores, [80, null, 60]);
  assert.equal(h.mediaAnterior, 80);
  assert.equal(h.contraSuaMedia, -20);
});
