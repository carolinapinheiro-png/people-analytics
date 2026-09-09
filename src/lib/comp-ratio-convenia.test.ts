import test from 'node:test';
import assert from 'node:assert/strict';
import {
  montarCompRatio, quartilDe, resumoDaCarga,
  type Banda, type PessoaDoConvenia,
} from '@/lib/comp-ratio-convenia';

/** TECH CLT L4, a faixa real da migração de referência. */
const TECH_CLT_L4: Banda = {
  jobFamily: 'TECH', contract: 'CLT', level: 'L4',
  minimum: 18080, midpoint: 22600, maximum: 27120,
};
const BANDAS = [TECH_CLT_L4];

const pessoa = (over: Partial<PessoaDoConvenia> = {}): PessoaDoConvenia => ({
  conveniaId: 'x1', nome: 'Fulano', salario: 22600,
  jobTypeFamily: 'Product & Technology', department: 'TECHNOLOGY',
  vinculo: 'CLT', level: 'L4', ...over,
});

test('comp-ratio é salário sobre o ponto médio', () => {
  const [l] = montarCompRatio([pessoa({ salario: 20000 })], BANDAS);
  assert.equal(l.comp_ratio, 0.88);
  assert.equal(l.band_midpoint, 22600);
  assert.equal(l.band_family, 'TECH');
  assert.equal(l.sem_banda, null);
});

test('quem está no ponto médio dá exatamente 1', () => {
  assert.equal(montarCompRatio([pessoa()], BANDAS)[0].comp_ratio, 1);
});

test('os quartis seguem a régua da tabela', () => {
  // q1 = 20.340, médio = 22.600, q3 = 24.860, máximo = 27.120
  assert.equal(quartilDe(18000, TECH_CLT_L4), 'Q1');
  assert.equal(quartilDe(20340, TECH_CLT_L4), 'Q1');
  assert.equal(quartilDe(21000, TECH_CLT_L4), 'Q2');
  assert.equal(quartilDe(22600, TECH_CLT_L4), 'Q2');
  assert.equal(quartilDe(24000, TECH_CLT_L4), 'Q3');
  assert.equal(quartilDe(26000, TECH_CLT_L4), 'Q4');
});

test('acima do máximo continua Q4, e não vira erro', () => {
  // Estar fora da faixa por cima é informação, não defeito de cadastro.
  const [l] = montarCompRatio([pessoa({ salario: 40000 })], BANDAS);
  assert.equal(l.quartile, 'Q4');
  assert.equal(l.comp_ratio, 1.77);
  assert.equal(l.sem_banda, null);
});

// ===========================================================================
// QUEM NÃO RESOLVE FICA NA TABELA, COM O MOTIVO
// ===========================================================================
// Sumir com a pessoa faria a aba de Salários mostrar um total menor e parecer
// completa. Comp-ratio nulo sem motivo se lê como falha de carga.

test('sem faixa cadastrada diz que falta a FAIXA, não o cadastro', () => {
  // Os dois casos exigem ações opostas: um é o RH corrigir o Convenia, o outro
  // é o Comp & Ben cadastrar a banda. Confundir manda a pessoa arrumar o que
  // já está certo.
  const [l] = montarCompRatio([pessoa({ level: 'L9' })], BANDAS);
  assert.equal(l.comp_ratio, null);
  assert.match(l.sem_banda!, /Não há faixa cadastrada/);
  assert.equal(l.level, 'L9', 'o level continua na linha');
});

test('cadastro incompleto diz que falta o CADASTRO', () => {
  const [l] = montarCompRatio([pessoa({ jobTypeFamily: null })], BANDAS);
  assert.equal(l.comp_ratio, null);
  assert.match(l.sem_banda!, /unifica/i);
});

test('vínculo sem faixa é motivo próprio', () => {
  const [l] = montarCompRatio([pessoa({ vinculo: 'Aprendiz' })], BANDAS);
  assert.equal(l.comp_ratio, null);
  assert.match(l.sem_banda!, /só para CLT e PJ/);
});

test('sem salário não vira comp-ratio zero', () => {
  // Zero é um número, e um comp-ratio zero na tela diz "essa pessoa ganha
  // muito abaixo da faixa". Ausência de salário não é isso.
  const [l] = montarCompRatio([pessoa({ salario: null })], BANDAS);
  assert.equal(l.comp_ratio, null);
  assert.equal(l.salary, null);
  assert.match(l.sem_banda!, /Sem salário/);
});

test('faixa com ponto médio zero não divide por zero', () => {
  const zerada: Banda = { ...TECH_CLT_L4, midpoint: 0 };
  const [l] = montarCompRatio([pessoa()], [zerada]);
  assert.equal(l.comp_ratio, null);
  assert.match(l.sem_banda!, /sem ponto médio/);
});

test('a linha carrega os campos do Convenia mesmo sem banda', () => {
  const [l] = montarCompRatio(
    [pessoa({ vinculo: 'Sócio', team: 'SRE', jobTitle: 'Eng', empresa: 'NSX', hire: '2024-01-10' })],
    BANDAS,
  );
  assert.equal(l.team, 'SRE');
  assert.equal(l.job_title, 'Eng');
  assert.equal(l.company, 'NSX');
  assert.equal(l.hire, '2024-01-10');
  assert.equal(l.area, 'TECHNOLOGY');
});

test('o resumo agrupa motivos e não lista um por pessoa', () => {
  const linhas = montarCompRatio([
    pessoa({ conveniaId: 'a' }),
    pessoa({ conveniaId: 'b', jobTypeFamily: null }),
    pessoa({ conveniaId: 'c', jobTypeFamily: null }),
    pessoa({ conveniaId: 'd', vinculo: 'Aprendiz' }),
  ], BANDAS);
  const r = resumoDaCarga(linhas);
  assert.equal(r.total, 4);
  assert.equal(r.comRatio, 1);
  assert.equal(r.porMotivo[0].n, 2, 'o motivo mais comum vem primeiro');
  assert.equal(r.porMotivo.length, 2);
});
