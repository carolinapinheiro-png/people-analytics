import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolverAcesso, atingidosPeloPerfil,
  type CadastroDeAcesso, type PerfilDeAcesso,
} from '@/lib/acesso-resolvido';

const HRBP: PerfilDeAcesso = {
  id: 'p1',
  nome: 'HRBP',
  veEmpresaToda: false,
  administraUsuarios: false,
  veIndividual: true,
  tabs: ['overview', 'engagement', 'attrition'],
  subTabs: ['engajamento'],
};

// ===========================================================================
// SEM PERFIL, NADA MUDA
// ===========================================================================
// Os nove cadastros que existem hoje não têm `profile_id`. Se este bloco
// falhar, a migração mudou o acesso de alguém sem ninguém pedir.

test('cadastro sem perfil segue as próprias chaves', () => {
  const a = resolverAcesso(
    { veEmpresaToda: true, administraUsuarios: true, veIndividual: true }, null,
  );
  assert.deepEqual(a.chaves, { global: true, admin: true, individual: true });
  assert.equal(a.profile, 'admin');
  assert.equal(a.perfil, null);
  assert.deepEqual(a.excecoes, []);
});

test('sem perfil, a lista própria e as extras continuam valendo', () => {
  const a = resolverAcesso(
    { veEmpresaToda: false, veIndividual: false, tabs: ['engagement'], extraTabs: ['dei'] },
    null,
  );
  assert.deepEqual(a.tabs, ['engagement']);
  assert.deepEqual(a.extraTabs, ['dei']);
  assert.equal(a.profile, 'dept_leader');
});

// ===========================================================================
// COM PERFIL
// ===========================================================================

test('sem exceção, tudo vem do perfil', () => {
  const a = resolverAcesso({ profileId: 'p1' }, HRBP);
  assert.deepEqual(a.chaves, { global: false, admin: false, individual: true });
  assert.equal(a.profile, 'hrbp');
  assert.deepEqual(a.tabs, ['overview', 'engagement', 'attrition']);
  assert.deepEqual(a.subTabs, ['engajamento']);
  assert.deepEqual(a.excecoes, []);
  assert.deepEqual(a.perfil, { id: 'p1', nome: 'HRBP' });
});

test('nulo é herdar, e não "não"', () => {
  // Esta é a distinção que a migração de 31/08 tinha apagado e que volta a
  // ter dono. Se `null` virasse `false`, todo mundo num perfil global
  // perderia a empresa inteira em silêncio.
  const a = resolverAcesso(
    { profileId: 'p1', veIndividual: null, veEmpresaToda: null }, HRBP,
  );
  assert.equal(a.chaves.individual, true, 'herdou o "sim" do HRBP');
  assert.deepEqual(a.excecoes, []);
});

test('false explícito é exceção e vence o perfil', () => {
  const a = resolverAcesso({ profileId: 'p1', veIndividual: false }, HRBP);
  assert.equal(a.chaves.individual, false);
  assert.deepEqual(a.excecoes, ['veIndividual']);
  // E o rótulo interno acompanha: sem individual, HRBP vira dept_leader.
  assert.equal(a.profile, 'dept_leader');
});

test('valor igual ao do perfil não conta como exceção', () => {
  // Marcar "sim" onde o perfil já diz "sim" não é divergência. Contar isso
  // encheria o cadastro de avisos de exceção que não mudam nada.
  const a = resolverAcesso({ profileId: 'p1', veIndividual: true }, HRBP);
  assert.deepEqual(a.excecoes, []);
});

test('lista própria de abas vence o perfil e aparece como exceção', () => {
  const a = resolverAcesso({ profileId: 'p1', tabs: ['engagement'] }, HRBP);
  assert.deepEqual(a.tabs, ['engagement']);
  assert.deepEqual(a.excecoes, ['tabs']);
});

test('lista igual à do perfil, em outra ordem, não é exceção', () => {
  const a = resolverAcesso(
    { profileId: 'p1', tabs: ['attrition', 'overview', 'engagement'] }, HRBP,
  );
  assert.deepEqual(a.excecoes, []);
});

test('lista vazia é "não definida", e herda', () => {
  // Salvar sem marcar nada é o gesto mais fácil de fazer sem querer, e o
  // resultado dele não pode ser "esta pessoa não vê nada".
  const a = resolverAcesso({ profileId: 'p1', tabs: [] }, HRBP);
  assert.deepEqual(a.tabs, ['overview', 'engagement', 'attrition']);
  assert.deepEqual(a.excecoes, []);
});

test('extra_tabs não sobrevive ao perfil', () => {
  // Duas listas mandando ao mesmo tempo é a combinação que visibleTabs existe
  // para não ter. Quem precisa de mais uma aba ganha lista própria.
  const a = resolverAcesso({ profileId: 'p1', extraTabs: ['comp'] }, HRBP);
  assert.equal(a.extraTabs, null);
  assert.deepEqual(a.tabs, ['overview', 'engagement', 'attrition']);
});

test('o rótulo interno sai das chaves resolvidas, não do que estava gravado', () => {
  // `profile` continua sendo o que os 26 pontos de isGlobalProfile consultam.
  // Se ele viesse do campo antigo, uma pessoa movida para um perfil global
  // continuaria barrada pelo rótulo velho.
  const admin: PerfilDeAcesso = {
    ...HRBP, id: 'p2', nome: 'Admin',
    veEmpresaToda: true, administraUsuarios: true, veIndividual: true,
  };
  const a = resolverAcesso({ profileId: 'p2', profile: 'dept_leader' }, admin);
  assert.equal(a.profile, 'admin');
});

// ===========================================================================
// QUANTOS MUDAM
// ===========================================================================

test('conta quem herda o campo, e ignora quem tem exceção nele', () => {
  const gente: CadastroDeAcesso[] = [
    { profileId: 'p1' },
    { profileId: 'p1' },
    { profileId: 'p1', tabs: ['engagement'] },   // exceção de abas
    { profileId: 'p1', veIndividual: false },    // exceção de individual
    { profileId: 'p9' },                          // outro perfil
    {},                                           // avulso
  ];
  assert.equal(atingidosPeloPerfil(gente, 'p1', 'tabs'), 3,
    'os dois sem nada mais o da exceção de individual');
  assert.equal(atingidosPeloPerfil(gente, 'p1', 'veIndividual'), 3,
    'os dois sem nada mais o da exceção de abas');
});
