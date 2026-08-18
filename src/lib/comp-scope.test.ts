import test from 'node:test';
import assert from 'node:assert/strict';
import {
  camadaDe, descreverRecorte, filtrarLinhas, podeVerLinha, temCamadaNosDados,
  type EscopoComp,
} from './comp-scope';
import { isInScope, type AccessScope } from './permissions';

/** N-1 = C-level, reporta ao CEO. */
const C_LEVEL_TECH: EscopoComp = { global: false, camada: 1, areas: ['TECHNOLOGY'] };
const N2_TECH: EscopoComp = { global: false, camada: 2, areas: ['TECHNOLOGY'] };
const GLOBAL: EscopoComp = { global: true, camada: null, areas: [] };

/**
 * A escada aqui é o "N" do Workday: `N` é o CEO, `N-1` são os reportes
 * diretos, e o número CRESCE conforme desce. É o inverso da escada L0..L9 da
 * tabela de remuneração.
 *
 * A primeira versão desta regra usou a escada errada e no sentido errado. Os
 * testes abaixo travam as duas coisas -- qual escada, e para que lado.
 */

// ------------------------------------------------------------------ a escada

test('N é o CEO, e o número cresce descendo', () => {
  assert.equal(camadaDe('N'), 0);
  assert.equal(camadaDe('N-1'), 1);
  assert.equal(camadaDe('N-4'), 4);
});

test('N-1 é MAIS sênior que N-2 — o sentido que eu tinha invertido', () => {
  assert.ok(
    (camadaDe('N-1') as number) < (camadaDe('N-2') as number),
    'camada menor = mais sênior',
  );
});

test('aceita as escritas que aparecem numa planilha preenchida à mão', () => {
  for (const v of ['N-2', 'n-2', 'N 2', 'N2', '2', 'Layer 2', 'camada 2', ' n – 2 ']) {
    assert.equal(camadaDe(v), 2, `não reconheceu "${v}"`);
  }
});

test('o que não é camada vira null, não zero', () => {
  // Zero seria o CEO. Um valor ilegível virando CEO deixaria a linha visível
  // para ninguém -- mas um valor ilegível virando N-9 deixaria visível para
  // todos. `null` é a única resposta segura.
  assert.equal(camadaDe('Director'), null);
  assert.equal(camadaDe('L7'), null, 'a escada L NÃO é a escada N');
  assert.equal(camadaDe(''), null);
  assert.equal(camadaDe(null), null);
  assert.equal(camadaDe('N-37'), null, 'liderança vai até N-4; 37 é digitação errada');
});

// -------------------------------------------------------------------- regra

test('C-level vê as camadas abaixo da dele', () => {
  assert.equal(podeVerLinha(C_LEVEL_TECH, { area: 'TECHNOLOGY', n_layer: 'N-2' }), true);
  assert.equal(podeVerLinha(C_LEVEL_TECH, { area: 'TECHNOLOGY', n_layer: 'N-4' }), true);
});

test('C-level NÃO vê os pares nem o CEO', () => {
  assert.equal(podeVerLinha(C_LEVEL_TECH, { area: 'TECHNOLOGY', n_layer: 'N-1' }), false);
  assert.equal(podeVerLinha(C_LEVEL_TECH, { area: 'TECHNOLOGY', n_layer: 'N' }), false);
});

test('N-2 não vê N-1 — o teste que a versão anterior passava ao contrário', () => {
  assert.equal(podeVerLinha(N2_TECH, { area: 'TECHNOLOGY', n_layer: 'N-1' }), false);
  assert.equal(podeVerLinha(N2_TECH, { area: 'TECHNOLOGY', n_layer: 'N-3' }), true);
});

test('NÃO vê outra área, mesmo em camada mais profunda', () => {
  assert.equal(podeVerLinha(C_LEVEL_TECH, { area: 'MARKETING', n_layer: 'N-3' }), false);
});

test('linha sem camada não aparece', () => {
  assert.equal(podeVerLinha(C_LEVEL_TECH, { area: 'TECHNOLOGY', n_layer: null }), false);
  assert.equal(podeVerLinha(C_LEVEL_TECH, { area: 'TECHNOLOGY', n_layer: 'L3' }), false);
});

