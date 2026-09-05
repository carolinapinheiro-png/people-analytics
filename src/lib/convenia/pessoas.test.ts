import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mesDe, mesesEntre, ehVoluntaria, areaDe, reconstruirSerie, textoDe, ufDe, dataISO,
  idsDeGestores, faixaTempoDeCasa, faixaEtaria, normalizarGenero, classificarSaida,
  type PessoaConvenia,
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

test('os DOZE rótulos reais do Convenia, classificados', () => {
  // Esta lista saiu de uma consulta à base, não da documentação. A primeira
  // versão do código procurava "pedido de demissão" -- expressão que o
  // Convenia não usa em nenhum dos doze -- e classificou 164 saídas com ZERO
  // voluntárias. O painel teria mostrado isso como um fato.
  const voluntarias = [
    'Demissão fora do contrato de experiência - Pedido do Empregado',
    'Antecipado pelo empregado (tempo determinado)',
    'Quebra de Contrato de Experiência - Pedido do Empregado',
  ];
  const involuntarias = [
    'Demissão SEM justa causa fora do contrato de experiência - Pedido da Empresa',
    'Antecipado pelo empregador (tempo determinado)',
    'Quebra de Contrato de Experiência - Pedido da Empresa',
    'Demissão COM justa causa fora do contrato de experiência - Pedido da Empresa',
    'Término de Contrato de Experiência - Pedido da Empresa',
  ];
  const outras = [
    'Outros',
    'Rescisão contratual por acordo entre as partes',
    'Término do contrato de trabalho por tempo determinado',
    'Suspensão de contrato',
  ];

  for (const t of voluntarias) assert.equal(classificarSaida(t), 'voluntaria', t);
  for (const t of involuntarias) assert.equal(classificarSaida(t), 'involuntaria', t);
  for (const t of outras) assert.equal(classificarSaida(t), 'outra', t);
  assert.equal(voluntarias.length + involuntarias.length + outras.length, 12);
});

test('"empregado" e "empresa" aparecem em rótulos parecidos e não podem se confundir', () => {
  // A diferença entre os dois é uma palavra no fim de uma frase longa. Casar
  // o fragmento errado inverteria a classificação sem dar erro.
  assert.equal(classificarSaida('Quebra de Contrato de Experiência - Pedido do Empregado'), 'voluntaria');
  assert.equal(classificarSaida('Quebra de Contrato de Experiência - Pedido da Empresa'), 'involuntaria');
});

test('acordo e fim de contrato NÃO são involuntárias', () => {
  // Num booleano elas cairiam em involuntária por omissão, inflando o número
  // que a diretoria lê como "demissões feitas pela empresa".
  assert.equal(classificarSaida('Rescisão contratual por acordo entre as partes'), 'outra');
  assert.equal(classificarSaida('Término do contrato de trabalho por tempo determinado'), 'outra');
});

test('"Outros" é ausência de informação, não categoria', () => {
  assert.equal(classificarSaida('Outros'), 'outra');
  assert.equal(classificarSaida(null), 'outra');
  assert.equal(classificarSaida(''), 'outra');
});

test('só a voluntária conta na atrição ligada a engajamento', () => {
  assert.equal(ehVoluntaria('Demissão fora do contrato de experiência - Pedido do Empregado'), true);
  assert.equal(ehVoluntaria('Demissão SEM justa causa fora do contrato de experiência - Pedido da Empresa'), false);
  assert.equal(ehVoluntaria('Rescisão contratual por acordo entre as partes'), false);
});

