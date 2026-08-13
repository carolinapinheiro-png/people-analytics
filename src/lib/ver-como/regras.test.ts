import test from 'node:test';
import assert from 'node:assert/strict';
import { decidirEscopo, perfilDe, type LinhaAcesso } from './regras';

const ADMIN: LinhaAcesso = { role: 'admin', profile: 'admin', departments: [], job_families: [] };
const LIDER: LinhaAcesso = {
  role: 'viewer', profile: 'dept_leader', departments: ['TECNOLOGIA'], job_families: [],
};
const RH: LinhaAcesso = { role: 'viewer', profile: 'hr_leader', departments: [], job_families: [] };

test('sem alvo, o escopo é o de quem está logado', () => {
  const r = decidirEscopo({ email: 'ana@x.com', propria: LIDER, alvo: null, linhaAlvo: null });
  assert.equal(r.verComo, null);
  assert.equal(r.profile, 'dept_leader');
  assert.deepEqual(r.departments, ['TECNOLOGIA']);
});

test('pedir para ver como si mesmo é a sessão normal, não simulação', () => {
  // Acontece de verdade: dá para clicar no próprio nome na lista de usuários.
  // Se isto contasse como simulação, o admin perderia os próprios poderes
  // sem entender por quê.
  const r = decidirEscopo({ email: 'Ana@X.com', propria: ADMIN, alvo: 'ana@x.com', linhaAlvo: ADMIN });
  assert.equal(r.verComo, null);
  assert.equal(r.role, 'admin');
});

test('não-admin não simula ninguém, mesmo forjando o cabeçalho', () => {
  assert.throws(
    () => decidirEscopo({ email: 'lider@x.com', propria: LIDER, alvo: 'ceo@x.com', linhaAlvo: RH }),
    /apenas admin/,
  );
});

test('admin simulando um líder recebe o escopo DO LÍDER', () => {
  const r = decidirEscopo({ email: 'ana@x.com', propria: ADMIN, alvo: 'lider@x.com', linhaAlvo: LIDER });
  assert.equal(r.profile, 'dept_leader');
  assert.deepEqual(r.departments, ['TECNOLOGIA']);
  assert.deepEqual(r.verComo, { email: 'lider@x.com', profile: 'dept_leader' });
});

test('o e-mail devolvido é sempre o REAL, para a auditoria não mentir', () => {
  // Se aqui voltasse o e-mail simulado, todo registro de acesso sensível
  // gravado durante a conferência sairia em nome de outra pessoa -- e o
  // rastro que existe justamente para responder "quem viu isso?" passaria a
  // responder errado.
  const r = decidirEscopo({ email: 'ana@x.com', propria: ADMIN, alvo: 'lider@x.com', linhaAlvo: LIDER });
  assert.equal(r.email, 'ana@x.com');
});

test('simular derruba o poder de escrita, inclusive simulando outro admin', () => {
  // O caso perigoso é este: simulando um admin, `profile` continua 'admin'
  // (é o que a tela precisa mostrar), então só `role` separa "ver" de
  // "escrever". Sem esta regra, dava para disparar uma sincronização de
  // dentro da identidade de outra pessoa.
  const r = decidirEscopo({ email: 'ana@x.com', propria: ADMIN, alvo: 'outro@x.com', linhaAlvo: ADMIN });
  assert.equal(r.profile, 'admin', 'a tela deve mostrar o que um admin vê');
  assert.equal(r.role, 'viewer', 'mas nada pode ser escrito durante a simulação');
});

test('alvo que não existe no cadastro é erro, não silêncio', () => {
  // Devolver o escopo próprio aqui seria o pior desfecho: a faixa diria
  // "vendo como fulano" enquanto a tela mostraria os dados do admin.
  assert.throws(
    () => decidirEscopo({ email: 'ana@x.com', propria: ADMIN, alvo: 'ninguem@x.com', linhaAlvo: null }),
    /Não há usuário cadastrado/,
  );
});

test('perfil ausente cai no mais restrito, nunca no mais permissivo', () => {
  assert.equal(perfilDe({}), 'dept_leader');
  const r = decidirEscopo({
    email: 'ana@x.com', propria: ADMIN, alvo: 'novo@x.com',
    linhaAlvo: { departments: [], job_families: [] },
  });
  assert.equal(r.profile, 'dept_leader');
});

test('escopo nulo no banco vira lista vazia, e lista vazia não vê nada', () => {
  // `departments: null` chegando como `null` faria `isInScope` explodir ou,
  // pior, passar. Vazio é a resposta certa: cadastro incompleto não vira
  // acesso total por omissão.
  const r = decidirEscopo({
    email: 'ana@x.com', propria: ADMIN, alvo: 'meio@x.com',
    linhaAlvo: { profile: 'dept_leader', departments: null, job_families: null },
  });
  assert.deepEqual(r.departments, []);
  assert.deepEqual(r.jobFamilies, []);
  assert.deepEqual(r.scope.departments, []);
});
