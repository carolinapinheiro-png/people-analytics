/**
 * Testes da lista de caminhos e da paginação do InHire.
 *
 *   npx tsc src/lib/inhire/jobs.ts src/lib/inhire/paths.ts src/lib/inhire/paths.test.ts \
 *     --outDir /tmp/ihpaths --module commonjs --target es2020 --strict \
 *     --esModuleInterop --skipLibCheck --moduleResolution node
 *   node --test /tmp/ihpaths/paths.test.js
 *
 * Os dois assuntos aqui falham de formas opostas e igualmente silenciosas:
 * um caminho a mais faz dado pessoal circular sem ninguém decidir; uma
 * paginação mal lida traz um terço das vagas e desenha um gráfico plausível.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPathPermitido, extrairPagina, JOBS_PAGINATED } from './paths';

// ------------------------------------------------------- lista de caminhos

test('permite o que o painel precisa: listagem de vagas, vaga e campos personalizados', () => {
  assert.equal(isPathPermitido(JOBS_PAGINATED), true);
  assert.equal(isPathPermitido('/jobs/abc-123'), true);
  assert.equal(isPathPermitido('/custom-fields'), true);
});

test('o caminho de listagem é o da referência, não o que eu tinha suposto', () => {
  // A suposição inicial era GET /jobs. O real é POST /jobs/paginated/lean.
  assert.equal(JOBS_PAGINATED, '/jobs/paginated/lean');
  assert.equal(isPathPermitido('/jobs'), false);
});

test('recusa qualquer caminho de candidato', () => {
  // A credencial LÊ estes dados. Só o código impede que sejam pedidos.
  for (const p of [
    '/candidates',
    '/candidates/123',
    '/talents',
    '/talents/123/resume',
    '/applications',
    '/jobs/abc/candidates',
  ]) {
    assert.equal(isPathPermitido(p), false, `${p} não deveria ser permitido`);
  }
});

test('recusa escrita disfarçada de caminho', () => {
  assert.equal(isPathPermitido('/jobs/abc/hire'), false);
  assert.equal(isPathPermitido('/jobs/abc/reject'), false);
  assert.equal(isPathPermitido('/jobs/paginated/full'), false);
});

test('não dá para escapar da lista com barra ou fragmento', () => {
  assert.equal(isPathPermitido('/jobs/../candidates'), false);
  assert.equal(isPathPermitido('/jobs#/../candidates'), false);
  assert.equal(isPathPermitido('/jobs?x=1#/candidates'), false);
  assert.equal(isPathPermitido('//jobs'), false);
  assert.equal(isPathPermitido('https://outro.host/jobs'), false);
});

// ------------------------------------------------------------- paginação

test('lê os formatos comuns de lista', () => {
  for (const chave of ['data', 'items', 'results', 'jobs']) {
    const r = extrairPagina({ [chave]: [{ id: '1' }, { id: '2' }] });
    assert.equal(r.itens.length, 2, `formato "${chave}" não foi lido`);
    assert.equal(r.reconhecido, true);
  }
});

test('array puro na raiz também vale', () => {
  const r = extrairPagina([{ id: '1' }]);
  assert.equal(r.itens.length, 1);
  assert.equal(r.startKey, null);
  assert.equal(r.reconhecido, true);
});

test('formato desconhecido avisa em vez de fingir lista vazia', () => {
  // Sem isto, uma mudança de contrato do outro lado pararia na primeira página
  // e o painel mostraria um terço das vagas sem nenhum sinal.
  const r = extrairPagina({ payload: { vagas: [] } });
  assert.equal(r.reconhecido, false);
  assert.deepEqual(r.itens, []);
});

test('startKey da resposta vira a chave da próxima página', () => {
  // A API usa pagination token: o `startKey` que volta é enviado de novo como
  // `exclusiveStartKey`. Pode ser objeto composto, não só string.
  const r = extrairPagina({ data: [{ id: '1' }], startKey: { id: 'abc', sk: 'x#1' } });
  assert.deepEqual(r.startKey, { id: 'abc', sk: 'x#1' });
});

test('aceita os nomes alternativos da chave de paginação', () => {
  assert.equal(extrairPagina({ data: [], lastEvaluatedKey: 'k' }).startKey, 'k');
  assert.equal(extrairPagina({ data: [], nextStartKey: 'k' }).startKey, 'k');
});

test('fim da lista em qualquer das formas devolve chave nula', () => {
  // null, string vazia, false e objeto vazio já apareceram como "acabou".
  // Tratar qualquer um como chave faria a paginação girar até o teto, gastando
  // o limite que é compartilhado com o MCP do time.
  for (const fim of [null, undefined, '', false, {}]) {
    const r = extrairPagina({ data: [{ id: '1' }], startKey: fim });
    assert.equal(r.startKey, null, `startKey=${JSON.stringify(fim)} deveria encerrar`);
  }
});

test('resposta nula não quebra', () => {
  assert.deepEqual(extrairPagina(null), { itens: [], startKey: null, reconhecido: false });
  assert.equal(extrairPagina('texto').reconhecido, false);
});
