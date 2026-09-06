import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JOB_FAMILIES, jobFamily, regularOuContractor, ehMulher, somaFte, doze,
  montarLocation, montarN4, type PessoaWil,
} from './wil';

const p = (o: Partial<PessoaWil>): PessoaWil => ({
  id: Math.random().toString(36), genero: 'M', camada: null, relationship: 'CLT',
  hiring_date: '2020-01-10', saida: null, voluntaria: null, personalizados: [], ...o,
});
const comFamilia = (f: string, extra: Partial<PessoaWil> = {}) =>
  p({ personalizados: [{ nome: 'Job Type Family', valor: f }], ...extra });

test('as dez familias sao fixas e saem mesmo vazias', () => {
  // "Risk and Trading" vem com zeros no arquivo de setembro. Gerar so as que
  // tem gente faria a planilha mudar de forma todo mes.
  const linhas = montarLocation([], [], '2026-08');
  assert.equal(linhas.length, JOB_FAMILIES.length * 2);
  assert.equal(linhas[0][1], 'Commercial & Marketing');
  assert.equal(linhas.at(-1)![1], 'Risk and Trading');
});

test('quem esta sem Job Type Family cai em Other, e nao some do total', () => {
  assert.equal(jobFamily(p({})), 'Other');
  assert.equal(jobFamily(comFamilia('Familia Inventada')), 'Other');
  assert.equal(jobFamily(comFamilia('Finance')), 'Finance');
});

test('Regular e Contractor saem do vinculo, e desconhecido fica fora', () => {
  assert.equal(regularOuContractor(p({ relationship: 'CLT' })), 'Regular');
  assert.equal(regularOuContractor(p({ relationship: 'Aprendiz' })), 'Regular');
  assert.equal(regularOuContractor(p({ relationship: 'Pessoa Jurídica' })), 'Contractor');
  assert.equal(regularOuContractor(p({ relationship: 'Vinculo Novo' })), null);
});

test('FTE trata virgula decimal e conta ausencia como 1', () => {
  const fte = (v: string) => p({ personalizados: [{ nome: 'Força de Trabalho', valor: v }] });
  assert.equal(somaFte([fte('0,9'), fte('1,0')]), 1.9);
  assert.equal(somaFte([p({})]), 1);
  assert.equal(somaFte([fte('')]), 1);
});

test('a janela de 12 meses termina no mes pedido', () => {
  const m = doze('2026-08');
  assert.equal(m.length, 12);
  assert.equal(m[0], '2025-09');
  assert.equal(m.at(-1), '2026-08');
});

test('voluntaria nao classificada nao conta como voluntaria', () => {
  const janela = [
    comFamilia('Finance', { saida: '2026-03', voluntaria: true }),
    comFamilia('Finance', { saida: '2026-04', voluntaria: null }),
    comFamilia('Finance', { saida: '2026-05', voluntaria: false }),
  ];
  const l = montarLocation([], janela, '2026-08')
    .find((x) => x[1] === 'Finance' && x[18].startsWith('Regular'))!;
  assert.equal(l[7], '3', 'total de saidas na janela');
  assert.equal(l[9], '1', 'so a classificada como voluntaria');
});

test('saida fora da janela de 12 meses nao entra', () => {
  const janela = [comFamilia('Legal', { saida: '2024-01', voluntaria: true })];
  const l = montarLocation([], janela, '2026-08').find((x) => x[1] === 'Legal')!;
  assert.equal(l[7], '0');
});

test('saidas e entradas DO MES sao separadas da janela', () => {
  const janela = [
    comFamilia('HR', { saida: '2026-08' }),
    comFamilia('HR', { saida: '2026-02' }),
    comFamilia('HR', { hiring_date: '2026-08-11' }),
  ];
  const l = montarLocation([], janela, '2026-08').find((x) => x[1] === 'HR')!;
  assert.equal(l[7], '2', 'duas saidas na janela');
  assert.equal(l[13], '1', 'uma saida no mes');
  assert.equal(l[14], '1', 'uma entrada no mes');
});

test('recrutamento sai vazio, e nao zero', () => {
  // Open roles vem do InHire. Zero diria "nao ha vaga aberta", que e diferente
  // de "nao sei" -- e o proprio arquivo entregue deixa vazio.
  const l = montarLocation([comFamilia('Finance')], [], '2026-08')
    .find((x) => x[1] === 'Finance')!;
  assert.deepEqual([l[15], l[16], l[17]], ['', '', '']);
});

test('N-4 conta por camada, genero e vinculo', () => {
  const noMes = [
    p({ camada: 'N-3', genero: 'M', relationship: 'CLT' }),
    p({ camada: 'N-3', genero: 'F', relationship: 'Pessoa Jurídica' }),
    p({ camada: 'N-4', genero: 'F', relationship: 'CLT' }),
    p({ camada: 'N-4', genero: '', relationship: 'CLT' }),
  ];
  const linhas = montarN4(noMes);
  assert.deepEqual(linhas.find((l) => l[0] === 'N-3')!.slice(1), ['1', '0', '0', '1', '0']);
  assert.deepEqual(linhas.find((l) => l[0] === 'N-4')!.slice(1), ['0', '0', '1', '0', '1']);
});

test('N e N-1 saem com zero, e nao somem', () => {
  const linhas = montarN4([]);
  assert.equal(linhas.length, 5);
  assert.deepEqual(linhas[0], ['N', '0', '0', '0', '0', '0']);
});

test('mulher e reconhecida por F, em qualquer caixa', () => {
  assert.equal(ehMulher(p({ genero: 'F' })), true);
  assert.equal(ehMulher(p({ genero: 'f' })), true);
  assert.equal(ehMulher(p({ genero: 'M' })), false);
  assert.equal(ehMulher(p({ genero: null })), false);
});
