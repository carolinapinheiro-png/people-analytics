import test from 'node:test';
import assert from 'node:assert/strict';
import { cargoDe } from './sync.server';

/**
 * O cargo, vindo do Convenia.
 *
 * ===========================================================================
 * POR QUE ESTA FUNÇÃO TENTA VÁRIOS CAMPOS
 * ===========================================================================
 * Não sei em qual campo o Convenia guarda o cargo, e supor o nome de um campo
 * dele já custou duas rodadas nesta semana: `full_name` veio primeiro sem
 * sobrenome e depois sem o primeiro nome, e nas duas vezes nada quebrou --
 * o casamento com a folha só foi a zero em silêncio.
 *
 * Então aqui a suposição é explícita e testada, e o sync avisa quando mais da
 * metade vier vazia. Vazio não quebra nada: o campo Cargo continua digitável,
 * que é como ele funciona hoje.
 */

test('aceita string direta, nos nomes plausíveis', () => {
  assert.equal(cargoDe({ job_title: 'Tech Lead' }), 'Tech Lead');
  assert.equal(cargoDe({ role: 'HRBP' }), 'HRBP');
  assert.equal(cargoDe({ position: 'Analista' }), 'Analista');
  assert.equal(cargoDe({ cargo: 'Gerente' }), 'Gerente');
});

test('aceita objeto com `name` — é como o Convenia manda department', () => {
  assert.equal(cargoDe({ job: { name: 'Product Manager' } }), 'Product Manager');
  assert.equal(cargoDe({ office: { name: 'Diretor' } }), 'Diretor');
});

test('a ordem dos campos é estável: o primeiro que tiver valor vence', () => {
  // Sem ordem definida, o mesmo cadastro daria cargos diferentes entre cargas.
  assert.equal(cargoDe({ job_title: 'A', role: 'B', position: 'C' }), 'A');
  assert.equal(cargoDe({ role: 'B', position: 'C' }), 'B');
});

test('vazio e espaço em branco não viram cargo', () => {
  assert.equal(cargoDe({ job_title: '   ' }), null);
  assert.equal(cargoDe({ job_title: '', role: 'HRBP' }), 'HRBP');
});

test('devolve null quando não reconhece nada', () => {
  // Null é a resposta honesta: o campo fica digitável, e o sync avisa se isso
  // acontecer com mais da metade das pessoas.
  assert.equal(cargoDe({}), null);
  assert.equal(cargoDe({ nome_do_cargo: 'Analista' }), null);
});

test('ignora tipo inesperado sem explodir', () => {
  assert.equal(cargoDe({ job_title: 42 as unknown as string }), null);
  assert.equal(cargoDe({ job: { name: 99 } as unknown as { name: string } }), null);
});
