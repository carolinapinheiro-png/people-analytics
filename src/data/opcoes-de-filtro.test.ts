import test from 'node:test';
import assert from 'node:assert/strict';
import { opcoesDoDado } from './opcoes-de-filtro';
import { mesmoValor } from '@/lib/filtro-sentinela';
import type { MonthRecord } from './raw-data';
import type { LeaverRecord } from './leaver-types';

/**
 * O seletor tem de oferecer o que a carga grava -- nem mais, nem menos.
 *
 * Estes testes existem porque a divergência entre as duas listas não dava erro
 * em lugar nenhum. Ela desenhava uma linha reta no zero, que se lê como "não
 * temos ninguém nessa faixa", e escondia 178 pessoas no filtro de level.
 */

const mes = (extra: Partial<MonthRecord>): MonthRecord => ({
  month: '2026-09', headcount: 100, joiners: 0, leavers: 0,
  ...extra,
} as MonthRecord);

test('as opções saem das chaves gravadas, não de uma lista escrita à mão', () => {
  const o = opcoesDoDado([mes({
    family_base: { 'Data & Analytics': 19, 'Customer Operations': 150 },
    contract_base: { CLT: 449, 'Pessoa Jurídica': 342, 'Diretor Estatutário': 6 },
    level_base: { L4: 115, L7: 10, L9: 2 },
  })], []);

  // "Data & Analytics" e "Diretor Estatutário" não estavam na lista da barra;
  // L7 e L9 também não. Eram 178 pessoas sem recorte possível.
  assert.deepEqual(o.jobFamily, ['Customer Operations', 'Data & Analytics']);
  // Alfabética desde 10/09: "Diretor Estatutário" antes de "Pessoa Jurídica",
  // e não depois por ter menos gente.
  assert.deepEqual(o.tipoContrato, ['CLT', 'Diretor Estatutário', 'Pessoa Jurídica']);
  assert.deepEqual(o.level, ['L4', 'L7', 'L9']);
});

test('tempo de casa sai na ordem da régua, não por tamanho', () => {
  // "5+ anos" depois de "1-2 anos" é a única ordem que se lê. Por frequência,
  // a faixa mais populosa viria primeiro e a escada perderia o sentido.
  const o = opcoesDoDado([mes({
    tenure_base: { '5+ anos': 35, '0-3 meses': 102, '1-2 anos': 168, '6-12 meses': 196 },
  })], []);
  assert.deepEqual(o.tempoCasa, ['0-3 meses', '6-12 meses', '1-2 anos', '5+ anos']);
});

test('valor novo, fora da régua, entra no fim -- e não no começo', () => {
  // `indexOf` devolve -1 para desconhecido, e -1 ordena antes de tudo. Sem o
  // tratamento, uma faixa nova que o RH criasse apareceria em primeiro lugar.
  const o = opcoesDoDado([mes({
    tenure_base: { '1-2 anos': 10, '10+ anos': 3, '0-3 meses': 5 },
  })], []);
  assert.deepEqual(o.tempoCasa, ['0-3 meses', '1-2 anos', '10+ anos']);
});

test('a ausência vai para o fim, com UM nome, e NÃO some', () => {
  // Em set/2026 são 166 pessoas em `level` e 64 em job family -- a maior fatia
  // de `level`. Escondê-las faria a soma dos recortes não bater com o
  // headcount, sem nada na tela dizendo por quê.
  //
  // E aparecem com o rótulo canônico, não com o que cada base escreveu: a
  // série grava "NA", e oferecer "NA" no seletor obrigaria quem lê a saber
  // que aquilo quer dizer "não preenchido".
  const o = opcoesDoDado([mes({
    level_base: { NA: 166, L4: 115 },
    family_base: { 'Não informado': 64, HR: 24 },
  })], []);
  assert.deepEqual(o.level, ['L4', 'Não informado']);
  assert.deepEqual(o.jobFamily, ['HR', 'Não informado']);
});

test('o vocabulário é a UNIÃO dos meses, não o do último', () => {
  // Um vínculo que existiu em janeiro e acabou em setembro continua sendo um
  // recorte legítimo da série -- e sumir do seletor tornaria o passado
  // inalcançável.
  const o = opcoesDoDado([
    mes({ month: '2026-01', contract_base: { CLT: 400, Estágio: 12 } }),
    mes({ month: '2026-09', contract_base: { CLT: 449 } }),
  ], []);
  assert.deepEqual(o.tipoContrato, ['CLT', 'Estágio']);
});

