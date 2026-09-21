import test from 'node:test';
import assert from 'node:assert/strict';
import {
  paraLeaverRow, mesesDeCasa, diasDeCasa, ROTULO_TIPO, type ConveniaLeaverRow,
} from './leavers.functions';

/**
 * `paraLeaverRow` é o que faz a aba de Desligamentos passar a ler
 * `convenia_leavers` em vez da planilha manual (`leavers`) -- estes testes
 * cobrem sobretudo os casos onde o dado do Convenia ainda não convergiu
 * (campo em branco) e a matemática de data, que é fácil de errar por um mês
 * ou um dia sem que nada acuse.
 */

const base: ConveniaLeaverRow = {
  convenia_id: '123',
  nome: 'Fulano de Tal',
  cargo: 'Analista',
  department: 'operation',
  hiring_month: '2024-03',
  dismissal_month: '2026-09',
  dismissal_date: '2026-09-10',
  dismissal_type: 'Demissão fora do contrato de experiência - Pedido do Empregado',
  // Em CENTAVOS, como o Convenia realmente manda no detalhe de desligado --
  // R$5.500,00. Ver o teste dedicado logo abaixo e o comentário em
  // `paraLeaverRow`.
  salary: 550000,
  level: 'L2',
  job_type_family: 'Customer Operations',
  genero: 'F',
  raca: 'Parda',
  vinculo: 'CLT',
  marca: 'NSX',
  empresa: 'NSX São Paulo',
};

test('marca e empresa passam adiante -- o filtro de marca e o quadro por empresa dependem delas', () => {
  const row = paraLeaverRow(base);
  assert.equal(row.marca, 'NSX');
  assert.equal(row.empresa, 'NSX São Paulo');
});

test('mesesDeCasa conta meses inteiros entre admissão e desligamento', () => {
  assert.equal(mesesDeCasa('2024-03', '2026-09-10'), 30);
});

test('mesesDeCasa é null sem uma das duas pontas', () => {
  assert.equal(mesesDeCasa(null, '2026-09-10'), null);
  assert.equal(mesesDeCasa('2024-03', null), null);
});

test('diasDeCasa conta a partir do dia 01 do mês de admissão', () => {
  // 2024-03-01 até 2026-09-10: dois anos e meio e alguns dias.
  const dias = diasDeCasa('2024-03', '2026-09-10');
  assert.ok(dias != null && dias > 900 && dias < 950, `veio ${dias}`);
});

test('departamento é normalizado (trim + uppercase), como o resto do painel', () => {
  const row = paraLeaverRow(base);
  assert.equal(row.departamento, 'OPERATION');
});

test('tipo_desligamento_agrupado usa a mesma classificação de sync.server.ts', () => {
  const row = paraLeaverRow(base);
  assert.equal(row.tipo_desligamento_agrupado, ROTULO_TIPO.voluntaria);
  assert.equal(row.tipo_desligamento_agrupado, 'Voluntário');

  const involuntario = paraLeaverRow({
    ...base,
    dismissal_type: 'Demissão SEM justa causa fora do contrato de experiência - Pedido da Empresa',
  });
  assert.equal(involuntario.tipo_desligamento_agrupado, 'Involuntário');

  const outros = paraLeaverRow({ ...base, dismissal_type: 'Rescisão contratual por acordo entre as partes' });
  assert.equal(outros.tipo_desligamento_agrupado, 'Outros');
});

test('faixa_salarial deriva do salário, igual a person-bands.ts', () => {
  assert.equal(paraLeaverRow(base).faixa_salarial, '5k-8k');
  assert.equal(paraLeaverRow({ ...base, salary: null }).faixa_salarial, 'Não informado');
});

// ---------------------------------------------------------------------------
// O SALÁRIO DO DESLIGADO VEM EM CENTAVOS -- O DO ATIVO, EM REAIS
// ---------------------------------------------------------------------------
// Achado em 15/09 pela Carolina: o gráfico "Desligamentos por Faixa
// Salarial" só mostrava duas barras (50k+ e Não informado), quando havia
// gente em praticamente todas as faixas naquele mês.
//
// `convenia_leavers.salary` vem em centavos; `convenia_pessoas.salary` (o
// cadastro de ativos, que alimenta Comp Ratio e Meu Time) já vem em reais --
// as duas fontes do Convenia usam unidades diferentes para o mesmo campo.
// Sem dividir por 100, qualquer salário não-nulo passa de R$50.000 e cai
// direto em "50k+": um estagiário de R$1.200,00 apareceria classificado
// junto com a diretoria.
test('salario converte centavos do Convenia para reais', () => {
  assert.equal(paraLeaverRow({ ...base, salary: 120000 }).salario, 1200);
  assert.equal(paraLeaverRow({ ...base, salary: 120000 }).faixa_salarial, 'Até 3k');
  assert.equal(paraLeaverRow({ ...base, salary: 7506720 }).salario, 75067.2);
  assert.equal(paraLeaverRow({ ...base, salary: 7506720 }).faixa_salarial, '50k+');
});


test('campos ainda não lidos pelo detalhe do Convenia vêm null, não inventados', () => {
  const parcial = paraLeaverRow({
    ...base, nome: null, cargo: null, salary: null, level: null,
    job_type_family: null, genero: null, raca: null, vinculo: null,
  });
  assert.equal(parcial.nome, 'Não informado');
  assert.equal(parcial.cargo, null);
  assert.equal(parcial.salario, null);
  assert.equal(parcial.level, null);
  assert.equal(parcial.job_family, null);
  assert.equal(parcial.vinculo, null);
});

test('sem hiring_month, tempo de casa fica null em vez de virar "0 dias"', () => {
  const semAdmissao = paraLeaverRow({ ...base, hiring_month: null });
  assert.equal(semAdmissao.tempo_casa_dias, null);
  assert.equal(semAdmissao.tempo_casa_faixa, null);
});

test('data_desligamento_str formata em pt-BR sem escorregar de dia por fuso', () => {
  const row = paraLeaverRow(base);
  assert.equal(row.data_desligamento_str, '10/09/2026');
});

test('sem department, departamento fica null (a tela mostra "Não informado")', () => {
  const row = paraLeaverRow({ ...base, department: null });
  assert.equal(row.departamento, null);
});
