import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mesDe, mesesEntre, ehVoluntaria, areaDe, reconstruirSerie,
  idsDeGestores, faixaTempoDeCasa, faixaEtaria, normalizarGenero, type PessoaConvenia,
} from './pessoas';

const p = (o: Partial<PessoaConvenia> & { id: string }): PessoaConvenia => ({ ...o });

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

test('aceita ISO da API e dd/mm/aaaa do export', () => {
  assert.equal(mesDe('2026-03-16'), '2026-03');
  assert.equal(mesDe('16/03/2026'), '2026-03');
  assert.equal(mesDe('2026-03-16T00:00:00Z'), '2026-03');
});

test('"Não informado" e vazio viram null, não uma data inventada', () => {
  // O Convenia usa esta string literal onde o campo não foi preenchido.
  // Tratá-la como data daria um mês qualquer sem parecer errado.
  assert.equal(mesDe('Não informado'), null);
  assert.equal(mesDe(''), null);
  assert.equal(mesDe(null), null);
  assert.equal(mesDe(undefined), null);
});

test('formato desconhecido devolve null em vez de adivinhar', () => {
  assert.equal(mesDe('março de 2026'), null);
  assert.equal(mesDe('2026'), null);
});

test('mesesEntre atravessa a virada do ano', () => {
  assert.deepEqual(mesesEntre('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('mesesEntre com de igual a ate devolve um mês', () => {
  assert.deepEqual(mesesEntre('2026-03', '2026-03'), ['2026-03']);
});

// ---------------------------------------------------------------------------
// Voluntária vs involuntária
// ---------------------------------------------------------------------------

test('separa pedido da pessoa de pedido da empresa', () => {
  assert.equal(ehVoluntaria('Pedido de demissão'), true);
  assert.equal(ehVoluntaria('Demissão SEM justa causa fora do contrato de experiência - Pedido da Empresa'), false);
  assert.equal(ehVoluntaria('Demissão COM justa causa'), false);
});

test('na dúvida conta como involuntária', () => {
  // Subestimar atrição voluntária é menos perigoso que inventá-la: o número
  // sustenta a leitura de retenção, e inflá-lo levaria a agir sobre um
  // problema que não existe.
  assert.equal(ehVoluntaria('Rescisão contratual'), false);
  assert.equal(ehVoluntaria(null), false);
  assert.equal(ehVoluntaria(''), false);
});

test('ignora acento e caixa', () => {
  assert.equal(ehVoluntaria('PEDIDO DE DEMISSAO'), true);
  assert.equal(ehVoluntaria('pedido de demissão'), true);
});

// ---------------------------------------------------------------------------
// Área
// ---------------------------------------------------------------------------

test('área vazia vira SEM DEPTO, não some', () => {
  assert.equal(areaDe(p({ id: '1' })), 'SEM DEPTO');
  assert.equal(areaDe(p({ id: '1', department: { name: '  ' } })), 'SEM DEPTO');
  assert.equal(areaDe(p({ id: '1', department: { name: 'Operation' } })), 'OPERATION');
});

// ---------------------------------------------------------------------------
// A reconstrução
// ---------------------------------------------------------------------------

test('pessoa presente conta em todos os meses entre entrada e saída', () => {
  const { linhas } = reconstruirSerie(
    [p({ id: '1', hiring_date: '2026-01-10', department: { name: 'TECH' } })],
    'NSX', '2026-04',
  );
  assert.deepEqual(linhas.map((l) => l.headcount), [1, 1, 1, 1]);
  assert.equal(linhas[0].month, '2026-01-01');
});

test('quem saiu para de contar no mês seguinte, e conta como saída no mês da saída', () => {
  const { linhas } = reconstruirSerie(
    [p({ id: '1', hiring_date: '2026-01-10', dataSaida: '2026-02-20', department: { name: 'TECH' } })],
    'NSX', '2026-04',
  );
  assert.deepEqual(linhas.map((l) => l.headcount), [1, 0, 0, 0]);
  assert.deepEqual(linhas.map((l) => l.leavers), [0, 1, 0, 0]);
});

test('o mês da saída ainda conta a pessoa como exposta na taxa', () => {
  // Se o denominador fosse só o headcount do fim do mês, alguém que saiu
  // sozinho num mês daria divisão por zero -- ou 100% num mês com 50 pessoas.
  const pessoas = [
    p({ id: '1', hiring_date: '2026-01-01', dataSaida: '2026-02-10' }),
    p({ id: '2', hiring_date: '2026-01-01' }),
  ];
  const { linhas } = reconstruirSerie(pessoas, 'NSX', '2026-02');
  const fev = linhas[1];
  assert.equal(fev.headcount, 1);
  assert.equal(fev.leavers, 1);
  assert.equal(fev.attrition_rate, 50); // 1 saída sobre 2 expostos
});

test('a série começa na admissão mais antiga, não numa data fixa', () => {
  const { linhas, resumo } = reconstruirSerie(
    [
      p({ id: '1', hiring_date: '2024-06-01' }),
      p({ id: '2', hiring_date: '2026-01-01' }),
    ],
    'NSX', '2026-02',
  );
  assert.equal(resumo.primeiroMes, '2024-06');
  assert.equal(linhas[0].month, '2024-06-01');
  assert.equal(linhas[0].headcount, 1);
  assert.equal(linhas.at(-1)!.headcount, 2);
});

test('sem data de admissão a pessoa fica fora do headcount E isso é contado', () => {
  // Este é o caso do desligado que não cruzou com a listagem de ativos.
  // O importante não é o número certo -- é o número certo VIR ACOMPANHADO
  // do tamanho do que ficou de fora.
  const { linhas, resumo } = reconstruirSerie(
    [
      p({ id: '1', hiring_date: '2026-01-01' }),
      p({ id: '2', dataSaida: '2026-02-15' }),
    ],
    'NSX', '2026-02',
  );
  assert.equal(resumo.semAdmissao, 1);
  assert.equal(resumo.saidasSemAdmissao, 1);
  assert.equal(linhas[0].headcount, 1);
  // A saída aparece mesmo sem admissão: sabemos que saiu, não sabemos quando entrou.
  assert.equal(linhas[1].leavers, 1);
  assert.ok(resumo.avisos.some((a) => a.includes('subestima')));
});

test('quebra por área acompanha headcount, entradas e saídas', () => {
  const { linhas } = reconstruirSerie(
    [
      p({ id: '1', hiring_date: '2026-01-05', department: { name: 'TECH' } }),
      p({ id: '2', hiring_date: '2026-01-20', department: { name: 'OPERATION' } }),
      p({ id: '3', hiring_date: '2025-12-01', department: { name: 'TECH' }, dataSaida: '2026-01-31' }),
    ],
    'NSX', '2026-01',
  );
  const jan = linhas.at(-1)!;
  assert.equal(jan.headcount, 2);
  assert.equal(jan.joiners, 2);
  assert.equal(jan.leavers, 1);
  assert.equal(jan.dept_breakdown.TECH.headcount, 1);
  assert.equal(jan.dept_breakdown.TECH.joiners, 1);
  assert.equal(jan.dept_breakdown.TECH.leavers, 1);
  assert.equal(jan.dept_breakdown.OPERATION.headcount, 1);
});

test('lista vazia não explode, devolve série vazia com aviso', () => {
  const { linhas, resumo } = reconstruirSerie([], 'NSX', '2026-03');
  assert.equal(linhas.length, 0);
  assert.equal(resumo.primeiroMes, null);
  assert.ok(resumo.avisos.length > 0);
});

test('a marca vai em toda linha — é o corte que separa NSX de Betfair', () => {
  const { linhas } = reconstruirSerie(
    [p({ id: '1', hiring_date: '2026-01-01' })], 'Betfair', '2026-02',
  );
  assert.ok(linhas.every((l) => l.brand === 'Betfair'));
});

test('nenhum campo pessoal sobrevive à agregação', () => {
  // Se alguém acrescentar um campo ao registro de pessoa, ele não pode
  // vazar para a linha mensal. Este teste quebra se vazar.
  const pessoas = [{
    id: 'abc', hiring_date: '2026-01-01', department: { name: 'TECH' },
    cpf: { cpf: '000.000.000-00' }, name: 'Fulana', salary: 9999,
  } as unknown as PessoaConvenia];
  const { linhas } = reconstruirSerie(pessoas, 'NSX', '2026-01');
  const texto = JSON.stringify(linhas);
  assert.ok(!texto.includes('000.000.000-00'));
  assert.ok(!texto.includes('Fulana'));
  assert.ok(!texto.includes('abc'));
  // O salário também não: com uma pessoa no grupo, a média SERIA o salário
  // dela. O piso de 5 impede que agregar vire disfarce.
  assert.ok(!texto.includes('9999'));
  assert.equal(linhas[0].avg_salary_non_leaders, null);
});


// ---------------------------------------------------------------------------
// Liderança derivada, faixas e médias
// ---------------------------------------------------------------------------

test('gestor é quem aparece como supervisor de alguém, não quem se declara', () => {
  const pessoas = [
    p({ id: 'chefe' }),
    p({ id: 'a', supervisorId: 'chefe' }),
    p({ id: 'b', supervisorId: 'chefe' }),
    p({ id: 'sozinho' }),
  ];
  const g = idsDeGestores(pessoas);
  assert.ok(g.has('chefe'));
  assert.ok(!g.has('a'));
  assert.ok(!g.has('sozinho'));
  assert.equal(g.size, 1);
});

test('quem já saiu continua contando como gestor no passado', () => {
  // Se a derivação usasse só quem está ativo, um time inteiro cujo gestor saiu
  // apareceria sem liderança em TODOS os meses passados -- inclusive naqueles
  // em que ele estava lá.
  const g = idsDeGestores([p({ id: 'x', supervisorId: 'exchefe', dataSaida: '2026-01-10' })]);
  assert.ok(g.has('exchefe'));
});

test('faixas de tempo de casa contam meses completos', () => {
  assert.equal(faixaTempoDeCasa('2026-01', '2026-03'), '0-6 meses');
  assert.equal(faixaTempoDeCasa('2025-09', '2026-03'), '6-12 meses');
  assert.equal(faixaTempoDeCasa('2025-01', '2026-03'), '1-2 anos');
  assert.equal(faixaTempoDeCasa('2023-01', '2026-03'), '2-4 anos');
  assert.equal(faixaTempoDeCasa('2015-01', '2026-03'), '4+ anos');
});

test('idade implausível fica de fora em vez de virar faixa errada', () => {
  // Data de nascimento com erro de digitação existe em qualquer cadastro.
  // Uma pessoa de 300 anos numa faixa "55+" contamina a distribuição sem
  // parecer defeito.
  assert.equal(faixaEtaria('1700-01-01', '2026-03'), null);
  assert.equal(faixaEtaria('2020-01-01', '2026-03'), null);
  assert.equal(faixaEtaria(null, '2026-03'), null);
  assert.equal(faixaEtaria('1996-05-01', '2026-03'), '25-34');
});

test('liderança, salários, estado, tempo e idade entram na linha mensal', () => {
  const pessoas = [
    p({ id: 'chefe', hiring_date: '2025-01-01', salary: 20000, uf: 'Pernambuco', birth_date: '1985-01-01' }),
    ...[1, 2, 3, 4, 5].map((n) => p({
      id: `a${n}`, hiring_date: '2025-01-01', supervisorId: 'chefe',
      salary: 6000, uf: n === 5 ? 'São Paulo' : 'Pernambuco', birth_date: '1996-01-01',
    })),
  ];
  const { linhas } = reconstruirSerie(pessoas, 'NSX', '2025-01');
  const m = linhas[0];
  assert.equal(m.headcount, 6);
  assert.equal(m.leaders, 1);
  assert.equal(m.leaders_pct, 16.7);
  // Um gestor só: abaixo do piso, então a média não é publicada.
  assert.equal(m.avg_salary_leaders, null);
  assert.equal(m.avg_salary_non_leaders, 6000);
  assert.equal(m.state_mix['Pernambuco'], 5);
  assert.equal(m.state_mix['São Paulo'], 1);
  assert.equal(m.tenure_base['0-6 meses'], 6);
  assert.equal(m.demographics['25-34'], 5);
  assert.equal(m.demographics['35-44'], 1);
});

test('quem saiu deixa de contar como gestor a partir do mês da saída', () => {
  // A pessoa sai em fevereiro: conta como gestora em janeiro, não em fevereiro.
  // Sair EM fevereiro já a tira do headcount de fevereiro -- mesma regra do
  // headcount, e é bom que seja a mesma, senão liderança e headcount contariam
  // populações diferentes.
  const pessoas = [
    p({ id: 'chefe', hiring_date: '2025-01-01', dataSaida: '2025-02-20' }),
    p({ id: 'a', hiring_date: '2025-01-01', supervisorId: 'chefe' }),
  ];
  const { linhas } = reconstruirSerie(pessoas, 'NSX', '2025-02');
  assert.equal(linhas[0].leaders, 1);
  assert.equal(linhas[0].headcount, 2);
  assert.equal(linhas[1].leaders, 0);
  assert.equal(linhas[1].headcount, 1);
});

test('salário ausente não vira zero na média', () => {
  // Tratar ausência como zero puxaria a média para baixo silenciosamente.
  const pessoas = [
    ...[1, 2, 3, 4, 5].map((n) => p({ id: `a${n}`, hiring_date: '2025-01-01', salary: 6000 })),
    p({ id: 'sem', hiring_date: '2025-01-01', salary: null }),
  ];
  const { linhas } = reconstruirSerie(pessoas, 'NSX', '2025-01');
  assert.equal(linhas[0].headcount, 6);
  assert.equal(linhas[0].avg_salary_non_leaders, 6000);
});

test('média salarial exige pelo menos 5 pessoas no grupo', () => {
  const quatro = [1, 2, 3, 4].map((n) => p({ id: `a${n}`, hiring_date: '2025-01-01', salary: 6000 }));
  assert.equal(reconstruirSerie(quatro, 'NSX', '2025-01').linhas[0].avg_salary_non_leaders, null);

  const cinco = [...quatro, p({ id: 'a5', hiring_date: '2025-01-01', salary: 6000 })];
  assert.equal(reconstruirSerie(cinco, 'NSX', '2025-01').linhas[0].avg_salary_non_leaders, 6000);
});


// ---------------------------------------------------------------------------
// Gênero
// ---------------------------------------------------------------------------

test('normaliza os rótulos que o Convenia usa', () => {
  assert.equal(normalizarGenero('Mulher'), 'F');
  assert.equal(normalizarGenero('Feminino'), 'F');
  assert.equal(normalizarGenero('Homem'), 'M');
  assert.equal(normalizarGenero('Masculino'), 'M');
});

test('identidade fora do binário fica null em vez de ser forçada', () => {
  // Contar como F ou M para fechar a conta seria classificar errado uma
  // pessoa real. Fora do recorte é melhor que dentro do lugar errado.
  assert.equal(normalizarGenero('Não-binário'), null);
  assert.equal(normalizarGenero('Prefiro não informar'), null);
  assert.equal(normalizarGenero(null), null);
  assert.equal(normalizarGenero(''), null);
});

test('percentual de gênero fica nulo enquanto a cobertura for baixa', () => {
  // Este é o ponto: a CONTAGEM aparece, o PERCENTUAL não. Com 2 de 10
  // resolvidas, "100% mulheres" seria uma afirmação sobre as 10 a partir de 2.
  const pessoas = [
    p({ id: 'a', hiring_date: '2025-01-01', genero: 'F' }),
    p({ id: 'b', hiring_date: '2025-01-01', genero: 'F' }),
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => p({ id: `x${n}`, hiring_date: '2025-01-01' })),
  ];
  const m = reconstruirSerie(pessoas, 'NSX', '2025-01').linhas[0];
  assert.equal(m.headcount, 10);
  assert.equal(m.gender_female, 2);
  assert.equal(m.genero_conhecido, 2);
  assert.equal(m.gender_female_pct, null);
});

test('com cobertura completa o percentual aparece', () => {
  const pessoas = [
    p({ id: 'a', hiring_date: '2025-01-01', genero: 'F' }),
    p({ id: 'b', hiring_date: '2025-01-01', genero: 'M' }),
    p({ id: 'c', hiring_date: '2025-01-01', genero: 'M' }),
    p({ id: 'd', hiring_date: '2025-01-01', genero: 'M' }),
  ];
  const m = reconstruirSerie(pessoas, 'NSX', '2025-01').linhas[0];
  assert.equal(m.gender_female, 1);
  assert.equal(m.gender_male, 3);
  assert.equal(m.gender_female_pct, 25);
});

test('mulheres em liderança usa a mesma regra de cobertura', () => {
  const pessoas = [
    p({ id: 'chefe', hiring_date: '2025-01-01', genero: 'F' }),
    p({ id: 'a', hiring_date: '2025-01-01', genero: 'M', supervisorId: 'chefe' }),
  ];
  const m = reconstruirSerie(pessoas, 'NSX', '2025-01').linhas[0];
  assert.equal(m.leaders, 1);
  assert.equal(m.leader_female, 1);
  assert.equal(m.leader_female_pct, 100);
});
