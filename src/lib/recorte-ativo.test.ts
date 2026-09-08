import test from 'node:test';
import assert from 'node:assert/strict';
import { recorteAtivo, combinacaoGravada, perfisIncompativeis } from '@/lib/recorte-ativo';

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

// ===========================================================================
// MARCA DE PRODUTO
// ===========================================================================
// O pedido que a Thais e a Marilia fizeram, cada uma do seu jeito. O seletor
// do topo é ENTIDADE e não pode responder; marca de produto é o que a
// pesquisa pergunta, e o cruzamento com área já estava gravado.

test('marca de produto sozinha é o recorte simples', () => {
  const r = recorteAtivo({ marcaProduto: 'Betfair' }, null)!;
  assert.equal(r.cutType, 'marca');
  assert.equal(r.valor, 'Betfair');
  assert.equal(r.rotulo, 'Marca de produto');
});

test('marca de produto com área vira area+marca -- o que a Thais pediu', () => {
  const r = recorteAtivo({ marcaProduto: 'Betfair' }, 'Product')!;
  assert.equal(r.cutType, 'area+marca');
  assert.equal(r.valor, 'Product || Betfair');
  assert.equal(r.cruzado, true);
});

test('marca NÃO cruza com tempo nem com modelo: essas chaves não existem', () => {
  // Se um dia passarem a ser gravadas, este teste falha e manda soltar a
  // exclusão -- em vez de a restrição sobreviver à razão dela, como já
  // aconteceu com tempo × modelo.
  assert.equal(combinacaoGravada(['marca']), true);
  assert.equal(combinacaoGravada(['tempo', 'modelo']), true);
  assert.equal(combinacaoGravada(['tempo', 'marca']), false);
  assert.equal(combinacaoGravada(['modelo', 'marca']), false);
  assert.equal(combinacaoGravada(['tempo', 'modelo', 'marca']), false);
});

test('escolher marca com tempo ligado apaga o tempo, e diz qual apagou', () => {
  const fora = perfisIncompativeis(
    { tempoCasa: '24+ meses', marcaProduto: 'Betfair' }, 'marcaProduto',
  );
  assert.deepEqual(fora, ['tempoCasa']);
});

test('escolher tempo com marca ligada apaga a marca -- quem escolheu por último fica', () => {
  const fora = perfisIncompativeis(
    { tempoCasa: '24+ meses', marcaProduto: 'Betfair' }, 'tempoCasa',
  );
  assert.deepEqual(fora, ['marcaProduto']);
});

test('tempo e modelo continuam convivendo: a combinação existe', () => {
  const fora = perfisIncompativeis(
    { tempoCasa: '24+ meses', modeloTrabalho: 'Remoto' }, 'modeloTrabalho',
  );
  assert.deepEqual(fora, []);
});

test('marca escolhida com os dois ligados derruba os dois', () => {
  const fora = perfisIncompativeis(
    { tempoCasa: '24+ meses', modeloTrabalho: 'Remoto', marcaProduto: 'Betnacional' },
    'marcaProduto',
  );
  assert.deepEqual(fora.sort(), ['modeloTrabalho', 'tempoCasa']);
});

test('desligar um filtro não desaloja ninguém', () => {
  const fora = perfisIncompativeis(
    { tempoCasa: '24+ meses', marcaProduto: 'Todos' }, 'marcaProduto',
  );
  assert.deepEqual(fora, []);
});
