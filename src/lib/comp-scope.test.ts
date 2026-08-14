import test from 'node:test';
import assert from 'node:assert/strict';
import {
  degrauDe, descreverRecorte, filtrarLinhas, podeVerLinha, NIVEL_POR_ROTULO,
  type EscopoComp,
} from './comp-scope';

const DIRETOR_TECH: EscopoComp = { global: false, degrau: 7, areas: ['TECHNOLOGY'] };
const GLOBAL: EscopoComp = { global: true, degrau: null, areas: [] };

/**
 * Regra de remuneração. O modo de falhar que importa aqui é assimétrico:
 * quem NÃO vê um salário percebe e reclama; quem vê um salário que não devia
 * não reclama, e ninguém fica sabendo. Por isso todo teste abaixo pergunta
 * "isto pode vazar?", e não "isto aparece?".
 */

// ------------------------------------------------------------------ degraus

test('reconhece as duas escritas que existem na base', () => {
  // A tabela de remuneração usa L0..L9; o cadastro de usuário usa rótulos.
  assert.equal(degrauDe('L7'), 7);
  assert.equal(degrauDe('Director'), 7);
  assert.equal(degrauDe('  director  '), 7);
  assert.equal(degrauDe('C-Level'), 9);
});

test('nível que não existe vira null, não zero', () => {
  // Zero seria o degrau mais BAIXO -- e um nível ilegível viraria "estagiário",
  // deixando a linha visível para praticamente todo mundo.
  assert.equal(degrauDe('Diretor'), null);
  assert.equal(degrauDe('L99'), null);
  assert.equal(degrauDe(''), null);
  assert.equal(degrauDe(null), null);
  assert.equal(degrauDe(undefined), null);
});

test('a escada tem dez degraus distintos, sem empate', () => {
  // Dois rótulos no mesmo degrau fariam pares se enxergarem.
  const degraus = Object.values(NIVEL_POR_ROTULO);
  assert.equal(new Set(degraus).size, degraus.length);
});

// ------------------------------------------------------------------ a regra

test('vê quem está abaixo', () => {
  assert.equal(podeVerLinha(DIRETOR_TECH, { area: 'TECHNOLOGY', level: 'L5' }), true);
  assert.equal(podeVerLinha(DIRETOR_TECH, { area: 'TECHNOLOGY', level: 'L0' }), true);
});

test('NÃO vê os pares — é o caso que a regra existe para cobrir', () => {
  assert.equal(podeVerLinha(DIRETOR_TECH, { area: 'TECHNOLOGY', level: 'L7' }), false);
});

test('NÃO vê os níveis acima', () => {
  assert.equal(podeVerLinha(DIRETOR_TECH, { area: 'TECHNOLOGY', level: 'L8' }), false);
  assert.equal(podeVerLinha(DIRETOR_TECH, { area: 'TECHNOLOGY', level: 'L9' }), false);
});

test('NÃO vê outra área, mesmo abaixo do próprio nível', () => {
  assert.equal(podeVerLinha(DIRETOR_TECH, { area: 'MARKETING', level: 'L2' }), false);
});

test('linha sem nível não aparece', () => {
  // Cadastro incompleto na origem não pode virar exceção à regra.
  assert.equal(podeVerLinha(DIRETOR_TECH, { area: 'TECHNOLOGY', level: null }), false);
  assert.equal(podeVerLinha(DIRETOR_TECH, { area: 'TECHNOLOGY', level: 'Sênior' }), false);
});

test('linha sem área não aparece', () => {
  assert.equal(podeVerLinha(DIRETOR_TECH, { area: null, level: 'L1' }), false);
});

test('quem olha sem nível reconhecido não vê NADA', () => {
  // O desfecho é tela vazia, e é o certo: um cadastro pela metade não pode
  // resolver para "vê tudo".
  const semNivel: EscopoComp = { global: false, degrau: null, areas: ['TECHNOLOGY'] };
  assert.equal(podeVerLinha(semNivel, { area: 'TECHNOLOGY', level: 'L0' }), false);
  assert.deepEqual(filtrarLinhas(semNivel, [{ area: 'TECHNOLOGY', level: 'L0' }]), []);
});

test('quem olha sem área não vê nada', () => {
  const semArea: EscopoComp = { global: false, degrau: 9, areas: [] };
  assert.equal(podeVerLinha(semArea, { area: 'TECHNOLOGY', level: 'L0' }), false);
});

test('C-level vê todos os níveis abaixo da própria área, e nenhum par', () => {
  const cLevel: EscopoComp = { global: false, degrau: 9, areas: ['COMMERCIAL'] };
  const base = [
    { area: 'COMMERCIAL', level: 'L9' },
    { area: 'COMMERCIAL', level: 'L8' },
    { area: 'COMMERCIAL', level: 'L3' },
    { area: 'TECHNOLOGY', level: 'L1' },
  ];
  assert.deepEqual(
    filtrarLinhas(cLevel, base).map((r) => `${r.area}/${r.level}`),
    ['COMMERCIAL/L8', 'COMMERCIAL/L3'],
  );
});

test('perfil global passa por cima de tudo, inclusive sem nível cadastrado', () => {
  assert.equal(podeVerLinha(GLOBAL, { area: 'QUALQUER', level: null }), true);
  assert.equal(filtrarLinhas(GLOBAL, [{ area: null, level: null }]).length, 1);
});

test('área compara sem depender de caixa ou espaço', () => {
  assert.equal(podeVerLinha(DIRETOR_TECH, { area: ' technology ', level: 'L1' }), true);
});

test('quem atende várias áreas vê as duas, com o mesmo corte de nível', () => {
  const hrbp: EscopoComp = { global: false, degrau: 7, areas: ['TECHNOLOGY', 'PRODUCT'] };
  const r = filtrarLinhas(hrbp, [
    { area: 'TECHNOLOGY', level: 'L6' },
    { area: 'PRODUCT', level: 'L6' },
    { area: 'PRODUCT', level: 'L7' },
    { area: 'FINANCE', level: 'L1' },
  ]);
  assert.deepEqual(r.map((x) => `${x.area}/${x.level}`), ['TECHNOLOGY/L6', 'PRODUCT/L6']);
});

// ------------------------------------------------------------------ o aviso

test('a tela sempre sabe dizer que está vendo um recorte', () => {
  // Um recorte silencioso faz alguém levar "a média da área" para uma
  // conversa de orçamento sem saber que os níveis acima ficaram de fora.
  const texto = descreverRecorte(DIRETOR_TECH, 'Director');
  assert.match(texto ?? '', /TECHNOLOGY/);
  assert.match(texto ?? '', /abaixo do seu/);
  assert.match(texto ?? '', /médias/);
});

test('sem nível cadastrado, o aviso diz o que fazer', () => {
  const semNivel: EscopoComp = { global: false, degrau: null, areas: ['TECHNOLOGY'] };
  assert.match(descreverRecorte(semNivel) ?? '', /Fale com o RH/);
});

test('perfil global não recebe aviso de recorte, porque não há recorte', () => {
  assert.equal(descreverRecorte(GLOBAL), null);
});
