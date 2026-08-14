import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dividirLinha, escaparCampo, gerarCsv, lerCsv, linhasDe,
} from './access-csv';

const ABAS = [
  'overview', 'team', 'dei', 'comp', 'demographics', 'engagement',
  'span', 'attrition', 'recruitment', 'individual', 'data',
] as const;

const CAB = 'email,perfil,departamentos,abas,validade,dado individual';

/**
 * Este parser transforma texto colado numa planilha em CONCESSÃO DE ACESSO.
 * É a única entrada do sistema em que uma leitura errada não gera erro: gera
 * um usuário com o escopo de outro, silenciosamente.
 */

// ------------------------------------------------------------ divisão de linha

test('vírgula dentro de aspas não separa coluna', () => {
  // O caso que quebra `split(',')`: a lista de departamentos vem num campo só.
  assert.deepEqual(
    dividirLinha('ana@x.com,dept_leader,"TECHNOLOGY,PRODUCT"'),
    ['ana@x.com', 'dept_leader', 'TECHNOLOGY,PRODUCT'],
  );
});

test('aspas duplicadas viram uma aspa literal', () => {
  assert.deepEqual(dividirLinha('a,"diz ""oi"" aqui",b'), ['a', 'diz "oi" aqui', 'b']);
});

test('ponto e vírgula também separa — é o que o Excel em português exporta', () => {
  assert.deepEqual(dividirLinha('a;b;c'), ['a', 'b', 'c']);
});

test('campo vazio no fim não some', () => {
  assert.deepEqual(dividirLinha('a,b,'), ['a', 'b', '']);
});

test('BOM do Excel e CRLF não viram conteúdo', () => {
  // Sem tirar o BOM, o primeiro cabeçalho vira "﻿email" e nada casa.
  assert.deepEqual(linhasDe('﻿a,b\r\nc,d\r\n'), ['a,b', 'c,d']);
});

// ------------------------------------------------------------------ leitura

test('lê uma linha completa', () => {
  const r = lerCsv(`${CAB}\nana@x.com,dept_leader,"TECHNOLOGY,PRODUCT",comp,2030-01-01,sim`, ABAS);
  assert.equal(r.problemas.length, 0);
  assert.deepEqual(r.linhas[0], {
    email: 'ana@x.com',
    profile: 'dept_leader',
    departments: ['TECHNOLOGY', 'PRODUCT'],
    jobFamilies: [],
    extraTabs: ['comp'],
    jobTitle: '',
    jobLevel: '',
    expiresAt: '2030-01-01',
    canSeeIndividual: 'sim',
  });
});

test('cabeçalho aceita português e acento', () => {
  const r = lerCsv('E-mail,Perfil,Departamentos\nana@x.com,dept_leader,HR', ABAS);
  assert.equal(r.problemas.length, 0);
  assert.deepEqual(r.linhas[0].departments, ['HR']);
});

test('departamento sai em maiúsculas, como o catálogo', () => {
  // O catálogo é MAIÚSCULO. Gravar "technology" produziria uma pessoa com
  // escopo que não casa com departamento nenhum -- e tela vazia.
  const r = lerCsv(`${CAB}\nana@x.com,dept_leader,technology,,,`, ABAS);
  assert.deepEqual(r.linhas[0].departments, ['TECHNOLOGY']);
});

test('perfil inexistente é recusado, não corrigido', () => {
  const r = lerCsv(`${CAB}\nana@x.com,chefao,HR,,,`, ABAS);
  assert.equal(r.linhas.length, 0);
  assert.match(r.problemas[0].motivo, /não existe/);
});

test('aba inexistente derruba a linha inteira', () => {
  // Aceitar a linha ignorando a aba ruim daria um acesso diferente do que a
  // planilha pediu -- e ninguém confere linha a linha depois de importar.
  const r = lerCsv(`${CAB}\nana@x.com,dept_leader,HR,vendas,,`, ABAS);
  assert.equal(r.linhas.length, 0);
  assert.match(r.problemas[0].motivo, /Aba "vendas"/);
});

test('e-mail inválido não entra', () => {
  const r = lerCsv(`${CAB}\nsem-arroba,dept_leader,HR,,,`, ABAS);
  assert.equal(r.linhas.length, 0);
  assert.match(r.problemas[0].motivo, /formato inválido/);
});

test('e-mail repetido recusa a segunda linha em vez de escolher uma', () => {
  // Qual das duas vale? Qualquer resposta seria um palpite sobre permissão.
  const r = lerCsv(
    `${CAB}\nana@x.com,dept_leader,HR,,,\nana@x.com,hrbp,COMMERCIAL,,,`,
    ABAS,
  );
  assert.equal(r.linhas.length, 1);
  assert.equal(r.linhas[0].profile, 'dept_leader');
  assert.match(r.problemas[0].motivo, /repetido/);
});

