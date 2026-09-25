import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import {
  montarApresentacao, tokensDoDeck, graficosDoDeck, candidatos, rotuloCurto, areaDaResposta,
  type OndaEntrada, type CutEntrada, type DriverEntrada,
} from './dados';
import { preencherSlide, preencherGrafico } from './deck';

const cut = (cutType: string, cutValue: string, n: number, enps: number, risco: number, sat: number, p = 0, pa = 0, d = 0): CutEntrada =>
  ({ cutType, cutValue, n, enps, risco, satisfacao: sat, promotores: p, passivos: pa, detratores: d });
const drv = (driver: string, question: string, cutType: string, cutValue: string, fav: number, score = 4): DriverEntrada =>
  ({ driver, question, cutType, cutValue, n: 40, score, favoravel: fav });

// Números reais de Product (ago/26 e jan/26), reduzidos ao que o teste precisa.
const ago: OndaEntrada = {
  wave: 'ago_2026', label: 'Agosto/26', respondentes: 485, elegiveis: 634, participacao: 76.5,
  elegiveisPorArea: { Product: 40 },
  cuts: [
    cut('company', 'company', 485, 69, 16.1, 8.7),
    cut('area', 'Product', 40, 65, 15.0, 8.4, 28, 10, 2),
    cut('area+funcao', 'Product || Gestores', 7, 100, 14.3, 9.0),
    cut('area+funcao', 'Product || Contribuidores individuais', 33, 58, 15.2, 8.3),
    cut('funcao', 'Gestores', 103, 55, 20.4, 8.3),
    cut('funcao', 'Contribuidores individuais', 382, 73, 14.9, 8.7),
  ],
  importancia: [{ cutType: 'area', cutValue: 'Product', question: 'Carga', r: 0.581 }],
  driversPorArea: [
    drv('Carga de Trabalho e Bem\u2011Estar', 'Carga', 'area', 'Product', 75),
    drv('Carga de Trabalho e Bem\u2011Estar', 'Carga', 'company', 'company', 78.1),
    drv('Gestão', 'Feedback', 'area', 'Product', 80),
    drv('Gestão', 'Feedback', 'company', 'company', 74.2),
    drv('Evento Específico - Copa do Mundo', 'Copa', 'area', 'Product', 90),
    drv('Evento Específico - Copa do Mundo', 'Copa', 'company', 'company', 80),
  ],
  driversAnteriores: [
    drv('Carga de Trabalho e Bem-Estar', 'Carga', 'area', 'Product', 94.6),
    drv('Carga de Trabalho e Bem-Estar', 'Carga', 'company', 'company', 84.3),
    drv('Gestão', 'Feedback', 'area', 'Product', 73.7),
    drv('Gestão', 'Feedback', 'company', 'company', 74.3),
  ],
  ondaAnteriorLabel: 'Janeiro/26',
};
const jan: OndaEntrada = {
  ...ago, wave: 'jan_2026', label: 'Janeiro/26', participacao: 78.9,
  cuts: [cut('company', 'company', 367, 76, 16.6, 8.9), cut('area', 'Product', 38, 84, 7.9, 8.9, 32, 6, 0),
    cut('area+funcao', 'Product || Contribuidores individuais', 30, 87, 6.7, 9.0)],
  driversPorArea: [], driversAnteriores: [], importancia: [],
};
const ORDEM = ['jan_2026', 'ago_2026'];

test('rótulo curto da onda', () => {
  assert.equal(rotuloCurto('Agosto/26'), 'Ago/26');
  assert.equal(rotuloCurto('Julho/25'), 'Jul/25');
});

test('sem exatamente uma área não há apresentação', () => {
  assert.equal(areaDaResposta({ cuts: [cut('area', 'A', 1, 1, 1, 1), cut('area', 'B', 1, 1, 1, 1)] }), null);
  assert.equal(montarApresentacao({ ...ago, cuts: [cut('company', 'company', 1, 1, 1, 1)] }, [ago]), null);
});