test('ignora acento e caixa', () => {
  assert.equal(classificarSaida('PEDIDO DO EMPREGADO'), 'voluntaria');
  assert.equal(classificarSaida('pedido da empresa'), 'involuntaria');
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
  // `dept_data` -- headcount/entradas/saídas por área. Isto já se chamou
  // `dept_breakdown` aqui dentro, e esse nome pertence a OUTRA estrutura no
  // app: as dimensões por área. A carga gravava a coisa fina na coluna da
  // grossa, e nunca escrevia `dept_data` -- então `applyDeptFilter` não achava
  // a área e devolvia escalares zerados com os percentuais da empresa.
  assert.equal(jan.dept_data.TECH.hc, 1);
  assert.equal(jan.dept_data.TECH.joiners, 1);
  assert.equal(jan.dept_data.TECH.leavers, 1);
  assert.equal(jan.dept_data.OPERATION.hc, 1);
});

test('dept_breakdown traz as dimensões da ÁREA, não as da empresa', () => {
  // Sem isto o filtro de departamento não tem como recortar gênero e
  // liderança: `applyDeptFilter` cai no rateio, que multiplica os números da
  // empresa pela fatia de headcount da área e mantém os percentuais
  // company-wide. Foi o que deixou "Mulheres — Geral" idêntico ao da empresa
  // com um departamento selecionado.
  const pessoas = [
    p({ id: '1', hiring_date: '2026-01-01', department: { name: 'TECH' }, genero: 'F', raca: 'Preta' }),
    p({ id: '2', hiring_date: '2026-01-01', department: { name: 'TECH' }, genero: 'M', raca: 'Branca', supervisorId: null }),
    p({ id: '3', hiring_date: '2026-01-01', department: { name: 'HR' }, genero: 'F', raca: 'Branca', supervisorId: '2' }),
  ];
  const { linhas } = reconstruirSerie(pessoas, 'NSX', '2026-01');
  const bd = linhas[0].dept_breakdown;

  assert.equal(bd.TECH.gender_female, 1);
  assert.equal(bd.TECH.gender_male, 1);
  assert.equal(bd.HR.gender_female, 1);
  assert.equal(bd.HR.gender_male, 0, 'HR não pode herdar o homem que está em TECH');

  // '2' é supervisor de '3', então é gestor -- e é de TECH.
  assert.equal(bd.TECH.leaders, 1);
  assert.equal(bd.HR.leaders, 0);

  assert.equal(bd.TECH.race_cross.Preta.total, 1);
  assert.equal(bd.HR.race_cross.Branca.total, 1);
  assert.equal(bd.TECH.race_cross.Branca?.total, 1);
  assert.equal(bd.HR.race_cross.Preta, undefined, 'raça de outra área não vaza');

  assert.equal(bd.TECH.demographics.race.Preta, 1);
  assert.ok(Object.values(bd.HR.tenure_base).reduce((a, b) => a + b, 0) === 1);
});

test('a soma das áreas bate com o total da empresa', () => {
  // A conferência que denuncia dupla contagem ou pessoa perdida: cada pessoa
  // está em exatamente uma área.
  const pessoas = [
    p({ id: '1', hiring_date: '2026-01-01', department: { name: 'TECH' }, genero: 'F' }),
    p({ id: '2', hiring_date: '2026-01-01', department: { name: 'TECH' }, genero: 'M' }),
    p({ id: '3', hiring_date: '2026-01-01', department: { name: 'HR' }, genero: 'F' }),
    p({ id: '4', hiring_date: '2026-01-01', department: { name: 'HR' }, genero: 'M' }),
  ];
  const l = reconstruirSerie(pessoas, 'NSX', '2026-01').linhas[0];
  const soma = (campo: 'gender_female' | 'gender_male') =>
    Object.values(l.dept_breakdown).reduce((a, b) => a + b[campo], 0);
  assert.equal(soma('gender_female'), l.gender_female);
  assert.equal(soma('gender_male'), l.gender_male);
  assert.equal(
    Object.values(l.dept_data).reduce((a, b) => a + b.hc, 0),
    l.headcount,
  );
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
  assert.equal(m.demographics.age['25-34'], 5);
  assert.equal(m.demographics.age['35-44'], 1);
});

