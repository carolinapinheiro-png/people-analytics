import test from 'node:test';
import assert from 'node:assert/strict';
import { areaDoRecorte, recorteVisivel } from '@/lib/recorte-visivel';

/** Perfil com escopo de Marketing: só a própria área passa. */
const soMarketing = (area: string) => area === 'Marketing';
/** Perfil global sem seleção. */
const tudo = () => true;

test('areaDoRecorte: só recorte de área nomeia uma área', () => {
  assert.equal(areaDoRecorte('area', 'Marketing'), 'Marketing');
  assert.equal(areaDoRecorte('area+tempo', 'Marketing || 24+ meses'), 'Marketing');
  for (const t of ['company', 'tempo', 'modelo', 'marca', 'funcao']) {
    assert.equal(areaDoRecorte(t, 'qualquer'), null, `${t} não é recorte de área`);
  }
});

test('recorte transversal passa para quem tem escopo', () => {
  // Este era o bug: os drivers barravam, os cuts liberavam, e o filtro por
  // tempo de casa mostrava número sem clima.
  for (const t of ['tempo', 'modelo', 'marca', 'funcao', 'company']) {
    assert.equal(recorteVisivel(t, '24+ meses', soMarketing), true, t);
  }
});

test('recorte DE área continua fechado para área alheia', () => {
  assert.equal(recorteVisivel('area', 'Technology', soMarketing), false);
  assert.equal(recorteVisivel('area', 'Marketing', soMarketing), true);
  // O cruzado carrega a área no nome e segue a mesma porta.
  assert.equal(recorteVisivel('area+tempo', 'Technology || 24+ meses', soMarketing), false);
  assert.equal(recorteVisivel('area+tempo', 'Marketing || 24+ meses', soMarketing), true);
});

test('linha marcada como área com nome que não resolve falha FECHADO', () => {
  // Dado corrompido não vira permissão: 'area' sem separador válido no
  // cruzamento devolve null, e a linha não passa nem para perfil global.
  assert.equal(recorteVisivel('area+tempo', 'sem separador', tudo), false);
});
