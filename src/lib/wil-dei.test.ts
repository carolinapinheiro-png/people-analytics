import test from 'node:test';
import assert from 'node:assert/strict';
import { montarDEI, ehSenior, ehNivelInicial, ehTecnico, type PessoaDEI } from './wil-dei';

const p = (o: Partial<PessoaDEI>): PessoaDEI => ({
  familia: 'Finance', empresa: 'NSX Brasil Recife', tipo: 'CLT', genero: 'M', fte: null,
  admissao: '2020-01-10', saida: null, voluntaria: null,
  role: 'NO TECH', careerBand: 'B - Entry level specialist', nacionalidades: ['Brasil'],
  pcd: false, ...o,
});

test('senior e Career Band F, G ou H, pela letra', () => {
  // O valor vem como "F - Senior Leadership". Comparar a string inteira
  // quebraria no dia em que editassem a descricao depois do hifen.
  assert.equal(ehSenior('F - Senior Leadership'), true);
  assert.equal(ehSenior('G - qualquer coisa que escrevam aqui'), true);
  assert.equal(ehSenior('H'), true);
  assert.equal(ehSenior('A - Entry level professionals'), false);
  assert.equal(ehSenior('D - Manager + Specialist roles'), false);
  assert.equal(ehSenior(null), false);
});

test('nivel inicial e Career Band A', () => {
  assert.equal(ehNivelInicial('A - Entry level professionals'), true);
  assert.equal(ehNivelInicial('B - Entry level specialist'), false);
  assert.equal(ehNivelInicial(null), false);
});

test('tecnico e TECHNICAL ROLE; NO TECH e vazio nao contam', () => {
  assert.equal(ehTecnico('TECHNICAL ROLE'), true);
  assert.equal(ehTecnico('technical role'), true);
  assert.equal(ehTecnico('NO TECH'), false);
  assert.equal(ehTecnico(null), false);
});

test('nacionalidades sao DISTINTAS, e nao pessoas', () => {
  // A coluna pergunta quantas nacionalidades existem no time: 5 no arquivo
  // entregue, num time de 352. Contar pessoas daria 352.
  const l = montarDEI([
    p({ nacionalidades: ['Brasil'] }), p({ nacionalidades: ['Brasil'] }),
    p({ nacionalidades: ['Portugal'] }),
  ], '2026-08');
  assert.equal(l[0].nacionalidadesUnicas, 2);
});

test('nacionalidade em caixa diferente nao conta duas vezes', () => {
  const l = montarDEI([p({ nacionalidades: ['Brasil'] }), p({ nacionalidades: ['brasil'] })], '2026-08');
  assert.equal(l[0].nacionalidadesUnicas, 1);
});

test('Regular e Contractors saem separados', () => {
  const l = montarDEI([p({ tipo: 'CLT' }), p({ tipo: 'PJ' }), p({ tipo: 'PJ' })], '2026-08');
  assert.equal(l[0].bloco, 'Regular');
  assert.equal(l[1].bloco, 'Contractors');
});

test('tecnicos e mulheres em tecnicos', () => {
  const l = montarDEI([
    p({ role: 'TECHNICAL ROLE', genero: 'F' }),
    p({ role: 'TECHNICAL ROLE', genero: 'M' }),
    p({ role: 'NO TECH', genero: 'F' }),
  ], '2026-08');
  assert.equal(l[0].cargosTecnicos, 2);
  assert.equal(l[0].mulheresEmTecnicos, 1);
});

test('lideranca senior conta so quem esta dentro no mes', () => {
  const l = montarDEI([
    p({ careerBand: 'F - Senior', saida: '2026-03' }),
    p({ careerBand: 'F - Senior' }),
  ], '2026-08');
  assert.equal(l[0].liderancaSenior, 1);
});

test('entradas e saidas senior sao do MES, nao dos doze meses', () => {
  const l = montarDEI([
    p({ careerBand: 'G - Senior', saida: '2026-08', genero: 'F' }),
    p({ careerBand: 'G - Senior', admissao: '2026-08-04' }),
    p({ careerBand: 'G - Senior', admissao: '2026-01-04' }),
  ], '2026-08');
  assert.equal(l[0].saidasSenior, 1);
  assert.equal(l[0].saidasSeniorMulheres, 1);
  assert.equal(l[0].entradasSenior, 1);
});

test('entradas de nivel inicial contam Career Band A', () => {
  const l = montarDEI([
    p({ careerBand: 'A - Entry level professionals', admissao: '2026-08-10', genero: 'F' }),
    p({ careerBand: 'B - Entry level specialist', admissao: '2026-08-10' }),
  ], '2026-08');
  assert.equal(l[0].entradasNivelInicial, 1);
  assert.equal(l[0].entradasNivelInicialMulheres, 1);
});

test('quem nao e NSX fica de fora', () => {
  const l = montarDEI([p({ empresa: 'Betfair', role: 'TECHNICAL ROLE' })], '2026-08');
  assert.equal(l[0].cargosTecnicos, 0);
});

test('PCD conta quem tem deficiencia declarada', () => {
  const l = montarDEI([p({ pcd: true }), p({ pcd: false })], '2026-08');
  assert.equal(l[0].pcd, 1);
});
