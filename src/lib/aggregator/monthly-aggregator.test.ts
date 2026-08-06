/**
 * Testes sinteticos do agregador mensal (decisoes da revisao fria de 24/07/2026).
 *
 * Roda com o runner nativo do Node (>=18), sem dependencia nova:
 *   npx tsc src/lib/aggregator/monthly-aggregator.ts src/lib/aggregator/monthly-aggregator.test.ts \
 *     --outDir /tmp/aggtest --module commonjs --target es2020 --strict --esModuleInterop --skipLibCheck
 *   node --test /tmp/aggtest/monthly-aggregator.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateMonth,
  aggregateRange,
  departmentAt,
  isActiveAt,
  leadershipStart,
  levelBucket,
  monthEnd,
  parseBrDate,
  parseBrNumber,
  classifyRaise,
  salaryMovements,
  tenureBucket,
  ageBucket,
  promotionDates,
  contractBucket,
  checkInvariants,
  type HistoryRow,
  type PersonRow,
} from './monthly-aggregator';

// ---------- construtores ----------

const d = (iso: string): Date => {
  const p = parseBrDate(iso);
  if (!p) throw new Error(`data invalida no teste: ${iso}`);
  return p;
};

const person = (over: Partial<PersonRow>): PersonRow => ({
  company: 'NSX BRASIL RECIFE',
  cpf: '111',
  admission: d('2024-01-10'),
  termination: null,
  gender: 'Mulher',
  state: 'PE',
  leadership: 'Não',
  ...over,
});

const hist = (over: Partial<HistoryRow>): HistoryRow => ({
  cpf: '111',
  from: d('2024-01-10'),
  to: null,
  department: 'TECH',
  salary: 10000,
  reason: null,
  ...over,
});

const histMap = (rows: HistoryRow[]): Map<string, HistoryRow[]> => {
  const m = new Map<string, HistoryRow[]>();
  for (const r of rows) {
    const arr = m.get(r.cpf);
    if (arr) arr.push(r);
    else m.set(r.cpf, [r]);
  }
  return m;
};

// ---------- parses ----------

test('parseBrDate: dd/mm/aaaa, ISO, vazios e sentinelas', () => {
  assert.equal(parseBrDate('05/03/2024')?.toISOString().slice(0, 10), '2024-03-05');
  assert.equal(parseBrDate('2024-03-05')?.toISOString().slice(0, 10), '2024-03-05');
  assert.equal(parseBrDate('2024-03-05T12:00:00')?.toISOString().slice(0, 10), '2024-03-05');
  assert.equal(parseBrDate('Não informado'), null);
  assert.equal(parseBrDate('nan'), null);
  assert.equal(parseBrDate(''), null);
  assert.equal(parseBrDate(null), null);
});

test('parseBrNumber: formatos brasileiro e americano', () => {
  assert.equal(parseBrNumber('1.234,56'), 1234.56);
  assert.equal(parseBrNumber('1234.56'), 1234.56);
  assert.equal(parseBrNumber('1,5'), 1.5);
  assert.equal(parseBrNumber(1234.56), 1234.56);
  assert.equal(parseBrNumber('nan'), null);
  assert.equal(parseBrNumber(''), null);
});

test('parseBrNumber: ARMADILHA CONHECIDA — milhar sem centavos', () => {
  // "1.234" (mil duzentos e trinta e quatro, sem centavos) e interpretado como
  // 1.234 — mil vezes menor. Achado da revisao fria de 24/07. Se este teste
  // quebrar porque o comportamento mudou, otimo: atualize o RASCUNHO.md.
  // Enquanto ele passar, o ADAPTADOR e responsavel por garantir que salario
  // sempre chegue com centavos (",00") ou ja numerico.
  assert.equal(parseBrNumber('1.234'), 1.234);
});

// ---------- fronteiras de data (decisao 3: mantidas e medidas) ----------

test('isActiveAt: admissao no dia do corte CONTA como ativo', () => {
  const p = person({ admission: d('2024-06-30') });
  assert.equal(isActiveAt(p, monthEnd(2024, 6)), true);
});

test('isActiveAt: desligamento no dia do corte JA EXCLUI', () => {
  const p = person({ termination: d('2024-06-30') });
  assert.equal(isActiveAt(p, monthEnd(2024, 6)), false);
});

test('isActiveAt: admissao futura nao e ativo (caso das admissoes 2026-08/09)', () => {
  const p = person({ admission: d('2026-08-01') });
  assert.equal(isActiveAt(p, monthEnd(2026, 7)), false);
});

test('isActiveAt: sem admissao nunca e ativo', () => {
  const p = person({ admission: null });
  assert.equal(isActiveAt(p, monthEnd(2024, 6)), false);
});

test('quem sai no ultimo dia do mes: fora do headcount, dentro de leavers', () => {
  const p = person({ termination: d('2024-06-30') });
  const agg = aggregateMonth([p], histMap([hist({})]), 2024, 6, 'nsx_br');
  assert.equal(agg.headcount, 0);
  assert.equal(agg.leavers, 1);
});

// ---------- dedup hibrido (decisao 1) ----------

test('foto por pessoa: 2 vinculos ativos do mesmo CPF = headcount 1', () => {
  const v1 = person({ cpf: '222', admission: d('2023-06-01'), leadership: 'Não' });
  const v2 = person({ cpf: '222', admission: d('2025-07-01'), leadership: 'Sim' });
  const agg = aggregateMonth([v1, v2], histMap([hist({ cpf: '222' })]), 2025, 10, 'nsx_br');
  assert.equal(agg.headcount, 1);
  // vinculo de admissao mais recente representa a pessoa: lideranca do v2
  assert.equal(agg.leaders, 1);
  // dept_data conta a pessoa uma unica vez
  assert.equal(agg.dept_data['TECH'].hc, 1);
});

test('fluxo por evento: duas admissoes do mesmo CPF no mes = 2 joiners', () => {
  const v1 = person({ cpf: '333', admission: d('2024-06-03'), termination: d('2024-06-10') });
  const v2 = person({ cpf: '333', admission: d('2024-06-20') });
  const agg = aggregateMonth([v1, v2], histMap([hist({ cpf: '333' })]), 2024, 6, 'nsx_br');
  assert.equal(agg.joiners, 2);
  assert.equal(agg.leavers, 1);
  assert.equal(agg.headcount, 1); // so o v2 segue ativo no fim do mes
});

// ---------- SEM DEPTO (decisao 4) ----------

test('ativo sem registro vigente entra como SEM DEPTO; soma dos deptos = headcount', () => {
  const comDepto = person({ cpf: '444' });
  const semDepto = person({ cpf: '555' });
  const agg = aggregateMonth(
    [comDepto, semDepto],
    histMap([hist({ cpf: '444' })]), // 555 nao tem historico
    2024, 6, 'nsx_br',
  );
  assert.equal(agg.dept_data['SEM DEPTO']?.hc, 1);
  const soma = Object.values(agg.dept_data).reduce((a, g) => a + g.hc, 0);
  assert.equal(soma, agg.headcount);
});

// ---------- promotions (reconstruidas da aba de historico) ----------

test('promotions conta Motivo="Promoção" com data no mes, para CPFs da BU', () => {
  const p = person({ cpf: '77' });
  const rows = [
    hist({ cpf: '77', from: d('2024-06-05'), reason: 'Promoção' }), // conta
    hist({ cpf: '77', from: d('2024-06-20'), reason: 'Mérito/Reajuste' }), // reajuste, nao conta
    hist({ cpf: '77', from: d('2024-05-30'), reason: 'Promoção' }), // fora do mes
  ];
  const agg = aggregateMonth([p], histMap(rows), 2024, 6, 'nsx_br');
  assert.equal(agg.promotions, 1);
});

test('promotions sem eventos = 0 (0 e afirmacao valida agora)', () => {
  const agg = aggregateMonth([person({})], histMap([hist({})]), 2024, 6, 'nsx_br');
  assert.equal(agg.promotions, 0);
});

test('promotions so conta CPFs da propria BU', () => {
  const nsx = person({ cpf: '1', company: 'NSX BRASIL RECIFE' });
  const bet = person({ cpf: '2', company: 'NSX BETFAIR BRASIL S.A.' });
  const rows = [
    hist({ cpf: '1', from: d('2024-06-05'), reason: 'Promoção' }),
    hist({ cpf: '2', from: d('2024-06-05'), reason: 'Promoção' }),
  ];
  const nsxAgg = aggregateMonth([nsx, bet], histMap(rows), 2024, 6, 'nsx_br');
  const betAgg = aggregateMonth([nsx, bet], histMap(rows), 2024, 6, 'betfair');
  assert.equal(nsxAgg.promotions, 1);
  assert.equal(betAgg.promotions, 1);
});

// ---------- empresa nao mapeada (achado da revisao fria) ----------

test('COMPORTAMENTO ATUAL: empresa fora do COMPANY_TO_BU some em silencio', () => {
  // Documenta o descarte silencioso. O adaptador DEVE validar empresas antes
  // de chamar o agregador — este teste existe para lembrar disso.
  const p = person({ company: 'EMPRESA NOVA LTDA' });
  const agg = aggregateMonth([p], histMap([]), 2024, 6, 'nsx_br');
  assert.equal(agg.headcount, 0);
  assert.equal(agg.joiners, 0);
});

// ---------- genero (espelha serie congelada) ----------

test('genero: trans conta no grupo; % sobre base conhecida (fem+mas), nao headcount', () => {
  const a = person({ cpf: '1', gender: 'Mulher Trans' });
  const b = person({ cpf: '2', gender: 'Homem Trans' });
  const c = person({ cpf: '3', gender: 'Não-binário' }); // fora de fem/mas
  const agg = aggregateMonth([a, b, c], histMap([]), 2024, 6, 'nsx_br');
  assert.equal(agg.gender_female, 1);
  assert.equal(agg.gender_male, 1);
  assert.equal(agg.headcount, 3);
  assert.equal(agg.gender_base, 2); // so os dois com genero binario conhecido
  assert.equal(agg.gender_female_pct, 50); // 1 de 2, nao 1 de 3
});

test('genero sem conhecidos (base 0) nao divide por zero', () => {
  const a = person({ cpf: '1', gender: '' });
  const b = person({ cpf: '2', gender: 'Não informado' });
  const agg = aggregateMonth([a, b], histMap([]), 2024, 6, 'nsx_br');
  assert.equal(agg.gender_base, 0);
  assert.equal(agg.gender_female_pct, 0);
});

// ---------- attrition (decisao 2: fim de mes) ----------

test('attrition_rate = leavers / headcount de fim de mes', () => {
  const fica1 = person({ cpf: '1' });
  const fica2 = person({ cpf: '2' });
  const sai = person({ cpf: '3', termination: d('2024-06-15') });
  const agg = aggregateMonth([fica1, fica2, sai], histMap([]), 2024, 6, 'nsx_br');
  assert.equal(agg.headcount, 2);
  assert.equal(agg.leavers, 1);
  assert.equal(agg.attrition_rate, 50);
});

// ---------- departmentAt ----------

test('departmentAt: em sobreposicao vence o inicio mais recente', () => {
  const rows = [
    hist({ from: d('2023-01-01'), to: null, department: 'OPERATION' }),
    hist({ from: d('2024-01-01'), to: null, department: 'TECH' }),
  ];
  assert.equal(departmentAt(rows, monthEnd(2024, 6))?.department, 'TECH');
});

test('departmentAt: registro encerrado antes da referencia nao vale', () => {
  const rows = [hist({ from: d('2023-01-01'), to: d('2024-05-31'), department: 'TECH' })];
  assert.equal(departmentAt(rows, monthEnd(2024, 6)), null);
});

// ---------- range ----------

test('aggregateRange atravessa a virada de ano', () => {
  const out = aggregateRange([person({})], [hist({})], '2025-11', '2026-02', 'nsx_br');
  assert.deepEqual(
    out.map((m) => m.month),
    ['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01'],
  );
});

test('monthEnd respeita ano bissexto', () => {
  assert.equal(monthEnd(2024, 2).toISOString().slice(0, 10), '2024-02-29');
  assert.equal(monthEnd(2025, 2).toISOString().slice(0, 10), '2025-02-28');
});

// ---------- reconstrucao historica (lideranca + nivel), decisao 28/07 ----------

test('levelBucket: L3, "Level 3", "3" e ausencias', () => {
  assert.equal(levelBucket('L3'), 3);
  assert.equal(levelBucket('Level 3'), 3);
  assert.equal(levelBucket('3'), 3);
  assert.equal(levelBucket('Não informado'), null);
  assert.equal(levelBucket(''), null);
  assert.equal(levelBucket(null), null);
});

test('leadershipStart: data a transicao (nao-lider -> lider)', () => {
  const rows = [
    hist({ from: d('2024-01-10'), cargo: 'Software Engineer' }),
    hist({ from: d('2025-06-01'), cargo: 'Engineering Manager' }),
  ];
  assert.equal(leadershipStart(rows)?.toISOString().slice(0, 10), '2025-06-01');
});

test('leadershipStart: quem ja entrou lider nao tem transicao (null)', () => {
  const rows = [hist({ from: d('2024-01-10'), cargo: 'Head of Design' })];
  assert.equal(leadershipStart(rows), null);
});

test('leadershipStart: sem cargo de lideranca no historico -> null', () => {
  const rows = [hist({ from: d('2024-01-10'), cargo: 'Data Analyst' })];
  assert.equal(leadershipStart(rows), null);
});

test('promotionDates: filtra Motivo="Promoção"', () => {
  const rows = [
    hist({ from: d('2025-06-01'), reason: 'Promoção' }),
    hist({ from: d('2025-09-01'), reason: 'Mérito/Reajuste' }),
    hist({ from: d('2026-01-01'), reason: 'promocao' }),
  ];
  assert.equal(promotionDates(rows).length, 2);
});

test('lideranca da epoca: lider hoje deixa de ser lider antes da transicao', () => {
  const p = person({ cpf: '900', leadership: 'Sim', admission: d('2024-01-10') });
  const rows = histMap([
    hist({ cpf: '900', from: d('2024-01-10'), cargo: 'Software Engineer' }),
    hist({ cpf: '900', from: d('2025-06-01'), cargo: 'Engineering Manager' }),
  ]);
  // antes da transicao: nao e lider
  assert.equal(aggregateMonth([p], rows, 2025, 1, 'nsx_br').leaders, 0);
  // no mes atual (ancora): e lider
  assert.equal(aggregateMonth([p], rows, 2026, 1, 'nsx_br').leaders, 1);
});

test('lideranca sem transicao detectada mantem lider (nao fabrica recuo)', () => {
  const p = person({ cpf: '901', leadership: 'Sim', admission: d('2024-01-10') });
  const rows = histMap([hist({ cpf: '901', from: d('2024-01-10'), cargo: 'VP Finance' })]);
  assert.equal(aggregateMonth([p], rows, 2025, 1, 'nsx_br').leaders, 1);
});

test('nivel da epoca: recua 1 por promocao posterior; ancora exata', () => {
  const p = person({ cpf: '902', level: 4, admission: d('2024-01-10') });
  const rows = histMap([
    hist({ cpf: '902', from: d('2024-01-10'), cargo: 'Analyst' }),
    hist({ cpf: '902', from: d('2025-06-01'), reason: 'Promoção' }),
  ]);
  // antes da promocao: L3
  assert.equal(aggregateMonth([p], rows, 2025, 1, 'nsx_br').level_base['L3'], 1);
  // depois (ancora): L4
  assert.equal(aggregateMonth([p], rows, 2026, 1, 'nsx_br').level_base['L4'], 1);
});

test('nivel ausente cai em "NA" no level_base', () => {
  const p = person({ cpf: '903', level: null, admission: d('2024-01-10') });
  const m = aggregateMonth([p], histMap([]), 2026, 1, 'nsx_br');
  assert.equal(m.level_base['NA'], 1);
});

// ---------- movimentacoes salariais (merito x promocao x dissidio) ----------

test('classifyRaise: promocao, merito, dissidio e nulos', () => {
  assert.equal(classifyRaise('Promoção'), 'promocao');
  assert.equal(classifyRaise('Mérito/Reajuste'), 'merito');
  assert.equal(classifyRaise('Reajuste'), 'merito');
  assert.equal(classifyRaise('Dissídio'), 'dissidio');
  assert.equal(classifyRaise('Antecipação de dissidio'), 'dissidio');
  assert.equal(classifyRaise('Acordo coletivo'), 'dissidio');
  assert.equal(classifyRaise('Admissão'), null);
  assert.equal(classifyRaise(''), null);
});

test('salaryMovements: delta vs ultimo salario conhecido', () => {
  const rows = [
    hist({ from: d('2024-01-10'), salary: 10000, reason: 'Admissão' }),
    hist({ from: d('2025-03-01'), salary: 11000, reason: 'Mérito/Reajuste' }),
    hist({ from: d('2025-09-01'), salary: 15000, reason: 'Promoção' }),
  ];
  const ev = salaryMovements(rows);
  assert.equal(ev.length, 2);
  assert.deepEqual(ev.map((e) => [e.type, e.delta]), [['merito', 1000], ['promocao', 4000]]);
});

test('salaryMovements: registro sem salario nao vira baseline nem evento', () => {
  const rows = [
    hist({ from: d('2024-01-10'), salary: 8000, reason: 'Admissão' }),
    hist({ from: d('2024-06-01'), salary: null, reason: 'Alteração de função' }),
    hist({ from: d('2025-02-01'), salary: 9000, reason: 'Dissídio' }),
  ];
  const ev = salaryMovements(rows);
  assert.equal(ev.length, 1);
  assert.deepEqual([ev[0].type, ev[0].delta], ['dissidio', 1000]);
});

test('raise_events agrega por tipo no mes correto', () => {
  const p = person({ cpf: '950', admission: d('2024-01-10') });
  const rows = histMap([
    hist({ cpf: '950', from: d('2024-01-10'), salary: 10000, reason: 'Admissão' }),
    hist({ cpf: '950', from: d('2025-03-15'), salary: 12000, reason: 'Mérito/Reajuste' }),
  ]);
  const mar = aggregateMonth([p], rows, 2025, 3, 'nsx_br');
  assert.equal(mar.raise_events.merito.n, 1);
  assert.equal(mar.raise_events.merito.delta, 2000);
  const abr = aggregateMonth([p], rows, 2025, 4, 'nsx_br');
  assert.equal(abr.raise_events.merito.n, 0);
});

// ---------- cotas (PCD/aprendiz) e lideranca por depto ----------

test('pcd/apprentice contam atributos atuais dos ativos', () => {
  const ppl = [
    person({ cpf: '960', pcd: true }),
    person({ cpf: '961', apprentice: true }),
    person({ cpf: '962' }),
  ];
  const m = aggregateMonth(ppl, histMap([]), 2026, 1, 'nsx_br');
  assert.equal(m.pcd, 1);
  assert.equal(m.apprentice, 1);
});

test('leader_dept quebra lideranca por depto e genero (da epoca)', () => {
  const ppl = [
    person({ cpf: '970', leadership: 'Sim', gender: 'Mulher' }),
    person({ cpf: '971', leadership: 'Sim', gender: 'Homem' }),
    person({ cpf: '972', leadership: 'Não', gender: 'Mulher' }),
  ];
  const rows = histMap([
    hist({ cpf: '970', from: d('2024-01-10'), department: 'TECH' }),
    hist({ cpf: '971', from: d('2024-01-10'), department: 'TECH' }),
    hist({ cpf: '972', from: d('2024-01-10'), department: 'TECH' }),
  ]);
  const m = aggregateMonth(ppl, rows, 2026, 1, 'nsx_br');
  assert.equal(m.leader_dept['TECH'].leaders, 2);
  assert.equal(m.leader_dept['TECH'].female, 1);
});

// ---------- tempo de casa ----------

test('tenureBucket: faixas por data de admissao', () => {
  const ref = monthEnd(2026, 1);
  assert.equal(tenureBucket(d('2025-12-01'), ref), '0-3m');
  assert.equal(tenureBucket(d('2025-09-01'), ref), '3-6m');
  assert.equal(tenureBucket(d('2025-04-01'), ref), '6-12m');
  assert.equal(tenureBucket(d('2024-06-01'), ref), '1-2a');
  assert.equal(tenureBucket(d('2022-06-01'), ref), '2-5a');
  assert.equal(tenureBucket(d('2018-01-01'), ref), '5a+');
  assert.equal(tenureBucket(null, ref), 'Não informado');
});

test('tenure_base distribui ativos por faixa', () => {
  const ppl = [
    person({ cpf: '980', admission: d('2025-12-01') }),
    person({ cpf: '981', admission: d('2022-06-01') }),
  ];
  const m = aggregateMonth(ppl, histMap([]), 2026, 1, 'nsx_br');
  assert.equal(m.tenure_base['0-3m'], 1);
  assert.equal(m.tenure_base['2-5a'], 1);
});

// ---------- demograficos ----------

test('ageBucket: faixas etarias por nascimento', () => {
  const ref = monthEnd(2026, 1);
  assert.equal(ageBucket(d('2005-01-01'), ref), '<25');
  assert.equal(ageBucket(d('1995-01-01'), ref), '25-34');
  assert.equal(ageBucket(d('1985-01-01'), ref), '35-44');
  assert.equal(ageBucket(d('1975-01-01'), ref), '45-54');
  assert.equal(ageBucket(d('1960-01-01'), ref), '55+');
  assert.equal(ageBucket(null, ref), 'Não informado');
});

test('demographics agrega idade, raca, estado civil e origem', () => {
  const ppl = [
    person({ cpf: '990', birth: d('1995-01-01'), race: 'Parda', marital: 'Solteiro(a)', origin: 'Pernambuco' }),
    person({ cpf: '991', birth: d('1985-01-01'), race: 'Branca', marital: 'Casado(a)', origin: 'São Paulo' }),
  ];
  const m = aggregateMonth(ppl, histMap([]), 2026, 1, 'nsx_br');
  assert.equal(m.demographics.age['25-34'], 1);
  assert.equal(m.demographics.age['35-44'], 1);
  assert.equal(m.demographics.race['Parda'], 1);
  assert.equal(m.demographics.marital['Casado(a)'], 1);
  assert.equal(m.demographics.origin['São Paulo'], 1);
});

test('race_cross cruza raca x genero x lideranca', () => {
  const ppl = [
    person({ cpf: 'a', race: 'Preta', gender: 'Mulher', leadership: 'Sim' }),
    person({ cpf: 'b', race: 'Preta', gender: 'Homem', leadership: 'Não' }),
    person({ cpf: 'c', race: 'Branca', gender: 'Mulher', leadership: 'Não' }),
  ];
  const rows = histMap([
    hist({ cpf: 'a', from: d('2024-01-10'), cargo: 'Head' }),
    hist({ cpf: 'b', from: d('2024-01-10'), cargo: 'Analyst' }),
    hist({ cpf: 'c', from: d('2024-01-10'), cargo: 'Analyst' }),
  ]);
  const m = aggregateMonth(ppl, rows, 2026, 1, 'nsx_br');
  assert.equal(m.race_cross['Preta'].total, 2);
  assert.equal(m.race_cross['Preta'].female, 1);
  assert.equal(m.race_cross['Preta'].leaders, 1);
  assert.equal(m.race_cross['Preta'].female_leaders, 1);
  assert.equal(m.race_cross['Branca'].total, 1);
});

// ---------- evolucao CLT/PJ (contract_mix) ----------

test('contractBucket normaliza os textos livres de Vinculo', () => {
  assert.equal(contractBucket('CLT'), 'CLT');
  assert.equal(contractBucket('Pessoa Jurídica'), 'PJ');
  assert.equal(contractBucket('pj'), 'PJ');
  assert.equal(contractBucket('Aprendiz'), 'Aprendiz');
  assert.equal(contractBucket('Diretor Estatutário'), 'Estatutário/Sócio');
  assert.equal(contractBucket('Associado'), 'Estatutário/Sócio');
  // Intermitente e celetista: jornada variavel, nao regime a parte.
  assert.equal(contractBucket('Contrato Intermitente'), 'CLT');
  // Sem informacao nao pode virar uma faixa propria (o grafico e do vinculo,
  // e todo ativo tem um): cai no default.
  assert.equal(contractBucket(null), 'CLT');
});

test('contract_mix usa o vinculo DA EPOCA, nao o atual', () => {
  // Pessoa entrou PJ e virou CLT em 2026-03. O snapshot atual diz CLT, mas
  // janeiro tem que continuar contando ela como PJ -- senao a conversao
  // reescreve o passado e o grafico mente sobre quando a virada aconteceu.
  const p = person({ cpf: '700', admission: d('2025-01-10'), vinculo: 'CLT' });
  const h = histMap([
    hist({ cpf: '700', from: d('2025-01-10'), to: d('2026-02-28'), vinculo: 'Pessoa Jurídica' }),
    hist({ cpf: '700', from: d('2026-03-01'), to: null, vinculo: 'CLT' }),
  ]);
  const jan = aggregateMonth([p], h, 2026, 1, 'nsx_br');
  assert.equal(jan.contract_mix.PJ, 1);
  assert.equal(jan.contract_mix.CLT, 0);

  const abr = aggregateMonth([p], h, 2026, 4, 'nsx_br');
  assert.equal(abr.contract_mix.CLT, 1);
  assert.equal(abr.contract_mix.PJ, 0);
});

test('contract_mix cai no vinculo do snapshot quando nao ha registro vigente', () => {
  const p = person({ cpf: '701', admission: d('2026-01-05'), vinculo: 'Pessoa Jurídica' });
  const m = aggregateMonth([p], histMap([]), 2026, 1, 'nsx_br');
  assert.equal(m.contract_mix.PJ, 1);
});

test('contract_mix sempre traz as 4 chaves e soma o headcount', () => {
  const ppl = [
    person({ cpf: '710', vinculo: 'CLT' }),
    person({ cpf: '711', vinculo: 'Pessoa Jurídica' }),
    person({ cpf: '712', vinculo: 'Aprendiz' }),
  ];
  const m = aggregateMonth(ppl, histMap([]), 2026, 1, 'nsx_br');
  assert.deepEqual(Object.keys(m.contract_mix).sort(), ['Aprendiz', 'CLT', 'Estatutário/Sócio', 'PJ']);
  // Faixa zerada existe (o empilhado nao pode trocar de cor no meio da serie).
  assert.equal(m.contract_mix['Estatutário/Sócio'], 0);
  const soma = Object.values(m.contract_mix).reduce((a, b) => a + b, 0);
  assert.equal(soma, m.headcount);
});

// ---------- invariantes (a trava da importacao) ----------

test('checkInvariants aprova um mes coerente do proprio agregador', () => {
  const ppl = [
    person({ cpf: '800', gender: 'Mulher', vinculo: 'CLT' }),
    person({ cpf: '801', gender: 'Homem', vinculo: 'Pessoa Jurídica', leadership: 'Sim' }),
  ];
  const m = aggregateMonth(ppl, histMap([hist({ cpf: '800' }), hist({ cpf: '801' })]), 2026, 1, 'nsx_br');
  assert.deepEqual(checkInvariants(m), []);
});

test('checkInvariants pega soma de departamento que nao fecha', () => {
  const m = aggregateMonth([person({ cpf: '810' })], histMap([hist({ cpf: '810' })]), 2026, 1, 'nsx_br');
  // Simula o erro classico: alguem editou o agregado na mao e o depto ficou a mais.
  const quebrado = { ...m, dept_data: { ...m.dept_data, TECH: { ...m.dept_data['TECH'], hc: 99 } } };
  const issues = checkInvariants(quebrado);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /departamentos/);
});

test('checkInvariants pega nivel, tempo de casa e vinculo fora do headcount', () => {
  const m = aggregateMonth([person({ cpf: '820' })], histMap([hist({ cpf: '820' })]), 2026, 1, 'nsx_br');
  assert.match(checkInvariants({ ...m, level_base: { L1: 5 } })[0], /níveis/);
  assert.match(checkInvariants({ ...m, tenure_base: { '0-3m': 7 } })[0], /tempo de casa/);
  assert.match(
    checkInvariants({ ...m, contract_mix: { ...m.contract_mix, CLT: 9 } })[0],
    /vínculo/,
  );
});

test('checkInvariants nao reclama de bloco vazio (Betfair/Flutter)', () => {
  const m = aggregateMonth([person({ cpf: '830' })], histMap([hist({ cpf: '830' })]), 2026, 1, 'nsx_br');
  const semDimensoes = {
    ...m,
    dept_data: {}, level_base: {}, tenure_base: {}, dept_breakdown: {},
    contract_mix: { CLT: 0, PJ: 0, Aprendiz: 0, 'Estatutário/Sócio': 0 } as typeof m.contract_mix,
  };
  assert.deepEqual(checkInvariants(semDimensoes), []);
});

// ---------- recorte de dimensao unica sobre a serie ----------

test('applySeriesFilter: headcount vem da contagem por faixa, nao de rateio', async () => {
  const { applySeriesFilter } = await import('../../data/series-filter');
  const meses = [
    { month: '2026-01', headcount: 100, leavers: 5, level_base: { L4: 20, L5: 10 } },
    { month: '2026-02', headcount: 110, leavers: 3, level_base: { L4: 25, L5: 12 } },
  ] as never[];
  const r = applySeriesFilter(meses, [], 'level', 'L4');
  assert.equal(r.active, true);
  assert.equal(r.months[0].headcount, 20);
  assert.equal(r.months[1].headcount, 25);
  // 20% do quadro nao vira 20% das saidas: sem desligado no recorte, e zero.
  assert.equal(r.months[0].leavers, 0);
});

test('applySeriesFilter: saidas contadas pessoa a pessoa, no mes certo', async () => {
  const { applySeriesFilter } = await import('../../data/series-filter');
  const meses = [
    { month: '2026-01', headcount: 100, leavers: 9, level_base: { L4: 20 } },
    { month: '2026-02', headcount: 100, leavers: 9, level_base: { L4: 20 } },
  ] as never[];
  const saidas = [
    { data_desligamento: '2026-01-15', level: 'L4', vinculo: 'CLT', tempo_casa_dias: 400 },
    { data_desligamento: '2026-01-20', level: 'L4', vinculo: 'PJ', tempo_casa_dias: 40 },
    { data_desligamento: '2026-02-03', level: 'L5', vinculo: 'CLT', tempo_casa_dias: 400 },
  ] as never[];
  const r = applySeriesFilter(meses, saidas, 'level', 'L4');
  assert.equal(r.months[0].leavers, 2);
  assert.equal(r.months[1].leavers, 0);            // a de fev e L5
  assert.equal(r.months[0].attrition_rate, 10);     // 2/20
});

test('applySeriesFilter: dimensoes sem valor exato saem indefinidas, nao zeradas', async () => {
  const { applySeriesFilter } = await import('../../data/series-filter');
  const meses = [
    { month: '2026-01', headcount: 100, gender_female: 40, level_base: { L4: 20 },
      demographics: { age: { '25-34': 50 } }, race_cross: { Branca: { total: 60 } } },
  ] as never[];
  const r = applySeriesFilter(meses, [], 'level', 'L4');
  // undefined obriga quem desenha a tratar; zero passaria por medicao.
  assert.equal(r.months[0].demographics, undefined);
  assert.equal(r.months[0].race_cross, undefined);
  assert.equal(r.suppressed.length > 0, true);
});

test('applySeriesFilter: sem recorte devolve a serie intacta', async () => {
  const { applySeriesFilter } = await import('../../data/series-filter');
  const meses = [{ month: '2026-01', headcount: 100, gender_female: 40 }] as never[];
  const r = applySeriesFilter(meses, [], null, null);
  assert.equal(r.active, false);
  assert.equal(r.months[0].gender_female, 40);
});
