import test from 'node:test';
import assert from 'node:assert/strict';
import { compararSeries, camposComValor, AUSENTES_NA_SERIE_CONVENIA } from './serie-cobertura';
import { reconstruirSerie, type PessoaConvenia } from './convenia/pessoas';
import { RAW_DATA } from '@/data/raw-data';

/**
 * A verificação que faltava em 09/09.
 *
 * Quatro gráficos ficaram vazios porque a série do Convenia substituiu a
 * congelada sem produzir tudo o que ela produzia. Nenhum deu erro; todos foram
 * encontrados por uma pessoa olhando a tela.
 *
 * Este teste faz a comparação que ninguém estava fazendo.
 */

/**
 * Seis gestores e seis liderados.
 *
 * O tamanho não é enfeite: as médias salariais só saem com pelo menos
 * `MIN_GRUPO_SALARIO` (5) pessoas no grupo -- média de poucos é salário
 * individual disfarçado. Com uma amostra pequena, `avg_salary_leaders` sairia
 * `null` e a comparação acusaria uma ausência que é, na verdade, a supressão
 * funcionando. O teste tem de exercitar o caminho normal, não o suprimido.
 */
const PESSOAS: PessoaConvenia[] = Array.from({ length: 12 }, (_, i) => {
  const gestor = i < 6;
  return {
    id: String(i + 1),
    hiring_date: `2026-01-0${(i % 9) + 1}`,
    department: { name: i % 2 === 0 ? 'TECHNOLOGY' : 'HR' },
    genero: i % 2 === 0 ? 'F' : 'M',
    raca: ['Parda', 'Branca', 'Preta'][i % 3],
    salary: gestor ? 20000 + i * 100 : 6000 + i * 100,
    uf: i % 2 === 0 ? 'PE' : 'SP',
    birth_date: `199${i % 10}-05-05`,
    relationship: i % 3 === 0 ? 'Pessoa Jurídica' : 'CLT',
    jobFamily: ['Product & Technology', 'Data & Analytics', 'HR'][i % 3],
    nivel: `L${(i % 6) + 1}`,
    marital: ['Casado(a)', 'Solteiro(a)', 'Divorciado(a)'][i % 3],
    origem: ['PE', 'SP', 'CE'][i % 3],
    // Cada liderado reporta a um gestor distinto: `idsDeGestores` deriva
    // liderança de quem aparece como supervisor de alguém.
    supervisorId: gestor ? null : String(i - 5),
  } satisfies PessoaConvenia;
});

const serieConvenia = () =>
  reconstruirSerie(PESSOAS, 'NSX', '2026-01').linhas as unknown as Array<Record<string, unknown>>;

test('a série do Convenia produz tudo o que a congelada produz, ou declara o motivo', () => {
  const { naoDeclarados } = compararSeries(
    RAW_DATA as unknown as Array<Record<string, unknown>>,
    serieConvenia(),
  );
  assert.deepEqual(
    naoDeclarados,
    [],
    'Campo produzido pela série congelada e ausente na do Convenia, sem motivo declarado. '
    + 'Ou a carga passa a produzi-lo, ou ele entra em AUSENTES_NA_SERIE_CONVENIA com o que falta '
    + 'para existir. Um gráfico vazio não pode ser a forma de descobrir isto: '
    + `${naoDeclarados.join(', ')}`,
  );
});

test('nenhuma declaração de ausência está obsoleta', () => {
  // O erro simétrico: a carga passou a produzir o campo e a nota continuou
  // dizendo que não produz. Nota errada é pior que nota nenhuma -- a próxima
  // pessoa acredita nela e não vai conferir.
  const { declaracoesObsoletas } = compararSeries(
    RAW_DATA as unknown as Array<Record<string, unknown>>,
    serieConvenia(),
  );
  assert.deepEqual(
    declaracoesObsoletas,
    [],
    `Declarado como ausente, mas a série produz: ${declaracoesObsoletas.join(', ')}. Tire de AUSENTES_NA_SERIE_CONVENIA.`,
  );
});

test('os quatro de 09/09 continuam sendo produzidos', () => {
  // Guarda explícita e nominal. A comparação acima pega o caso geral; estes
  // quatro custaram uma tarde e merecem um teste que os cite pelo nome.
  const [jan] = serieConvenia();
  const campos = camposComValor(jan);
  for (const c of ['level_base', 'family_base', 'contract_base', 'tenure_base']) {
    assert.ok(campos.has(c), `${c} voltou a sair vazio`);
  }
  const demo = jan.demographics as Record<string, unknown>;
  for (const c of ['age', 'race', 'marital', 'origin']) {
    assert.ok(
      demo[c] != null && Object.keys(demo[c] as object).length > 0,
      `demographics.${c} voltou a sair vazio`,
    );
  }
});

test('presença não conta: `{}` e `[]` valem como ausência', () => {
  // É assim que `level_base` passou despercebido -- a chave existia na
  // estrutura e o objeto estava vazio em toda linha.
  const campos = camposComValor({
    cheio: { a: 1 }, vazioObj: {}, vazioArr: [], nulo: null, zero: 0, texto: '',
  });
  assert.deepEqual([...campos].sort(), ['cheio', 'texto', 'zero']);
});

test('promoções saíram da lista de dívidas -- a carga passou a calculá-las', () => {
  // Em 09/09 esta lista dizia "falta ler o histórico salarial". A carga passou
  // a ler, e a linha saiu. O teste fica para que a volta dela seja deliberada:
  // se alguém reintroduzir a declaração, é porque desligou a leitura.
  assert.ok(!('promotions' in AUSENTES_NA_SERIE_CONVENIA));
  assert.ok(!('raise_events' in AUSENTES_NA_SERIE_CONVENIA));
});