test('camada numérica também vale — planilha às vezes traz só o número', () => {
  assert.equal(podeVerLinha(C_LEVEL_TECH, { area: 'TECHNOLOGY', n_layer: 3 }), true);
  assert.equal(podeVerLinha(C_LEVEL_TECH, { area: 'TECHNOLOGY', n_layer: 1 }), false);
});

test('quem olha sem camada cadastrada não vê NADA', () => {
  const sem: EscopoComp = { global: false, camada: null, areas: ['TECHNOLOGY'] };
  assert.deepEqual(filtrarLinhas(sem, [{ area: 'TECHNOLOGY', n_layer: 'N-4' }]), []);
});

test('perfil global passa por cima de tudo', () => {
  assert.equal(podeVerLinha(GLOBAL, { area: null, n_layer: null }), true);
});

test('área compara sem depender de caixa, acento ou espaço', () => {
  assert.equal(podeVerLinha(C_LEVEL_TECH, { area: ' technology ', n_layer: 'N-2' }), true);
});

// ------------------------------------------------------ uma regra de área só

/**
 * O painel inteiro escopa por departamento OU job family (`isInScope`).
 * Remuneração escopa só por departamento (`podeVerLinha`). Isso é decisão,
 * não descuido -- 18/08/2026, a partir da regra escrita: "remuneração de toda
 * a sua área".
 *
 * Até aqui as duas conviviam no mesmo filtro de `listCompRatio`. Somadas, a
 * mais estrita vencia, então nunca vazou nada. Mas quem lesse aquele trecho
 * não tinha como saber qual das duas estava mandando -- e a chance de alguém
 * remover "a redundante" errada era real. Ficou uma só; este teste é o que
 * impede a outra de voltar por engano.
 */
test('escopo por job family abre o painel, mas NÃO abre a folha', () => {
  const porFamilia: AccessScope = {
    profile: 'dept_leader',
    departments: [],
    jobFamilies: ['Product & Technology'],
  };
  const pessoa = { area: 'TECHNOLOGY', job_type_family: 'Product & Technology', n_layer: 'N-4' };

  // Meu Time, Atrição, Talent Mobility: a pessoa aparece.
  assert.equal(isInScope(porFamilia, pessoa.area, pessoa.job_type_family), true);

  // Compensation: não aparece. `areas` vem só dos departamentos, e está vazio.
  const comp: EscopoComp = { global: false, camada: 1, areas: [] };
  assert.equal(podeVerLinha(comp, pessoa), false);
});

test('o mesmo departamento na lista abre as duas', () => {
  const porDepto: AccessScope = { profile: 'dept_leader', departments: ['TECHNOLOGY'] };
  const pessoa = { area: 'TECHNOLOGY', job_type_family: 'Product & Technology', n_layer: 'N-4' };
  assert.equal(isInScope(porDepto, pessoa.area, pessoa.job_type_family), true);
  assert.equal(podeVerLinha(C_LEVEL_TECH, pessoa), true);
});

// ------------------------------------------- dado ausente x regra funcionando

test('sabe distinguir "não importei a camada" de "não há gente"', () => {
  // As duas produzem a MESMA tela vazia e pedem ações opostas.
  assert.equal(temCamadaNosDados([{ n_layer: null }, { n_layer: 'L3' }]), false);
  assert.equal(temCamadaNosDados([{ n_layer: null }, { n_layer: 'N-3' }]), true);
  assert.equal(temCamadaNosDados([]), false);
});

test('sem a camada importada, o aviso diz que falta DADO, não acesso', () => {
  const t = descreverRecorte(C_LEVEL_TECH, 'N-1', false);
  assert.match(t ?? '', /não foi importada/);
  assert.match(t ?? '', /não ausência de gente/i);
});

test('com tudo no lugar, o aviso nomeia a área e o corte', () => {
  const t = descreverRecorte(C_LEVEL_TECH, 'N-1', true);
  assert.match(t ?? '', /TECHNOLOGY/);
  assert.match(t ?? '', /abaixo da sua/);
  assert.match(t ?? '', /médias/);
});

test('perfil global não recebe aviso de recorte, porque não há recorte', () => {
  assert.equal(descreverRecorte(GLOBAL, null, false), null);
});