test('o catálogo NÃO pode encolher quando um valor já está escolhido', () => {
  // O defeito de 10/09, relatado como "não consigo ver todos os departamentos
  // após selecionar um".
  //
  // As opções passaram a vir do dado -- certo -- mas vinham de `allMonthsData`,
  // que já passou pelo `applyDeptFilter`. Escolher TECHNOLOGY reduzia
  // `dept_data` a TECHNOLOGY, e o seletor perdia todos os outros: a seleção
  // apagava as alternativas a ela.
  //
  // Aqui as duas séries são exercitadas lado a lado. A do catálogo tem de
  // continuar oferecendo as três áreas.
  const completa = mes({
    dept_data: {
      TECHNOLOGY: { hc: 173 }, OPERATION: { hc: 147 }, HR: { hc: 24 },
    } as never,
  });
  const jaRecortada = mes({ dept_data: { TECHNOLOGY: { hc: 173 } } as never });

  assert.deepEqual(
    opcoesDoDado([completa], []).departamento,
    ['HR', 'OPERATION', 'TECHNOLOGY'],
  );
  // O que a barra veria se lesse a série recortada -- e é por isso que ela
  // recebe `serieSemRecorteDeArea` do contexto, e não `allMonthsData`.
  assert.deepEqual(opcoesDoDado([jaRecortada], []).departamento, ['TECHNOLOGY']);
});

// ---------------------------------------------------------------------------
// A INVARIANTE: TODA PESSOA TEM DE SER ALCANÇÁVEL POR ALGUM RECORTE
// ---------------------------------------------------------------------------
// Este é o teste que faltava e que teria pego tudo o que apareceu em 10/09.
// Ele não confere uma lista contra outra lista -- confere que, para cada
// dimensão, TODO valor presente em QUALQUER das duas bases é encontrável por
// alguma opção do seletor.
//
// É a formulação certa porque não depende de eu lembrar quais valores existem.

test('todo valor das duas bases é alcançável por alguma opção', () => {
  const meses = [mes({
    level_base: { L4: 115, L7: 10, NA: 166 },
    family_base: { 'Data & Analytics': 19, 'Não informado': 64 },
    contract_base: { CLT: 449, Aprendiz: 4 },
    tenure_base: { '0-3 meses': 100, '5+ anos': 35 },
    dept_data: { TECHNOLOGY: { hc: 173 }, GERALL: { hc: 20 } } as never,
  })];
  // Os desligados trazem valores que a série NÃO tem, e escrevem a ausência
  // com outra palavra -- os dois casos reais medidos no banco.
  const leavers = [
    { level: 'Não se aplica', job_family: 'Legal', vinculo: 'Sócio',
      tempo_casa_faixa: '2-5 anos', departamento: '-',
      faixa_salarial: '5k-8k', tipo_desligamento_agrupado: 'Voluntário' },
  ] as LeaverRecord[];

  const o = opcoesDoDado(meses, leavers);

  const alcancavel = (opcoes: string[] | undefined, valor: string) =>
    (opcoes ?? []).some((op) => mesmoValor(op, valor));

  // Da série
  for (const v of ['L4', 'L7', 'NA']) {
    assert.ok(alcancavel(o.level, v), `level "${v}" ficou sem opção`);
  }
  for (const v of ['Data & Analytics', 'Não informado']) {
    assert.ok(alcancavel(o.jobFamily, v), `job family "${v}" ficou sem opção`);
  }
  assert.ok(alcancavel(o.tipoContrato, 'Aprendiz'));
  assert.ok(alcancavel(o.departamento, 'TECHNOLOGY'));

  // Dos desligados -- inclusive os que a série não conhece
  assert.ok(alcancavel(o.level, 'Não se aplica'), 'a ausência dos desligados');
  assert.ok(alcancavel(o.jobFamily, 'Legal'), 'família só dos desligados');
  assert.ok(alcancavel(o.tipoContrato, 'Sócio'));

  // A ÚNICA exceção, e ela é declarada: GERALL e "-" não são áreas.
  // Se alguém tirar uma linha de NAO_SAO_DEPARTAMENTOS sem querer, o teste
  // acima volta a cobrar a alcançabilidade dela.
  for (const v of ['GERALL', '-']) {
    assert.ok(
      !alcancavel(o.departamento, v),
      `"${v}" voltou ao seletor de área -- ele não é um departamento oficial`,
    );
  }
});

