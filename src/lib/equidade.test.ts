import test from 'node:test';
import assert from 'node:assert/strict';
import { mediana, agruparEquidade, N_MINIMO_EQUIDADE } from './equidade';

const p = (nivel: string | null, chave: string | null, cr: number) => ({ nivel, chave, cr });
const ORDEM = ['Feminino', 'Masculino'];
const acha = (rs: ReturnType<typeof agruparEquidade>, nivel: string, grupo: string) =>
  rs.find((r) => r.nivel === nivel)!.celulas.find((c) => c.grupo === grupo)!;

test('mediana, e não média: um outlier não move a leitura', () => {
  assert.equal(mediana([90, 95, 100, 105, 900]), 100);
  assert.equal(mediana([90, 100]), 95);
  assert.equal(mediana([]), null);
});

test('célula pequena perde a MEDIANA, não a linha', () => {
  // Some o número, não o grupo. Quem olha precisa saber que existem quatro
  // pessoas ali e que são poucas para publicar -- não concluir que não há
  // ninguém. É a mesma troca que este painel passou a semana desfazendo.
  const dados = [
    ...Array.from({ length: 4 }, () => p('L6', 'Feminino', 130)),
    ...Array.from({ length: 20 }, () => p('L6', 'Masculino', 131)),
  ];
  const r = agruparEquidade(dados, ORDEM);
  const f = acha(r, 'L6', 'Feminino');
  assert.equal(f.n, 4, 'o n real continua visível');
  assert.equal(f.mediana, null, 'a mediana é suprimida');
  assert.equal(acha(r, 'L6', 'Masculino').mediana, 131);
});

test('exatamente no mínimo a célula aparece', () => {
  const dados = Array.from({ length: N_MINIMO_EQUIDADE }, () => p('L4', 'Feminino', 85));
  assert.equal(acha(agruparEquidade(dados, ORDEM), 'L4', 'Feminino').mediana, 85);
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
