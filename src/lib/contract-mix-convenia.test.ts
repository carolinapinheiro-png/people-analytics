import test from 'node:test';
import assert from 'node:assert/strict';
import { categoriaDeVinculo, montarEvolucaoCLTPJ } from './contract-mix-convenia';

test('categoriaDeVinculo reconhece os valores crus do Convenia', () => {
  assert.equal(categoriaDeVinculo('CLT'), 'CLT');
  assert.equal(categoriaDeVinculo('Pessoa Jurídica'), 'PJ');
  assert.equal(categoriaDeVinculo('Aprendiz'), 'Aprendiz');
});

test('Diretor Estatutário e Associado caem na mesma categoria da série congelada', () => {
  assert.equal(categoriaDeVinculo('Diretor Estatutário'), 'Estatutário/Sócio');
  assert.equal(categoriaDeVinculo('Associado'), 'Estatutário/Sócio');
});

test('vínculo sem categoria própria cai em Outros, não desaparece', () => {
  assert.equal(categoriaDeVinculo('Contrato Intermitente'), 'Outros');
  assert.equal(categoriaDeVinculo(null), 'Outros');
  assert.equal(categoriaDeVinculo(undefined), 'Outros');
});

test('categoriaDeVinculo ignora acento e caixa', () => {
  assert.equal(categoriaDeVinculo('pessoa juridica'), 'PJ');
  assert.equal(categoriaDeVinculo('  CLT  '), 'CLT');
});

test('montarEvolucaoCLTPJ agrupa por marca x categoria', () => {
  const { linhas, semMarca } = montarEvolucaoCLTPJ(
    [
      { empresa: 'NSX Brasil Recife', relationship: 'CLT' },
      { empresa: 'NSX Brasil São Paulo', relationship: 'CLT' },
      { empresa: 'NSX Brasil Recife', relationship: 'Pessoa Jurídica' },
      { empresa: 'Betfair', relationship: 'CLT' },
    ],
    20000,
  );
  assert.equal(semMarca, 0);
  const nsxClt = linhas.find((l) => l.brand === 'NSX' && l.contract === 'CLT');
  assert.equal(nsxClt?.n, 2);
  const nsxPj = linhas.find((l) => l.brand === 'NSX' && l.contract === 'PJ');
  assert.equal(nsxPj?.n, 1);
  const betfairClt = linhas.find((l) => l.brand === 'Betfair BR' && l.contract === 'CLT');
  assert.equal(betfairClt?.n, 1);
});

test('empresa não reconhecida conta em semMarca e não vira linha fantasma', () => {
  const { linhas, semMarca } = montarEvolucaoCLTPJ(
    [{ empresa: 'Uma Empresa Desconhecida Ltda', relationship: 'CLT' }],
    20000,
  );
  assert.equal(semMarca, 1);
  assert.equal(linhas.length, 0);
});

test('empresa nula também conta em semMarca', () => {
  const { semMarca } = montarEvolucaoCLTPJ([{ empresa: null, relationship: 'CLT' }], 20000);
  assert.equal(semMarca, 1);
});

test('position cresce com diaDoMes e respeita a ordem das categorias', () => {
  const { linhas } = montarEvolucaoCLTPJ(
    [
      { empresa: 'NSX Brasil Recife', relationship: 'CLT' },
      { empresa: 'NSX Brasil Recife', relationship: 'Pessoa Jurídica' },
    ],
    20000,
  );
  const clt = linhas.find((l) => l.contract === 'CLT');
  const pj = linhas.find((l) => l.contract === 'PJ');
  // CLT é índice 0, PJ é índice 1 em CATEGORIAS_VINCULO.
  assert.equal(clt?.position, 200000);
  assert.equal(pj?.position, 200001);
  assert.ok((pj?.position ?? 0) > (clt?.position ?? 0));
});

test('position de um mês mais recente fica sempre maior que a de um mês antigo', () => {
  const mesAntigo = montarEvolucaoCLTPJ([{ empresa: 'NSX Brasil Recife', relationship: 'CLT' }], 19000);
  const mesNovo = montarEvolucaoCLTPJ([{ empresa: 'NSX Brasil Recife', relationship: 'CLT' }], 20000);
  assert.ok(mesNovo.linhas[0].position > mesAntigo.linhas[0].position);
  // E, mais importante: maior que qualquer posição da série congelada (0-75).
  assert.ok(mesAntigo.linhas[0].position > 75);
});
