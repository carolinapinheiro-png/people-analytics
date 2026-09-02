import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularCamadas, diagnosticar, type PessoaOrg } from './organograma';

const camadaDe = (r: ReturnType<typeof calcularCamadas>, id: string) =>
  r.find((x) => x.id === id)?.camada;

/**
 * Esta conta decide de quem cada pessoa vê a remuneração. Errar por um degrau
 * mostra a um N-2 o salário dos pares. Os testes abaixo cobrem sobretudo os
 * casos que uma base de RH real tem e que ninguém reproduz à mão: ciclo,
 * supervisor que não existe na lista, e cadeia longa.
 */

test('a cadeia vira camada, e o topo daqui é N-2', () => {
  const org: PessoaOrg[] = [
    { id: 'gm', supervisorId: null },
    { id: 'cto', supervisorId: 'gm' },
    { id: 'head', supervisorId: 'cto' },
    { id: 'dev', supervisorId: 'head' },
  ];
  const r = calcularCamadas(org);
  assert.equal(camadaDe(r, 'gm'), 'N-2');
  assert.equal(camadaDe(r, 'cto'), 'N-3');
  assert.equal(camadaDe(r, 'head'), 'N-4');
  assert.equal(camadaDe(r, 'dev'), 'N-5');
});

test('a âncora só muda o rótulo, não a ordem', () => {
  const org: PessoaOrg[] = [{ id: 'a', supervisorId: null }, { id: 'b', supervisorId: 'a' }];
  const r = calcularCamadas(org, 1);
  assert.equal(camadaDe(r, 'a'), 'N-1');
  assert.equal(camadaDe(r, 'b'), 'N-2');
  // A profundidade relativa é a mesma; é ela que a regra de acesso usa.
  assert.equal(r.find((x) => x.id === 'a')?.profundidade, 0);
  assert.equal(r.find((x) => x.id === 'b')?.profundidade, 1);
});

test('ciclo não trava e não inventa camada', () => {
  // Acontece de verdade: troca de gestor feita pela metade nos dois cadastros.
  const org: PessoaOrg[] = [
    { id: 'a', supervisorId: 'b' },
    { id: 'b', supervisorId: 'a' },
    { id: 'c', supervisorId: null },
  ];
  const r = calcularCamadas(org);
  assert.equal(camadaDe(r, 'a'), undefined, 'quem está no ciclo fica sem camada');
  assert.equal(camadaDe(r, 'b'), undefined);
  assert.equal(camadaDe(r, 'c'), 'N-2', 'e não contamina quem está fora dele');
});

test('quem pendura num ciclo também fica sem camada', () => {
  const org: PessoaOrg[] = [
    { id: 'a', supervisorId: 'b' },
    { id: 'b', supervisorId: 'a' },
    { id: 'filho', supervisorId: 'a' },
  ];
  assert.equal(camadaDe(calcularCamadas(org), 'filho'), undefined);
});

test('supervisor que não está na lista encerra a cadeia ali', () => {
  // Gestor de outra empresa do grupo, ou já desligado. Sabemos que existe
  // alguém acima; não sabemos quem. Chamar essa pessoa de topo é a leitura
  // honesta -- inventar uma camada acima seria palpite, e palpite aqui solta
  // salário.
  const org: PessoaOrg[] = [
    { id: 'x', supervisorId: 'fantasma' },
    { id: 'y', supervisorId: 'x' },
  ];
  const r = calcularCamadas(org);
  assert.equal(camadaDe(r, 'x'), 'N-2');
  assert.equal(camadaDe(r, 'y'), 'N-3');
});

test('vários topos convivem — cada empresa do grupo tem o seu', () => {
  const org: PessoaOrg[] = [
    { id: 'nsx', supervisorId: null },
    { id: 'nsx-1', supervisorId: 'nsx' },
    { id: 'betfair', supervisorId: null },
    { id: 'betfair-1', supervisorId: 'betfair' },
  ];
  const r = calcularCamadas(org);
  assert.equal(camadaDe(r, 'nsx'), 'N-2');
  assert.equal(camadaDe(r, 'betfair'), 'N-2');
  assert.equal(camadaDe(r, 'nsx-1'), 'N-3');
  assert.equal(camadaDe(r, 'betfair-1'), 'N-3');
});

test('cadeia absurdamente longa não trava o processo', () => {
  const org: PessoaOrg[] = [{ id: 'p0', supervisorId: null }];
  for (let i = 1; i <= 60; i++) org.push({ id: `p${i}`, supervisorId: `p${i - 1}` });
  const r = calcularCamadas(org);
  // Os primeiros níveis saem; o corte de segurança impede o laço infinito.
  assert.equal(camadaDe(r, 'p1'), 'N-3');
  assert.ok(r.length > 0);
});

test('o resultado não depende da ordem da lista', () => {
  // O Convenia devolve paginado; a ordem muda entre sincronizações.
  const base: PessoaOrg[] = [
    { id: 'a', supervisorId: null },
    { id: 'b', supervisorId: 'a' },
    { id: 'c', supervisorId: 'b' },
  ];
  const direto = calcularCamadas(base);
  const invertido = calcularCamadas([...base].reverse());
  for (const id of ['a', 'b', 'c']) {
    assert.equal(camadaDe(direto, id), camadaDe(invertido, id), `divergiu em ${id}`);
  }
});

