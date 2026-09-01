import test from 'node:test';
import assert from 'node:assert/strict';
import { lerCustomFields, valorDe, escritorioDe, NOMES_DE_ESCRITORIO } from './custom-fields';

/**
 * Estes testes existem porque o dado ainda não existe.
 *
 * `custom_fields` está vazio em 8 de 8 da amostra -- o RH ainda não terminou de
 * configurar. Ou seja: o código vai rodar pela primeira vez contra uma forma
 * que ninguém aqui viu.
 *
 * Foi exatamente essa a situação do `cargoDe`, que tentou sete nomes de campo
 * na resposta errada e acertou zero em 638, calado. A diferença é que lá o
 * prejuízo era um campo em branco; aqui é a série mensal reescrita.
 *
 * Como não dá para testar contra a resposta real, testa-se contra TODAS as
 * formas plausíveis. Assim a leitura não depende de eu ter adivinhado certo.
 */

test('forma 1: lista de pares name/value', () => {
  const campos = lerCustomFields([
    { name: 'Escritório', value: 'Recife' },
    { name: 'Centro de custo', value: 'AI TECH' },
  ]);
  assert.equal(campos.length, 2);
  assert.equal(valorDe(campos, ['escritorio']), 'Recife');
});

test('forma 1, variantes: label/field/title e content/data/text', () => {
  // Cada API escolhe um par de nomes. Não custa cobrir os quatro.
  assert.equal(valorDe(lerCustomFields([{ label: 'Office', content: 'SP' }]), ['office']), 'SP');
  assert.equal(valorDe(lerCustomFields([{ field: 'Unidade', data: 'Marechal' }]), ['unidade']), 'Marechal');
  assert.equal(valorDe(lerCustomFields([{ title: 'Local', text: 'Recife' }]), ['local']), 'Recife');
});

test('forma 2: objeto simples, a chave é o nome', () => {
  const campos = lerCustomFields({ 'Escritório': 'Recife', 'Turno': 'Manhã' });
  assert.equal(campos.length, 2);
  assert.equal(valorDe(campos, ['escritorio']), 'Recife');
});

test('forma 3: lista de objetos de um par cada', () => {
  assert.equal(
    valorDe(lerCustomFields([{ 'Escritório': 'Recife' }, { 'Turno': 'Manhã' }]), ['escritorio']),
    'Recife',
  );
});

test('forma 4: vazio devolve lista vazia, e não null', () => {
  // A distinção importa: lista vazia = "não tem campo personalizado nenhum";
  // lista cheia com busca falhando = "tem campos, nenhum é o escritório".
  // São conversas diferentes com o RH.
  for (const v of [null, undefined, [], {}, '', 0, 'texto solto']) {
    assert.deepEqual(lerCustomFields(v), [], `falhou para ${JSON.stringify(v)}`);
  }
});

test('valor embrulhado em {name} também é lido', () => {
  // `department` e `ethnicity` chegam assim nesta API; nada garante que o
  // valor de um campo personalizado não chegue igual.
  assert.equal(
    valorDe(lerCustomFields([{ name: 'Escritório', value: { name: 'Recife' } }]), ['escritorio']),
    'Recife',
  );
});

test('acento e caixa não separam "Escritório" de "escritorio"', () => {
  assert.equal(valorDe(lerCustomFields([{ name: 'ESCRITÓRIO', value: 'Recife' }]), ['escritorio']), 'Recife');
});

test('casa por pedaço do nome, para "Escritório de trabalho"', () => {
  assert.equal(
    valorDe(lerCustomFields([{ name: 'Escritório de trabalho', value: 'Recife' }]), ['escritorio']),
    'Recife',
  );
});

test('campo sem valor não vira par -- string vazia não é resposta', () => {
  // Um campo criado e não preenchido é o estado de HOJE, em 8 de 8. Se ele
  // virasse par com valor '', a marca de todo mundo seria a mesma string vazia
  // e a série inteira colapsaria numa marca só, sem erro nenhum.
  assert.deepEqual(lerCustomFields([{ name: 'Escritório', value: '' }]), []);
  assert.deepEqual(lerCustomFields([{ name: 'Escritório', value: '   ' }]), []);
  assert.equal(escritorioDe({ custom_fields: [{ name: 'Escritório', value: '' }] }), null);
});

test('não acha o que não está lá, em vez de devolver o primeiro campo', () => {
  // O erro tentador seria "pega o primeiro campo personalizado". Com o RH
  // criando campos numa ordem qualquer, isso devolveria turno, ramal ou
  // tamanho de camiseta como se fosse o escritório.
  const campos = lerCustomFields([
    { name: 'Turno', value: 'Manhã' },
    { name: 'Ramal', value: '4321' },
  ]);
  assert.equal(campos.length, 2, 'os campos foram lidos');
  assert.equal(valorDe(campos, NOMES_DE_ESCRITORIO), null, 'mas nenhum é o escritório');
});

test('sem custom_fields no cadastro, escritorioDe devolve null', () => {
  assert.equal(escritorioDe({}), null);
  assert.equal(escritorioDe({ custom_fields: [] }), null);
});
