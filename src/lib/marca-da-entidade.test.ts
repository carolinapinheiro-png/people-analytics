import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marcaDaEntidade, filtrosDaPesquisa } from './marca-da-entidade';
import { recorteAtivo } from './recorte-ativo';

test('Betfair BR vira marca Betfair; NSX vira Betnacional', () => {
  assert.equal(marcaDaEntidade('Betfair BR'), 'Betfair');
  assert.equal(marcaDaEntidade('NSX'), 'Betnacional');
});

test('Flutter International e combinado não têm marca', () => {
  assert.equal(marcaDaEntidade('Flutter International'), null);
  assert.equal(marcaDaEntidade('combined'), null);
});

test('a entidade sobrepõe a marca de produto e gera recorte de marca', () => {
  const f = filtrosDaPesquisa({ tempoCasa: 'Todos', marcaProduto: 'Todos' }, 'Betfair BR');
  assert.equal(f.marcaProduto, 'Betfair');
  const r = recorteAtivo(f, null)!;
  assert.equal(r.cutType, 'marca');
  assert.equal(r.valor, 'Betfair');
});

test('sem entidade mapeável, os filtros passam intactos', () => {
  const orig = { marcaProduto: 'Todos' };
  assert.equal(filtrosDaPesquisa(orig, 'combined'), orig);
  assert.equal(recorteAtivo(filtrosDaPesquisa(orig, 'Flutter International'), null), null);
});
