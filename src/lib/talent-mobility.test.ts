import test from 'node:test';
import assert from 'node:assert/strict';
import { casarCampos, sobraram, chave, COLUNAS_TALENT, type CampoVisto } from './talent-mobility';

const campo = (nome: string, preenchidos = 8): CampoVisto =>
  ({ nome, origem: 'personalizado', preenchidos, valores: [] });

test('casa por nome ignorando acento, caixa e pontuacao', () => {
  const c = casarCampos([campo('career band')]).find((x) => x.coluna === 'Career Band');
  assert.equal(c?.forca, 'exata');
  assert.equal(c?.campo?.nome, 'career band');
});

test('casamento parcial nao rouba a coluna de um exato', () => {
  // `Career Band Level` vem ANTES na lista e contem "Career Band". Se o parcial
  // rodasse por coluna, ele levaria a coluna e o campo exato ficaria orfao --
  // exatamente o erro que a ordem de custom_fields provocaria.
  const m = casarCampos([campo('Career Band Level'), campo('Career Band')]);
  assert.equal(m.find((x) => x.coluna === 'Career Band')?.campo?.nome, 'Career Band');
});

test('nao procura campo para coluna que ja sai do que temos', () => {
  const c = casarCampos([campo('Company')]).find((x) => x.coluna === 'Company');
  assert.ok(c?.jaTemos);
  assert.equal(c?.campo, undefined);
});

test('deixa a coluna orfa quando nada casa, em vez de inventar', () => {
  assert.equal(casarCampos([]).find((x) => x.coluna === 'FTE %')?.campo, undefined);
});

test('devolve todas as 51 colunas, sempre', () => {
  assert.equal(casarCampos([]).length, COLUNAS_TALENT.length);
});

test('sobraram lista o que nenhuma coluna reivindicou', () => {
  const campos = [campo('Career Band'), campo('Apelido do pet')];
  assert.deepEqual(sobraram(campos, casarCampos(campos)).map((c) => c.nome), ['Apelido do pet']);
});

test('chave normaliza espaco, simbolo e acento', () => {
  assert.equal(chave('FTE %'), 'fte');
  assert.equal(chave('Funcao'), 'funcao');
});