// ---------------------------------------------------------------------------
// A FORMA DE `demographics`
// ---------------------------------------------------------------------------
// Este campo já foi um mapa PLANO de faixas etárias enquanto a aba de
// Demográficos lia `dg.age` e `dg.race`. As duas leituras davam `undefined`, e
// os dois gráficos ficavam vazios sem erro nenhum. Passou despercebido porque
// a série antiga, que gravava a forma certa, era a que estava no ar.
//
// O teste que existia aqui afirmava a forma plana -- ele travava o defeito em
// vez de denunciá-lo. Estes conferem o CONTRATO com a tela.
// ---------------------------------------------------------------------------

test('demographics vem aninhado em age e race, que é o que a tela lê', () => {
  const pessoas = [
    p({ id: '1', hiring_date: '2026-01-01', birth_date: '1995-05-05', raca: 'Parda' }),
    p({ id: '2', hiring_date: '2026-01-01', birth_date: '1990-05-05', raca: 'Branca' }),
  ];
  const d = reconstruirSerie(pessoas, 'NSX', '2026-01').linhas[0].demographics;
  assert.deepEqual(Object.keys(d).sort(), ['age', 'race']);
  assert.equal(d.race.Parda, 1);
  assert.equal(d.race.Branca, 1);
  assert.ok(Object.values(d.age).some((v) => v > 0), 'idade não pode vir vazia');
});

test('a faixa mais nova é "<25", o rótulo que a tela e a série antiga usam', () => {
  // Com '18-24', a MESMA faixa vira duas categorias ao comparar as séries, e
  // o gráfico a ordena antes de todas as outras (AGE_ORDER não a reconhece).
  const nasc = `${new Date().getFullYear() - 20}-01-01`;
  const d = reconstruirSerie(
    [p({ id: '1', hiring_date: '2026-01-01', birth_date: nasc })],
    'NSX', '2026-01',
  ).linhas[0].demographics;
  assert.equal(Object.keys(d.age)[0], '<25');
});

