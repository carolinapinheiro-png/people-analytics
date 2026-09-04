import test from 'node:test';
import assert from 'node:assert/strict';
import { casarCampos, sobraram, chave, forcaDoCasamento, COLUNAS_TALENT, type CampoVisto } from './talent-mobility';

const campo = (nome: string, preenchidos = 8): CampoVisto =>
  ({ nome, origem: 'personalizado', preenchidos, valores: [] });

test('casa por nome ignorando acento, caixa e pontuacao', () => {
  const c = casarCampos([campo('career band')]).find((x) => x.coluna === 'Career Band');
  assert.equal(c?.forca, 'exata');
  assert.equal(c?.campo?.nome, 'career band');
});

test('casamento parcial nao rouba a coluna de um exato', () => {
  // `Career Band Level` vem ANTES na lista e contem "Career Band". Se o parcial
  // rodasse por coluna, ele levaria a coluna e o campo exato ficaria orfao --
  // exatamente o erro que a ordem de custom_fields provocaria.
  const m = casarCampos([campo('Career Band Level'), campo('Career Band')]);
  assert.equal(m.find((x) => x.coluna === 'Career Band')?.campo?.nome, 'Career Band');
});

test('nao procura campo para coluna que ja sai do que temos', () => {
  const c = casarCampos([campo('Company')]).find((x) => x.coluna === 'Company');
  assert.ok(c?.jaTemos);
  assert.equal(c?.campo, undefined);
});

test('deixa a coluna orfa quando nada casa, em vez de inventar', () => {
  assert.equal(casarCampos([]).find((x) => x.coluna === 'FTE %')?.campo, undefined);
});

test('devolve todas as 51 colunas, sempre', () => {
  assert.equal(casarCampos([]).length, COLUNAS_TALENT.length);
});

test('sobraram lista o que nenhuma coluna reivindicou', () => {
  const campos = [campo('Career Band'), campo('Apelido do pet')];
  assert.deepEqual(sobraram(campos, casarCampos(campos)).map((c) => c.nome), ['Apelido do pet']);
});

test('um campo curto nao leva doze colunas', () => {
  // A primeira execucao real: `Level` (valores L0/L5/L3, que sao Compensation
  // Grade) reivindicou as sete Supervisory Org e as cinco Cost Centre
  // Hierarchy, porque "level" esta contido no nome de todas.
  const m = casarCampos([campo('Level')]);
  const levadas = m.filter((x) => x.campo?.nome === 'Level');
  assert.ok(levadas.length <= 1, `Level levou ${levadas.length} colunas`);
  assert.equal(m.find((x) => x.coluna === 'Supervisory Org Level 2')?.campo, undefined);
  assert.equal(m.find((x) => x.coluna === 'Cost centre Hierarchy Level 1')?.campo, undefined);
});

test('um campo vale por uma coluna so', () => {
  const m = casarCampos([campo('job')]);
  assert.ok(m.filter((x) => x.campo?.nome === 'job').length <= 1);
});

test('salary ainda alcanca Basic Salary, marcado para conferencia', () => {
  const c = casarCampos([campo('salary')]).find((x) => x.coluna === 'Basic Salary');
  assert.equal(c?.campo?.nome, 'salary');
  assert.equal(c?.forca, 'parcial');
});

test('forcaDoCasamento pune cobertura parcial dos dois lados', () => {
  assert.ok(forcaDoCasamento('Supervisory Org Level 2', 'Level') < 0.5);
  assert.equal(forcaDoCasamento('Career Band', 'Career Band'), 1);
  assert.ok(forcaDoCasamento('Basic Salary', 'salary') >= 0.5);
});

test('a escolha gravada ganha do palpite por nome', () => {
  // `Career Band` casa exato com o campo de mesmo nome. Se alguem gravou outra
  // coisa, foi por ter olhado o valor -- e o palpite nao desfaz isso.
  const campos = [campo('Career Band'), campo('Banda')];
  const m = casarCampos(campos, [
    { coluna: 'Career Band', campo: 'Banda', definidoPor: 'carolina@nsx.bet' },
  ]);
  const c = m.find((x) => x.coluna === 'Career Band');
  assert.equal(c?.campo?.nome, 'Banda');
  assert.equal(c?.forca, 'escolhida');
  assert.equal(c?.definidoPor, 'carolina@nsx.bet');
});

test('escolha alcanca coluna que nenhum nome alcancaria', () => {
  // O caso real: `Level` (L0/L5/L3) e o Compensation Grade, e os nomes nao tem
  // uma letra em comum.
  const c = casarCampos([campo('Level')], [
    { coluna: 'Compensation Grade', campo: 'Level', definidoPor: 'carolina@nsx.bet' },
  ]).find((x) => x.coluna === 'Compensation Grade');
  assert.equal(c?.campo?.nome, 'Level');
  assert.equal(c?.forca, 'escolhida');
});

test('campo gravado nao sobra para o palpite de outra coluna', () => {
  const m = casarCampos([campo('salary')], [
    { coluna: 'FTE %', campo: 'salary', definidoPor: 'carolina@nsx.bet' },
  ]);
  assert.equal(m.find((x) => x.coluna === 'Basic Salary')?.campo, undefined);
});

test('escolha para campo que sumiu do cadastro nao quebra', () => {
  const m = casarCampos([campo('Career Band')], [
    { coluna: 'FTE %', campo: 'campo que o RH apagou', definidoPor: 'carolina@nsx.bet' },
  ]);
  assert.equal(m.find((x) => x.coluna === 'FTE %')?.campo, undefined);
  assert.equal(m.length, COLUNAS_TALENT.length);
});

test('palavra generica sozinha nao vale palpite', () => {
  // A primeira execucao real ofereceu `father_name` para `Preferred Name` --
  // o nome do PAI como nome preferido -- e `salary_type` para `Leave Type`.
  // Uma palavra de ligacao casa com tudo.
  assert.equal(forcaDoCasamento('Preferred Name', 'father_name'), 0);
  assert.equal(forcaDoCasamento('Leave Type', 'salary_type'), 0);
  assert.equal(casarCampos([campo('father_name')])
    .find((x) => x.coluna === 'Preferred Name')?.campo, undefined);
});

test('palavra com conteudo ainda casa, mesmo acompanhada de generica', () => {
  // `Date of Birth` x `birth_date` divide "date" (vaga) e "birth" (nao).
  assert.ok(forcaDoCasamento('Date of Birth', 'birth_date') >= 0.5);
  assert.ok(forcaDoCasamento('Basic Salary', 'salary') >= 0.5);
});

test('chave normaliza espaco, simbolo e acento', () => {
  assert.equal(chave('FTE %'), 'fte');
  assert.equal(chave('Funcao'), 'funcao');
});
