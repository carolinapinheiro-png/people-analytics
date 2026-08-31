import test from 'node:test';
import assert from 'node:assert/strict';
import { podeVerLinha, type EscopoComp } from './comp-scope';
import { aplicarFiltrosDeComp } from './filtros-comp';
import { agruparEquidade, N_MINIMO_EQUIDADE } from './equidade';

/**
 * O cartão de equidade visto por quem NÃO é global.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE
 * ===========================================================================
 * `comp-scope.test.ts` já prova que `podeVerLinha` decide certo. `equidade.
 * test.ts` já prova que a supressão por célula pequena funciona. Nenhum dos
 * dois provava que as duas coisas estão LIGADAS no cartão que entrou hoje --
 * e é na ligação que este projeto vem errando a semana inteira: regra certa,
 * conta certa, e o pedaço do meio faltando.
 *
 * `getCompEquidade` é server function e não roda aqui. O que roda é a mesma
 * sequência de funções puras que ela executa, na mesma ordem:
 *
 *   podeVerLinha  ->  aplicarFiltrosDeComp  ->  agruparEquidade
 *
 * Se a ordem mudar lá e não aqui, estes testes deixam de valer. Por isso a
 * ordem está escrita no alto e repetida em cada teste.
 *
 * ===========================================================================
 * O QUE UM PERFIL COM ESCOPO NÃO PODE VER
 * ===========================================================================
 * Remuneração de outra área -- nem individual, nem dentro de uma mediana.
 * Uma mediana é agregado, mas agregado sobre gente que a pessoa não podia ver
 * continua sendo dado que ela não podia ver.
 */

const GLOBAL: EscopoComp = { global: true, camada: null, areas: [] };
/** Gestora de Marketing, camada N-2: vê quem está ABAIXO dela, na área dela. */
const MARKETING: EscopoComp = { global: false, camada: 2, areas: ['MARKETING'] };

const p = (area: string, camada: string, cr: number, genero: string, nivel = 'L3') =>
  ({ area, n_layer: camada, comp_ratio: cr, genero, level: nivel });

/** A MESMA sequência da server function. */
const pipeline = (linhas: ReturnType<typeof p>[], escopo: EscopoComp, filtros = {}) => {
  const visiveis = aplicarFiltrosDeComp(
    linhas.filter((r) => podeVerLinha(escopo, { area: r.area, n_layer: r.n_layer })),
    filtros,
  );
  return {
    visiveis,
    grupos: agruparEquidade(
      visiveis.map((r) => ({ nivel: r.level, chave: r.genero, cr: r.comp_ratio })),
      ['Feminino', 'Masculino'],
    ),
  };
};

const BASE = [
  ...Array.from({ length: 6 }, () => p('MARKETING', 'N-4', 88, 'Feminino')),
  ...Array.from({ length: 6 }, () => p('MARKETING', 'N-4', 110, 'Masculino')),
  ...Array.from({ length: 9 }, () => p('TECHNOLOGY', 'N-4', 130, 'Masculino')),
  ...Array.from({ length: 9 }, () => p('TECHNOLOGY', 'N-4', 70, 'Feminino')),
];

test('perfil global vê as duas áreas na conta', () => {
  const { visiveis } = pipeline(BASE, GLOBAL);
  assert.equal(visiveis.length, 30);
});

test('gestora de Marketing NÃO vê ninguém de Technology, nem dentro da mediana', () => {
  // O ponto central. Uma mediana é agregado, mas agregado sobre gente de outra
  // área continua sendo dado de outra área.
  const { visiveis, grupos } = pipeline(BASE, MARKETING);
  assert.equal(visiveis.length, 12, 'só as 12 de Marketing');
  assert.ok(visiveis.every((r) => r.area === 'MARKETING'));

  const geral = grupos.find((g) => g.nivel === 'Geral')!;
  const fem = geral.celulas.find((c) => c.grupo === 'Feminino')!;
  assert.equal(fem.n, 6, 'as 9 mulheres de Technology não entram');
  assert.equal(fem.mediana, 88, 'e não puxam a mediana para 70');
});

