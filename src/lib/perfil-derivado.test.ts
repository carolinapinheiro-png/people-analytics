import test from 'node:test';
import assert from 'node:assert/strict';
import { perfilDeChaves, chavesDePerfil, chavesDoCadastro } from './perfil-derivado';
import { ACCESS_PROFILES, isGlobalProfile, canManageUsers, canSeeIndividualData } from './permissions';

/**
 * O perfil virou derivado de três respostas.
 *
 * O teste que mais importa é o de ida e volta: para cada perfil que existe
 * hoje, traduzir para as chaves e voltar tem de devolver o MESMO perfil. Se
 * não devolver, algum cadastro muda de acesso na migração -- e ninguém veria,
 * porque o painel continuaria abrindo normalmente.
 */

test('as três chaves -> o rótulo interno', () => {
  assert.equal(perfilDeChaves({ global: true, admin: true, individual: true }), 'admin');
  assert.equal(perfilDeChaves({ global: true, admin: false, individual: true }), 'hr_leader');
  assert.equal(perfilDeChaves({ global: false, admin: false, individual: true }), 'hrbp');
  assert.equal(perfilDeChaves({ global: false, admin: false, individual: false }), 'dept_leader');
});

test('ida e volta preserva TODO perfil que existe hoje, menos o que foi aposentado', () => {
  for (const p of ACCESS_PROFILES) {
    if (p === 'engagement_viewer') continue; // vira dept_leader + tabs=['engagement']
    assert.equal(perfilDeChaves(chavesDePerfil(p)), p, `${p} não sobrevive à ida e volta`);
  }
});

test('as chaves batem com o que as funções de permissão já respondiam', () => {
  // Se divergirem, a migração muda o acesso de alguém em silêncio.
  for (const p of ACCESS_PROFILES) {
    const c = chavesDePerfil(p);
    assert.equal(c.global, isGlobalProfile(p), `${p}: global`);
    assert.equal(c.admin, canManageUsers(p), `${p}: admin`);
    assert.equal(c.individual, canSeeIndividualData(p), `${p}: individual`);
  }
});

test('admin implica global — não existe admin de uma área só', () => {
  // A combinação não é oferecida na tela, mas se chegasse aqui, "administra
  // usuários" ganharia: quem administra o cadastro alcança todo mundo de
  // qualquer forma.
  assert.equal(perfilDeChaves({ global: true, admin: true, individual: false }), 'admin');
});

test('global implica ver individual, porque não há perfil global sem isso', () => {
  // `hr_leader` e `admin` são os dois globais, e os dois veem individual. A
  // combinação "global sem individual" não tem rótulo -- e o campo por
  // usuário continua podendo negar, que é o caminho certo para esse caso.
  assert.equal(perfilDeChaves({ global: true, admin: false, individual: false }), 'hr_leader');
});

test('o campo por usuário vence a chave do perfil', () => {
  assert.equal(chavesDoCadastro('hrbp', false).individual, false);
  assert.equal(chavesDoCadastro('dept_leader', true).individual, true);
  assert.equal(chavesDoCadastro('hrbp', null).individual, true, 'null = conforme o perfil');
  assert.equal(chavesDoCadastro('dept_leader', undefined).individual, false);
});

test('engagement_viewer traduz para dept_leader, sem dado individual', () => {
  // A aba única dele não é uma chave: é `tabs`. Este teste fixa que a
  // tradução não inventa acesso -- ele continua sem individual e sem global.
  const c = chavesDePerfil('engagement_viewer');
  assert.deepEqual(c, { global: false, admin: false, individual: false });
  assert.equal(perfilDeChaves(c), 'dept_leader');
});
