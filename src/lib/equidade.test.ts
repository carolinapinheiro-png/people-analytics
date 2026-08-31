import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mediana, agruparEquidade, N_MINIMO_EQUIDADE, N_MINIMO_SE_SUPRIMIR,
} from './equidade';

const p = (nivel: string | null, chave: string | null, cr: number) => ({ nivel, chave, cr });
const ORDEM = ['Feminino', 'Masculino'];
const acha = (rs: ReturnType<typeof agruparEquidade>, nivel: string, grupo: string) =>
  rs.find((r) => r.nivel === nivel)!.celulas.find((c) => c.grupo === grupo)!;

test('mediana, e não média: um outlier não move a leitura', () => {
  assert.equal(mediana([90, 95, 100, 105, 900]), 100);
  assert.equal(mediana([90, 100]), 95);
  assert.equal(mediana([]), null);
});

// ---------------------------------------------------------------------------
// A SUPRESSÃO SAIU -- DECISÃO DA CAROLINA, 28/08/2026
// ---------------------------------------------------------------------------
// O fundamento é o acesso: a aba de Compensação é restrita a quem já vê o
// comp-ratio individual na lista logo acima do cartão. Suprimir a mediana de
// três pessoas cujos números individuais estão na mesma tela não protege
// ninguém.
//
// A capacidade continua no código, parametrizada. Estes testes cobrem os DOIS
// estados, porque a premissa é sobre a lista de acesso -- que muda por fora
// deste arquivo.
// ---------------------------------------------------------------------------

test('hoje: todo grupo publica mediana, inclusive de uma pessoa', () => {
  const dados = [
    p('L6', 'Feminino', 130),
    ...Array.from({ length: 20 }, () => p('L6', 'Masculino', 131)),
  ];
  const r = agruparEquidade(dados, ORDEM);
  const f = acha(r, 'L6', 'Feminino');
  assert.equal(f.n, 1);
  assert.equal(f.mediana, 130, 'com n=1 a "mediana" é o número daquela pessoa');
});

test('com o mínimo de volta, a célula pequena perde a MEDIANA e não a linha', () => {
  // O comportamento para o qual voltar é uma troca de valor, não uma edição
  // de lógica. Some o número, não o grupo: "não aparece" já foi lido como
  // "não existe" vezes demais neste painel.
  const dados = [
    ...Array.from({ length: 4 }, () => p('L6', 'Feminino', 130)),
    ...Array.from({ length: 20 }, () => p('L6', 'Masculino', 131)),
  ];
  const r = agruparEquidade(dados, ORDEM, N_MINIMO_SE_SUPRIMIR);
  const f = acha(r, 'L6', 'Feminino');
  assert.equal(f.n, 4, 'o n real continua visível');
  assert.equal(f.mediana, null, 'a mediana é suprimida');
  assert.equal(acha(r, 'L6', 'Masculino').mediana, 131);
});

test('exatamente no mínimo a célula aparece', () => {
  const dados = Array.from({ length: N_MINIMO_SE_SUPRIMIR }, () => p('L4', 'Feminino', 85));
  assert.equal(
    acha(agruparEquidade(dados, ORDEM, N_MINIMO_SE_SUPRIMIR), 'L4', 'Feminino').mediana, 85);
});

test('a proteção não foi apagada, só desligada', () => {
  // Se alguém remover o parâmetro, este teste cai -- e com ele o caminho de
  // volta. É a diferença entre "decidimos não usar" e "não temos mais".
  assert.equal(N_MINIMO_EQUIDADE, 1, 'hoje, sem supressão');
  assert.equal(N_MINIMO_SE_SUPRIMIR, 5, 'o valor para o qual voltar');
});

test('"Geral" NÃO é a soma dos níveis, e as duas linhas convivem', () => {
  // A geral mistura níveis; as por nível comparam igual com igual. Uma pessoa
  // entra nas duas, de propósito -- e é por isso que a tela mostra ambas.
  const dados = [
    ...Array.from({ length: 5 }, () => p('L3', 'Feminino', 90)),
    ...Array.from({ length: 5 }, () => p('L5', 'Feminino', 130)),
  ];
  const r = agruparEquidade(dados, ORDEM);
  assert.equal(acha(r, 'L3', 'Feminino').mediana, 90);
  assert.equal(acha(r, 'L5', 'Feminino').mediana, 130);
  assert.equal(acha(r, 'Geral', 'Feminino').n, 10);
  assert.equal(acha(r, 'Geral', 'Feminino').mediana, 110);
});

test('Geral vem primeiro, e os níveis em ordem', () => {
  const dados = [p('L5', 'Feminino', 1), p('L3', 'Feminino', 1), p('L4', 'Feminino', 1)];
  assert.deepEqual(agruparEquidade(dados, ORDEM).map((r) => r.nivel),
    ['Geral', 'L3', 'L4', 'L5']);
});

test('quem não tem demografia não vira grupo "null"', () => {
  // Sem isto, apareceria uma coluna sem nome ao lado de Feminino e Masculino.
  const dados = [
    ...Array.from({ length: 5 }, () => p('L3', null, 100)),
    ...Array.from({ length: 5 }, () => p('L3', 'Feminino', 90)),
  ];
  const r = agruparEquidade(dados, ORDEM);
  assert.deepEqual(r.find((x) => x.nivel === 'L3')!.celulas.map((c) => c.grupo), ['Feminino']);
});

test('a ordem declarada manda, e o que sobra vai para o fim', () => {
  const dados = [
    ...Array.from({ length: 5 }, () => p(null, 'Preta', 100)),
    ...Array.from({ length: 5 }, () => p(null, 'Branca', 100)),
    ...Array.from({ length: 5 }, () => p(null, 'Outra', 100)),
  ];
  const r = agruparEquidade(dados, ['Branca', 'Parda', 'Preta']);
  assert.deepEqual(r[0].celulas.map((c) => c.grupo), ['Branca', 'Preta', 'Outra']);
});