test('quem está na MESMA camada ou acima não entra, mesmo sendo da área', () => {
  // `podeVerLinha` usa `>`, não `>=`: pares e chefes ficam de fora. Sem isto,
  // a mediana da área revelaria a posição salarial do próprio gestor.
  const comPares = [
    ...BASE,
    ...Array.from({ length: 5 }, () => p('MARKETING', 'N-2', 150, 'Masculino')),
    ...Array.from({ length: 5 }, () => p('MARKETING', 'N-1', 180, 'Masculino')),
  ];
  const { visiveis } = pipeline(comPares, MARKETING);
  assert.equal(visiveis.length, 12);
  assert.ok(visiveis.every((r) => r.n_layer === 'N-4'));
});

test('camada não cadastrada esconde tudo — o erro cai para o lado seguro', () => {
  const semCamada: EscopoComp = { global: false, camada: null, areas: ['MARKETING'] };
  assert.equal(pipeline(BASE, semCamada).visiveis.length, 0);
});

test('a supressão continua valendo DEPOIS do escopo, não antes', () => {
  // Uma área pequena pode passar no escopo e ainda assim não publicar: são
  // duas proteções em série, e a segunda não pode sumir porque a primeira
  // deixou passar.
  const poucas = [
    ...Array.from({ length: 3 }, () => p('MARKETING', 'N-4', 88, 'Feminino')),
    ...Array.from({ length: 8 }, () => p('MARKETING', 'N-4', 110, 'Masculino')),
  ];
  const { grupos } = pipeline(poucas, MARKETING);
  const geral = grupos.find((g) => g.nivel === 'Geral')!;
  const fem = geral.celulas.find((c) => c.grupo === 'Feminino')!;
  assert.equal(fem.n, 3, 'o grupo continua visível');
  assert.equal(fem.mediana, null, `abaixo de ${N_MINIMO_EQUIDADE}, sem mediana`);
  assert.equal(geral.celulas.find((c) => c.grupo === 'Masculino')!.mediana, 110);
});

test('o filtro de tela não amplia o escopo', () => {
  // Pedir Technology sendo gestora de Marketing não devolve Technology: o
  // filtro estreita o que já passou pela permissão, nunca o contrário.
  const { visiveis } = pipeline(BASE, MARKETING, { department: 'TECHNOLOGY' });
  assert.equal(visiveis.length, 0);
});

test('a ordem importa: filtrar antes da permissão devolveria dado de fora', () => {
  // Este teste existe para falhar se alguém inverter a ordem na server
  // function. Filtrando primeiro por Technology e só depois aplicando o
  // escopo de Marketing, o resultado seria vazio -- igual. Mas com o escopo
  // GLOBAL invertido a diferença aparece, e é o canário.
  const soPermissao = BASE.filter((r) => podeVerLinha(MARKETING, { area: r.area, n_layer: r.n_layer }));
  const soFiltro = aplicarFiltrosDeComp(BASE, { department: 'MARKETING' });
  // Os dois caminhos chegam às 12 de Marketing SÓ porque a área coincide.
  assert.equal(soPermissao.length, 12);
  assert.equal(soFiltro.length, 12);
  // A diferença: o filtro sozinho não sabe de camada.
  const comChefes = [...BASE, ...Array.from({ length: 4 }, () => p('MARKETING', 'N-1', 200, 'Masculino'))];
  assert.equal(aplicarFiltrosDeComp(comChefes, { department: 'MARKETING' }).length, 16);
  assert.equal(
    comChefes.filter((r) => podeVerLinha(MARKETING, { area: r.area, n_layer: r.n_layer })).length,
    12,
    'só a permissão barra a camada de cima',
  );
});
