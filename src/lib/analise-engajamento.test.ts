import test from 'node:test';
import assert from 'node:assert/strict';
import {
  variacaoPorFaixa, efeitoComposicao, dispersaoEntreAreas, aderenciaDoRisco,
  type FaixaOnda, type NotaPorArea, type RiscoObservado,
} from './analise-engajamento';

/**
 * Os recortes REAIS por tempo de casa das duas ondas com eNPS por faixa.
 * jul/25 saiu da planilha de junho (233 respostas); ago/26 da de julho (485).
 *
 * Estão aqui de propósito, e não valores inventados: estas contas foram feitas
 * primeiro fora do app, à mão, e a leitura que saiu delas foi para a tela. Os
 * testes existem para o código ter que reproduzir aqueles números -- se um dia
 * divergir, é aqui que aparece.
 */
const JUL25: FaixaOnda[] = [
  { faixa: '0-3 meses', n: 36, enps: 83 },
  { faixa: '3-6 meses', n: 26, enps: 85 },
  { faixa: '6-9 meses', n: 12, enps: 67 },
  { faixa: '9-12 meses', n: 21, enps: 71 },
  { faixa: '12-18 meses', n: 42, enps: 83 },
  { faixa: '18-24 meses', n: 23, enps: 83 },
  { faixa: '24+ meses', n: 73, enps: 84 },
];
const AGO26: FaixaOnda[] = [
  { faixa: '0-3 meses', n: 35, enps: 80 },
  { faixa: '3-6 meses', n: 77, enps: 74 },
  { faixa: '6-9 meses', n: 47, enps: 72 },
  { faixa: '9-12 meses', n: 60, enps: 65 },
  { faixa: '12-18 meses', n: 71, enps: 63 },
  { faixa: '18-24 meses', n: 52, enps: 69 },
  { faixa: '24+ meses', n: 143, enps: 67 },
];

// ------------------------------------------------- 1. onde a queda aconteceu

test('a queda se concentra em quem tem mais de um ano de casa', () => {
  const v = variacaoPorFaixa(AGO26, JUL25);
  const de = (f: string) => v.find((x) => x.faixa === f)?.variacao;
  assert.equal(de('0-3 meses'), -3, 'quem chega continua chegando animado');
  assert.equal(de('6-9 meses'), 5, 'esta faixa até melhorou');
  assert.equal(de('12-18 meses'), -20);
  assert.equal(de('18-24 meses'), -14);
  assert.equal(de('24+ meses'), -17);
});

test('faixa sem correspondência na outra onda fica nula, não zero', () => {
  const v = variacaoPorFaixa(
    [{ faixa: 'nova', n: 10, enps: 50 }],
    [{ faixa: 'antiga', n: 10, enps: 50 }],
  );
  assert.equal(v[0].variacao, null, 'zero diria "não mudou"');
});

test('a média ponderada das faixas reproduz o eNPS publicado', () => {
  // É a conferência que valida tudo o que vem depois: se estas somas não
  // fecham com 82 e 69, os recortes por faixa não descrevem a mesma empresa
  // que os cartões do topo.
  const e = efeitoComposicao(AGO26, JUL25);
  assert.ok(Math.abs((e.anterior as number) - 82) < 0.5, `jul/25 deu ${e.anterior}, esperado ~82`);
  assert.ok(Math.abs((e.atual as number) - 69) < 0.5, `ago/26 deu ${e.atual}, esperado ~69`);
});

test('a queda NÃO é composição -- o mix explica 0,4 de 12,7 pontos', () => {
  // "Mas a empresa dobrou de tamanho" é a primeira objeção da sala. Ela é
  // legítima e verificável, e aqui ela não se sustenta.
  const e = efeitoComposicao(AGO26, JUL25);
  assert.equal(e.contrafactual, 69.3);
  assert.equal(e.efeitoMix, 0.4);
  assert.equal(e.variacaoTotal, -12.7);
});

test('quando a queda É composição, a conta mostra isso', () => {
  // Mesmas notas nas duas ondas; só o peso das faixas muda. A variação total
  // tem que ser inteiramente explicada pelo mix.
  const antes: FaixaOnda[] = [
    { faixa: 'novos', n: 80, enps: 90 },
    { faixa: 'antigos', n: 20, enps: 50 },
  ];
  const agora: FaixaOnda[] = [
    { faixa: 'novos', n: 20, enps: 90 },
    { faixa: 'antigos', n: 80, enps: 50 },
  ];
  // 80x90 + 20x50 = 82 antes; 20x90 + 80x50 = 58 agora; queda de 24.
  // O contrafactual usa as MESMAS notas com os pesos de antes -> volta a 82,
  // ou seja, a queda inteira é mistura diferente das mesmas pessoas.
  //
  // (A primeira versão deste teste esperava 32. Eu escrevi o número sem fazer
  // a conta; o teste apontou o erro em mim, não no código. Fica registrado
  // porque é exatamente o tipo de engano que esta função existe para pegar
  // quando alguém fizer a conta de cabeça numa reunião.)
  const e = efeitoComposicao(agora, antes);
  assert.equal(e.variacaoTotal, -24);
  assert.equal(e.efeitoMix, 24, 'o mix explica a queda inteira');
});

