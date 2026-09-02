import test from 'node:test';
import assert from 'node:assert/strict';
import { marcaDeEmpresa, empresasNaoReconhecidas } from './marca';

/**
 * A marca é o eixo de comparação da série mensal inteira. Um de-para errado
 * aqui não quebra nada: multiplica marcas, e o painel mostra seis onde havia
 * três, com todos os números plausíveis.
 */

test('as três entidades legais de hoje viram a mesma marca', () => {
  // Medido em 02/09: são os únicos valores que o campo Empresa devolve.
  for (const e of ['NSX Brasil Recife', 'NSX Brasil São Paulo', 'NSX Brasil Marechal']) {
    assert.equal(marcaDeEmpresa(e), 'NSX', e);
  }
});

test('uma praça nova de NSX não cai em null', () => {
  // Casar por fragmento, e não por igualdade, é o que faz a próxima entidade
  // funcionar sem alguém lembrar de editar a tabela.
  assert.equal(marcaDeEmpresa('NSX Brasil Fortaleza'), 'NSX');
});

test('Betfair e Flutter estão previstas, para quando o RH preencher', () => {
  // Hoje NENHUM dos 389 cadastros preenchidos menciona as duas. Isso é "não
  // vi", não "não existe" -- 376 ainda estão sem o campo.
  assert.equal(marcaDeEmpresa('Betfair Brasil'), 'Betfair BR');
  assert.equal(marcaDeEmpresa('Flutter International Ltda'), 'Flutter International');
});

test('"Flutter International" não vira NSX nem Betfair por engano', () => {
  // A ordem dos fragmentos importa: o mais específico primeiro.
  assert.equal(marcaDeEmpresa('Flutter International'), 'Flutter International');
});

test('acento, caixa e pontuação não separam a mesma empresa', () => {
  for (const e of ['NSX BRASIL SÃO PAULO', 'nsx brasil sao paulo', 'NSX-Brasil, São Paulo']) {
    assert.equal(marcaDeEmpresa(e), 'NSX', e);
  }
});

test('valor desconhecido devolve null -- nunca o valor cru', () => {
  // "Se não conheço, uso como está" é como uma marca nova entra no painel sem
  // ninguém decidir. Basta o RH criar uma entidade para a série se partir em
  // duas com o mesmo significado.
  assert.equal(marcaDeEmpresa('Paddy Power'), null);
  assert.equal(marcaDeEmpresa('Empresa Nova Ltda'), null);
});

test('vazio, nulo e espaço em branco são null', () => {
  for (const v of [null, undefined, '', '   ', '---']) {
    assert.equal(marcaDeEmpresa(v), null, JSON.stringify(v));
  }
});

test('os não reconhecidos saem por NOME, sem repetir', () => {
  // Um número não dá para agir; um nome, sim.
  const fora = empresasNaoReconhecidas([
    'NSX Brasil Recife', 'Paddy Power', null, 'Paddy Power', 'Sisal', '',
  ]);
  assert.deepEqual(fora, ['Paddy Power', 'Sisal']);
});
