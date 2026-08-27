import test from 'node:test';
import assert from 'node:assert/strict';
import { recorteAtivo } from '@/lib/recorte-ativo';

test('sem filtro de perfil, não há recorte', () => {
  assert.equal(recorteAtivo({}, null), null);
  assert.equal(recorteAtivo({ tempoCasa: 'Todos', modeloTrabalho: 'Todos' }, 'Marketing'), null);
  // Vazio e espaço em branco contam como "sem filtro" -- ver filtro-sentinela.
  assert.equal(recorteAtivo({ tempoCasa: '   ' }, null), null);
});

test('só perfil: o recorte é o simples, da empresa inteira', () => {
  const r = recorteAtivo({ tempoCasa: '24+ meses' }, null)!;
  assert.equal(r.cutType, 'tempo');
  assert.equal(r.valor, '24+ meses');
  assert.equal(r.cruzado, false);
});

test('área + perfil: vira o cruzado, com a chave composta do banco', () => {
  const r = recorteAtivo({ tempoCasa: '24+ meses' }, 'Marketing')!;
  assert.equal(r.cutType, 'area+tempo');
  assert.equal(r.valor, 'Marketing || 24+ meses');
  assert.equal(r.cruzado, true);
  // O título não mostra o separador cru.
  assert.equal(r.soValor, '24+ meses');
  assert.equal(r.rotulo, 'Marketing · Tempo de casa');
});

test('modelo de trabalho segue a mesma regra', () => {
  const r = recorteAtivo({ modeloTrabalho: 'Híbrido' }, 'Technology')!;
  assert.equal(r.cutType, 'area+modelo');
  assert.equal(r.valor, 'Technology || Híbrido');
});

test('com os dois perfis preenchidos, tempo de casa ganha', () => {
  // A barra não deixa chegar aqui -- eles se excluem --, mas depender só dela
  // seria confiar numa regra que mora noutro arquivo.
  const r = recorteAtivo({ tempoCasa: '24+ meses', modeloTrabalho: 'Remoto' }, null)!;
  assert.equal(r.cutType, 'tempo');
});
