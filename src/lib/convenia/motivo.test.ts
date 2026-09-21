import test from 'node:test';
import assert from 'node:assert/strict';
import { motivoDesligamento, formaDoBloco, blocoSemTextoLivre, classificarSaida } from './pessoas';

test('motivo: aceita string ou objeto com title/name, em qualquer das chaves candidatas', () => {
  assert.equal(motivoDesligamento({ motive: { id: 3, title: 'Proposta de outra empresa' } }), 'Proposta de outra empresa');
  assert.equal(motivoDesligamento({ reason: 'Mudança de cidade' }), 'Mudança de cidade');
  assert.equal(motivoDesligamento({ dismissal_reason: { name: 'Baixo desempenho' } }), 'Baixo desempenho');
});

test('motivo: o TIPO não é motivo, e vazio/"Não informado" não viram categoria', () => {
  assert.equal(motivoDesligamento({ type: { title: 'Pedido de demissão' }, date: '2026-09-10' }), null);
  assert.equal(motivoDesligamento({ motive: 'Não informado' }), null);
  assert.equal(motivoDesligamento({ motive: '  ' }), null);
  assert.equal(motivoDesligamento(null), null);
});

test('motivo: texto livre nunca é lido como motivo', () => {
  assert.equal(motivoDesligamento({ observation: 'conversa difícil com o gestor' }), null);
});

test('forma do bloco publica as chaves com um nível de aninhamento', () => {
  assert.equal(
    formaDoBloco({ date: '2026-09-10', type: { id: 1, title: 'x' }, motive: null }),
    'date, type{id,title}, motive',
  );
  assert.equal(formaDoBloco(undefined), '(vazio)');
});

test('bruto: observação é trocada, a chave fica, o resto passa intacto', () => {
  const b = blocoSemTextoLivre({ date: '2026-09-10', observation: 'texto sensível', comments: '', motive: { title: 'X' } })!;
  assert.equal(b.observation, '[texto livre omitido]');
  assert.equal(b.comments, '');
  assert.deepEqual(b.motive, { title: 'X' });
  assert.equal(b.date, '2026-09-10');
  assert.equal(blocoSemTextoLivre('x'), null);
});

test('quebra de estágio segue quem tomou a decisão, e não cai em outra', () => {
  assert.equal(classificarSaida('Quebra do Contrato de Estágio por parte do Empregado'), 'voluntaria');
  assert.equal(classificarSaida('Quebra do Contrato de Estágio por parte do Empregador'), 'involuntaria');
  assert.equal(classificarSaida('Término de Contrato de Estágio'), 'outra');
});
