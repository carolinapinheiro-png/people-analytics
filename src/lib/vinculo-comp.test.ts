import test from 'node:test';
import assert from 'node:assert/strict';
import { chaveNome, resumir, vincular } from './vinculo-comp';

/**
 * Casar folha com organograma pelo NOME é a pior chave possível, e é a única
 * que existe. O que torna isso aceitável não é a esperteza do casamento — é a
 * regra do empate: na dúvida, não casa.
 *
 * Cada teste abaixo pergunta "isto pode casar a pessoa errada?", porque casar
 * errado aqui mostra o salário de alguém para quem não devia, e não gera erro
 * nenhum na tela.
 */

const ORG = [
  { nome: 'Ana Souza', camada: 'N-3' },
  { nome: 'Bruno Lima', camada: 'N-4' },
  { nome: 'Carla Menezes', camada: null },
];

test('nome igual casa e traz a camada', () => {
  const r = vincular([{ id: '1', name: 'Ana Souza' }], ORG);
  assert.deepEqual(r.casados, [
    { id: '1', nome: 'Ana Souza', camada: 'N-3', convenia_id: null },
  ]);
});

test('o casamento leva o convenia_id junto, para ser gravado na folha', () => {
  // O elo existe para PARAR de casar por nome na hora de ler. Este casamento
  // por nome já devolveu 0% duas vezes esta semana, por dois defeitos
  // diferentes no mesmo campo do Convenia -- e tudo que dependia dele caiu
  // junto, em silêncio. Guardado, o elo é conferido uma vez e vira chave.
  const r = vincular(
    [{ id: '1', name: 'Ana Souza' }],
    [{ nome: 'Ana Souza', camada: 'N-3', convenia_id: 'abc-123' }],
  );
  assert.equal(r.casados[0].convenia_id, 'abc-123');
});

test('sem convenia_id na origem, o elo sai null e a camada continua', () => {
  // Null significa "não casou", e o que depende do elo não aparece. A camada,
  // que é o que controla ACESSO, não pode cair junto.
  const r = vincular([{ id: '1', name: 'Ana Souza' }], ORG);
  assert.equal(r.casados[0].convenia_id, null);
  assert.equal(r.casados[0].camada, 'N-3');
});

test('acento, caixa e espaço extra não impedem o casamento', () => {
  const r = vincular([{ id: '1', name: '  ANA   SOUZA ' }], [{ nome: 'Ana Sóuza', camada: 'N-3' }]);
  assert.equal(r.casados.length, 1);
});

test('pontuação some da comparação', () => {
  assert.equal(chaveNome("O'Brien, José-Maria"), 'o brien jose maria');
});

test('homônimo no organograma NÃO casa — nenhum dos dois', () => {
  // Escolher um seria decidir no cara ou coroa quem enxerga o salário de quem.
  const org = [
    { nome: 'João Silva', camada: 'N-2' },
    { nome: 'João Silva', camada: 'N-5' },
  ];
  const r = vincular([{ id: '1', name: 'João Silva' }], org);
  assert.equal(r.casados.length, 0);
  assert.deepEqual(r.ambiguos, ['João Silva']);
});

test('nome repetido NA FOLHA também é recusado', () => {
  // Duas linhas de salário com o mesmo nome não podem apontar para a mesma
  // pessoa do organograma -- uma delas estaria errada.
  const r = vincular(
    [{ id: '1', name: 'Ana Souza' }, { id: '2', name: 'ana souza' }],
    ORG,
  );
  assert.equal(r.casados.length, 0);
  assert.equal(r.ambiguos.length, 2);
});

test('quem não está no Convenia fica sem camada, e é contado', () => {
  const r = vincular([{ id: '9', name: 'Fulano Externo' }], ORG);
  assert.equal(r.casados.length, 0);
  assert.deepEqual(r.semCorrespondencia, ['Fulano Externo']);
});

test('encontrado mas sem camada na origem é um caso à parte', () => {
  // Ciclo ou cadeia quebrada no Convenia. Separar do "não encontrei" importa:
  // um se resolve arrumando o organograma, o outro cadastrando a pessoa.
  const r = vincular([{ id: '3', name: 'Carla Menezes' }], ORG);
  assert.equal(r.casados.length, 0);
  assert.deepEqual(r.semCamadaNaOrigem, ['Carla Menezes']);
  assert.equal(r.semCorrespondencia.length, 0);
});

test('nome vazio não casa com nada', () => {
  const r = vincular([{ id: '1', name: '   ' }], ORG);
  assert.equal(r.casados.length, 0);
  assert.equal(chaveNome(null), '');
});

test('não tenta ser esperto: sobrenome a menos não casa', () => {
  // "Ana Souza" e "Ana Souza Pereira" podem ser duas pessoas. Casar por
  // aproximação é como o salário da errada aparece.
  const r = vincular([{ id: '1', name: 'Ana Souza Pereira' }], ORG);
  assert.equal(r.casados.length, 0);
  assert.deepEqual(r.semCorrespondencia, ['Ana Souza Pereira']);
});

test('o resumo diz a taxa, que é o número que decide se dá para usar', () => {
  const linhas = [
    { id: '1', name: 'Ana Souza' },
    { id: '2', name: 'Bruno Lima' },
    { id: '3', name: 'Carla Menezes' },
    { id: '4', name: 'Ninguém' },
  ];
  const r = vincular(linhas, ORG);
  const texto = resumir(r, linhas.length);
  assert.match(texto, /2 de 4 linhas casaram \(50%\)/);
  assert.match(texto, /1 sem correspondência/);
  assert.match(texto, /1 sem camada no organograma/);
});

test('lista vazia não quebra', () => {
  const r = vincular([], ORG);
  assert.equal(r.casados.length, 0);
  assert.match(resumir(r, 0), /Nenhuma linha/);
});