test('o memo não corrompe a camada de quem vem depois', () => {
  // O cálculo guarda o que já resolveu. Um erro na volta do memo daria
  // camadas deslocadas em quem compartilha o mesmo chefe -- exatamente o
  // "errar por um degrau" que mostra salário de par.
  const org: PessoaOrg[] = [
    { id: 'topo', supervisorId: null },
    { id: 'm1', supervisorId: 'topo' },
    { id: 'a', supervisorId: 'm1' },
    { id: 'b', supervisorId: 'm1' },
    { id: 'c', supervisorId: 'a' },
  ];
  const r = calcularCamadas(org);
  assert.equal(camadaDe(r, 'a'), 'N-4');
  assert.equal(camadaDe(r, 'b'), 'N-4', 'irmão tem a mesma camada');
  assert.equal(camadaDe(r, 'c'), 'N-5');
});

test('o diagnóstico conta quem ficou de fora', () => {
  const org: PessoaOrg[] = [
    { id: 'a', supervisorId: null },
    { id: 'b', supervisorId: 'a' },
    { id: 'x', supervisorId: 'y' },
    { id: 'y', supervisorId: 'x' },
  ];
  const d = diagnosticar(org, calcularCamadas(org));
  assert.equal(d.total, 4);
  assert.equal(d.comCamada, 2);
  assert.equal(d.semCamada, 2, 'os dois do ciclo');
  assert.equal(d.topos, 1);
  assert.equal(d.profundidadeMaxima, 1);
});

test('lista vazia não quebra', () => {
  assert.deepEqual(calcularCamadas([]), []);
  assert.equal(diagnosticar([], []).total, 0);
});

// ---------------------------------------------------------------------------
// O ATALHO PELO CACHE IA PARA O LADO ERRADO
// ---------------------------------------------------------------------------
// Havia dois caminhos para atribuir profundidade: subir até o topo real, e
// parar no meio porque o chefe já estava no cache. O primeiro descia somando;
// o segundo descia SUBTRAINDO.
//
// Os onze testes acima passavam com o defeito no lugar. Todos montam cadeias
// curtas ou entram pelo topo, e o atalho só se exercita quando alguém pergunta
// por uma pessoa DUAS ou mais abaixo de alguém já calculado -- que é o caso
// comum numa base de 639 pessoas, e não aparece em nenhum exemplo de três.
//
// Em produção isso deu 45 pessoas com camada acima do topo da empresa, duas
// delas com a string "N--1". `camada` decide até que degrau a pessoa enxerga
// remuneração, então o erro entregava MAIS acesso, e sempre a quem está em
// cadeia longa -- quem deveria ver menos.
// ---------------------------------------------------------------------------

test('o atalho pelo cache desce somando, e não subtraindo', () => {
  // T -> B -> C -> D -> E. Perguntar por C primeiro deixa T, B e C no cache;
  // a pergunta por E entra pelo atalho com DOIS degraus por resolver.
  const pessoas = [
    { id: 'C', supervisorId: 'B' },
    { id: 'E', supervisorId: 'D' },
    { id: 'T', supervisorId: null },
    { id: 'B', supervisorId: 'T' },
    { id: 'D', supervisorId: 'C' },
  ];
  const prof = new Map(calcularCamadas(pessoas).map((c) => [c.id, c.profundidade]));
  assert.equal(prof.get('T'), 0);
  assert.equal(prof.get('B'), 1);
  assert.equal(prof.get('C'), 2);
  assert.equal(prof.get('D'), 3, 'D está abaixo de C, logo mais fundo');
  assert.equal(prof.get('E'), 4, 'com `d--` isto dava 2 — mais raso que o pai');
});

test('ninguém fica mais raso que o próprio chefe', () => {
  // A propriedade que o defeito violava, dita sem depender de números: se A
  // reporta a B, A está mais fundo que B. Vale para qualquer cadeia.
  // A ORDEM da lista é o que exercita o atalho: `p3` primeiro deixa p1, p2 e
  // p3 no cache, e `p6` chega depois com três degraus por resolver. Numa
  // ordem que entra sempre pelo topo, o defeito não aparece -- foi assim que
  // ele passou por onze testes.
  const pessoas = [
    { id: 'p3', supervisorId: 'p2' },
    { id: 'p6', supervisorId: 'p5' },
    { id: 'p1', supervisorId: null },
    { id: 'p2', supervisorId: 'p1' },
    { id: 'p4', supervisorId: 'p3' },
    { id: 'p5', supervisorId: 'p4' },
  ];
  const prof = new Map(calcularCamadas(pessoas).map((c) => [c.id, c.profundidade]));
  for (const p of pessoas) {
    if (!p.supervisorId) continue;
    const meu = prof.get(p.id);
    const doChefe = prof.get(p.supervisorId);
    assert.ok(meu != null && doChefe != null, `${p.id} ficou sem camada`);
    assert.equal(meu, doChefe + 1, `${p.id} deveria estar um degrau abaixo de ${p.supervisorId}`);
  }
});

test('nenhuma profundidade é negativa — não há degrau acima do topo', () => {
  // "N--1" foi para o banco. Nenhuma camada válida tem dois hifens.
  // Chefe cacheado NO TOPO (profundidade 0) e três degraus abaixo dele: é a
  // forma mínima de o `d--` atravessar o zero e sair negativo.
  const pessoas = [
    { id: 'a', supervisorId: null },
    { id: 'd', supervisorId: 'c' },
    { id: 'b', supervisorId: 'a' }, { id: 'c', supervisorId: 'b' },
    { id: 'e', supervisorId: 'd' }, { id: 'f', supervisorId: 'e' },
  ];
  for (const c of calcularCamadas(pessoas)) {
    assert.ok(c.profundidade >= 0, `${c.id} veio com profundidade ${c.profundidade}`);
    assert.ok(!c.camada.includes('--'), `${c.id} veio com camada "${c.camada}"`);
  }
});