test('raça ausente não cria categoria vazia em demographics', () => {
  const d = reconstruirSerie(
    [p({ id: '1', hiring_date: '2026-01-01', raca: null })],
    'NSX', '2026-01',
  ).linhas[0].demographics;
  assert.deepEqual(d.race, {});
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

// ---------------------------------------------------------------------------
// RECORTE POR RAÇA
// ---------------------------------------------------------------------------
// A tabela do DEI já existia inteira, atrás de um `hasRaceCross` que nunca foi
// verdadeiro: `race_cross` saía `{}` em todas as linhas porque ninguém a
// calculava. O dado estava gravado em `convenia_pessoas` o tempo todo.
// ---------------------------------------------------------------------------

test('race_cross conta pessoas, mulheres e gestoras por raça', () => {
  const pessoas = [
    p({ id: '1', hiring_date: '2026-01-01', genero: 'F', raca: 'Preta' }),
    p({ id: '2', hiring_date: '2026-01-01', genero: 'M', raca: 'Preta', supervisorId: null }),
    p({ id: '3', hiring_date: '2026-01-01', genero: 'F', raca: 'Branca', supervisorId: '2' }),
  ];
  const { linhas } = reconstruirSerie(pessoas, 'NSX', '2026-01');
  const rc = linhas[0].race_cross;
  assert.equal(rc.Preta.total, 2);
  assert.equal(rc.Preta.female, 1);
  assert.equal(rc.Branca.total, 1);
  assert.equal(rc.Branca.female, 1);
  // Quem tem alguém reportando é gestor -- '2' é supervisor de '3'.
  assert.equal(rc.Preta.leaders, 1);
  assert.equal(rc.Branca.leaders, 0);
});

test('race_cross vem VAZIO quando a cobertura de raça é baixa', () => {
  // Esta é a regra que impede a tabela de mentir. Ela divide `total` pelo
  // headcount do mês: com uma pessoa de dez tendo raça conhecida, "Branca:
  // 10% do quadro" seria lido como representatividade, e é desconhecimento.
  //
  // Vazio ESCONDE a tabela inteira, e é o comportamento certo -- ela some em
  // vez de publicar um número que ninguém consegue conferir.
  const pessoas = Array.from({ length: 10 }, (_, i) =>
    p({ id: String(i), hiring_date: '2026-01-01', raca: i === 0 ? 'Branca' : null }));
  const { linhas } = reconstruirSerie(pessoas, 'NSX', '2026-01');
  assert.deepEqual(linhas[0].race_cross, {});
  // O contador bruto continua saindo: é ele que explica POR QUE está vazio.
  assert.equal(linhas[0].raca_conhecida, 1);
});

test('race_cross aparece quando a cobertura passa do mínimo', () => {
  const pessoas = Array.from({ length: 10 }, (_, i) =>
    p({ id: String(i), hiring_date: '2026-01-01', raca: i === 0 ? null : 'Parda' }));
  const { linhas } = reconstruirSerie(pessoas, 'NSX', '2026-01');
  assert.equal(linhas[0].race_cross.Parda.total, 9);
  assert.equal(linhas[0].raca_conhecida, 9);
});

test('raça em branco não vira grupo próprio', () => {
  // "" e "  " como chave criariam uma linha sem nome na tabela do DEI.
  const pessoas = [
    p({ id: '1', hiring_date: '2026-01-01', raca: '   ' }),
    p({ id: '2', hiring_date: '2026-01-01', raca: 'Branca' }),
  ];
  const { linhas } = reconstruirSerie(pessoas, 'NSX', '2026-01');
  assert.deepEqual(Object.keys(linhas[0].race_cross), []);
  assert.equal(linhas[0].raca_conhecida, 1);
});

test('textoDe achata objeto: team e relationship vem como {name}', () => {
  // O erro real: `team` e `relationship` chegam como objeto, igual a
  // `department`. A versao que so aceitava string deixou as duas colunas em
  // 0 de 809 depois de uma carga inteira, enquanto registration, salary e
  // birth_date -- que sao string -- preencheram normalmente.
  assert.equal(textoDe({ id: 3, name: 'Customer Support Betnacional' }), 'Customer Support Betnacional');
  assert.equal(textoDe({ id: 1, title: 'CLT' }), 'CLT');
  assert.equal(textoDe('CLT'), 'CLT');
  assert.equal(textoDe(11), '11');
});

test('textoDe trata "Nao informado" como ausencia, inclusive dentro do objeto', () => {
  assert.equal(textoDe('Não informado'), null);
  assert.equal(textoDe({ name: 'Não informado' }), null);
  assert.equal(textoDe('N/A'), null);
  assert.equal(textoDe(''), null);
  assert.equal(textoDe(null), null);
  assert.equal(textoDe(undefined), null);
});

test('textoDe nao confunde valor legitimo que contenha a palavra', () => {
  assert.equal(textoDe('Informado pelo gestor'), 'Informado pelo gestor');
});

test('ufDe pega o estado do endereco aninhado', () => {
  assert.equal(ufDe({ state: 'PE', city: 'Recife' }), 'PE');
  assert.equal(ufDe({ city: 'Recife' }), null);
  assert.equal(ufDe(null), null);
});

test('dataISO aceita os dois formatos que o Convenia manda', () => {
  assert.equal(dataISO('2026-08-22'), '2026-08-22');
  assert.equal(dataISO('22/08/2026'), '2026-08-22');
});

test('dataISO recusa o que nao entende, em vez de arriscar dia trocado', () => {
  // 03/07 e 07/03 sao ambos plausiveis e ninguem conferiria.
  assert.equal(dataISO('2026-08'), null);
  assert.equal(dataISO('agosto de 2026'), null);
  assert.equal(dataISO(null), null);
  assert.equal(dataISO(''), null);
});
