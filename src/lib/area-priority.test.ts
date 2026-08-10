/**
 * Testes da fila de prioridade por área.
 *
 *   npx tsc src/lib/area-priority.ts src/lib/stats.ts src/lib/area-priority.test.ts \
 *     --outDir /tmp/aptest --module commonjs --target es2020 --strict \
 *     --esModuleInterop --skipLibCheck --moduleResolution node
 *   node --test /tmp/aptest/area-priority.test.js
 *
 * O caso que motivou este arquivo está no primeiro teste: com corte na mediana
 * pura, Technology (2,5 pontos abaixo, 0,55 acima) recebia o mesmo rótulo de
 * "agir primeiro" que Marketing (19,5 abaixo, 10,85 acima). Rótulo forte em
 * cima de diferença de ruído manda gestor procurar problema que não existe.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAreas, type AreaEntrada } from './area-priority';

/** Números reais de jan/2026, depois da correção contra o arquivo original. */
const JAN26: AreaEntrada[] = [
  { scope: 'Customer Service', dept: 'OPERATION', enps: 85, retentionRisk: 26.2, headcountMedio: 138 },
  { scope: 'Marketing', dept: 'MARKETING', enps: 62, retentionRisk: 23.4, headcountMedio: 84 },
  { scope: 'Technology', dept: 'TECHNOLOGY', enps: 79, retentionRisk: 13.1, headcountMedio: 161 },
  { scope: 'Commercial', dept: 'COMMERCIAL', enps: 76, retentionRisk: 12.0, headcountMedio: 44 },
  { scope: 'Human Resources', dept: 'HR', enps: 88, retentionRisk: 17.6, headcountMedio: 22 },
  { scope: 'Finance', dept: 'FINANCE', enps: 84, retentionRisk: 10.5, headcountMedio: 42 },
  { scope: 'Product', dept: 'PRODUCT', enps: 84, retentionRisk: 7.9, headcountMedio: 35 },
  { scope: 'Legal', dept: 'LEGAL & COMPLIANCE', enps: 47, retentionRisk: 6.7, headcountMedio: 17 },
  // Marca, não departamento -- não pode entrar na fila.
  { scope: 'Betfair', dept: null, enps: 75, retentionRisk: 15, headcountMedio: null },
];

const por = (c: ReturnType<typeof classifyAreas>, scope: string) =>
  c.itens.find((i) => i.scope === scope);

test('Betfair é marca e fica fora da fila por área', () => {
  const c = classifyAreas(JAN26);
  assert.equal(por(c, 'Betfair'), undefined);
  assert.equal(c.itens.length, 8);
});

test('área na fronteira NÃO vira "agir primeiro"', () => {
  // Technology: 2,5 abaixo da mediana de eNPS e 0,55 acima na de risco.
  // Com corte na mediana pura isso bastava para "agir". Não basta mais.
  const c = classifyAreas(JAN26);
  assert.notEqual(por(c, 'Technology')?.veredito, 'agir');
  assert.equal(por(c, 'Technology')?.veredito, 'manter');
});

test('área claramente pior nos dois eixos vira "agir primeiro"', () => {
  const c = classifyAreas(JAN26);
  assert.equal(por(c, 'Marketing')?.veredito, 'agir');
  // E é a única, nestes dados.
  assert.deepEqual(c.itens.filter((i) => i.veredito === 'agir').map((i) => i.scope), ['Marketing']);
});

test('risco alto sem engajamento baixo vira "vigiar"', () => {
  const c = classifyAreas(JAN26);
  assert.equal(por(c, 'Customer Service')?.veredito, 'vigiar');
});

test('engajamento baixo sem risco alto vira "ouvir", não "agir"', () => {
  // Legal tem o pior eNPS da empresa (47) e o MENOR risco (6,7%). Colocá-la em
  // "agir" mandaria a área correr atrás de gente que não está saindo.
  const c = classifyAreas(JAN26);
  assert.equal(por(c, 'Legal')?.veredito, 'ouvir');
});

test('a margem sai do MAD do próprio grupo', () => {
  const c = classifyAreas(JAN26);
  assert.ok(c.margemEnps > 0, 'margem de eNPS precisa ser positiva');
  assert.ok(c.margemRisco > 0, 'margem de risco precisa ser positiva');
  // Technology está dentro das duas margens -- é o que a torna "manter".
  const tech = por(c, 'Technology')!;
  assert.ok(Math.abs(tech.enps - c.medianaEnps) <= c.margemEnps);
  assert.ok(Math.abs((tech.risco ?? 0) - c.medianaRisco) <= c.margemRisco);
});

test('grupo homogêneo não gera alarme nenhum', () => {
  // Todas iguais: MAD zero, mas ninguém está fora do grupo.
  const iguais: AreaEntrada[] = ['A', 'B', 'C', 'D'].map((s) => ({
    scope: s, dept: s, enps: 80, retentionRisk: 12, headcountMedio: 50,
  }));
  const c = classifyAreas(iguais);
  assert.equal(c.itens.every((i) => i.veredito === 'manter'), true);
});

test('a fila é ordenada por gravidade, não por eNPS', () => {
  const c = classifyAreas(JAN26);
  const ordem = c.itens.map((i) => i.scope);
  // Marketing (agir) precede Customer Service (vigiar), que precede Legal (ouvir),
  // mesmo Legal tendo o pior eNPS de todas.
  assert.ok(ordem.indexOf('Marketing') < ordem.indexOf('Customer Service'));
  assert.ok(ordem.indexOf('Customer Service') < ordem.indexOf('Legal'));
});

test('entre duas áreas igualmente ruins, a maior vem primeiro', () => {
  const base: AreaEntrada[] = [
    { scope: 'Grande', dept: 'G', enps: 40, retentionRisk: 40, headcountMedio: 200 },
    { scope: 'Pequena', dept: 'P', enps: 40, retentionRisk: 40, headcountMedio: 10 },
    { scope: 'Boa1', dept: 'B1', enps: 90, retentionRisk: 5, headcountMedio: 50 },
    { scope: 'Boa2', dept: 'B2', enps: 88, retentionRisk: 6, headcountMedio: 50 },
    { scope: 'Boa3', dept: 'B3', enps: 92, retentionRisk: 4, headcountMedio: 50 },
  ];
  const c = classifyAreas(base);
  const agir = c.itens.filter((i) => i.veredito === 'agir').map((i) => i.scope);
  assert.deepEqual(agir, ['Grande', 'Pequena']);
});

test('área sem risco informado não é tratada como risco zero', () => {
  const comNull: AreaEntrada[] = [
    { scope: 'SemRisco', dept: 'S', enps: 40, retentionRisk: null, headcountMedio: 50 },
    { scope: 'A', dept: 'A', enps: 80, retentionRisk: 10, headcountMedio: 50 },
    { scope: 'B', dept: 'B', enps: 82, retentionRisk: 12, headcountMedio: 50 },
    { scope: 'C', dept: 'C', enps: 84, retentionRisk: 30, headcountMedio: 50 },
  ];
  const c = classifyAreas(comNull);
  // eNPS baixo entra em "ouvir"; sem risco conhecido não pode virar "agir".
  assert.equal(por(c, 'SemRisco')?.veredito, 'ouvir');
});