// ------------------------------------- 2. problema da empresa ou de alguém

const NOTAS: NotaPorArea[] = [
  // Remuneração: todo mundo responde parecido -- é da empresa.
  { driver: 'Remuneração', question: 'Salário justo?', area: 'Technology', favoravel: 72, n: 40 },
  { driver: 'Remuneração', question: 'Salário justo?', area: 'Marketing', favoravel: 68, n: 40 },
  { driver: 'Remuneração', question: 'Salário justo?', area: 'Finance', favoravel: 70, n: 40 },
  // Gestão: a mesma empresa produz experiências muito diferentes -- é local.
  { driver: 'Gestão', question: 'Meu gestor escuta?', area: 'Technology', favoravel: 95, n: 40 },
  { driver: 'Gestão', question: 'Meu gestor escuta?', area: 'Marketing', favoravel: 55, n: 40 },
  { driver: 'Gestão', question: 'Meu gestor escuta?', area: 'Finance', favoravel: 80, n: 40 },
];
const EMPRESA = new Map([
  ['Remuneração||Salário justo?', 70],
  ['Gestão||Meu gestor escuta?', 77],
]);

test('separa o que é da empresa do que é de alguém', () => {
  const d = dispersaoEntreAreas(NOTAS, EMPRESA);
  assert.equal(d[0].question, 'Meu gestor escuta?', 'a de maior amplitude vem primeiro');
  assert.equal(d[0].amplitude, 40);
  assert.equal(d[0].pior.area, 'Marketing');
  assert.equal(d[0].melhor.area, 'Technology');
  assert.equal(d[1].amplitude, 4, 'remuneração é igual em todo lugar');
});

test('pergunta com poucas áreas não vira amplitude', () => {
  // Com uma ou duas áreas, "amplitude" é ruído com nome de métrica.
  const d = dispersaoEntreAreas(NOTAS.slice(0, 2), EMPRESA);
  assert.deepEqual(d, []);
});

test('nota suprimida não entra na amplitude', () => {
  const com = [...NOTAS, {
    driver: 'Gestão', question: 'Meu gestor escuta?', area: 'Legal', favoravel: null, n: 3,
  }];
  const d = dispersaoEntreAreas(com, EMPRESA);
  assert.equal(d[0].areas, 3, 'a área suprimida não conta');
});

// ----------------------------------------- 3. o risco declarado previu?

const linha = (
  area: string, riscoDeclarado: number, saidaObservada: number | null,
): RiscoObservado => ({
  area, riscoDeclarado, respostas: 40, pediramDemissao: 4,
  headcount: 100, saidaObservada,
});

test('quando a ordem bate, o rho é alto', () => {
  const r = aderenciaDoRisco([
    linha('A', 30, 12), linha('B', 20, 9), linha('C', 10, 5), linha('D', 5, 2),
  ], 7);
  assert.equal(r.rho, 1);
  assert.equal(r.pares, 4);
});

test('quando a ordem se inverte, o rho é negativo -- e isso é uma resposta', () => {
  // Um rho negativo não é defeito da conta: é a pesquisa dizendo que quem
  // declarou mais risco perdeu menos gente. Vale saber.
  const r = aderenciaDoRisco([
    linha('A', 30, 2), linha('B', 20, 5), linha('C', 10, 9), linha('D', 5, 12),
  ], 7);
  assert.equal(r.rho, -1);
});

test('com menos de quatro áreas não devolve correlação nenhuma', () => {
  // Três pontos sempre desenham uma tendência. Publicar um rho aí seria dar
  // ares de medição a um acaso.
  const r = aderenciaDoRisco([linha('A', 30, 12), linha('B', 20, 9), linha('C', 10, 5)], 7);
  assert.equal(r.rho, null);
});

test('área sem saída observada entra na tabela mas fica fora da conta', () => {
  const r = aderenciaDoRisco([
    linha('A', 30, 12), linha('B', 20, 9), linha('C', 10, 5), linha('D', 5, 2),
    linha('E', 40, null),
  ], 7);
  assert.equal(r.linhas.length, 5, 'aparece na tabela');
  assert.equal(r.pares, 4, 'não entra na correlação');
  assert.equal(r.linhas[0].area, 'E', 'ordenada por risco declarado');
});