test('os não-departamentos saem do seletor, e só do de área', () => {
  // Decisão da Carolina: Porto, Gerall, Geral e Diretoria estão no Convenia e
  // não são áreas. As pessoas continuam no headcount; o que sai é o recorte.
  const o = opcoesDoDado([mes({
    dept_data: {
      TECHNOLOGY: { hc: 173 }, PORTO: { hc: 18 }, GERALL: { hc: 20 },
      GERAL: { hc: 1 }, DIRETORIA: { hc: 6 }, HR: { hc: 24 },
    } as never,
    // A mesma palavra em OUTRA dimensão continua valendo: "Não informado" em
    // job family são 64 pessoas reais, e escondê-las faria a soma não bater.
    family_base: { HR: 24, 'Não informado': 64 },
  })], []);

  assert.deepEqual(o.departamento, ['HR', 'TECHNOLOGY']);
  assert.deepEqual(o.jobFamily, ['HR', 'Não informado']);
});

test('a ordem é alfabética -- e respeita acento do português', () => {
  // Por código, "Á" vem depois de "Z" e a área acentuada cai no fim da lista,
  // longe de onde quem procura espera.
  const o = opcoesDoDado([mes({
    dept_data: {
      ZONA: { hc: 1 }, ÁGUAS: { hc: 1 }, MARKETING: { hc: 1 }, ANALYTICS: { hc: 1 },
    } as never,
  })], []);
  assert.deepEqual(o.departamento, ['ÁGUAS', 'ANALYTICS', 'MARKETING', 'ZONA']);
});

test('as duas escadas NÃO ficam alfabéticas -- elas são progressão', () => {
  // Alfabética daria "0-3 meses, 1-2 anos, 2-5 anos, 3-6 meses, 5+ anos,
  // 6-12 meses": a escada embaralhada deixa de ser lida como progressão.
  const o = opcoesDoDado([mes({
    tenure_base: {
      '5+ anos': 1, '0-3 meses': 1, '2-5 anos': 1, '6-12 meses': 1,
      '1-2 anos': 1, '3-6 meses': 1,
    },
  })], [{ faixa_salarial: '50k+' }, { faixa_salarial: '3k-5k' },
    { faixa_salarial: '12k-20k' }] as LeaverRecord[]);

  assert.deepEqual(o.tempoCasa,
    ['0-3 meses', '3-6 meses', '6-12 meses', '1-2 anos', '2-5 anos', '5+ anos']);
  assert.deepEqual(o.faixaSalarial, ['3k-5k', '12k-20k', '50k+']);
});

test('as três palavras para ausência viram UMA opção', () => {
  // "NA" na série, "Não informado" e "Não se aplica" nos desligados, "-" no
  // departamento. Oferecer as quatro daria quatro seletores para a mesma
  // pergunta, cada um achando só a base que o escreveu.
  const o = opcoesDoDado(
    [mes({ level_base: { L4: 10, NA: 166 } })],
    [{ level: 'Não se aplica' }, { level: 'Não informado' }] as LeaverRecord[],
  );
  assert.deepEqual(o.level, ['L4', 'Não informado']);
});

test('série vazia não devolve listas vazias', () => {
  // Lista vazia apagaria os seletores durante o carregamento, e "ainda não
  // carregou" viraria "não existe". A barra precisa cair na reserva dela.
  assert.deepEqual(opcoesDoDado([], []), {});
});

test('faixa salarial e tipo de desligamento saem da base por pessoa', () => {
  // O AGRUPADO, e não o cru. `tipo_desligamento` guarda o texto do Convenia
  // ("Demissão SEM justa causa fora do contrato de experiência - Pedido da
  // Empresa", doze variantes); é o agrupado que a aba de Atrição compara com o
  // filtro. Oferecer o cru daria doze opções ilegíveis, nenhuma casando.
  const leavers = [
    { faixa_salarial: '5k-8k', tipo_desligamento: 'Demissão SEM justa causa...', tipo_desligamento_agrupado: 'Involuntário' },
    { faixa_salarial: 'Até 3k', tipo_desligamento: 'Antecipado pelo empregado', tipo_desligamento_agrupado: 'Involuntário' },
    { faixa_salarial: '5k-8k', tipo_desligamento: 'Outros', tipo_desligamento_agrupado: 'Voluntário' },
  ] as LeaverRecord[];
  const o = opcoesDoDado([mes({ level_base: { L4: 1 } })], leavers);
  // Faixa salarial sai na escada, não por frequência.
  assert.deepEqual(o.faixaSalarial, ['Até 3k', '5k-8k']);
  assert.deepEqual(o.tipoDesligamento, ['Involuntário', 'Voluntário']);
});

test('sem desligados, os dois filtros de pessoa ficam com a lista da barra', () => {
  const o = opcoesDoDado([mes({ level_base: { L4: 1 } })], []);
  assert.equal(o.faixaSalarial, undefined);
  assert.equal(o.tipoDesligamento, undefined);
});
