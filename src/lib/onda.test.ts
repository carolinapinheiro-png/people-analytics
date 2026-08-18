import test from 'node:test';
import assert from 'node:assert/strict';
import { escolherOndas, comDeltaCalculado, type OndaLinha, type LinhaComEscopo } from './onda';

const onda = (wave: string, ref: string): OndaLinha => ({
  wave, label: wave, reference_date: ref,
});

const linha = (
  scope: string,
  enps: number | null,
  rr: number | null = null,
  sat: number | null = null,
): LinhaComEscopo => ({
  scope, enps, retention_risk: rr, satisfaction: sat,
});

// ------------------------------------------------------------------ a escolha

test('a onda atual é a de data de referência mais recente, não a primeira da lista', () => {
  // Chega fora de ordem de propósito: o defeito real veio de um chamador que
  // ordenou diferente do outro.
  const r = escolherOndas([
    onda('jan_2026', '2026-01-05'),
    onda('ago_2026', '2026-07-28'),
    onda('jul_2025', '2025-07-01'),
  ]);
  assert.equal(r.atual?.wave, 'ago_2026');
  assert.equal(r.anterior?.wave, 'jan_2026');
  assert.deepEqual(r.ordenadas.map((o) => o.wave), ['ago_2026', 'jan_2026', 'jul_2025']);
});

test('com uma onda só, não existe anterior', () => {
  const r = escolherOndas([onda('jan_2026', '2026-01-05')]);
  assert.equal(r.atual?.wave, 'jan_2026');
  assert.equal(r.anterior, null);
});

test('sem onda nenhuma, nada explode', () => {
  const r = escolherOndas([]);
  assert.equal(r.atual, null);
  assert.equal(r.anterior, null);
});

// ------------------------------------------------------------------- o delta

test('o delta é a subtração entre as ondas', () => {
  const r = comDeltaCalculado(
    [linha('company', 69, 16.1, 8.7)],
    [linha('company', 76, 14.0, 8.9)],
  );
  assert.equal(r[0].enps_delta, -7);
  assert.equal(r[0].rr_delta, 2.1);
  assert.equal(r[0].sat_delta, -0.2);
});

test('área sem correspondência na onda anterior fica NULA, não zero', () => {
  // Zero diria "não mudou". A verdade é "não havia com o que comparar" -- e as
  // duas frases levam a decisões diferentes.
  const r = comDeltaCalculado([linha('Outros', 85)], [linha('company', 76)]);
  assert.equal(r[0].enps_delta, null);
});

test('sem onda anterior, o que veio na carga é preservado', () => {
  // jan/26 sozinha trazia o delta do deck do CEO. Enquanto ela for a única,
  // apagá-lo seria perder a informação que existe.
  const original = { ...linha('company', 76), enps_delta: -14 };
  const r = comDeltaCalculado([original], []);
  assert.equal(r[0].enps_delta, -14);
});

test('o delta calculado SOBRESCREVE o que veio na carga', () => {
  // O número digitado e os dois valores comparados podem discordar. Quando há
  // como conferir, vale a conta -- não o que alguém copiou do deck.
  const r = comDeltaCalculado(
    [{ ...linha('company', 69), enps_delta: -999 }],
    [linha('company', 76)],
  );
  assert.equal(r[0].enps_delta, -7);
});

test('o nome da área casa sem depender de caixa ou espaço', () => {
  const r = comDeltaCalculado([linha(' Customer Service ', 78)], [linha('customer service', 85)]);
  assert.equal(r[0].enps_delta, -7);
});

test('valor ausente de um dos lados não vira delta', () => {
  assert.equal(comDeltaCalculado([linha('X', null)], [linha('X', 80)])[0].enps_delta, null);
  assert.equal(comDeltaCalculado([linha('X', 80)], [linha('X', null)])[0].enps_delta, null);
});
