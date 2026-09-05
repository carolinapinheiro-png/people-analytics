import test from 'node:test';
import assert from 'node:assert/strict';
import { casarCampos, sobraram, chave, forcaDoCasamento, cadeiaAcima, degrau, blocosDe30Dias, tempoDeCasa, tempoDeCasaTexto, workerType, valorOuVazio, noMesDeReferencia, ultimoValorConhecido, escolhasOrfas, JA_TEMOS, COLUNAS_TALENT, type CampoVisto } from './talent-mobility';

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

// A hierarquia da Alba, como esta no arquivo de agosto:
// Alba -> Catarine -> Diego -> Ricardo
const CHEFE = new Map<string, string | null>([
  ['alba', 'catarine'], ['catarine', 'diego'], ['diego', 'ricardo'], ['ricardo', null],
]);
const AREA = new Map([
  ['alba', 'Facilities'], ['catarine', 'Procurament'],
  ['diego', 'Finance'], ['ricardo', 'DIRETORIA'],
]);
const area = (id: string) => AREA.get(id) ?? null;

test('a subida bate com o arquivo de agosto', () => {
  // SupOrg L2 = a propria pessoa, L3 = gestora, L4 = gestor da gestora.
  assert.equal(degrau('alba', 0, CHEFE, area), 'Facilities');
  assert.equal(degrau('alba', 1, CHEFE, area), 'Procurament');
  assert.equal(degrau('alba', 2, CHEFE, area), 'Finance');
  assert.equal(degrau('alba', 3, CHEFE, area), 'DIRETORIA');
});

test('acima do topo sai vazio, e nao #N/A', () => {
  // O arquivo de agosto traz `#N/A` e `0` nesses lugares, residuo de PROCV.
  // Vazio some do pivo; "#N/A" vira uma categoria.
  assert.equal(degrau('alba', 4, CHEFE, area), '');
  assert.equal(degrau('alba', 6, CHEFE, area), '');
});

test('gestor apontando para si mesmo nao vira laco infinito', () => {
  const ciclo = new Map<string, string | null>([['a', 'a']]);
  assert.deepEqual(cadeiaAcima('a', ciclo, 8), []);
});

test('dois gestores apontando um para o outro param', () => {
  const ciclo = new Map<string, string | null>([['a', 'b'], ['b', 'a']]);
  assert.deepEqual(cadeiaAcima('a', ciclo, 8), ['b']);
});

test('ciclo mais longe na cadeia tambem para', () => {
  const ciclo = new Map<string, string | null>([['a', 'b'], ['b', 'c'], ['c', 'b']]);
  assert.deepEqual(cadeiaAcima('a', ciclo, 8), ['b', 'c']);
});

test('respeita o limite de niveis', () => {
  assert.equal(cadeiaAcima('alba', CHEFE, 2).length, 2);
});

test('pessoa sem gestor tem cadeia vazia', () => {
  assert.deepEqual(cadeiaAcima('ricardo', CHEFE, 8), []);
  assert.equal(degrau('ricardo', 0, CHEFE, area), 'DIRETORIA');
  assert.equal(degrau('ricardo', 1, CHEFE, area), '');
});

// Linhas reais do arquivo de agosto, medidas contra 2026-08-31. A regra de
// blocos de 30 bate em 641 de 641; mes de calendario bate em 373.
test('Length of Service reproduz o arquivo de agosto', () => {
  assert.equal(blocosDe30Dias('2026-03-16', '2026-08-31'), 5);
  assert.equal(blocosDe30Dias('2025-11-17', '2026-08-31'), 9);
  assert.equal(blocosDe30Dias('2026-02-09', '2026-08-31'), 6);
  assert.equal(blocosDe30Dias('2026-06-15', '2026-08-31'), 2);
  assert.equal(blocosDe30Dias('2025-09-08', '2026-08-31'), 11);
});

test('a Alba da 15, e nao os 14 do calendario', () => {
  // 02/06/2025 a 31/08/2026 sao 455 dias: 15 blocos de 30, 14 meses de
  // calendario. O arquivo diz 15 -- e a planilha e que manda.
  assert.equal(blocosDe30Dias('2025-06-02', '2026-08-31'), 15);
});

test('admissao no futuro e data invalida nao viram numero negativo', () => {
  assert.equal(blocosDe30Dias('2026-12-01', '2026-08-31'), null);
  assert.equal(blocosDe30Dias(null, '2026-08-31'), null);
  assert.equal(blocosDe30Dias('nao e data', '2026-08-31'), null);
});

