/**
 * Testes do agregador e do parser da pesquisa de engajamento.
 *
 *   npx tsc src/lib/aggregator/polly-survey.ts src/lib/aggregator/polly-parser.ts \
 *     src/lib/aggregator/polly-survey.test.ts --outDir /tmp/pollytest \
 *     --module commonjs --target es2020 --strict --esModuleInterop \
 *     --skipLibCheck --moduleResolution node
 *   node --test /tmp/pollytest/polly-survey.test.js
 *
 * O que estes testes protegem, em ordem de risco:
 *
 *  1. AS TRÊS DEFINIÇÕES (eNPS, risco, satisfação). Foram inferidas testando
 *     contra os números publicados; se alguém "corrigir" o corte do risco para
 *     ≤5 porque parece mais razoável, o painel passa a discordar do deck que a
 *     liderança já viu, e ninguém vai saber por quê.
 *  2. A NORMALIZAÇÃO. É onde os erros são silenciosos: uma faixa escrita
 *     diferente não dá erro, só cria um grupo de 3 pessoas ao lado do de 38.
 *  3. O DESCARTE DE COMENTÁRIO. Se um comentário virar nota, a média muda e o
 *     texto vaza para o banco -- os dois piores desfechos deste módulo.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonArea, canonGestor, canonMarca, canonModelo, canonTempo, ordemTempo, limpa,
  computeMetrics, computeCuts, computeDriverImportance, applySuppression,
  N_MINIMO_EXIBICAO, type PollyResponse,
} from './polly-survey';
import { parsePollyExport } from './polly-parser';

const resp = (o: Partial<PollyResponse> = {}): PollyResponse => ({
  area: 'Technology', tempoCasa: '24+ meses', gestor: false, marca: 'Betnacional',
  modelo: 'Híbrido',
  nps: 10, retencao: 10, satisfacao: 9, drivers: {}, ...o,
});

// --------------------------------------------------------------- definições

test('eNPS: promotor é 9-10, detrator é 1-6, passivo 7-8', () => {
  const rs = [
    ...Array(5).fill(0).map(() => resp({ nps: 10 })),
    ...Array(3).fill(0).map(() => resp({ nps: 8 })),
    ...Array(2).fill(0).map(() => resp({ nps: 6 })),
  ];
  const m = computeMetrics(rs);
  assert.equal(m.promotores, 5);
  assert.equal(m.passivos, 3);
  assert.equal(m.detratores, 2);
  assert.equal(m.enps, 30); // (5-2)/10
});

test('eNPS: nota 7 e 8 não são detratoras -- erro clássico de implementação', () => {
  const m = computeMetrics([resp({ nps: 7 }), resp({ nps: 8 })]);
  assert.equal(m.detratores, 0);
  assert.equal(m.enps, 0);
});

test('risco de retenção: conta quem respondeu 6 ou menos, não 5', () => {
  // O corte ≤6 é o único que reproduz os 16,6% publicados em jan/26.
  const rs = [resp({ retencao: 6 }), resp({ retencao: 7 }), resp({ retencao: 10 }), resp({ retencao: 1 })];
  assert.equal(computeMetrics(rs).risco, 50);
});

test('satisfação é média simples, com uma casa', () => {
  const rs = [resp({ satisfacao: 8 }), resp({ satisfacao: 9 }), resp({ satisfacao: 10 })];
  assert.equal(computeMetrics(rs).satisfacao, 9);
});

test('n é o total de pessoas do recorte, não o de quem respondeu a pergunta', () => {
  // É o n que protege o sigilo: precisa refletir quantas pessoas ali estão.
  const m = computeMetrics([resp(), resp({ nps: null }), resp({ nps: null })]);
  assert.equal(m.n, 3);
  assert.equal(m.promotores, 1);
});

test('recorte sem nenhuma resposta válida devolve null, não zero', () => {
  const m = computeMetrics([resp({ nps: null, retencao: null, satisfacao: null })]);
  assert.equal(m.enps, null);
  assert.equal(m.risco, null);
  assert.equal(m.satisfacao, null);
});

// ------------------------------------------------------------ normalização

test('área: unifica PT/EN, espaço duplo e espaço nas bordas', () => {
  assert.equal(canonArea('Tecnologia '), 'Technology');
  assert.equal(canonArea(' Marketing '), 'Marketing');
  assert.equal(canonArea('Comercial'), 'Commercial');
  assert.equal(canonArea('Commercial'), 'Commercial');
  assert.equal(canonArea('Legal  & Compliance'), 'Legal');
  assert.equal(canonArea('Atendimento ao cliente'), 'Customer Service');
});

test('área desconhecida volta limpa, não vira null nem "Outros"', () => {
  // Silenciar uma área nova a esconderia da tela inteira.
  assert.equal(canonArea('Dados '), 'Dados');
});

test('tempo de casa: as três grafias das ondas caem na mesma faixa', () => {
  for (const v of ['[+] 24 meses', '24+ meses', '24+ months', 'mais de 24 meses']) {
    assert.equal(canonTempo(v), '24+ meses', `falhou em "${v}"`);
  }
  for (const v of ['3 meses ou menos', '0-3 meses', '3 months or less', '0 - 3 meses']) {
    assert.equal(canonTempo(v), '0-3 meses', `falhou em "${v}"`);
  }
  for (const v of ['6 - 9 meses', '6-9 meses', '6-9 months', '6 - 9 months']) {
    assert.equal(canonTempo(v), '6-9 meses', `falhou em "${v}"`);
  }
});

test('tempo de casa desconhecido não some do eixo, vai para o fim', () => {
  assert.ok(ordemTempo('coisa nova') > ordemTempo('24+ meses'));
  assert.equal(ordemTempo('0-3 meses'), 0);
});

test('função: reconhece os dois idiomas e recusa chutar no resto', () => {
  assert.equal(canonGestor('Gestor(a): tenho responsabilidade formal sobre a gestão de outras pessoas.'), true);
  assert.equal(canonGestor('Manager: I have formal responsibility for leading other people'), true);
  assert.equal(canonGestor('Contribuidor(a) individual: atuo sem responsabilidade formal.'), false);
  assert.equal(canonGestor('Individual contributor: I work without formal people-management'), false);
  // Não classificar é melhor que empilhar no grupo maior.
  assert.equal(canonGestor('Prefiro não dizer'), null);
  assert.equal(canonGestor(''), null);
});

test('marca: cross-brand nos dois idiomas cai no mesmo grupo', () => {
  assert.equal(canonMarca('Ambas / Função cross-brand'), 'Cross Brand');
  // O valor que este arquivo gravou enquanto encurtava o nome reentra no mesmo
  // grupo -- reimportar uma onda antiga não pode criar um segundo "ambas".
  assert.equal(canonMarca('Ambas'), 'Cross Brand');
  assert.equal(canonMarca('Both/cross-brand'), 'Cross Brand');
  assert.equal(canonMarca('Betnacional'), 'Betnacional');
});

test('limpa: remove espaço duplo e não-quebrável', () => {
  assert.equal(limpa('  Legal   &  Compliance '), 'Legal & Compliance');
});

// ---------------------------------------------------------------- recortes

test('recorte ignora quem não respondeu a dimensão, sem virar grupo vazio', () => {
  const rs = [resp({ gestor: true }), resp({ gestor: false }), resp({ gestor: null })];
  const f = computeCuts(rs, ['funcao']);
  assert.equal(f.length, 2);
  assert.equal(f.reduce((s, c) => s + c.n, 0), 2);
});

test('recorte de empresa soma todo mundo', () => {
  const rs = [resp({ area: 'Technology' }), resp({ area: 'Legal' }), resp({ area: null })];
  const c = computeCuts(rs, ['company']);
  assert.equal(c[0].n, 3);
});

// ---------------------------------------------------------------- sigilo

test('sigilo: esconde a nota abaixo de 5, mantendo o n e o recorte', () => {
  const rows = [{ n: 3, enps: 33, risco: 66 }, { n: 12, enps: 80, risco: 10 }];
  const out = applySuppression(rows, false, ['enps', 'risco']);
  assert.equal(out[0].suprimido, true);
  assert.equal(out[0].enps, null);
  assert.equal(out[0].n, 3, 'o n precisa continuar visível');
  assert.equal(out[1].suprimido, false);
  assert.equal(out[1].enps, 80);
});

test('sigilo: perfil que já vê dado individual vê tudo', () => {
  const out = applySuppression([{ n: 2, enps: 50 }], true, ['enps']);
  assert.equal(out[0].suprimido, false);
  assert.equal(out[0].enps, 50);
});

test('sigilo: o limite é exatamente 5, não 6', () => {
  const out = applySuppression([{ n: N_MINIMO_EXIBICAO, enps: 1 }], false, ['enps']);
  assert.equal(out[0].suprimido, false);
});

// ---------------------------------------------------------------- parser

const CAB = [
  'Polly Id', 'Qual sua área de atuação?', 'Há quanto tempo você trabalha na organização?',
  'Qual das opções descreve melhor sua função?', 'Para qual marca você atua principalmente?',
  'Qual a probabilidade de você recomendar nossa organização como um ótimo lugar para trabalhar? Nessa escala o 1...',
  'Qual a probabilidade de você permanecer trabalhando aqui se recebesse uma oferta idêntica...',
  'No geral, qual o seu nível de satisfação trabalhando na nossa organização? Nessa escala...',
  '[Gestão] "Meu gestor se importa com a minha opinião." (1 = Discordo totalmente / 5 = Concordo totalmente)',
  '(comment) [Gestão] "Meu gestor se importa com a minha opinião." (1 = Discordo totalmente / 5 = Concordo totalmente)',
];

test('parser: lê pelo cabeçalho e monta a resposta', () => {
  const r = parsePollyExport([
    CAB,
    ['x1', 'Tecnologia ', '[+] 24 meses', 'Gestor(a): tenho responsabilidade', 'Betnacional', '10', '9', '8', '5', 'comentário livre'],
  ]);
  assert.equal(r.responses.length, 1);
  const p = r.responses[0];
  assert.equal(p.area, 'Technology');
  assert.equal(p.tempoCasa, '24+ meses');
  assert.equal(p.gestor, true);
  assert.equal(p.nps, 10);
  assert.equal(p.retencao, 9);
  assert.equal(p.satisfacao, 8);
  assert.deepEqual(p.drivers, { 'Gestão||Meu gestor se importa com a minha opinião.': 5 });
});

test('parser: comentário NÃO vira nota nem entra no resultado', () => {
  // Se isto quebrar, texto livre identificável vaza para o banco.
  const r = parsePollyExport([CAB, ['x', 'Legal', '0-3 meses', '', '', '9', '9', '9', '4', 'meu gestor é 5']]);
  const d = r.responses[0].drivers;
  assert.equal(Object.keys(d).length, 1);
  assert.equal(d['Gestão||Meu gestor se importa com a minha opinião.'], 4);
  assert.equal(JSON.stringify(r.responses).includes('meu gestor é 5'), false);
});

test('parser: nota de driver fora de 1-5 é descartada, não entra na média', () => {
  const r = parsePollyExport([CAB, ['x', 'Legal', '0-3 meses', '', '', '9', '9', '9', '77', '']]);
  assert.deepEqual(r.responses[0].drivers, {});
});

test('parser: onda sem eNPS é aceita e reportada, não quebra', () => {
  // É o caso de jul/25: 10 drivers, nenhuma pergunta de eNPS.
  const r = parsePollyExport([
    ['Qual sua área de atuação?', '"O trabalho que realizo é significativo para mim." (1 = Discordo totalmente / 5 = Concordo totalmente)'],
    ['Produto ', '4'],
  ]);
  assert.equal(r.encontrado.nps, false);
  assert.equal(r.encontrado.drivers, 1);
  assert.equal(r.responses[0].area, 'Product');
  // Sem bloco no cabeçalho, o driver entra como "Geral" em vez de se perder.
  assert.equal(r.responses[0].drivers['Geral||O trabalho que realizo é significativo para mim.'], 4);
});

test('parser: linha totalmente vazia do fim do export é descartada', () => {
  const r = parsePollyExport([CAB, ['', '', '', '', '', '', '', '', '', ''], ['x', 'Legal', '0-3 meses', '', '', '9', '9', '9', '4', '']]);
  assert.equal(r.responses.length, 1);
});

// ------------------------------------------------------------- importância

test('importância: correlação positiva aparece; par incompleto não conta', () => {
  const rs: PollyResponse[] = [];
  for (let i = 0; i < 40; i++) {
    const nota = (i % 5) + 1;
    rs.push(resp({ nps: nota * 2, drivers: { 'D||q': nota } }));
  }
  // Sai a linha da empresa E a da área: a associação passou a ser calculada
  // nos dois níveis. Todas estas 40 respostas são de Technology (ver `resp`).
  const imp = computeDriverImportance(rs, 10);
  assert.equal(imp.length, 2);

  const emp = imp.find((i) => i.cutType === 'company')!;
  assert.ok(emp.r > 0.9, `esperava r alto, veio ${emp.r}`);
  assert.equal(emp.n, 40);
  assert.equal(emp.cutValue, 'company');

  const area = imp.find((i) => i.cutType === 'area')!;
  assert.equal(area.cutValue, 'Technology');
  // Mesmo grupo, mesmo número: com uma área só, os dois recortes coincidem.
  assert.equal(area.n, 40);
  assert.equal(area.r, emp.r);
});

test('importância: a associação de cada área sai da MESMA área', () => {
  // O teste que descreve por que isto existe. Em Technology a correlação é
  // perfeita e positiva; em Marketing, invertida. Uma associação calculada só
  // na empresa devolveria a média das duas e não descreveria nenhuma.
  const rs: PollyResponse[] = [];
  for (let i = 0; i < 40; i++) {
    const nota = (i % 5) + 1;
    rs.push(resp({ area: 'Technology', nps: nota * 2, drivers: { 'D||q': nota } }));
    rs.push(resp({ area: 'Marketing', nps: (6 - nota) * 2, drivers: { 'D||q': nota } }));
  }
  const imp = computeDriverImportance(rs, 10);
  const tech = imp.find((i) => i.cutValue === 'Technology')!;
  const mkt = imp.find((i) => i.cutValue === 'Marketing')!;
  assert.ok(tech.r > 0.9, `Technology: ${tech.r}`);
  assert.ok(mkt.r < -0.9, `Marketing: ${mkt.r}`);
  // E a da empresa fica no meio, sem descrever nenhuma das duas.
  const emp = imp.find((i) => i.cutType === 'company')!;
  assert.ok(Math.abs(emp.r) < 0.5, `empresa: ${emp.r}`);
});

test('importância: área abaixo do mínimo não ganha correlação própria', () => {
  // Legal tem 16 respostas em ago/26, e o corte é 30. Ela sai da lista por
  // área -- não vira um `r` frágil com cara de medida.
  const rs: PollyResponse[] = [];
  for (let i = 0; i < 40; i++) {
    rs.push(resp({ area: 'Technology', nps: (i % 5) * 2 + 2, drivers: { 'D||q': (i % 5) + 1 } }));
  }
  for (let i = 0; i < 16; i++) {
    rs.push(resp({ area: 'Legal', nps: (i % 5) * 2 + 2, drivers: { 'D||q': (i % 5) + 1 } }));
  }
  const imp = computeDriverImportance(rs, 30);
  assert.ok(imp.some((i) => i.cutValue === 'Technology'));
  assert.ok(!imp.some((i) => i.cutValue === 'Legal'));
  // A empresa continua tendo -- 56 respostas somadas passam do corte.
  assert.ok(imp.some((i) => i.cutType === 'company'));
});

test('importância: pergunta com poucas respostas fica de fora', () => {
  const rs = Array(5).fill(0).map(() => resp({ drivers: { 'D||q': 4 } }));
  assert.equal(computeDriverImportance(rs, 30).length, 0);
});


// ---------------------------------------------------------------------------
// Modelo de trabalho — pergunta nova em ago/26
// ---------------------------------------------------------------------------

test('modelo de trabalho normaliza pelo nucleo da palavra, nao pela frase', () => {
  // Cada onda escreve a mesma coisa de um jeito. Um dicionario de frases
  // cobriria o que ja vimos e quebraria calado na proxima -- foi exatamente o
  // que aconteceu com tempo de casa ("6-9 months" virou faixa propria).
  for (const v of ['Remoto', '100% remoto', 'Home office', 'REMOTO ']) {
    assert.equal(canonModelo(v), 'Remoto', `nao reconheceu "${v}"`);
  }
  for (const v of ['Híbrido', 'hibrido', 'Modelo híbrido (3x2)']) {
    assert.equal(canonModelo(v), 'Híbrido', `nao reconheceu "${v}"`);
  }
  for (const v of ['Presencial', 'No escritório todos os dias']) {
    assert.equal(canonModelo(v), 'Presencial', `nao reconheceu "${v}"`);
  }
});

test('modelo desconhecido volta como veio, visivel na tela', () => {
  // Somar silenciosamente com um grupo errado seria pior: a nota do grupo
  // muda e ninguem tem como desconfiar.
  assert.equal(canonModelo('Anywhere office 4 dias'), 'Remoto');
  assert.equal(canonModelo('Coisa nova'), 'Coisa nova');
  assert.equal(canonModelo(''), null);
  assert.equal(canonModelo(null), null);
});

test('o recorte por modelo entra em computeCuts', () => {
  const rs = [
    resp({ modelo: 'Remoto', nps: 10 }),
    resp({ modelo: 'Remoto', nps: 10 }),
    resp({ modelo: 'Presencial', nps: 0 }),
  ];
  const cuts = computeCuts(rs);
  const m = cuts.filter((c) => c.cutType === 'modelo');
  assert.equal(m.length, 2);
  assert.equal(m.find((c) => c.cutValue === 'Remoto')?.n, 2);
  assert.equal(m.find((c) => c.cutValue === 'Presencial')?.enps, -100);
});

test('quem nao respondeu o modelo fica fora do recorte, nao num grupo vazio', () => {
  const cuts = computeCuts([resp({ modelo: null })]);
  assert.equal(cuts.filter((c) => c.cutType === 'modelo').length, 0);
});