test('data ilegível é problema, não vira "sem validade"', () => {
  // Virar vazio daria acesso PERMANENTE a quem a planilha queria temporário.
  const r = lerCsv(`${CAB}\nana@x.com,dept_leader,HR,,ontem,`, ABAS);
  assert.equal(r.linhas.length, 0);
  assert.match(r.problemas[0].motivo, /data legível/);
});

test('dado individual aceita as escritas usuais e recusa o resto', () => {
  const ok = lerCsv(`${CAB}\na@x.com,hrbp,HR,,,nao\nb@x.com,hrbp,HR,,,TRUE`, ABAS);
  assert.equal(ok.linhas[0].canSeeIndividual, 'nao');
  assert.equal(ok.linhas[1].canSeeIndividual, 'sim');

  const ruim = lerCsv(`${CAB}\nc@x.com,hrbp,HR,,,talvez`, ABAS);
  assert.equal(ruim.linhas.length, 0);
});

test('vazio em dado individual quer dizer "segue o perfil", não "não"', () => {
  const r = lerCsv(`${CAB}\na@x.com,hrbp,HR,,,`, ABAS);
  assert.equal(r.linhas[0].canSeeIndividual, '');
});

test('sem coluna de e-mail, nada é lido', () => {
  const r = lerCsv('perfil,departamentos\ndept_leader,HR', ABAS);
  assert.equal(r.linhas.length, 0);
  assert.match(r.problemas[0].motivo, /Falta a coluna "email"/);
});

test('arquivo só com cabeçalho avisa em vez de aceitar em silêncio', () => {
  const r = lerCsv(CAB, ABAS);
  assert.equal(r.linhas.length, 0);
  assert.equal(r.problemas.length, 1);
});

test('coluna desconhecida é reportada, não ignorada em silêncio', () => {
  // Se a pessoa escreveu "salario" numa planilha de acesso, ela precisa saber
  // que aquilo não foi lido.
  const r = lerCsv('email,perfil,salario\na@x.com,hrbp,9000', ABAS);
  assert.deepEqual(r.ignorados, ['salario']);
  assert.equal(r.linhas.length, 1);
});

test('uma linha ruim não derruba as boas', () => {
  const r = lerCsv(
    `${CAB}\nboa@x.com,hrbp,HR,,,\nruim,hrbp,HR,,,\noutra@x.com,hrbp,HR,,,`,
    ABAS,
  );
  assert.deepEqual(r.linhas.map((l) => l.email), ['boa@x.com', 'outra@x.com']);
  assert.equal(r.problemas.length, 1);
  assert.equal(r.problemas[0].linha, 3, 'o número da linha é o do editor, não o do índice');
});

// ------------------------------------------------------------------ escrita

test('campo com vírgula sai entre aspas', () => {
  assert.equal(escaparCampo('TECHNOLOGY,PRODUCT'), '"TECHNOLOGY,PRODUCT"');
  assert.equal(escaparCampo('simples'), 'simples');
  assert.equal(escaparCampo(null), '');
});

test('aspas no valor são escapadas', () => {
  assert.equal(escaparCampo('diz "oi"'), '"diz ""oi"""');
});

test('o que sai da exportação volta igual na importação', () => {
  // A promessa que faz o fluxo "exporta, edita no Excel, reimporta" existir.
  // Sem ela, cada exportação vira trabalho manual de tradução.
  const csv = gerarCsv([{
    email: 'ana@x.com',
    profile: 'dept_leader',
    departments: ['TECHNOLOGY', 'PRODUCT'],
    job_families: [],
    extra_tabs: ['comp'],
    job_title: 'Head, Growth',
    job_level: 'Director',
    expires_at: '2030-01-01T00:00:00Z',
    can_see_individual: false,
    last_login_at: '2026-08-14T10:00:00Z',
  }]);

  const volta = lerCsv(csv, ABAS);
  assert.equal(volta.problemas.length, 0);
  assert.deepEqual(volta.linhas[0].departments, ['TECHNOLOGY', 'PRODUCT']);
  assert.deepEqual(volta.linhas[0].extraTabs, ['comp']);
  assert.equal(volta.linhas[0].jobTitle, 'Head, Growth', 'a vírgula do cargo sobreviveu');
  assert.equal(volta.linhas[0].canSeeIndividual, 'nao');
  assert.equal(volta.linhas[0].expiresAt, '2030-01-01');
});

test('a exportação leva o BOM, senão o Excel estraga o acento', () => {
  assert.ok(gerarCsv([]).startsWith('﻿'));
});