test('tempoDeCasa conta calendario de verdade', () => {
  assert.deepEqual(tempoDeCasa('2024-01-10', '2026-01-10'), { anos: 2, meses: 0, dias: 0 });
  assert.deepEqual(tempoDeCasa('2025-06-02', '2026-08-31'), { anos: 1, meses: 2, dias: 29 });
});

test('dia negativo pega os dias do mes anterior ao de referencia', () => {
  // Admitido em 31/01, medido em 01/03: 29 dias em ano bissexto, 28 no comum.
  assert.deepEqual(tempoDeCasa('2024-01-31', '2024-03-01'), { anos: 0, meses: 1, dias: 1 });
  assert.deepEqual(tempoDeCasa('2023-12-31', '2024-03-01'), { anos: 0, meses: 2, dias: 1 });
});

test('virada de ano nao produz mes negativo', () => {
  assert.deepEqual(tempoDeCasa('2025-11-20', '2026-02-10'), { anos: 0, meses: 2, dias: 21 });
});

test('tempoDeCasaTexto sai vazio quando nao da para calcular', () => {
  assert.equal(tempoDeCasaTexto(null, '2026-08-31'), '');
  assert.equal(tempoDeCasaTexto('2024-01-10', '2026-01-10'), '2a 0m 0d');
});

test('Employee ID e a matricula, e nao o UUID', () => {
  // O arquivo de agosto traz 320 e P000212. O `id` do Convenia e
  // 795f0df4-9556-4500-... Apontar para o UUID daria 641 linhas com a
  // matricula errada, e nenhuma pareceria errada.
  assert.match(JA_TEMOS['Employee ID'] ?? '', /registration/);
});

test('team e department nao trocam de coluna', () => {
  // Agosto: Supervisory Organization = "Customer Support Betnacional" (team);
  // Job Family Group = "OPERATION" (department).
  assert.match(JA_TEMOS['Supervisory Organization'] ?? '', /team/);
  assert.match(JA_TEMOS['Job Family Group'] ?? '', /department/);
  assert.match(JA_TEMOS['Supervisory Org Level 3'] ?? '', /team/);
});

test('escolha antiga em coluna que virou derivada nao reserva o campo', () => {
  // Job Family Group foi mapeada para `team` antes de virar derivada. Se a
  // escolha continuasse valendo, `team` sumiria do seletor das outras.
  const campos = [campo('team')];
  const m = casarCampos(campos, [
    { coluna: 'Job Family Group', campo: 'team', definidoPor: 'carolina@nsx.bet' },
  ]);
  assert.ok(m.find((x) => x.coluna === 'Job Family Group')?.jaTemos);
  assert.deepEqual(sobraram(campos, m).map((c) => c.nome), ['team']);
});

test('Vinculo vira CLT ou PJ como no arquivo de julho', () => {
  // Medido pessoa a pessoa contra as 654 linhas: os raros aparecem aqui.
  assert.equal(workerType('CLT'), 'CLT');
  assert.equal(workerType('Diretor Estatutário'), 'CLT');
  assert.equal(workerType('Aprendiz'), 'CLT');
  assert.equal(workerType('Contrato Intermitente'), 'CLT');
  assert.equal(workerType('Pessoa Jurídica'), 'PJ');
  assert.equal(workerType('Associado'), 'PJ');
});

test('vinculo desconhecido sai vazio, e nao chutado para CLT', () => {
  // CLT e a maioria: um vinculo novo entrando como CLT em silencio nao seria
  // notado por ninguem.
  assert.equal(workerType('Estagiario PJ Hibrido'), '');
  assert.equal(workerType(null), '');
  assert.equal(workerType(''), '');
});

test('acento e caixa nao separam o mesmo vinculo', () => {
  assert.equal(workerType('pessoa juridica'), 'PJ');
  assert.equal(workerType('DIRETOR ESTATUTARIO'), 'CLT');
});

test('"Nao informado" do export e ausencia, nao valor', () => {
  // Era o que derrubava Career Band para 63%. Tratado como vazio: 641 de 641.
  assert.equal(valorOuVazio('Não informado'), '');
  assert.equal(valorOuVazio('não informado'), '');
  assert.equal(valorOuVazio('N/A'), '');
  assert.equal(valorOuVazio('Career Band A'), 'Career Band A');
  assert.equal(valorOuVazio(null), '');
});

test('nao confunde valor legitimo que contenha a palavra', () => {
  assert.equal(valorOuVazio('Informado pelo gestor'), 'Informado pelo gestor');
});

