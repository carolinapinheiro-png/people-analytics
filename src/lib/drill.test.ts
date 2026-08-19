import test from 'node:test';
import assert from 'node:assert/strict';
import { perfilDaArea, areasNaPergunta, temQuebraPorArea } from './drill';
import type { DriverPorRecorte } from './survey.functions';

const l = (
  cutType: string, cutValue: string, question: string,
  favoravel: number | null, n = 40,
): DriverPorRecorte => ({
  driver: 'Remuneração', question, cutType, cutValue, n, score: null, favoravel,
});

const BASE: DriverPorRecorte[] = [
  l('company', 'company', 'Salário justo?', 74, 485),
  l('company', 'company', 'Benefícios?', 74, 485),
  l('area', 'Marketing', 'Salário justo?', 57),
  l('area', 'Marketing', 'Benefícios?', 72),
  l('area', 'Technology', 'Salário justo?', 91),
  l('area', 'Technology', 'Benefícios?', 80),
];

// ------------------------------------------------------- uma área, n perguntas

test('o perfil da área ordena pela distância da empresa, não pela nota', () => {
  // Marketing responde 57 e 72. Ordenar por nota traria 57 primeiro de todo
  // jeito -- mas o que interessa é que 57 está 17 pontos abaixo da empresa e
  // 72 está só 2. É a distância que diz onde agir.
  const r = perfilDaArea(BASE, 'Marketing');
  assert.deepEqual(r.map((x) => x.question), ['Salário justo?', 'Benefícios?']);
  assert.equal(r[0].gap, -17);
  assert.equal(r[1].gap, -2);
});

test('área acima da empresa aparece com gap positivo', () => {
  const r = perfilDaArea(BASE, 'Technology');
  assert.equal(r.find((x) => x.question === 'Salário justo?')?.gap, 17);
});

test('o nome da área casa sem depender de caixa ou espaço', () => {
  assert.equal(perfilDaArea(BASE, '  marketing ').length, 2);
});

test('nota suprimida não vira gap zero', () => {
  // Zero diria "igual à empresa". A verdade é "não dá para dizer" -- e as duas
  // levam a decisões opostas.
  const com = [...BASE, l('area', 'Legal', 'Salário justo?', null, 3)];
  const r = perfilDaArea(com, 'Legal');
  assert.equal(r[0].favoravel, null);
  assert.equal(r[0].gap, null);
});

test('sem gap vai para o fim da lista, não para o topo', () => {
  const com = [
    ...BASE,
    l('area', 'Marketing', 'Pergunta nova', null, 4),
  ];
  const r = perfilDaArea(com, 'Marketing');
  assert.equal(r.at(-1)?.question, 'Pergunta nova');
});

// ------------------------------------------------------- uma pergunta, n áreas

test('a mesma matriz lida pelo outro eixo', () => {
  const r = areasNaPergunta(BASE, 'Remuneração', 'Salário justo?');
  assert.deepEqual(r.map((x) => x.area), ['Marketing', 'Technology']);
  assert.equal(r[0].gap, -17);
  assert.equal(r[1].gap, 17);
});

test('os dois eixos concordam sobre a mesma célula', () => {
  // O gap de Marketing em "Salário justo?" tem que ser o mesmo número lido de
  // qualquer um dos dois lados. É a razão de as duas leituras morarem no mesmo
  // arquivo e usarem a mesma régua.
  const porArea = perfilDaArea(BASE, 'Marketing')
    .find((x) => x.question === 'Salário justo?')?.gap;
  const porPergunta = areasNaPergunta(BASE, 'Remuneração', 'Salário justo?')
    .find((x) => x.area === 'Marketing')?.gap;
  assert.equal(porArea, porPergunta);
});

test('sem régua da empresa, não há gap -- e não há zero', () => {
  const semEmpresa = BASE.filter((x) => x.cutType !== 'company');
  const r = areasNaPergunta(semEmpresa, 'Remuneração', 'Salário justo?');
  assert.equal(r[0].gap, null);
  assert.equal(r[0].favoravel, 57, 'a nota da área continua valendo');
});

// ------------------------------------------- onda que não mediu por área

test('sabe distinguir "área vai bem" de "esta onda não mediu por área"', () => {
  // jan/26 foi carregada só no nível da empresa. As duas produzem painel
  // vazio e significam o oposto uma da outra.
  assert.equal(temQuebraPorArea(BASE), true);
  assert.equal(temQuebraPorArea(BASE.filter((x) => x.cutType === 'company')), false);
  assert.equal(temQuebraPorArea([]), false);
});
