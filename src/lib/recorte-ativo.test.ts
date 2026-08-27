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

test('os dois perfis juntos viram UM recorte, na ordem da chave gravada', () => {
  const r = recorteAtivo({ tempoCasa: '24+ meses', modeloTrabalho: 'Remoto' }, null)!;
  assert.equal(r.cutType, 'tempo+modelo');
  // A ordem importa: "Remoto || 24+ meses" não acha linha nenhuma, e zero
  // linha na tela se lê como "este grupo não respondeu".
  assert.equal(r.valor, '24+ meses || Remoto');
  assert.equal(r.cruzado, false, 'cruzado quer dizer "tem área junto"');
});

test('os dois perfis MAIS a área viram o triplo', () => {
  const r = recorteAtivo({ tempoCasa: '24+ meses', modeloTrabalho: 'Remoto' }, 'Technology')!;
  assert.equal(r.cutType, 'area+tempo+modelo');
  assert.equal(r.valor, 'Technology || 24+ meses || Remoto');
  assert.equal(r.cruzado, true);
});

test('só modelo, sem tempo, não vira cruzamento', () => {
  const r = recorteAtivo({ modeloTrabalho: 'Remoto' }, null)!;
  assert.equal(r.cutType, 'modelo');
  assert.equal(r.valor, 'Remoto');
});