test('desligado entra no mes em que saiu, e some depois', () => {
  // O arquivo de julho tem 654 linhas, 16 desligadas, e as 18 datas de saida
  // que ele traz sao todas de julho. Filtrar so pela admissao daria 801 para
  // agosto: os 172 desligados desde 2024 entrariam todos.
  assert.equal(noMesDeReferencia('2020-01-10', '2026-07', '2026-07-01', '2026-07-31'), true);
  assert.equal(noMesDeReferencia('2020-01-10', '2026-07', '2026-08-01', '2026-08-31'), false);
  assert.equal(noMesDeReferencia('2020-01-10', '2024-03', '2026-08-01', '2026-08-31'), false);
});

test('quem ainda nao tinha entrado fica de fora', () => {
  assert.equal(noMesDeReferencia('2026-09-02', null, '2026-08-01', '2026-08-31'), false);
  assert.equal(noMesDeReferencia('2026-08-31', null, '2026-08-01', '2026-08-31'), true);
});

test('ativo sem data de saida entra sempre', () => {
  assert.equal(noMesDeReferencia('2013-03-25', null, '2026-08-01', '2026-08-31'), true);
});

test('sem data de admissao a pessoa fica, e nao some', () => {
  assert.equal(noMesDeReferencia(null, null, '2026-08-01', '2026-08-31'), true);
  assert.equal(noMesDeReferencia('data estranha', null, '2026-08-01', '2026-08-31'), true);
});

test('o valor de hoje ganha de qualquer foto anterior', () => {
  const r = ultimoValorConhecido('L4', ['L3', 'L2']);
  assert.equal(r.valor, 'L4');
  assert.equal(r.deMesAnterior, false);
});

test('campo vazio hoje puxa a foto mais recente que tiver valor', () => {
  // A nota de agosto do arquivo entregue: Job Type Family, Career Band e
  // WorkDay Level em branco para 120 colegas, puxados do ultimo mes com valor.
  const r = ultimoValorConhecido(null, [null, 'L3', 'L2']);
  assert.equal(r.valor, 'L3');
  assert.equal(r.deMesAnterior, true);
});

test('"Nao informado" na foto antiga tambem e vazio', () => {
  assert.equal(ultimoValorConhecido(null, ['Não informado', 'L2']).valor, 'L2');
  assert.equal(ultimoValorConhecido('Não informado', ['L2']).valor, 'L2');
});

test('sem nenhuma foto com valor, sai vazio em vez de inventar', () => {
  const r = ultimoValorConhecido(null, [null, null]);
  assert.equal(r.valor, '');
  assert.equal(r.deMesAnterior, false);
});

test('nao carrega valor mais velho que a janela', () => {
  // Um Career Band de dezoito meses atras nao descreve mais ninguem. Carregar
  // valor velho para sempre faz o campo parecer preenchido enquanto apodrece.
  const antigas = [null, null, null, null, null, null, 'L1'];
  assert.equal(ultimoValorConhecido(null, antigas).valor, '');
  assert.equal(ultimoValorConhecido(null, antigas, 7).valor, 'L1');
});

const MAPA_REAL = new Map([
  ['FTE %', { campo: 'Força de Trabalho', origem: 'personalizado' }],
  ['Compensation Grade', { campo: 'Level', origem: 'personalizado' }],
  ['Basic Salary', { campo: 'salary', origem: 'listagem' }],
]);

test('escolha que aponta para campo renomeado e acusada pelo nome', () => {
  // O RH renomeia `Forca de Trabalho` e a coluna FTE % sai vazia. O unico
  // sinal seria a contagem de vazios, que diz QUANTOS e nao POR QUE.
  const orfas = escolhasOrfas(MAPA_REAL, new Set(['Level']), new Set(['salary']));
  assert.deepEqual(orfas.map((o) => o.coluna), ['FTE %']);
  assert.equal(orfas[0].campo, 'Força de Trabalho');
});

test('mapa inteiro resolvido nao acusa nada', () => {
  const orfas = escolhasOrfas(
    MAPA_REAL, new Set(['Força de Trabalho', 'Level']), new Set(['salary']),
  );
  assert.deepEqual(orfas, []);
});

test('coluna da tabela que ficou toda nula tambem e acusada', () => {
  // Foi o caso do `cost_center`: existia na tabela e estava em 0 de 639.
  const orfas = escolhasOrfas(MAPA_REAL, new Set(['Força de Trabalho', 'Level']), new Set());
  assert.deepEqual(orfas.map((o) => o.coluna), ['Basic Salary']);
});

test('personalizado e coluna nao se confundem', () => {
  // `Level` como nome de coluna da tabela nao satisfaz uma escolha que diz
  // `personalizado`, e vice-versa.
  const orfas = escolhasOrfas(MAPA_REAL, new Set(), new Set(['Level', 'Força de Trabalho', 'salary']));
  assert.equal(orfas.length, 2);
});
