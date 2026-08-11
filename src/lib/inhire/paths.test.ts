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
import { isPathPermitido, extrairPagina } from './paths';

// ------------------------------------------------------- lista de caminhos

test('permite o que o painel precisa: vagas e campos personalizados', () => {
  assert.equal(isPathPermitido('/jobs'), true);
  assert.equal(isPathPermitido('/jobs?limit=100'), true);
  assert.equal(isPathPermitido('/jobs?cursor=abc123&limit=100'), true);
  assert.equal(isPathPermitido('/jobs/abc-123'), true);
  assert.equal(isPathPermitido('/jobs/abc-123/positions'), true);
  assert.equal(isPathPermitido('/custom-fields'), true);
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
  assert.equal(r.proximo, null);
  assert.equal(r.reconhecido, true);
});

test('formato desconhecido avisa em vez de fingir lista vazia', () => {
  // Sem isto, uma mudança de contrato do outro lado pararia na primeira página
  // e o painel mostraria um terço das vagas sem nenhum sinal.
  const r = extrairPagina({ payload: { vagas: [] } });
  assert.equal(r.reconhecido, false);
  assert.deepEqual(r.itens, []);
});

test('cursor vira a próxima página, com o limite máximo', () => {
  const r = extrairPagina({ data: [{ id: '1' }], nextCursor: 'xyz' });
  assert.equal(r.proximo, '/jobs?cursor=xyz&limit=100');
});

test('cursor com caractere especial é escapado', () => {
  const r = extrairPagina({ data: [], nextCursor: 'a b&c=d' });
  assert.equal(r.proximo, '/jobs?cursor=a%20b%26c%3Dd&limit=100');
  assert.equal(isPathPermitido(r.proximo!), true, 'o caminho gerado precisa passar na lista');
});

test('fim da lista em qualquer das formas devolve cursor nulo', () => {
  // null, string vazia e false já apareceram como "acabou" em APIs diferentes.
  // Tratar qualquer uma como cursor faria a paginação girar até o teto,
  // gastando o limite que é compartilhado com o MCP do time.
  for (const fim of [null, undefined, '', false]) {
    const r = extrairPagina({ data: [{ id: '1' }], nextCursor: fim });
    assert.equal(r.proximo, null, `nextCursor=${JSON.stringify(fim)} deveria encerrar`);
  }
});

test('resposta nula não quebra', () => {
  assert.deepEqual(extrairPagina(null), { itens: [], proximo: null, reconhecido: false });
  assert.equal(extrairPagina('texto').reconhecido, false);
});