test('indicadores, comparações e participação', () => {
  const d = montarApresentacao(ago, [ago, jan], { ordemOndas: ORDEM })!;
  assert.equal(d.area, 'Product');
  assert.equal(d.participacao.taxa, 100);
  assert.deepEqual(d.historico.map((h) => h.curto), ['Jan/26', 'Ago/26']);
  assert.equal(d.ondaAnterior?.curto, 'Jan/26');
  const t = tokensDoDeck(d);
  assert.equal(t.ENPS, '65');
  assert.equal(t.ENPS_SUB, '\u221219 vs Jan/26 · \u22124 vs Flutter Brasil');
  assert.equal(t.RISCO_SUB, '+7,1 pp vs Jan/26 · \u22121,1 pp vs Flutter Brasil');
});

test('o hífen não separável não parte o driver em dois', () => {
  const d = montarApresentacao(ago, [ago, jan], { ordemOndas: ORDEM })!;
  const carga = d.drivers.find((x) => x.nome === 'Carga de Trabalho e Bem-Estar')!;
  assert.equal(carga.favAnt, 94.6);
  assert.equal(d.drivers.length, 2, 'o evento não é driver');
  assert.equal(d.evento?.nome, 'Copa do Mundo');
});

test('população por função traz benchmark e a onda anterior', () => {
  const d = montarApresentacao(ago, [ago, jan], { ordemOndas: ORDEM })!;
  const ic = d.populacoes.find((p) => p.segmento === 'Contribuidores individuais')!;
  assert.equal(ic.enps, 58);
  assert.equal(ic.enpsBench, 73);
  assert.equal(ic.enpsAnterior, 87);
});

test('candidatos: maior queda primeiro; associação só com r', () => {
  const d = montarApresentacao(ago, [ago, jan], { ordemOndas: ORDEM })!;
  const c = candidatos(d);
  assert.equal(c.maioresQuedas[0].p.pergunta, 'Carga');
  assert.equal(c.maisLigadasAoEnps.length, 1);
});

test('tabela de capacidade fixa: linha sem dado sai inteira', () => {
  const xml = '<p:sld xmlns:p="p" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:tbl>'
    + '<a:tr><a:tc><a:txBody><a:p><a:r><a:t>{{D0_R0_C0}}</a:t></a:r></a:p></a:txBody></a:tc></a:tr>'
    + '<a:tr><a:tc><a:txBody><a:p><a:r><a:t>{{D0_R1_C0}}</a:t></a:r></a:p></a:txBody></a:tc></a:tr>'
    + '</a:tbl><a:t>{{AREA}} · {{NAO_EXISTE}}</a:t></p:sld>';
  const r = preencherSlide(xml, { D0_R0_C0: 'Carga', AREA: 'Product' }, { DOMParser, XMLSerializer } as never);
  assert.match(r.xml, /Carga/);
  assert.equal((r.xml.match(/<a:tr>/g) ?? []).length, 1);
  assert.match(r.xml, /Product · —/);
  assert.deepEqual(r.faltando, ['NAO_EXISTE']);
});

test('gráfico: categorias e valores reescritos; nulo não vira zero', () => {
  const C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
  const xml = `<c:chartSpace xmlns:c="${C}"><c:ser><c:tx><c:strRef><c:f>x</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>s0</c:v></c:pt></c:strCache></c:strRef></c:tx>`
    + '<c:cat><c:strRef><c:f>x</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>c0</c:v></c:pt></c:strCache></c:strRef></c:cat>'
    + '<c:val><c:numRef><c:f>x</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="1"/><c:pt idx="0"><c:v>1</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:chartSpace>';
  const out = preencherGrafico(xml, { categorias: ['Jan/26', 'Ago/26'], series: [{ nome: 'Product', valores: [null, 65] }] }, { DOMParser, XMLSerializer } as never);
  assert.match(out, /Product/);
  assert.match(out, /Ago\/26/);
  assert.match(out, /<c:pt idx="1"><c:v>65<\/c:v>/);
  assert.doesNotMatch(out, /<c:pt idx="0"><c:v>0<\/c:v>/);
});

test('gráficos do deck têm as chaves do manifesto', () => {
  const d = montarApresentacao(ago, [ago, jan], { ordemOndas: ORDEM })!;
  const g = graficosDoDeck(d);
  for (const k of ['s5_enps', 's5_risco', 's9_funcao', 's9_tempo', 'd0', 'h_enps', 'h_drivers', 'g_tempo', 'g_funcao']) {
    assert.ok(g[k], k);
  }
});
