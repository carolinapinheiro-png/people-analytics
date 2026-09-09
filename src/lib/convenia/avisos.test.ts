import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparAvisos, classificar, feito, limite } from './avisos';

test('aviso SEM marca cai em pendência, e não some', () => {
  // A regra que sustenta o desenho: esquecer de marcar empurra para o lado
  // visível. Se o padrão fosse "recibo", um aviso novo nasceria escondido --
  // e o defeito só apareceria quando alguém precisasse dele.
  const { categoria, texto } = classificar('162 pessoas sem Level');
  assert.equal(categoria, 'pendencia');
  assert.equal(texto, '162 pessoas sem Level');
});

test('a marca sai do texto que vai para a tela', () => {
  assert.deepEqual(classificar(feito('Foto do cadastro gravada')), {
    categoria: 'feito', texto: 'Foto do cadastro gravada',
  });
  assert.deepEqual(classificar(limite('193 linhas nascem marcadas')), {
    categoria: 'limite', texto: '193 linhas nascem marcadas',
  });
});

test('agrupa preservando a ordem de cada grupo', () => {
  const g = agruparAvisos([
    feito('gravou a foto'),
    '162 sem Level',
    limite('35 desligados da tabela guardada'),
    feito('cobertura completa'),
    '60 sem Job Type Family',
  ]);
  assert.deepEqual(g.feito, ['gravou a foto', 'cobertura completa']);
  assert.deepEqual(g.pendencia, ['162 sem Level', '60 sem Job Type Family']);
  assert.deepEqual(g.limite, ['35 desligados da tabela guardada']);
});

test('lista vazia devolve os três grupos vazios, e não undefined', () => {
  // Quem desenha faz `.length` nos três sem checar existência.
  assert.deepEqual(agruparAvisos([]), { feito: [], pendencia: [], limite: [] });
});

test('texto que por acaso contém a palavra "feito" NÃO vira recibo', () => {
  // A classificação é por marca no início, não por conteúdo. Classificar pelo
  // texto é o erro que este arquivo existe para não repetir.
  const { categoria } = classificar('O de-para foi feito para cinco famílias e o Convenia tem dez');
  assert.equal(categoria, 'pendencia');
});
