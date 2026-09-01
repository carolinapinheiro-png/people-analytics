import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lerCustomFields, valorDe, escritorioDe, empresaDe, valorEhSensivel,
  NOMES_DE_ESCRITORIO,
} from './custom-fields';

/**
 * Estes testes existem porque o dado ainda não existe.
 *
 * Quando foram escritos, `custom_fields` parecia vazio em 8 de 8 -- eu media
 * pelo caminho errado -- e o código ia rodar pela primeira vez contra uma
 * forma que ninguém aqui tinha visto. Os primeiros onze testes são desse
 * momento e ficam: a forma real é uma das quatro, e as outras três continuam
 * cobertas para o dia em que a API mudar.
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

// ---------------------------------------------------------------------------
// O QUE A PRIMEIRA EXECUÇÃO REAL MOSTROU
// ---------------------------------------------------------------------------
// A sonda rodou e o campo não estava vazio: 5 de 8 em Recife. São dois campos
// distintos, e tratá-los como um só devolveria o que viesse primeiro.
// ---------------------------------------------------------------------------

/** Recorte do cadastro real de Recife, com os valores sensíveis encurtados. */
const RECIFE = {
  custom_fields: [
    { name: 'Level', value: 'L5' },
    { name: 'Modelo de Jornada de Trabalho', value: 'Presencial' },
    { name: 'Escritório', value: 'Recife - Boa Viagem' },
    { name: 'WorkDay Level', value: 'N-5' },
    { name: 'Career Band', value: 'D - Manager + Specialist roles' },
    { name: 'Empresa', value: 'NSX Brasil Recife' },
    { name: 'Job Type Family', value: 'Product & Technology' },
    { name: 'Liderança ?', value: 'Sim' },
    { name: 'Razão Social (quando PJ)', value: 'FULANO CONSULTORIA EM TECN' },
    { name: 'CNPJ (quando PJs)', value: '00.000.000/0001-00' },
  ],
};

test('empresa e escritório saem separados, e não um pelo outro', () => {
  assert.equal(empresaDe(RECIFE), 'NSX Brasil Recife');
  assert.equal(escritorioDe(RECIFE), 'Recife - Boa Viagem');
});

test('"Razão Social (quando PJ)" NÃO é a empresa', () => {
  // É a empresa do PRESTADOR. Se entrasse, cada PJ viraria uma marca com uma
  // pessoa só e o painel ganharia dezenas de marcas fantasma, sem erro nenhum.
  assert.equal(
    empresaDe({ custom_fields: [{ name: 'Razão Social (quando PJ)', value: 'FULANO LTDA' }] }),
    null,
  );
});

test('"Remoto" é um escritório válido -- não é ausência', () => {
  assert.equal(
    escritorioDe({ custom_fields: [{ name: 'Escritório', value: 'Remoto' }] }),
    'Remoto',
  );
});

test('valores de CNPJ, razão social e endereço não são exibíveis', () => {
  // A sonda imprimiu CNPJ e endereço de prestador numa tela de admin, debaixo
  // de uma frase minha dizendo que isso não atravessava o filtro.
  for (const n of ['CNPJ (quando PJs)', 'Razão Social (quando PJ)', 'Endereço PJs',
    'CPF', 'Conta bancária', 'Banco', 'Data de nascimento']) {
    assert.ok(valorEhSensivel(n), `deveria ocultar o valor de "${n}"`);
  }
});

test('e os campos que interessam continuam exibíveis', () => {
  // Um filtro que esconde tudo protege e não informa -- a sonda existe para
  // mostrar com que nome o RH criou cada campo.
  for (const n of ['Escritório', 'Empresa', 'Job Type Family', 'Career Band',
    'Modelo de Jornada de Trabalho', 'Liderança ?', 'Level']) {
    assert.equal(valorEhSensivel(n), false, `não deveria ocultar "${n}"`);
  }
});

test('a lista de escritório não pega "Empresa" por engano', () => {
  assert.equal(valorDe(lerCustomFields(RECIFE.custom_fields), NOMES_DE_ESCRITORIO), 'Recife - Boa Viagem');
});
